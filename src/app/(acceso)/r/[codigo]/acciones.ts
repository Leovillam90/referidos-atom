"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { cruzarReferidos } from "@/lib/cruce";
import { correoNuevoReferido, enviarCorreo } from "@/lib/correo";
import { buscarPlan } from "@/lib/planes";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { buscarReferentePorCodigo } from "@/lib/referentes-publico";
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
    cuenta_dropi: leer(formData, "cuenta_dropi"),
    tipo: leer(formData, "tipo"),
  };

  // Campo trampa invisible: las personas no lo ven, los robots lo llenan.
  if (leer(formData, "sitio_web")) redirect("/gracias");

  const resultado = esquemaReferido.safeParse({
    ...valores,
    autoriza_datos: formData.get("autoriza_datos") ?? undefined,
  });
  if (!resultado.success) {
    return { ok: false, errores: erroresPorCampo(resultado.error), valores };
  }
  const datos = resultado.data;

  // El código y el plan se vuelven a verificar aquí: los campos del
  // formulario los podría cambiar cualquiera.
  const [referente, plan] = await Promise.all([
    buscarReferentePorCodigo(datos.codigo),
    buscarPlan(datos.plan_solicitado),
  ]);
  if (!referente) {
    return { ok: false, mensaje: "Este link de referido no es válido o fue desactivado.", valores };
  }
  if (!plan || !plan.activo) {
    return { ok: false, errores: { plan_solicitado: "Elige uno de los planes de la lista" }, valores };
  }

  if (referente.correo === datos.correo) {
    return {
      ok: false,
      errores: { correo: "No puedes registrarte con tu propio link de referido." },
      valores,
    };
  }

  const version = process.env.POLITICA_DATOS_VERSION?.trim();
  if (!version) {
    console.error("[referido] Falta la variable POLITICA_DATOS_VERSION");
    return { ok: false, mensaje: "No pudimos guardar tus datos. Intenta de nuevo más tarde.", valores };
  }

  const h = await headers();
  const { data: nuevo, error } = await crearClienteAdmin()
    .from("referidos")
    .insert({
      referente_id: referente.id,
      nombre: datos.nombre,
      plan_solicitado: plan.id,
      correo: datos.correo,
      telefono: datos.telefono,
      cuenta_dropi: datos.cuenta_dropi,
      tipo: datos.tipo,
      // Prueba de la autorización (Ley 1581 de 2012)
      autoriza_datos: true,
      version_politica: version,
      ip_origen: ipDelVisitante(h),
      user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
    })
    .select("id, bono")
    .single<{ id: string; bono: number | string | null }>();

  if (error) {
    // 23505 = el correo ya existe (índice único referidos_correo_unico)
    if (error.code === "23505") {
      return {
        ok: false,
        errores: { correo: "Este correo ya está registrado en el programa de referidos." },
        valores,
      };
    }
    console.error("[referido] insertar:", error.code, error.message);
    return { ok: false, mensaje: "No pudimos guardar tus datos. Intenta de nuevo en unos minutos.", valores };
  }

  // DESPUÉS de responder (el referido no espera):
  //  1. cruce con la hoja (si falla, lo recoge el cruce diario)
  //  2. correo al referente con el nombre, el plan y el bono estimado
  after(async () => {
    try {
      await cruzarReferidos({ referidoId: nuevo.id });
    } catch (e) {
      console.error("[referido] cruce inmediato:", e instanceof Error ? e.message : e);
    }
    try {
      const correo = correoNuevoReferido({
        referenteNombre: referente.nombre,
        referidoNombre: datos.nombre,
        plan: plan.nombre,
        bono: nuevo.bono === null ? null : Number(nuevo.bono),
      });
      await enviarCorreo({ para: referente.correo, ...correo });
    } catch (e) {
      console.error("[referido] correo al referente:", e instanceof Error ? e.message : e);
    }
  });

  redirect(`/gracias?plan=${encodeURIComponent(plan.id)}`);
}
