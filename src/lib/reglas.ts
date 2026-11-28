import "server-only";
import { cacheLife } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/registro";

/**
 * Reglas del programa (tabla reglas_programa, una sola fila).
 * Se editan en /admin/reglas o en Supabase → Table Editor. Nada de esto
 * está fijo en el código: la base de datos las aplica en sus disparadores
 * y la app las lee de aquí para mostrar mensajes y textos.
 */
export type Reglas = {
  dias_vigencia_registro: number;
  dias_permanencia_para_pagar: number;
  confirmacion_referido_por_correo: boolean;
  dominios_excluidos: string;
  max_registros_por_link_por_hora: number;
  updated_at: string;
};

const COLUMNAS =
  "dias_vigencia_registro, dias_permanencia_para_pagar, confirmacion_referido_por_correo, dominios_excluidos, " +
  "max_registros_por_link_por_hora, updated_at";

/** Lee las reglas con el cliente indicado (RLS: solo el super_admin) o con la clave secreta. */
export async function leerReglas(supabase: SupabaseClient = crearClienteAdmin()): Promise<Reglas> {
  const { data, error } = await supabase.from("reglas_programa").select(COLUMNAS).maybeSingle<Reglas>();
  if (error || !data) {
    throw new Error(
      `No se pudieron leer las reglas del programa${error ? `: ${error.message}` : ""}. ¿Ejecutaste de nuevo supabase/schema.sql?`,
    );
  }
  return data;
}

/**
 * Plazos para la página pública /terminos. En caché 1 hora: si cambias
 * las reglas, la página lo muestra a más tardar en una hora.
 */
export async function plazosPublicos(): Promise<Pick<Reglas, "dias_vigencia_registro" | "dias_permanencia_para_pagar"> | null> {
  "use cache";
  cacheLife("hours");
  try {
    const r = await leerReglas();
    return { dias_vigencia_registro: r.dias_vigencia_registro, dias_permanencia_para_pagar: r.dias_permanencia_para_pagar };
  } catch (e) {
    logError("[terminos] no se pudieron leer las reglas:", e);
    return null;
  }
}
