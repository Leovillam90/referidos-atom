import "server-only";
import { connection } from "next/server";
import { cacheLife } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Plan, PlanBasico } from "@/lib/estados";
import { logError } from "@/lib/registro";

/** Todos los planes (con bono). El cliente decide los permisos: RLS o clave secreta. */
export async function traerPlanes(supabase: SupabaseClient): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("planes")
    .select("id, nombre, bono, activo, orden")
    .order("orden", { ascending: true })
    .returns<Plan[]>();
  if (error) throw new Error(`No se pudieron leer los planes: ${error.message}`);
  return (data ?? []).map((p) => ({ ...p, bono: Number(p.bono) }));
}

/**
 * Planes que se muestran en el formulario público. Solo id y nombre:
 * el referido NO debe ver el valor del bono.
 */
export async function planesParaFormulario(): Promise<PlanBasico[]> {
  await connection(); // consulta en vivo, solo en la visita real
  const planes = await traerPlanes(crearClienteAdmin());
  return planes.filter((p) => p.activo).map(({ id, nombre }) => ({ id, nombre }));
}

export async function buscarPlan(id: string): Promise<Plan | null> {
  await connection(); // consulta en vivo, solo en la visita real
  const planes = await traerPlanes(crearClienteAdmin());
  return planes.find((p) => p.id === id) ?? null;
}

export type BonoPublico = { id: string; nombre: string; bono: number };

/**
 * Bonos por plan para la página de inicio (dirigida a los referentes).
 * Se guarda en caché 1 hora: si cambias un bono en la tabla "planes",
 * el inicio lo muestra a más tardar en una hora (o al volver a publicar).
 * Si Supabase falla, devuelve [] y el inicio oculta esa sección.
 */
export async function bonosPublicos(): Promise<BonoPublico[]> {
  "use cache";
  cacheLife("hours");
  try {
    const planes = await traerPlanes(crearClienteAdmin());
    return planes.filter((p) => p.activo).map(({ id, nombre, bono }) => ({ id, nombre, bono }));
  } catch (e) {
    logError("[inicio] no se pudieron leer los bonos:", e);
    return [];
  }
}
