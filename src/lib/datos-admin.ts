import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoBono } from "@/lib/estados";

export type ReferidoAdmin = {
  id: string;
  referente_id: string;
  nombre: string | null;
  correo: string;
  telefono: string;
  cuenta_dropi: string;
  tipo: "proveedor" | "marca";
  plan_solicitado: string | null;
  plan_hoja: string | null;
  plan_afiliado_id: string | null;
  afiliado_atom: boolean | null;
  cruce_por: "correo" | "telefono" | null;
  bono: number | string | null;
  estado_bono: EstadoBono;
  editado_manual: boolean;
  cruce_actualizado_en: string | null;
  autorizado_en: string;
  version_politica: string;
  created_at: string;
  referente: { nombre: string; correo: string; codigo: string } | null;
  pago: { id: string; fecha_pago: string; valor_pagado: number | string } | null;
};

export type ReferenteAdmin = {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  cuenta_dropi: string;
  codigo: string;
  activo: boolean;
  created_at: string;
};

export type Totales = { estimado: number; por_pagar: number; pagado: number; no_aplica: number };

export type ResumenReferente = ReferenteAdmin & {
  referidos: number;
  activos: number;
  totales: Totales;
};

export type PagoAdmin = {
  id: string;
  referente_id: string;
  fecha_pago: string;
  valor_pagado: number | string;
  nota: string | null;
  soporte_path: string;
  created_at: string;
};

export type HistorialItem = {
  id: string;
  usuario_correo: string | null;
  accion: string;
  cambios: Record<string, { antes: unknown; despues: unknown }>;
  created_at: string;
};

/**
 * ¿Hay sesión y es super_admin? Devuelve el cliente CON la sesión del
 * usuario: las consultas siguen pasando por Row Level Security, que solo
 * deja ver todo a quien está en la tabla super_admins.
 */
export async function verificarSuperAdmin() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, usuario: null, esSuperAdmin: false };
  const { data: es } = await supabase.rpc("es_super_admin");
  return { supabase, usuario: data.user, esSuperAdmin: es === true };
}

/** Para páginas: manda a /ingresar o /panel si no es super_admin. */
export async function exigirSuperAdmin() {
  const r = await verificarSuperAdmin();
  if (!r.usuario) redirect("/ingresar");
  if (!r.esSuperAdmin) redirect("/panel");
  return r;
}

const PAGINA = 1000;

/** Trae todas las filas, de a 1000 (el máximo de Supabase por consulta). */
async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

const COLUMNAS_REFERIDO =
  "id, referente_id, nombre, correo, telefono, cuenta_dropi, tipo, plan_solicitado, plan_hoja, plan_afiliado_id, " +
  "afiliado_atom, cruce_por, bono, estado_bono, editado_manual, cruce_actualizado_en, autorizado_en, " +
  "version_politica, created_at, referente:referentes(nombre, correo, codigo), pago:pagos(id, fecha_pago, valor_pagado)";

/** Filtro de la vista de referidos: un estado del bono o "sin_cruce". */
export type FiltroReferidos = EstadoBono | "sin_cruce" | "todos";

export function traerReferidos(
  supabase: SupabaseClient,
  opciones: { filtro?: FiltroReferidos; referenteId?: string } = {},
) {
  return traerTodo<ReferidoAdmin>((desde, hasta) => {
    let q = supabase
      .from("referidos")
      .select(COLUMNAS_REFERIDO)
      .order("created_at", { ascending: false })
      .range(desde, hasta);
    const filtro = opciones.filtro ?? "todos";
    // "Sin cruce" = no aparece en la hoja o todavía no se ha revisado
    if (filtro === "sin_cruce") q = q.or("afiliado_atom.is.null,afiliado_atom.eq.false");
    else if (filtro !== "todos") q = q.eq("estado_bono", filtro);
    if (opciones.referenteId) q = q.eq("referente_id", opciones.referenteId);
    return q.returns<ReferidoAdmin[]>();
  });
}

export async function traerReferido(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("referidos")
    .select(COLUMNAS_REFERIDO)
    .eq("id", id)
    .maybeSingle<ReferidoAdmin>();
  if (error) throw new Error(error.message);
  return data;
}

export function calcularTotales(referidos: Pick<ReferidoAdmin, "estado_bono" | "bono">[]): Totales {
  const t: Totales = { estimado: 0, por_pagar: 0, pagado: 0, no_aplica: 0 };
  for (const r of referidos) {
    if (r.estado_bono !== "no_aplica") t[r.estado_bono] += Number(r.bono) || 0;
  }
  return t;
}

export async function traerReferentes(supabase: SupabaseClient) {
  return traerTodo<ReferenteAdmin>((desde, hasta) =>
    supabase
      .from("referentes")
      .select("id, nombre, correo, telefono, cuenta_dropi, codigo, activo, created_at")
      .order("created_at", { ascending: false })
      .range(desde, hasta)
      .returns<ReferenteAdmin[]>(),
  );
}

export async function traerResumenReferentes(
  supabase: SupabaseClient,
  referidos?: ReferidoAdmin[],
): Promise<ResumenReferente[]> {
  const [referentes, todos] = await Promise.all([
    traerReferentes(supabase),
    referidos ?? traerReferidos(supabase),
  ]);

  const porReferente = new Map<string, ReferidoAdmin[]>();
  for (const r of todos) {
    const lista = porReferente.get(r.referente_id) ?? [];
    lista.push(r);
    porReferente.set(r.referente_id, lista);
  }

  return referentes.map((f) => {
    const suyos = porReferente.get(f.id) ?? [];
    return {
      ...f,
      referidos: suyos.length,
      activos: suyos.filter((r) => r.afiliado_atom === true).length,
      totales: calcularTotales(suyos),
    };
  });
}

export async function traerPagos(supabase: SupabaseClient, referenteId?: string) {
  return traerTodo<PagoAdmin>((desde, hasta) => {
    let q = supabase
      .from("pagos")
      .select("id, referente_id, fecha_pago, valor_pagado, nota, soporte_path, created_at")
      .order("fecha_pago", { ascending: false })
      .range(desde, hasta);
    if (referenteId) q = q.eq("referente_id", referenteId);
    return q.returns<PagoAdmin[]>();
  });
}

export async function traerHistorial(supabase: SupabaseClient, referidoId: string) {
  const { data, error } = await supabase
    .from("referidos_historial")
    .select("id, usuario_correo, accion, cambios, created_at")
    .eq("referido_id", referidoId)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<HistorialItem[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}
