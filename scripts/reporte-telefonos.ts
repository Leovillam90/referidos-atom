/**
 * npm run reporte-telefonos
 * Revisa los celulares YA GUARDADOS (referentes y referidos) con las
 * reglas nuevas y muestra:
 *   • los que no se pudieron convertir al formato estándar (inválidos);
 *   • los que no son celular (fijos), son números falsos o están bloqueados;
 *   • los que aparecen en 3 o más registros (sospechosos);
 *   • si falta convertir alguno (= falta ejecutar supabase/schema.sql).
 * SOLO LEE: no cambia nada. Tapa parte de cada número; abre el link de
 * /admin para ver el registro completo.
 */
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { formatoTelefono, normalizarTelefono, paisDeTelefono, validarCelular } from "../src/lib/telefono";
import { urlSitio } from "../src/lib/sitio";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

type Fila = { id: string; nombre: string | null; telefono: string; telefono_pais: string | null; created_at: string };
type Registro = Fila & { tabla: "referentes" | "referidos" };

const MOTIVOS: Record<string, string> = {
  ilegible: "No se puede leer como teléfono",
  invalido: "No es un número válido para su país",
  otro_pais: "Es de un país que no está en la lista",
  fijo: "Es un teléfono fijo, no un celular",
  falso: "Número falso (repetido, secuencia o patrón)",
  bloqueado: "Está en la lista de números bloqueados",
};

function tapar(t: string) {
  // "+57 310 482 7756" → "+** *** *** 7756" (solo se ven los últimos 4 dígitos)
  const s = formatoTelefono(t) || t;
  return s.replace(/\d(?=(?:\D*\d){4})/g, "*");
}

async function traer(supabase: SupabaseClient, tabla: "referentes" | "referidos"): Promise<Registro[]> {
  const filas: Registro[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from(tabla)
      .select("id, nombre, telefono, telefono_pais, created_at")
      .order("created_at")
      .range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}. ¿Ejecutaste supabase/schema.sql?`);
    filas.push(...((data ?? []) as Fila[]).map((f) => ({ ...f, tabla })));
    if (!data || data.length < 1000) return filas;
  }
}

async function principal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const sitio = urlSitio();

  const [referentes, referidos, { data: bloqueados, error: errorBloqueados }] = await Promise.all([
    traer(supabase, "referentes"),
    traer(supabase, "referidos"),
    supabase.from("telefonos_bloqueados").select("telefono"),
  ]);
  if (errorBloqueados) throw new Error(`telefonos_bloqueados: ${errorBloqueados.message}. ¿Ejecutaste supabase/schema.sql?`);
  const listaBloqueados = new Set((bloqueados ?? []).map((b: { telefono: string }) => b.telefono));

  const todos = [...referentes, ...referidos];
  const problemas: { r: Registro; motivo: string }[] = [];
  const sinConvertir: Registro[] = [];
  const porNumero = new Map<string, Registro[]>();

  for (const r of todos) {
    const estandar = normalizarTelefono(r.telefono);
    if (!estandar) {
      problemas.push({ r, motivo: "ilegible" });
      continue;
    }
    if (estandar !== r.telefono || !r.telefono_pais) sinConvertir.push(r);
    porNumero.set(estandar, [...(porNumero.get(estandar) ?? []), r]);

    const v = validarCelular(`+${estandar}`, r.telefono_pais ?? paisDeTelefono(estandar));
    if (!v.ok) problemas.push({ r, motivo: v.motivo });
    else if (listaBloqueados.has(estandar)) problemas.push({ r, motivo: "bloqueado" });
  }

  const sospechosos = [...porNumero.entries()].filter(([, lista]) => lista.length >= 3);
  const link = (r: Registro) => `${sitio}/admin/${r.tabla}/${r.id}`;
  const quien = (r: Registro) => `${r.tabla === "referentes" ? "Referente" : "Referido"} ${r.nombre ?? "(sin nombre)"}`;

  console.log(`\nCelulares guardados: ${referentes.length} referentes y ${referidos.length} referidos.\n`);

  if (sinConvertir.length) {
    console.log(`⚠️  ${sinConvertir.length} aún no están en el formato estándar o no tienen país.`);
    console.log("   → Ejecuta supabase/schema.sql en Supabase (SQL Editor) y vuelve a correr este reporte.\n");
  } else {
    console.log("✅ Todos están en el formato estándar (E.164 sin \"+\") y tienen país.\n");
  }

  if (!problemas.length) console.log("✅ Ninguno es inválido, fijo, falso ni bloqueado.\n");
  else {
    console.log(`❌ ${problemas.length} no cumplen las reglas nuevas (se guardaron antes; no se borran ni se cambian):`);
    for (const motivo of Object.keys(MOTIVOS)) {
      const grupo = problemas.filter((p) => p.motivo === motivo);
      if (!grupo.length) continue;
      console.log(`\n   ${MOTIVOS[motivo]} (${grupo.length}):`);
      for (const { r } of grupo) console.log(`     • ${quien(r)} · ${tapar(r.telefono)} · ${link(r)}`);
    }
    console.log("");
  }

  if (!sospechosos.length) console.log("✅ Ningún celular aparece en 3 o más registros.\n");
  else {
    console.log(`⚠️  ${sospechosos.length} celulares aparecen en 3 o más registros (sospechosos, se ven en /admin):`);
    for (const [numero, lista] of sospechosos) {
      console.log(`\n   ${tapar(numero)} · ${lista.length} registros:`);
      for (const r of lista) console.log(`     • ${quien(r)} · ${link(r)}`);
    }
    console.log("");
  }
}

principal().catch((e) => {
  console.error("No se pudo hacer el reporte:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
