/**
 * npm run verificar
 * Revisa la configuración de la app y muestra ✅ / ⚠️ / ❌ con qué hacer.
 * Nunca imprime el valor de una variable.
 * Con "-- --produccion" exige además el dominio de producción en NEXT_PUBLIC_SITE_URL.
 */
import { loadEnvConfig } from "@next/env";

// Carga .env.local (y los demás .env) igual que Next.js
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

// "npm run verificar -- --produccion": revisa como en producción (exige el dominio oficial)
if (process.argv.includes("--produccion")) process.env.VERIFICAR_PRODUCCION = "1";

const ICONO = { ok: "✅", aviso: "⚠️ ", error: "❌" } as const;

async function principal() {
  // Se importa después de cargar las variables
  const { verificarConfiguracion, contar } = await import("../src/lib/verificacion");

  console.log("\nRevisando la configuración de Referidos ATOM…\n");
  const grupos = await verificarConfiguracion();

  for (const g of grupos) {
    console.log(`── ${g.titulo} ──`);
    for (const r of g.resultados) {
      console.log(`${ICONO[r.estado]} ${r.titulo}`);
      if (r.detalle) console.log(`     ${r.detalle}`);
      if (r.solucion && r.estado !== "ok") console.log(`     → Qué hacer: ${r.solucion}`);
    }
    console.log("");
  }

  const t = contar(grupos);
  console.log(`Resultado: ${t.ok} bien, ${t.avisos} avisos, ${t.errores} por corregir.\n`);
  process.exitCode = t.errores > 0 ? 1 : 0;
}

principal().catch(async (e) => {
  const { limpiar } = await import("../src/lib/verificacion");
  console.error("No se pudo completar la revisión:", limpiar(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
