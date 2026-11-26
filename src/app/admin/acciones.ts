"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { after } from "next/server";
import { cruzarReferidos } from "@/lib/cruce";
import { correoPagoRegistrado, enviarCorreo } from "@/lib/correo";
import { verificarSuperAdmin } from "@/lib/datos-admin";
import { formatoFecha } from "@/lib/formato";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import {
  erroresPorCampo,
  esquemaEdicionReferido,
  esquemaPago,
  MAX_SOPORTE_BYTES,
  TIPOS_SOPORTE,
} from "@/lib/validaciones";

const BUCKET = "soportes-pagos";
const SIN_PERMISO = "No tienes permiso para hacer esto.";

// Todas las acciones se pueden llamar directamente desde fuera de la
// página, por eso cada una vuelve a verificar que quien llama es
// super_admin. Además, las funciones de la base de datos lo verifican
// otra vez por su cuenta.

/** Mensaje entendible a partir de un error de las funciones de la base de datos. */
function mensajeBD(error: { message?: string; code?: string }) {
  if (error.code === "42501") return SIN_PERMISO;
  if (error.code === "22023" || error.code === "P0002") return error.message ?? "Datos no válidos.";
  return "No se pudo guardar. Intenta de nuevo.";
}

// ---------------------------------------------------------------------
// Cruce con la hoja
// ---------------------------------------------------------------------
export type EstadoCruce = { ok: boolean; mensaje?: string };

