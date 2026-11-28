/**
 * Pruebas de punta a punta que NO necesitan base de datos: páginas
 * públicas, accesos negados, cabeceras de seguridad, validaciones del
 * formulario, tamaños de pantalla, teclado y animaciones reducidas.
 */
import { expect, test } from "@playwright/test";

const PAGINAS_PUBLICAS = ["/", "/registro", "/ingresar", "/gracias", "/terminos", "/politica-datos"];

test.describe("páginas públicas", () => {
  for (const ruta of PAGINAS_PUBLICAS) {
    test(`${ruta} carga, tiene título y no tiene errores en la consola`, async ({ page }) => {
      const errores: string[] = [];
      page.on("pageerror", (e) => errores.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) errores.push(m.text());
      });
      const r = await page.goto(ruta);
      expect(r?.status()).toBe(200);
      await expect(page).toHaveTitle(/ATOM/);
      expect(await page.locator("h1, [data-slot=card-title]").count()).toBeGreaterThan(0);
      expect(errores).toEqual([]);
    });
  }

  test("página que no existe → 404 en español", async ({ page }) => {
    const r = await page.goto("/esta-pagina-no-existe");
    expect(r?.status()).toBe(404);
    await expect(page.getByText("Esta página no existe")).toBeVisible();
  });
});

test.describe("cabeceras de seguridad", () => {
  test("todas las páginas las envían", async ({ request }) => {
    const r = await request.get("/registro");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("acceso negado", () => {
  test("visitante sin sesión → /panel lo manda a /ingresar", async ({ page }) => {
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("visitante sin sesión → /admin lo manda a /ingresar", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/ingresar$/);
    await page.goto("/admin/reglas");
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("visitante sin sesión no puede descargar reportes ni soportes", async ({ request }) => {
    for (const ruta of ["/admin/exportar?vista=referidos", "/soporte/00000000-0000-0000-0000-000000000000"]) {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect([302, 307, 401, 403]).toContain(r.status());
      expect(await r.text()).not.toContain("@");
    }
  });

  test("el cron exige CRON_SECRET", async ({ request }) => {
    expect((await request.get("/api/cruce")).status()).toBe(401);
    expect((await request.get("/api/cruce", { headers: { authorization: "Bearer otra-clave-cualquiera-123456" } })).status()).toBe(401);
  });

  test("/api/salud exige clave o sesión de super_admin", async ({ request }) => {
    expect((await request.get("/api/salud")).status()).toBe(401);
  });

  test("/auth/confirm no redirige a otros sitios", async ({ request }) => {
    for (const next of ["//malo.com", "/\\malo.com", "https://malo.com"]) {
      const r = await request.get(`/auth/confirm?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      const destino = r.headers()["location"] ?? "";
      expect(destino).not.toContain("malo.com");
    }
  });
});

test.describe("formulario de registro de referente", () => {
  test("sin casillas ni datos: muestra los errores y no envía nada", async ({ page }) => {
    await page.goto("/registro");
    await page.getByRole("button", { name: "Registrarme" }).click();
    await expect(page.getByText(/Debes aceptar la política de tratamiento de datos/)).toBeVisible();
    await expect(page.getByText(/Debes aceptar los términos/)).toBeVisible();
  });

  for (const falso of ["3000000000", "3123456789", "3121212121"]) {
    test(`celular falso ${falso} rechazado`, async ({ page }) => {
      await page.goto("/registro");
      await page.getByLabel("Nombre completo").fill("Persona de Prueba");
      await page.getByLabel("Correo").fill("persona.prueba@ejemplo-e2e.co");
      await page.locator("input[name=telefono]").fill(falso);
      await page.getByLabel("Cuenta Dropi").fill("tiendaprueba");
      await page.locator("input[name=autoriza_datos]").check();
      await page.locator("input[name=acepta_terminos]").check();
      await page.getByRole("button", { name: "Registrarme" }).click();
      await expect(page.locator("#telefono-error, [id$=telefono-error], p.text-destructive").first()).toBeVisible();
      await expect(page.getByText(/Te enviamos un link/)).toHaveCount(0);
    });
  }

  test("se puede llenar solo con el teclado y el foco se ve", async ({ page, isMobile }) => {
    test.skip(isMobile, "en celular no hay teclado físico");
    await page.goto("/registro");
    await page.getByLabel("Nombre completo").focus();
    await page.keyboard.type("Ana");
    await page.keyboard.press("Tab");
    const enfocado = await page.evaluate(() => document.activeElement?.getAttribute("name"));
    expect(enfocado).toBe("correo");
    // El campo enfocado tiene un indicador visible (anillo o borde)
    const estilo = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement;
      const s = getComputedStyle(e);
      return `${s.outlineStyle} ${s.boxShadow}`;
    });
    expect(estilo).not.toBe("none none");
  });
});

test.describe("tamaños de pantalla: sin scroll horizontal", () => {
  const ANCHOS = [360, 390, 430, 768, 1280, 1440, 1920];
  for (const ruta of PAGINAS_PUBLICAS) {
    test(`${ruta}`, async ({ page, isMobile }) => {
      test.skip(isMobile, "los anchos se prueban en el proyecto de PC");
      for (const ancho of ANCHOS) {
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.goto(ruta);
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sobra, `${ruta} a ${ancho}px tiene ${sobra}px de scroll horizontal`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe("animaciones", () => {
  test("con 'reducir movimiento' la mascota y el fondo quedan quietos", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const animadas = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>(".anim-flotar, .anim-fondo-a, .anim-fondo-b, .anim-particula, .anim-salto")]
          .filter((e) => getComputedStyle(e).animationName !== "none").length,
    );
    expect(animadas).toBe(0);
  });
});
