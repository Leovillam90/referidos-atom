/** Pesos colombianos sin espacio y con punto de miles: 20000 → "$20.000". */
export function pesosCOP(n: number) {
  const miles = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}$${miles}`;
}

const fecha = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

export function formatoPesos(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? pesosCOP(n) : "—";
}

export function formatoFecha(iso: string) {
  return fecha.format(new Date(iso));
}

/** Fecha y hora de Colombia en formato ordenable: "2026-11-26 14:03" */
export function formatoFechaHoraIso(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: "America/Bogota", hour12: false })
    .slice(0, 16);
}

/** 3001234567 → 300 123 4567 */
export function formatoTelefono(t: string) {
  const d = t.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : t;
}
