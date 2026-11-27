/** Estados del bono (se usan en el servidor y en el navegador). Ver schema.sql. */
export type EstadoBono =
  | "pendiente_confirmacion"
  | "estimado"
  | "en_verificacion"
  | "por_pagar"
  | "pagado"
  | "vencido"
  | "ya_cliente"
  | "no_aplica"
  | "posible_auto_referido"
  | "afiliado_duplicado";

export const ESTADOS_BONO: {
  id: EstadoBono;
  titulo: string;
  detalle: string;
  /** Título que ve el referente en su panel (si es distinto) */
  tituloReferente?: string;
}[] = [
  { id: "pendiente_confirmacion", titulo: "Pendiente de confirmación", detalle: "Falta que el referido confirme por correo" },
  { id: "estimado", titulo: "Estimado", detalle: "Registro vigente, aún no activo en ATOM" },
  { id: "en_verificacion", titulo: "En verificación", detalle: "Activo en ATOM, cumpliendo los días de permanencia" },
  { id: "por_pagar", titulo: "Por pagar", detalle: "Cumplió la permanencia: falta pagarle al referente" },
  { id: "pagado", titulo: "Pagado", detalle: "Pago registrado" },
  { id: "vencido", titulo: "Vencido", detalle: "Pasó el plazo sin activarse" },
  { id: "ya_cliente", titulo: "Ya era cliente", detalle: "Ya estaba en la hoja de afiliados al registrarse" },
  { id: "no_aplica", titulo: "No aplica", detalle: "Referente suspendido o anulado por el super_admin" },
  {
    id: "posible_auto_referido",
    titulo: "Posible auto-referido",
    detalle: "Su fila en la hoja de afiliados coincide con los datos del referente. Revísalo",
    tituloReferente: "En revisión",
  },
  {
    id: "afiliado_duplicado",
    titulo: "Afiliado ya bonificado",
    detalle: "Esa fila de la hoja de afiliados ya generó bono con otro referido. Revísalo",
    tituloReferente: "En revisión",
  },
];

/** Estados que esperan la revisión del super_admin. */
export const EN_REVISION: EstadoBono[] = ["posible_auto_referido", "afiliado_duplicado"];

/** Estados que el super_admin puede poner a mano (pagado solo con "Registrar pago"). */
export const ESTADOS_MANUALES = ["estimado", "en_verificacion", "por_pagar", "vencido", "ya_cliente", "no_aplica"] as const;

export function tituloEstado(estado: EstadoBono | string | null | undefined, paraReferente = false) {
  const e = ESTADOS_BONO.find((x) => x.id === estado);
  return (paraReferente ? e?.tituloReferente : undefined) ?? e?.titulo ?? "—";
}

export function esEstadoBono(v: unknown): v is EstadoBono {
  return ESTADOS_BONO.some((e) => e.id === v);
}

/** Estados que no generan bono (no se suman en los totales). */
export const SIN_BONO: EstadoBono[] = ["vencido", "ya_cliente", "no_aplica", ...EN_REVISION];

export type PlanBasico = { id: string; nombre: string };
export type Plan = PlanBasico & { bono: number; activo: boolean; orden: number };

export function nombrePlan(planes: PlanBasico[], id: string | null | undefined) {
  if (!id) return null;
  return planes.find((p) => p.id === id)?.nombre ?? id;
}

/** Días completos que faltan hasta una fecha (0 si ya pasó). */
export function diasHasta(iso: string | null | undefined, ahora = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - ahora) / 86_400_000));
}
