/** Estados del bono (se usan en el servidor y en el navegador). */
export type EstadoBono = "estimado" | "por_pagar" | "pagado" | "no_aplica";

export const ESTADOS_BONO: { id: EstadoBono; titulo: string; detalle: string }[] = [
  { id: "estimado", titulo: "Estimado", detalle: "Registrado, aún no activo en ATOM" },
  { id: "por_pagar", titulo: "Por pagar", detalle: "Activo en ATOM" },
  { id: "pagado", titulo: "Pagado", detalle: "Pago registrado" },
  { id: "no_aplica", titulo: "No aplica", detalle: "No se activó o se anuló" },
];

export function tituloEstado(estado: EstadoBono | string | null | undefined) {
  return ESTADOS_BONO.find((e) => e.id === estado)?.titulo ?? "—";
}

export function esEstadoBono(v: unknown): v is EstadoBono {
  return ESTADOS_BONO.some((e) => e.id === v);
}

export type PlanBasico = { id: string; nombre: string };
export type Plan = PlanBasico & { bono: number; activo: boolean; orden: number };

export function nombrePlan(planes: PlanBasico[], id: string | null | undefined) {
  if (!id) return null;
  return planes.find((p) => p.id === id)?.nombre ?? id;
}
