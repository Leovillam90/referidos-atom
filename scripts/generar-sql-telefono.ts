/**
 * npm run generar-sql-telefono
 * Reescribe en supabase/schema.sql la función public.celular_pais() con
 * los patrones de celular de libphonenumber-js. Úsalo después de
 * actualizar la librería y vuelve a ejecutar schema.sql en Supabase.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reemplazarBloque } from "../src/lib/telefono-sql";

const ruta = join(process.cwd(), "supabase", "schema.sql");
const antes = readFileSync(ruta, "utf8");
const despues = reemplazarBloque(antes);

if (antes === despues) {
  console.log("✅ supabase/schema.sql ya tenía los patrones de celular al día.");
} else {
  writeFileSync(ruta, despues);
  console.log("✅ Patrones de celular actualizados en supabase/schema.sql.");
  console.log("   → Ejecuta de nuevo supabase/schema.sql en Supabase (SQL Editor).");
}
