/**
 * npm test — utilidades de seguridad: redirecciones, CSV para Excel,
 * tipo real de los soportes, clave del cron y datos ocultos en los logs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rutaInterna } from "../src/lib/rutas";
import { aCsv, celdaSegura } from "../src/lib/csv";
import { tipoRealSoporte } from "../src/lib/archivos";
import { claveAutorizada } from "../src/lib/clave-servidor";
import { ocultarDatos } from "../src/lib/ocultar";

const ORIGEN = "https://referidos.ejemplo.co";

test("redirecciones: solo rutas internas", () => {
  assert.equal(rutaInterna("/panel", ORIGEN), "/panel");
  assert.equal(rutaInterna("/admin?vista=referidos", ORIGEN), "/admin?vista=referidos");
  assert.equal(rutaInterna(null, ORIGEN), "/panel");
  for (const malo of ["//malo.com", "/\\malo.com", "https://malo.com/panel", "\\\\malo.com", "javascript:alert(1)",
    "http://referidos.ejemplo.co/panel", "/%2F%2Fmalo.com"]) {
    const r = rutaInterna(malo, ORIGEN);
    assert.ok(r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\"), `${malo} → ${r}`);
    assert.equal(new URL(r, ORIGEN).origin, ORIGEN, malo);
  }
});

test("CSV: los textos que parecen fórmulas quedan como texto", () => {
  for (const f of ["=HYPERLINK(\"http://malo\")", "+1+1", "-2+3", "@SUM(A1)", " =1+1", "\t=1", "＝1+1"]) {
    const c = celdaSegura(f);
    assert.ok(c.replace(/^"/, "").startsWith("'"), `${JSON.stringify(f)} → ${c}`);
  }
  assert.equal(celdaSegura("Ana Pérez"), "Ana Pérez");
});

test("CSV: celulares como texto para Excel; si no son solo dígitos, van protegidos", () => {
  assert.equal(aCsv([[{ digitos: "573104827756" }]]), '"=""573104827756"""');
  assert.equal(aCsv([[{ digitos: "=1+1" }]]), "'=1+1");
  assert.equal(aCsv([["a;b", 1.5, null, 'di "hola"']]), '"a;b";1,5;;"di ""hola"""');
});

test("soportes: se reconoce el tipo real por el contenido, no por la extensión", () => {
  const b = (...x: number[]) => new Uint8Array([...x, ...new Array(16).fill(0)]);
  assert.equal(tipoRealSoporte(b(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(tipoRealSoporte(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(tipoRealSoporte(b(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)), "image/webp");
  assert.equal(tipoRealSoporte(new TextEncoder().encode("%PDF-1.7\n...")), "application/pdf");
  assert.equal(tipoRealSoporte(new TextEncoder().encode("<html><script>")), null);
  assert.equal(tipoRealSoporte(new TextEncoder().encode("MZ\x90\x00")), null); // ejecutable de Windows
});

test("clave del cron: exacta, con 'Bearer' y nunca vacía", () => {
  const clave = "a".repeat(40);
  assert.equal(claveAutorizada(`Bearer ${clave}`, clave), true);
  assert.equal(claveAutorizada(`Bearer ${clave}x`, clave), false);
  assert.equal(claveAutorizada(clave, clave), false);
  assert.equal(claveAutorizada("Bearer ", ""), false);
  assert.equal(claveAutorizada("Bearer undefined", undefined), false);
  assert.equal(claveAutorizada(null, clave), false);
});

test("logs: se ocultan correos, teléfonos y llaves", () => {
  const t = ocultarDatos(
    "550 ana.perez@gmail.com rechazado; tel +57 310 482 7756; sb_secret_abcdefghijklmnop; " +
      "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----",
  );
  assert.ok(!t.includes("ana.perez"), t);
  assert.ok(t.includes("a•••@gmail.com"), t);
  assert.ok(!t.includes("4827756"), t);
  assert.ok(!t.includes("abcdefghijklmnop"), t);
  assert.ok(!t.includes("MIIabc"), t);
  assert.equal(ocultarDatos("No se pudo leer la hoja"), "No se pudo leer la hoja");
});
