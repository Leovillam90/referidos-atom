"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { after } from "next/server";
import { cruceCompleto, cruzarReferidos } from "@/lib/cruce";
import { correoPagoRegistrado, enviarCorreo } from "@/lib/correo";
import { verificarSuperAdmin } from "@/lib/datos-admin";
import { tipoRealSoporte } from "@/lib/archivos";
import { formatoFecha } from "@/lib/formato";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { ejemploCelular, esPaisPermitido, formatoEstandarPosible, formatoTelefono } from "@/lib/telefono";
import { logError, ocultarDatos, registrarError, textoError } from "@/lib/registro";
import {
  erroresPorCampo,
  esquemaEdicionReferido,
  esquemaMotivo,
  esquemaPago,
  esquemaReglas,
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
    const completo = await cruceCompleto("admin");
    if (completo.estado === "ocupado") {
      return { ok: false, mensaje: "Ya hay un cruce en curso (el automático o el de otro super_admin). Espera un minuto y vuelve a revisar." };
    }
    const r = completo.resumen;
    refresh();
    return {
      ok: true,
      mensaje:
        `Listo: se revisaron ${r.revisados} referidos contra ${r.filasHoja} filas de la hoja. ` +
        `${r.activos} están activos (ESTADO activo), ${r.enHojaNoActivos} aparecen con otro estado y ` +
        `${r.sinCruce} no aparecen. ${r.cambios} cambiaron desde el último cruce.` +
        (r.vencidos ? ` ${r.vencidos} vencieron por pasar el plazo sin activarse.` : "") +
        (r.telefonosInvalidosHoja
          ? ` ${r.telefonosInvalidosHoja} filas de la hoja tienen un TELEFONO inválido: se cruzaron solo por buyer_email.`
          : "") +
        (r.omitidos ? ` ${r.omitidos} no se tocaron (pagados, vencidos, ya clientes o editados a mano).` : "") +
        (r.sinPlan
          ? ` Atención: ${r.sinPlan} activos tienen un plan en la hoja que no coincide con la tabla de planes (quedan sin bono).`
          : "") +
        (r.enRevision
          ? ` Atención: ${r.enRevision} referidos están en revisión (posible auto-referido o afiliado que ya generó bono): no generan bono hasta que los revises.`
          : ""),
    };
  } catch (e) {
    await registrarError("cruce (admin)", e, { guardar: true });
    return { ok: false, mensaje: `No se pudo hacer el cruce. ${ocultarDatos(textoError(e))}` };
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
    vence_en: leer(formData, "vence_en"),
    motivo: leer(formData, "motivo"),
  });
  if (!resultado.success) return { ok: false, errores: erroresPorCampo(resultado.error) };
  const d = resultado.data;

  // La función de la base de datos marca editado_manual = true y deja
  // historial con el motivo
  const { error } = await supabase.rpc("editar_referido", {
    p_id: d.id,
    p_plan_afiliado_id: d.plan_afiliado_id,
    p_afiliado_atom: d.afiliado_atom,
    p_bono: d.bono,
    p_estado: d.estado_bono,
    p_vence_en: d.vence_en,
    p_motivo: d.motivo,
  });
  if (error) {
    logError("[admin] editar referido:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }

  refresh();
  return { ok: true, mensaje: "Excepción guardada. Las reglas y el cruce con la hoja ya no cambian este referido." };
}

export async function volverAUsarHoja(_anterior: EstadoEdicion, formData: FormData): Promise<EstadoEdicion> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const resultado = esquemaMotivo.safeParse({ id: leer(formData, "id"), motivo: leer(formData, "motivo") });
  if (!resultado.success) return { ok: false, errores: erroresPorCampo(resultado.error) };
  const { id, motivo } = resultado.data;
  const { error } = await supabase.rpc("volver_a_usar_hoja", { p_id: id, p_motivo: motivo });
  if (error) {
    logError("[admin] volver a usar la hoja:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }

  // Volver a cruzarlo de una vez para que tome los datos actuales de la hoja
  try {
    await cruzarReferidos({ referidoId: id });
  } catch (e) {
    logError("[admin] cruce tras volver a la hoja:", e);
    refresh();
    return {
      ok: true,
      mensaje: "Listo, pero no se pudo leer la hoja ahora mismo. Se actualizará en el próximo cruce.",
    };
  }

  refresh();
  return { ok: true, mensaje: "Listo: el referido volvió a seguir las reglas y la hoja de afiliados." };
}

// ---------------------------------------------------------------------
// Suspensión de referentes
// ---------------------------------------------------------------------
export async function cambiarSuspension(_anterior: EstadoEdicion, formData: FormData): Promise<EstadoEdicion> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const resultado = esquemaMotivo.safeParse({ id: leer(formData, "id"), motivo: leer(formData, "motivo") });
  if (!resultado.success) return { ok: false, errores: erroresPorCampo(resultado.error) };
  const { id, motivo } = resultado.data;
  const suspender = leer(formData, "accion") === "suspender";

  const { error } = await supabase.rpc(suspender ? "suspender_referente" : "reactivar_referente", {
    p_id: id,
    p_motivo: motivo,
  });
  if (error) {
    logError("[admin] suspensión:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }

  refresh();
  return {
    ok: true,
    mensaje: suspender
      ? "Referente suspendido. Sus bonos no pagados pasaron a «no aplica» y su link ya no recibe referidos."
      : "Referente reactivado. Sus referidos volvieron a seguir las reglas.",
  };
}

// ---------------------------------------------------------------------
// Reglas del programa
// ---------------------------------------------------------------------
export async function guardarReglas(_anterior: EstadoEdicion, formData: FormData): Promise<EstadoEdicion> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return { ok: false, mensaje: SIN_PERMISO };

  const resultado = esquemaReglas.safeParse({
    dias_vigencia_registro: leer(formData, "dias_vigencia_registro"),
    dias_permanencia_para_pagar: leer(formData, "dias_permanencia_para_pagar"),
    confirmacion_referido_por_correo: leer(formData, "confirmacion_referido_por_correo"),
    dominios_excluidos: leer(formData, "dominios_excluidos"),
    max_registros_por_link_por_hora: leer(formData, "max_registros_por_link_por_hora"),
  });
  if (!resultado.success) return { ok: false, errores: erroresPorCampo(resultado.error) };
  const d = resultado.data;

  const { error } = await supabase.rpc("actualizar_reglas", {
    p_dias_vigencia: d.dias_vigencia_registro,
    p_dias_permanencia: d.dias_permanencia_para_pagar,
    p_confirmacion: d.confirmacion_referido_por_correo,
    p_dominios: d.dominios_excluidos,
    p_max_por_hora: d.max_registros_por_link_por_hora,
  });
  if (error) {
    logError("[admin] reglas:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }

  refresh();
  return { ok: true, mensaje: "Reglas guardadas. Los referidos en curso se recalcularon con los valores nuevos." };
}

// ---------------------------------------------------------------------
// Números de celular bloqueados (/admin/reglas)
// ---------------------------------------------------------------------
export async function agregarTelefonoBloqueado(_anterior: EstadoEdicion, formData: FormData): Promise<EstadoEdicion> {
  const { supabase, usuario, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin || !usuario) return { ok: false, mensaje: SIN_PERMISO };

  const pais = leer(formData, "telefono_pais");
  const telefono = formatoEstandarPosible(leer(formData, "telefono"), pais);
  if (!telefono) {
    return { ok: false, errores: { telefono: `Escribe el número completo (ej. ${ejemploCelular(esPaisPermitido(pais) ? pais : "CO")})` } };
  }
  const nota = leer(formData, "nota").trim().slice(0, 200) || null;

  const { error } = await supabase.from("telefonos_bloqueados").insert({ telefono, nota, creado_por: usuario.id });
  if (error) {
    if (error.code === "23505") return { ok: false, errores: { telefono: "Ese número ya está bloqueado" } };
    logError("[admin] bloquear teléfono:", error.code, error.message);
    return { ok: false, mensaje: mensajeBD(error) };
  }
  refresh();
  return { ok: true, mensaje: `Listo: ${formatoTelefono(telefono)} ya no se puede usar en ningún registro nuevo.` };
}

export async function quitarTelefonoBloqueado(formData: FormData): Promise<void> {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return;
  const telefono = leer(formData, "telefono");
  const { error } = await supabase.from("telefonos_bloqueados").delete().eq("telefono", telefono);
  if (error) logError("[admin] quitar teléfono bloqueado:", error.code, error.message);
  refresh();
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
    logError("[admin] permiso de subida:", error?.message);
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
  // El archivo debe existir, pesar máximo 5 MB y SER de verdad una imagen o
  // un PDF (se revisa su contenido, no la extensión ni lo que dijo el navegador)
  const { data: archivo, error: errorArchivo } = await almacen.download(d.soportePath);
  if (errorArchivo || !archivo) return { ok: false, mensaje: "No encontramos el soporte. Vuelve a adjuntarlo." };
  const inicio = new Uint8Array(await archivo.slice(0, 16).arrayBuffer());
  const tipoReal = tipoRealSoporte(inicio);
  const extension = d.soportePath.split(".").pop();
  if (
    archivo.size > MAX_SOPORTE_BYTES ||
    !tipoReal ||
    TIPOS_SOPORTE[tipoReal] !== extension
  ) {
    await almacen.remove([d.soportePath]);
    return { ok: false, mensaje: "El soporte no es una imagen (JPG, PNG o WEBP) o un PDF válido. Vuelve a adjuntarlo." };
  }

  const { error } = await supabase.rpc("registrar_pago", {
    p_referente_id: d.referenteId,
    p_referidos: d.referidoIds,
    p_fecha: d.fecha,
    p_valor: d.valor,
    p_nota: d.nota ?? null,
    p_soporte_path: d.soportePath,
  });
  if (error) {
    logError("[admin] registrar pago:", error.code, error.message);
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
        await registrarError("correo de pago", e, { guardar: true });
      }
    });
  }

  refresh();
  return { ok: true, mensaje: "Pago registrado. Le enviamos un correo al referente." };
}