export async function actualizarCruce(): Promise<EstadoCruce> {
  const { esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  try {
    const r = await cruzarReferidos();
    refresh();
    return {
      ok: true,
      mensaje:
        `Listo: se revisaron ${r.revisados} referidos contra ${r.filasHoja} filas de la hoja. ` +
        `${r.activos} están activos (${r.porCorreo} por correo, ${r.porTelefono} por teléfono) y ` +
        `${r.sinCruce} sin cruce. ${r.cambios} cambiaron desde el último cruce.` +
        (r.omitidos ? ` ${r.omitidos} no se tocaron por estar pagados o editados a mano.` : "") +
        (r.sinPlan
          ? ` Atención: ${r.sinPlan} activos tienen un plan en la hoja que no coincide con la tabla de planes (quedan sin bono).`
          : ""),
    };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[admin] cruce:", detalle);
    return { ok: false, mensaje: `No se pudo hacer el cruce. ${detalle}` };
  }
}

// ---------------------------------------------------------------------
// Edición manual de un referido
// ---------------------------------------------------------------------
export type EstadoEdicion = { ok: boolean; mensaje?: string; errores?: Record<string, string> };

function leer(formData: FormData, campo: string) {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
}

export async function editarReferido(_anterior: EstadoEdicion, formData: FormData): Promise<EstadoEdicion> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const resultado = esquemaEdicionReferido.safeParse({
    id: leer(formData, "id"),
    plan_afiliado_id: leer(formData, "plan_afiliado_id"),
    afiliado_atom: leer(formData, "afiliado_atom"),
    bono: leer(formData, "bono"),
    estado_bono: leer(formData, "estado_bono"),
  });
  if (!resultado.success) return { ok: false, errores: erroresPorCampo(resultado.error) };
  const d = resultado.data;

  // La función de la base de datos marca editado_manual = true y deja historial
  const { error } = await supabase.rpc("editar_referido", {
    p_id: d.id,
    p_plan_afiliado_id: d.plan_afiliado_id,
    p_afiliado_atom: d.afiliado_atom,
    p_bono: d.bono,
    p_estado: d.estado_bono,
  });
  if (error) {
    console.error("[admin] editar referido:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }

  refresh();
  return { ok: true, mensaje: "Cambios guardados. Este referido ya no lo cambia el cruce con la hoja." };
}

export async function volverAUsarHoja(_anterior: EstadoEdicion, formData: FormData): Promise<EstadoEdicion> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const id = leer(formData, "id");
  const { error } = await supabase.rpc("volver_a_usar_hoja", { p_id: id });
  if (error) {
    console.error("[admin] volver a usar la hoja:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }

  // Volver a cruzarlo de una vez para que tome los datos actuales de la hoja
  try {
    await cruzarReferidos({ referidoId: id });
  } catch (e) {
    console.error("[admin] cruce tras volver a la hoja:", e instanceof Error ? e.message : e);
    refresh();
    return {
      ok: true,
      mensaje: "Listo, pero no se pudo leer la hoja ahora mismo. Se actualizará en el próximo cruce.",
    };
  }

  refresh();
  return { ok: true, mensaje: "Listo: el referido volvió a seguir la hoja de afiliados." };
}

// ---------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------

/**
 * Paso 1 del pago: permiso de un solo uso para que el NAVEGADOR suba el
 * soporte directo al bucket privado (así el archivo no pasa por el
 * servidor de la app, que en Vercel tiene un límite de 4,5 MB).
 * El bucket mismo rechaza archivos de más de 5 MB o de otro tipo.
 */
export async function prepararSoporte(datos: {
  referenteId: string;
  tipo: string;
  tamano: number;
}): Promise<{ ok: true; path: string; token: string } | { ok: false; mensaje: string }> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const extension = TIPOS_SOPORTE[datos.tipo as keyof typeof TIPOS_SOPORTE];
  if (!extension) return { ok: false, mensaje: "El soporte debe ser una imagen (JPG, PNG o WEBP) o un PDF." };
  if (!(datos.tamano > 0 && datos.tamano <= MAX_SOPORTE_BYTES)) {
    return { ok: false, mensaje: "El soporte no puede pesar más de 5 MB." };
  }

  const { data: referente } = await supabase
    .from("referentes")
    .select("id")
    .eq("id", datos.referenteId)
    .maybeSingle();
  if (!referente) return { ok: false, mensaje: "El referente no existe." };

  const path = `${datos.referenteId}/${randomUUID()}.${extension}`;
  const { data, error } = await crearClienteAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[admin] permiso de subida:", error?.message);
    return { ok: false, mensaje: "No se pudo preparar la subida del soporte. ¿Ejecutaste de nuevo schema.sql?" };
  }
  return { ok: true, path: data.path, token: data.token };
}

export type DatosPago = {
  referenteId: string;
  referidoIds: string[];
  fecha: string;
  valor: string;
  nota?: string;
  soportePath: string;
};

/** Paso 2 del pago: con el soporte ya subido, registra el pago. */
export async function registrarPago(
  datos: DatosPago,
): Promise<{ ok: boolean; mensaje: string; errores?: Record<string, string> }> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const resultado = esquemaPago.safeParse(datos);
  if (!resultado.success) {
    return { ok: false, mensaje: "Revisa los datos del pago.", errores: erroresPorCampo(resultado.error) };
  }
  const d = resultado.data;
  const almacen = crearClienteAdmin().storage.from(BUCKET);

  // El soporte debe existir y estar en la carpeta de este referente
  if (!d.soportePath.startsWith(`${d.referenteId}/`)) {
    return { ok: false, mensaje: "El soporte no corresponde a este referente." };
  }
  const { error: errorArchivo } = await almacen.info(d.soportePath);
  if (errorArchivo) return { ok: false, mensaje: "No encontramos el soporte. Vuelve a adjuntarlo." };

  const { error } = await supabase.rpc("registrar_pago", {
    p_referente_id: d.referenteId,
    p_referidos: d.referidoIds,
    p_fecha: d.fecha,
    p_valor: d.valor,
    p_nota: d.nota ?? null,
    p_soporte_path: d.soportePath,
  });
  if (error) {
    console.error("[admin] registrar pago:", error.code, error.message);
    await almacen.remove([d.soportePath]); // no dejar archivos sueltos
    return { ok: false, mensaje: mensajeBD(error) };
  }

  // Correo al referente después de responder
  const { data: referente } = await supabase
    .from("referentes")
    .select("nombre, correo")
    .eq("id", d.referenteId)
    .maybeSingle<{ nombre: string; correo: string }>();
  if (referente) {
    after(async () => {
      try {
        const correo = correoPagoRegistrado({
          referenteNombre: referente.nombre,
          valor: d.valor,
          fecha: formatoFecha(`${d.fecha}T12:00:00`),
          referidos: d.referidoIds.length,
        });
        await enviarCorreo({ para: referente.correo, ...correo });
      } catch (e) {
        console.error("[admin] correo de pago:", e instanceof Error ? e.message : e);
      }
    });
  }

  refresh();
  return { ok: true, mensaje: "Pago registrado. Le enviamos un correo al referente." };
}
