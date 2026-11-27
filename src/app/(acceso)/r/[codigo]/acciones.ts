"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { revisarCelular } from "@/lib/celular-servidor";
import { linkWhatsAppAyuda, urlSitio } from "@/lib/config-programa";
import { cruzarReferidos } from "@/lib/cruce";
import { avisarAlReferente } from "@/lib/avisos";
import { correoConfirmacionReferido, enviarCorreo } from "@/lib/correo";
import { coinciden, identificadoresPersona } from "@/lib/identidad";
import { buscarPlan } from "@/lib/planes";
import { leerReglas } from "@/lib/reglas";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { buscarReferentePorCodigo } from "@/lib/referentes-publico";
import { mensajeCelular } from "@/lib/telefono";
import { huellaToken } from "@/lib/token";
import { verificarTurnstile } from "@/lib/turnstile";
import { erroresPorCampo, esquemaReferido } from "@/lib/validaciones";
import type { EstadoFormulario } from "../../acciones";

function leer(formData: FormData, campo: string) {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
}

const esIp = z.union([z.ipv4(), z.ipv6()]);

/** IP del visitante (Vercel la envía en x-forwarded-for). */
function ipDelVisitante(h: Headers): string | null {
  const candidata =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return esIp.safeParse(candidata).success ? candidata : null;
}

/** Mensaje con link de WhatsApp (sin revelar datos de nadie). */
function conWhatsApp(mensaje: string, valores: Record<string, string>): EstadoFormulario {
  const url = linkWhatsAppAyuda();
  return { ok: false, mensaje, valores, enlace: url ? { texto: "Escríbenos por WhatsApp", url } : undefined };
}

const MENSAJES = {
  duplicado: "Ya estás registrado en el programa; si tienes dudas escríbenos por WhatsApp.",
  autoReferido:
    "Con estos datos no es posible registrarse en este link. Si crees que es un error, escríbenos por WhatsApp.",
  limite: "Recibimos muchos registros en poco tiempo. Espera una hora y vuelve a intentarlo.",
  noDisponible: "Este link no está disponible.",
  robot: "Confirma la verificación anti-robots y vuelve a enviar el formulario.",
  error: "No pudimos guardar tus datos. Intenta de nuevo en unos minutos.",
};

/**
 * Registro de un referido. Las reglas se revisan aquí para dar un mensaje
 * claro y OTRA VEZ en la base de datos (validar_nuevo_referido en
 * schema.sql), que es la que manda: duplicados, auto-referidos, link
 * suspendido y límites por hora.
 */
