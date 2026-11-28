import "server-only";
import { z } from "zod";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { ocultarDatos, textoError } from "@/lib/ocultar";
import { codigoReferencia } from "@/lib/codigo-referencia";

export { ocultarDatos, textoError };

/**
 * Escribe el error en el log del servidor (sin datos personales). Con
 * `guardar: true` también lo deja en la tabla errores_sistema, que el
 * super_admin ve en /admin (para fallas de correo, hoja o anti-robots).
 * Nunca lanza: si no se puede guardar, solo queda el log.
 */
export async function registrarError(origen: string, e: unknown, opciones: { guardar?: boolean } = {}) {
  const mensaje = ocultarDatos(textoError(e)).slice(0, 1000);
  console.error(`[${origen}]`, mensaje);
  if (!opciones.guardar) return;
  try {
    const { error } = await crearClienteAdmin().from("errores_sistema").insert({ origen: origen.slice(0, 60), mensaje });
    if (error) console.error("[registro] no se pudo guardar el error:", ocultarDatos(error.message));
  } catch (x) {
    console.error("[registro] no se pudo guardar el error:", ocultarDatos(textoError(x)));
  }
}

const esIp = z.union([z.ipv4(), z.ipv6()]);

/** IP del visitante (Vercel la envía en x-forwarded-for). null si no es una IP válida. */
export function ipDelVisitante(h: Headers): string | null {
  const candidata = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return esIp.safeParse(candidata).success ? candidata : null;
}

/**
 * Error inesperado en un formulario público: lo escribe en el log y en
 * errores_sistema con un código corto, y devuelve ese código para
 * mostrárselo a la persona. En el log queda como
 *   [registro R-4F2A] identidad: <detalle sin datos personales>
 */
export async function errorConCodigo(origen: string, etapa: string, ...partes: unknown[]): Promise<string> {
  const codigo = codigoReferencia();
  const detalle = partes
    .filter((p) => p !== undefined && p !== null)
    .map((p) => textoError(p))
    .join(" ");
  await registrarError(`${origen} ${codigo}`, `${etapa}: ${detalle || "(sin detalle)"}`, { guardar: true });
  return codigo;
}

/** console.error sin datos personales (cada parte pasa por ocultarDatos). */
export function logError(etiqueta: string, ...partes: unknown[]) {
  console.error(etiqueta, ...partes.map((p) => (p === undefined || p === null ? p : ocultarDatos(textoError(p)))));
}
