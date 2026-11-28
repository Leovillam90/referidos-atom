import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta: npm run test:e2e
 * El servidor de pruebas NUNCA usa la base ni la hoja de producción (ver
 * scripts/servidor-e2e.ts). Corre en PC y en celular.
 * Usa el Chrome instalado en el computador (no descarga navegadores).
 */
const PUERTO = process.env.E2E_PUERTO ?? "3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    channel: process.env.E2E_NAVEGADOR ?? "chrome",
    trace: "retain-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [
    { name: "pc", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_NAVEGADOR ?? "chrome" } },
    { name: "celular", use: { ...devices["Pixel 7"], channel: process.env.E2E_NAVEGADOR ?? "chrome" } },
  ],
  webServer: {
    command: "npx tsx scripts/servidor-e2e.ts",
    url: `http://localhost:${PUERTO}/terminos`,
    timeout: 240_000,
    reuseExistingServer: process.env.E2E_REUSAR === "1",
    stdout: "ignore",
    stderr: "pipe",
  },
});