export async function registrarReferido(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = {
    codigo: leer(formData, "codigo"),
    nombre: leer(formData, "nombre"),
    plan_solicitado: leer(formData, "plan_solicitado"),
    correo: leer(formData, "correo"),
    telefono: leer(formData, "telefono"),
    telefono_pais: leer(formData, "telefono_pais"),
    cuenta_dropi: leer(formData, "cuenta_dropi"),
    tipo: leer(formData, "tipo"),
  };

  // Campo trampa invisible: las personas no lo ven, los robots lo llenan.
  if (leer(formData, "sitio_web")) redirect("/gracias");

  const resultado = esquemaReferido.safeParse({
    ...valores,
    autoriza_datos: formData.get("autoriza_datos") ?? undefined,
  });
  // Celular: reglas por país, números falsos y lista de bloqueados
  const celular = await revisarCelular(valores.telefono, valores.telefono_pais);
  valores.telefono_pais = celular.pais;
  if (!resultado.success || !celular.ok) {
    return {
      ok: false,
      errores: {
        ...(resultado.success ? {} : erroresPorCampo(resultado.error)),
        ...(celular.ok ? {} : { telefono: celular.mensaje }),
      },
      valores,
    };
  }
  const datos = { ...resultado.data, telefono: celular.telefono, telefono_pais: celular.pais };
  const h = await headers();
  const ip = ipDelVisitante(h);
  const admin = crearClienteAdmin();

  // Anti-robots (solo si Turnstile está configurado)
  if (!(await verificarTurnstile(leer(formData, "cf-turnstile-response"), ip))) {
    return { ok: false, mensaje: MENSAJES.robot, valores };
  }

  // Límite de intentos por IP en la última hora (regla max_registros_por_link_por_hora)
  const { data: permitido, error: errorIntento } = await admin.rpc("registrar_intento_referido", {
    p_codigo: datos.codigo,
    p_ip: ip,
  });
  if (errorIntento) {
    console.error("[referido] registrar intento:", errorIntento.message);
    return { ok: false, mensaje: MENSAJES.error, valores };
  }
  if (permitido === false) return { ok: false, mensaje: MENSAJES.limite, valores };

  // El código y el plan se vuelven a verificar aquí: los campos del
  // formulario los podría cambiar cualquiera.
  const [referente, plan] = await Promise.all([
    buscarReferentePorCodigo(datos.codigo),
    buscarPlan(datos.plan_solicitado),
  ]);
  if (!referente) return { ok: false, mensaje: MENSAJES.noDisponible, valores };
  if (!plan || !plan.activo) {
    return { ok: false, errores: { plan_solicitado: "Elige uno de los planes de la lista" }, valores };
  }

  // No auto-referirse: CUALQUIER identificador del formulario (correo,
  // teléfono o cuenta Dropi, en cualquier campo) contra CUALQUIERA del
  // referente, incluidos los que tuvo antes.
  if (coinciden(identificadoresPersona(datos), referente.identificadores ?? [])) {
    return conWhatsApp(MENSAJES.autoReferido, valores);
  }

  const version = process.env.POLITICA_DATOS_VERSION?.trim();
  if (!version) {
    console.error("[referido] Falta la variable POLITICA_DATOS_VERSION");
    return { ok: false, mensaje: MENSAJES.error, valores };
  }

  // Token para el correo de confirmación. Se guarda solo su huella
  // (sha256); la base de datos lo descarta si la confirmación está apagada.
  const token = randomBytes(32).toString("base64url");
  const huella = huellaToken(token);

  const { data: nuevo, error } = await admin
    .from("referidos")
    .insert({
      referente_id: referente.id,
      nombre: datos.nombre,
      plan_solicitado: plan.id,
      correo: datos.correo,
      telefono: datos.telefono, // formato estándar (E.164 sin "+")
      telefono_pais: datos.telefono_pais,
      cuenta_dropi: datos.cuenta_dropi,
      tipo: datos.tipo,
      // Prueba de la autorización (Ley 1581 de 2012)
      autoriza_datos: true,
      version_politica: version,
      ip_origen: ip,
      user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
      token_confirmacion_hash: huella,
    })
    .select("id, requiere_confirmacion")
    .single<{ id: string; requiere_confirmacion: boolean }>();

  if (error) {
    const clave = error.message ?? "";
    if (clave.includes("DUPLICADO")) return conWhatsApp(MENSAJES.duplicado, valores);
    if (clave.includes("AUTO_REFERIDO")) return conWhatsApp(MENSAJES.autoReferido, valores);
    if (clave.includes("LIMITE")) return { ok: false, mensaje: MENSAJES.limite, valores };
    if (clave.includes("LINK_NO_DISPONIBLE")) return { ok: false, mensaje: MENSAJES.noDisponible, valores };
    if (clave.includes("TELEFONO_INVALIDO")) {
      return { ok: false, errores: { telefono: mensajeCelular(datos.telefono_pais) }, valores };
    }
    console.error("[referido] insertar:", error.code, error.message);
    return { ok: false, mensaje: MENSAJES.error, valores };
  }

  // DESPUÉS de responder (el referido no espera):
  //  1. cruce con la hoja: decide si ya era cliente (si falla, lo hace el cruce diario)
  //  2. si hay que confirmar: correo al referido con el link de confirmación
  //     si no: correo al referente con el nombre, el plan y el bono estimado
  after(async () => {
    try {
      await cruzarReferidos({ referidoId: nuevo.id });
    } catch (e) {
      console.error("[referido] cruce inmediato:", e instanceof Error ? e.message : e);
    }
    try {
      const reglas = await leerReglas(admin);
      if (nuevo.requiere_confirmacion) {
        const correo = correoConfirmacionReferido({
          referidoNombre: datos.nombre,
          referenteNombre: referente.nombre,
          url: `${urlSitio()}/confirmar/${token}`,
          diasVigencia: reglas.dias_vigencia_registro,
        });
        await enviarCorreo({ para: datos.correo, ...correo });
      } else {
        await avisarAlReferente(nuevo.id, reglas.dias_vigencia_registro);
      }
    } catch (e) {
      console.error("[referido] correo:", e instanceof Error ? e.message : e);
    }
  });

  const confirmar = nuevo.requiere_confirmacion ? "&confirmar=1" : "";
  redirect(`/gracias?plan=${encodeURIComponent(plan.id)}${confirmar}`);
}
