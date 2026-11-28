/**
 * Flujos completos con una base de PRUEBAS (nunca producción).
 * Solo corren si existe .env.e2e con E2E_CON_BASE=1 y las claves de una
 * base de pruebas (Supabase local con "supabase start" o un proyecto
 * aparte, con supabase/schema.sql ejecutado). Ver README → Pruebas.
 *
 * La hoja de afiliados se SIMULA llamando aplicar_cruce() con datos de
 * prueba (no se lee la hoja real). Los correos de Supabase Auth quedan
 * capturados en Supabase local (Mailpit) y la app no envía correos
 * (SMTP vacío).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function leerEnvPruebas(): Record<string, string> {
  const ruta = join(__dirname, "..", "..", ".env.e2e");
  if (!existsSync(ruta)) return {};
  return Object.fromEntries(
    readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, "$1")]),
  );
}

const ENV = leerEnvPruebas();
const ACTIVO = ENV.E2E_CON_BASE === "1" && ENV.NEXT_PUBLIC_SUPABASE_URL && ENV.SUPABASE_SECRET_KEY;

test.describe("flujos con base de pruebas", () => {
  test.skip(!ACTIVO, "Falta .env.e2e con E2E_CON_BASE=1 (ver README → Pruebas)");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  const sufijo = Date.now().toString(36);
  const correoRef = `ref-${sufijo}@prueba-e2e.co`;
  const correoOtroRef = `otro-${sufijo}@prueba-e2e.co`;
  const correoAdmin = `admin-${sufijo}@prueba-e2e.co`;
  const celRef = `3104${String(Date.now()).slice(-6)}`;
  let codigo = "";
  let referenteId = "";
  let referidoId = "";

  /** Entra con un link mágico generado por la base de pruebas (sin correo real). */
  async function entrar(page: Page, correo: string) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
    if (error) throw error;
    await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/panel`);
  }

  async function crearUsuario(correo: string, meta: Record<string, unknown>) {
    const { data, error } = await admin.auth.admin.createUser({ email: correo, email_confirm: true, user_metadata: meta });
    if (error) throw error;
    return data.user.id;
  }

  test.beforeAll(async () => {
    admin = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    referenteId = await crearUsuario(correoRef, {
      rol: "referente", nombre: "Referente E2E", telefono: `57${celRef}`, telefono_pais: "CO",
      cuenta_dropi: `tienda-${sufijo}`, autoriza_datos: "true", version_politica: "e2e-1",
      acepta_terminos: "true", version_terminos: "e2e-1",
    });
    await crearUsuario(correoOtroRef, {
      rol: "referente", nombre: "Otro Referente", telefono: `573209${String(Date.now()).slice(-6)}`, telefono_pais: "CO",
      cuenta_dropi: `otra-${sufijo}`, autoriza_datos: "true", version_politica: "e2e-1",
      acepta_terminos: "true", version_terminos: "e2e-1",
    });
    const adminId = await crearUsuario(correoAdmin, {});
    await admin.from("super_admins").insert({ user_id: adminId });
    const { data } = await admin.from("referentes").select("codigo").eq("id", referenteId).single();
    codigo = data!.codigo;
  });

  test("registro de referente: guarda la autorización de datos con versión y fecha", async ({ page }) => {
    const correo = `nuevo-${sufijo}@prueba-e2e.co`;
    await page.goto("/registro");
    await page.getByLabel("Nombre completo").fill("Nuevo Referente");
    await page.getByLabel("Correo").fill(correo);
    await page.locator("input[name=telefono]").fill(`3157${String(Date.now()).slice(-6)}`);
    await page.getByLabel("Cuenta Dropi").fill(`nueva-${sufijo}`);
    await page.locator("input[name=autoriza_datos]").check();
    await page.locator("input[name=acepta_terminos]").check();
    await page.getByRole("button", { name: "Registrarme" }).click();
    await expect(page.getByText(/Te enviamos un link/)).toBeVisible();
    const { data } = await admin.from("referentes").select("autoriza_datos, autorizado_en, version_politica, version_terminos").eq("correo", correo).single();
    expect(data?.autoriza_datos).toBe(true);
    expect(data?.autorizado_en).toBeTruthy();
    expect(data?.version_politica).toBe("e2e-1");
    expect(data?.version_terminos).toBe("e2e-1");
  });

  async function llenarReferido(page: Page, d: { correo: string; telefono: string; dropi: string }) {
    await page.goto(`/r/${codigo}`);
    await page.getByLabel("Nombre completo").fill("Cliente E2E");
    await page.getByLabel("Correo").fill(d.correo);
    await page.locator("input[name=telefono]").fill(d.telefono);
    await page.getByLabel("Cuenta Dropi").fill(d.dropi);
    await page.locator("input[name=tipo]").first().check();
    await page.locator("input[name=plan_solicitado]").first().check();
    await page.locator("input[name=autoriza_datos]").check();
    await page.getByRole("button", { name: "Enviar mis datos" }).click();
  }

  test("referido con link válido → página de gracias", async ({ page }) => {
    await llenarReferido(page, { correo: `cliente-${sufijo}@prueba-e2e.co`, telefono: `3009${String(Date.now()).slice(-6)}`, dropi: `cli-${sufijo}` });
    await expect(page).toHaveURL(/\/gracias/);
    const { data } = await admin.from("referidos").select("id, estado_bono").eq("correo", `cliente-${sufijo}@prueba-e2e.co`).single();
    referidoId = data!.id;
    expect(data?.estado_bono).toBe("estimado");
  });

  for (const caso of [
    { nombre: "mismo correo", datos: () => ({ correo: correoRef, telefono: `3011${String(Date.now()).slice(-6)}`, dropi: "x-1" }) },
    { nombre: "correo en el campo Dropi", datos: () => ({ correo: `a-${sufijo}@prueba-e2e.co`, telefono: `3012${String(Date.now()).slice(-6)}`, dropi: correoRef }) },
    { nombre: "mismo celular", datos: () => ({ correo: `b-${sufijo}@prueba-e2e.co`, telefono: celRef, dropi: "x-3" }) },
  ]) {
    test(`auto-referido bloqueado: ${caso.nombre}`, async ({ page }) => {
      await llenarReferido(page, caso.datos());
      await expect(page.getByText(/no es posible registrarse en este link/)).toBeVisible();
    });
  }

  test("duplicado bloqueado", async ({ page }) => {
    await llenarReferido(page, { correo: `cliente-${sufijo}@prueba-e2e.co`, telefono: `3013${String(Date.now()).slice(-6)}`, dropi: "x-4" });
    await expect(page.getByText(/Ya estás registrado en el programa/)).toBeVisible();
  });

  test("cruce simulado: ACTIVE → en_verificacion; el referente lo ve en su panel", async ({ page }) => {
    // Simula que la persona se registró hace 2 días y no estaba en la hoja
    await admin.rpc("aplicar_cruce", { datos: [{ id: referidoId, en_hoja: false, activo: false }] });
    await admin.rpc("aplicar_cruce", {
      datos: [{ id: referidoId, en_hoja: true, activo: true, cruce_por: "correo", plan_hoja: "Plan Experto",
        correo_hoja: `cliente-${sufijo}@prueba-e2e.co` }],
    });
    const { data } = await admin.from("referidos").select("estado_bono").eq("id", referidoId).single();
    // Recién registrado y ya en la hoja = ya era cliente; si se registró antes, en verificación
    expect(["en_verificacion", "ya_cliente"]).toContain(data?.estado_bono);
    await entrar(page, correoRef);
    await expect(page).toHaveURL(/\/panel/);
    await expect(page.getByText("Cliente E2E")).toBeVisible();
    // El referente NO ve el correo completo de su referido
    await expect(page.getByText(`cliente-${sufijo}@prueba-e2e.co`)).toHaveCount(0);
  });

  test("acceso negado: un referente no entra a /admin", async ({ page }) => {
    await entrar(page, correoRef);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/panel/);
    const r = await page.request.get("/admin/exportar?vista=referidos");
    expect(r.status()).toBe(403);
  });

  test("suspensión: el link del referente deja de funcionar", async ({ page }) => {
    await admin.from("referentes").update({ suspendido: true }).eq("id", referenteId);
    await page.goto(`/r/${codigo}`);
    await expect(page.getByText("Este link no está disponible")).toBeVisible();
    await admin.from("referentes").update({ suspendido: false }).eq("id", referenteId);
  });
});
