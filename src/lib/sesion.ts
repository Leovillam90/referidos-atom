import "server-only";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { traerPlanes } from "@/lib/planes";
import type { EstadoBono } from "@/lib/estados";

export type Referente = {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  cuenta_dropi: string;
  codigo: string;
  activo: boolean;
  created_at: string;
};

export type ReferidoDelPanel = {
  id: string;
  nombre: string | null;
  correo: string;
  plan_solicitado: string | null;
  plan_afiliado_id: string | null;
  plan_hoja: string | null;
  afiliado_atom: boolean | null;
  bono: number | string | null;
  estado_bono: EstadoBono;
  created_at: string;
  pago: { id: string; fecha_pago: string } | null;
};

/**
 * Devuelve el usuario con sesión verificada por el servidor de Supabase,
 * o manda a /ingresar si no hay sesión.
 */
export async function exigirUsuario() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/ingresar");
  return { supabase, usuario: data.user };
}

/**
 * Datos del panel del referente con sesión.
 * Las consultas pasan por Row Level Security: aunque alguien cambiara
 * este código, la base de datos solo le devolvería SUS referidos y pagos.
 */
export async function obtenerPanelReferente() {
  const { supabase, usuario } = await exigirUsuario();

  const [{ data: referente }, { data: esSuperAdmin }] = await Promise.all([
    supabase
      .from("referentes")
      .select("id, nombre, correo, telefono, cuenta_dropi, codigo, activo, created_at")
      .eq("id", usuario.id)
      .maybeSingle<Referente>(),
    supabase.rpc("es_super_admin"),
  ]);

  if (!referente) {
    return { usuario, referente: null, referidos: [], planes: [], esSuperAdmin: esSuperAdmin === true };
  }

  const [{ data: referidos, error }, planes] = await Promise.all([
    supabase
      .from("referidos")
      .select(
        "id, nombre, correo, plan_solicitado, plan_afiliado_id, plan_hoja, afiliado_atom, bono, estado_bono, created_at, " +
          "pago:pagos(id, fecha_pago)",
      )
      .eq("referente_id", referente.id)
      .order("created_at", { ascending: false })
      .returns<ReferidoDelPanel[]>(),
    traerPlanes(supabase),
  ]);

  if (error) throw new Error("No se pudieron cargar tus referidos");

  return { usuario, referente, referidos: referidos ?? [], planes, esSuperAdmin: esSuperAdmin === true };
}
