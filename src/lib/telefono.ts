/**
 * Normaliza un teléfono colombiano: solo dígitos y sin indicativo +57.
 *   "+57 300-123 4567" → "3001234567"
 *   "0057 3001234567"  → "3001234567"
 * Debe coincidir con public.normalizar_telefono() en supabase/schema.sql.
 */
export function normalizarTelefono(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 14 && d.startsWith("0057")) return d.slice(4);
  if (d.length === 12 && d.startsWith("57")) return d.slice(2);
  return d;
}

export function normalizarCorreo(valor: string | null | undefined): string | null {
  const c = (valor ?? "").trim().toLowerCase();
  return c || null;
}
