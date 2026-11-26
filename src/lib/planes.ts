import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Plan, PlanBasico } from "@/lib/estados";

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
  const planes = await traerPlanes(crearClienteAdmin());
  return planes.filter((p) => p.activo).map(({ id, nombre }) => ({ id, nombre }));
}

export async function buscarPlan(id: string): Promise<Plan | null> {
  const planes = await traerPlanes(crearClienteAdmin());
  return planes.find((p) => p.id === id) ?? null;
}
