/**
 * Servidor para las pruebas de punta a punta (npm run test:e2e).
 *
 * NUNCA usa tus variables de producción: TODAS las de .env.local y
 * .env.example se dejan vacías y solo se usan las de .env.e2e (o, si no
 * existe, valores de prueba que no se conectan a nada real). Next.js no
 * reemplaza una variable que ya existe, aunque esté vacía.
 *
 *   Sin .env.e2e  → Supabase apunta a http://127.0.0.1:54321 (Supabase
 *                   local; si no está corriendo, las páginas que leen la
 *                   base muestran su mensaje de error). Sin hoja, sin
 *                   correo real y sin Turnstile.
 *   Con .env.e2e  → la base de PRUEBAS que configures ahí (Supabase local
 *                   con "supabase start" o un proyecto aparte). Se
 *                   rechaza si es el mismo proyecto de .env.local.
 *
 * Compila en .next-e2e (no toca tu .next) y arranca en el puerto 3100.
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..");
const PUERTO = process.env.E2E_PUERTO ?? "3100";

function leerEnv(archivo: string): Record<string, string> {
  const ruta = join(RAIZ, archivo);
  if (!existsSync(ruta)) return {};
  const salida: Record<string, string> = {};
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) salida[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return salida;
}

const produccion = leerEnv(".env.local");
const pruebas = leerEnv(".env.e2e");

const POR_DEFECTO: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: `http://localhost:${PUERTO}`,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_pruebas_e2e",
  SUPABASE_SECRET_KEY: "sb_secret_pruebas_e2e_no_es_real",
  CRON_SECRET: "clave-de-pruebas-e2e-no-es-la-real-0123456789",
  POLITICA_DATOS_VERSION: "e2e-1",
  TERMINOS_VERSION: "e2e-1",
  WHATSAPP_CAPACITACION: "573104827756",
};

const env: NodeJS.ProcessEnv = { ...process.env };
for (const k of new Set([...Object.keys(produccion), ...Object.keys(leerEnv(".env.example"))])) env[k] = "";
Object.assign(env, POR_DEFECTO, pruebas, { E2E_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" });

// Protección: nunca contra la base de producción
const urlPrueba = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const urlProduccion = (produccion.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
if (urlProduccion && urlPrueba === urlProduccion) {
  console.error("✖ .env.e2e apunta al MISMO proyecto de Supabase que .env.local (producción). Usa una base de pruebas.");
  process.exit(1);
}
if (pruebas.GOOGLE_SHEET_ID && pruebas.GOOGLE_SHEET_ID === produccion.GOOGLE_SHEET_ID) {
  console.error("✖ .env.e2e usa la hoja REAL de afiliados. Las pruebas usan una hoja simulada: quita GOOGLE_SHEET_ID.");
  process.exit(1);
}

const next = join(RAIZ, "node_modules", "next", "dist", "bin", "next");
if (process.env.E2E_SIN_BUILD !== "1") {
  const build = spawnSync(process.execPath, [next, "build"], { cwd: RAIZ, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const servidor = spawn(process.execPath, [next, "start", "-p", PUERTO], { cwd: RAIZ, env, stdio: "inherit" });
servidor.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, () => servidor.kill(s));
