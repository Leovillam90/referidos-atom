/**
 * npm run reporte-identidades
 * Revisa los registros EXISTENTES con la regla de identidad cruzada y
 * muestra cuáles habrían sido bloqueados o marcados. SOLO LEE: no cambia
 * nada en la base ni en la hoja. Tapa parte de correos y teléfonos.
 */
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buscarEnHoja,
  coinciden,
  identificadoresHoja,
  identificadoresPersona,
  normalizarCorreoIdentidad,
  normalizarDropi,
} from "../src/lib/identidad";
import { normalizarTelefono } from "../src/lib/telefono";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

type Referente = { id: string; nombre: string; correo: string; telefono: string; cuenta_dropi: string; created_at: string; suspendido: boolean };
type Referido = {
  id: string; referente_id: string; nombre: string | null; correo: string; telefono: string; cuenta_dropi: string;
  created_at: string; estado_bono: string; confirmado_en: string | null; vencido_en: string | null;
  bono_fijado_en: string | null; editado_manual: boolean;
};

function tapar(v: string | null | undefined) {
  const s = String(v ?? "");
  if (s.includes("@")) {
    const [u, dominio] = s.split("@");
    return `${u.slice(0, 2)}***@${dominio}`;
  }
  return s.length > 4 ? `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}` : "***";
}

/** La regla ANTERIOR: campo con campo. */
function reglaAnterior(a: { correo: string; telefono: string; cuenta_dropi: string }, b: { correo: string; telefono: string; cuenta_dropi: string }) {
  const d1 = normalizarDropi(a.cuenta_dropi);
  const t1 = normalizarTelefono(a.telefono); // null si no es un número válido
  return (
    normalizarCorreoIdentidad(a.correo) === normalizarCorreoIdentidad(b.correo) ||
    (t1 !== null && t1 === normalizarTelefono(b.telefono)) ||
    (d1 !== null && d1 === normalizarDropi(b.cuenta_dropi))
  );
}

async function traer<T>(supabase: SupabaseClient, tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).order("created_at").range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

async function principal() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const referentes = await traer<Referente>(supabase, "referentes", "*");
  const referidos = await traer<Referido>(
    supabase,
    "referidos",
    "*",
  );
  const idsRef = new Map(referentes.map((f) => [f.id, identificadoresPersona(f)]));
  const porId = new Map(referentes.map((f) => [f.id, f]));
  const idsDe = new Map(referidos.map((r) => [r.id, identificadoresPersona(r)]));

  console.log(`\nReferentes: ${referentes.length} · Referidos: ${referidos.length}\n`);
  const etiqueta = (r: Referido) =>
    `${r.nombre ?? "—"} <${tapar(r.correo)}> (${r.estado_bono}, ${r.created_at.slice(0, 10)}, id ${r.id.slice(0, 8)})`;

  // 1. Auto-referidos en el formulario
  console.log("── 1. Auto-referidos (datos del formulario = datos del referente) ──");
  let n = 0;
  for (const r of referidos) {
    const f = porId.get(r.referente_id)!;
    if (coinciden(idsDe.get(r.id)!, idsRef.get(r.referente_id) ?? [])) {
      n++;
      console.log(`  • ${etiqueta(r)} → referente ${f.nombre}${reglaAnterior(r, f) ? "" : "  ⚠️ la regla anterior NO lo detectaba"}`);
    }
  }
  if (!n) console.log("  Ninguno.");

  // 2. Duplicados entre referidos
  console.log("\n── 2. Duplicados (la misma persona ya tenía un registro vigente o con bono) ──");
  n = 0;
  for (const [i, r] of referidos.entries()) {
    const creado = new Date(r.created_at).getTime();
    const previo = referidos.slice(0, i).find((x) => {
      if (!coinciden(idsDe.get(x.id)!, idsDe.get(r.id)!)) return false;
      const ocupaba =
        (x.confirmado_en ?? x.created_at) !== null &&
        new Date(x.confirmado_en ?? x.created_at).getTime() <= creado &&
        (!x.vencido_en || new Date(x.vencido_en).getTime() > creado) &&
        x.estado_bono !== "no_aplica";
      return ocupaba || (Boolean(x.bono_fijado_en) && new Date(x.bono_fijado_en!).getTime() <= creado) || x.estado_bono === "pagado" || x.estado_bono === "por_pagar";
    });
    if (previo) {
      n++;
      console.log(
        `  • ${etiqueta(r)} duplica a ${etiqueta(previo)}${reglaAnterior(r, previo) ? "" : "  ⚠️ la regla anterior NO lo detectaba"}`,
      );
    }
  }
  if (!n) console.log("  Ninguno.");

  // 3. Referidos que son otro referente
  console.log("\n── 3. Referidos cuyos datos coinciden con OTRO referente (quedarían marcados, no bloqueados) ──");
  n = 0;
  for (const r of referidos) {
    const otro = referentes.find((g) => g.id !== r.referente_id && coinciden(idsRef.get(g.id)!, idsDe.get(r.id)!));
    if (otro) {
      n++;
      console.log(`  • ${etiqueta(r)} coincide con el referente ${otro.nombre}`);
    }
  }
  if (!n) console.log("  Ninguno.");

  // 4. Referentes duplicados
  console.log("\n── 4. Referentes duplicados (dos cuentas de referente para la misma persona) ──");
  n = 0;
  for (const [i, f] of referentes.entries()) {
    const previo = referentes.slice(0, i).find((g) => coinciden(idsRef.get(g.id)!, idsRef.get(f.id)!));
    if (previo) {
      n++;
      console.log(
        `  • ${f.nombre} <${tapar(f.correo)}> (${f.created_at.slice(0, 10)}) = ${previo.nombre} <${tapar(previo.correo)}> (${previo.created_at.slice(0, 10)})`,
      );
    }
  }
  if (!n) console.log("  Ninguno.");

  // 5. Cruce con la hoja
  console.log("\n── 5. Cruce con la hoja de afiliados ──");
  let indice;
  try {
    const { leerAfiliados } = await import("../src/lib/hoja-afiliados");
    indice = await leerAfiliados();
  } catch (e) {
    console.log(`  No se pudo leer la hoja: ${e instanceof Error ? e.message : e}`);
    return;
  }
  console.log(`  Filas en la hoja: ${indice.filas}`);
  const porFila = new Map<number, Referido[]>();
  n = 0;
  for (const r of referidos) {
    const hallado = buscarEnHoja(idsDe.get(r.id)!, indice);
    if (!hallado) continue;
    const a = hallado.afiliado;
    porFila.set(a.fila, [...(porFila.get(a.fila) ?? []), r]);
    if (coinciden(identificadoresHoja(a.correo, a.telefono), idsRef.get(r.referente_id) ?? [])) {
      n++;
      console.log(
        `  • POSIBLE AUTO-REFERIDO: ${etiqueta(r)} → fila ${a.fila} de la hoja (${tapar(a.correo)} / ${tapar(a.telefono)}) coincide con su referente ${porId.get(r.referente_id)?.nombre}`,
      );
    }
  }
  if (!n) console.log("  Ningún posible auto-referido.");
  let m = 0;
  for (const [fila, lista] of porFila) {
    if (lista.length < 2) continue;
    m++;
    console.log(`  • Fila ${fila} de la hoja asociada a ${lista.length} referidos: ${lista.map(etiqueta).join(" | ")}`);
  }
  if (!m) console.log("  Ninguna fila de la hoja asociada a más de un referido.");
  console.log("");
}

principal().catch((e) => {
  console.error("No se pudo completar el reporte:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
