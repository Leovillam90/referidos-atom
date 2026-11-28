/**
 * Arma la función public.celular_pais() de supabase/schema.sql con los
 * patrones de CELULAR de cada país, sacados de la metadata "max" de
 * libphonenumber-js. Así la base de datos valida igual que la app sin
 * programar las reglas por país a mano.
 *
 *   npm run generar-sql-telefono   → reescribe el bloque en schema.sql
 *   npm test                       → falla si el bloque quedó desactualizado
 *                                     (por ejemplo, al actualizar la librería)
 */
import { Metadata } from "libphonenumber-js/core";
import metadataMax from "libphonenumber-js/metadata.max.json";
import { PAISES } from "./telefono";

export const INICIO_BLOQUE = "-- >>> CELULARES POR PAÍS (generado con: npm run generar-sql-telefono; no editar a mano)";
export const FIN_BLOQUE = "-- <<< CELULARES POR PAÍS";

type Plan = { type(t: string): { pattern(): string } | undefined };

/** Patrón (regex) del número nacional de un celular en ese país. */
export function patronCelular(iso: (typeof PAISES)[number]["iso"]): string {
  const m = new (Metadata as unknown as new (json: unknown) => Metadata)(metadataMax);
  m.selectNumberingPlan(iso);
  const plan = m.numberingPlan as unknown as Plan;
  // En Estados Unidos y Puerto Rico los celulares y los fijos son iguales:
  // la librería solo publica el patrón de "fijo".
  const patron = plan.type("MOBILE")?.pattern() || plan.type("FIXED_LINE")?.pattern();
  if (!patron) throw new Error(`La librería no tiene patrón de celular para ${iso}`);
  if (patron.includes("'") || patron.includes("$")) throw new Error(`Patrón con caracteres inesperados para ${iso}`);
  return patron;
}

export function bloqueSqlCelular(): string {
  const filas = PAISES.map((p) => `    ('${p.iso}', '${p.indicativo}', '${patronCelular(p.iso)}')`).join(",\n");
  return [
    INICIO_BLOQUE,
    "create or replace function public.celular_pais(p_pais text)",
    "returns table (indicativo text, patron_celular text)",
    "language sql",
    "immutable",
    "set search_path = public, pg_catalog",
    "as $$",
    "  select v.indicativo, v.patron_celular",
    "  from (values",
    filas,
    "  ) as v(pais, indicativo, patron_celular)",
    "  where v.pais = p_pais;",
    "$$;",
    FIN_BLOQUE,
  ].join("\n");
}

const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);

/** Reemplaza el bloque dentro del texto de schema.sql (respeta los saltos de línea CRLF de Windows). */
export function reemplazarBloque(schema: string): string {
  const i = schema.indexOf(INICIO_BLOQUE);
  const f = schema.indexOf(FIN_BLOQUE);
  if (i < 0 || f < i) throw new Error("No se encontró el bloque de celulares en supabase/schema.sql");
  const bloque = schema.includes(CRLF) ? bloqueSqlCelular().split(LF).join(CRLF) : bloqueSqlCelular();
  return schema.slice(0, i) + bloque + schema.slice(f + FIN_BLOQUE.length);
}

/** El bloque que hoy está en schema.sql (para la prueba), con saltos de línea LF. */
export function bloqueActual(schema: string): string | null {
  const i = schema.indexOf(INICIO_BLOQUE);
  const f = schema.indexOf(FIN_BLOQUE);
  return i < 0 || f < i ? null : schema.slice(i, f + FIN_BLOQUE.length).split(CRLF).join(LF);
}
