/**
 * npm test
 * Reglas del CELULAR (src/lib/telefono.ts). Los mismos casos se prueban
 * contra la base de datos con "npm run verificar".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAISES,
  detectarPais,
  ejemploCelular,
  esNumeroFalso,
  formatoTelefono,
  linkWhatsAppTelefono,
  mensajeCelular,
  normalizarTelefono,
  paisDeTelefono,
  validarCelular,
} from "../src/lib/telefono";
import { CASOS_RECHAZADOS, CASOS_VALIDOS } from "../src/lib/telefono-casos";
import { bloqueActual, bloqueSqlCelular } from "../src/lib/telefono-sql";
import { identificadoresPersona, mismaPersona } from "../src/lib/identidad";

for (const c of CASOS_VALIDOS) {
  test(`válido: ${c.pais} "${c.texto}" → ${c.telefono} (${c.nota})`, () => {
    const r = validarCelular(c.texto, c.pais);
    assert.ok(r.ok, `debió aceptarse: ${JSON.stringify(r)}`);
    assert.equal(r.telefono, c.telefono);
    assert.equal(r.pais, c.paisFinal);
  });
}

for (const c of CASOS_RECHAZADOS) {
  test(`rechazado: ${c.pais} "${c.texto}" (${c.nota})`, () => {
    const r = validarCelular(c.texto, c.pais);
    assert.equal(r.ok, false, `debió rechazarse: ${JSON.stringify(r)}`);
  });
}

test("el mensaje de rechazo nombra el país y un ejemplo", () => {
  assert.equal(mensajeCelular("CO"), "Escribe un celular válido de Colombia, por ejemplo 310 482 7756");
  const r = validarCelular("6012345678", "CO");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.motivo, "fijo");
    assert.equal(r.mensaje, mensajeCelular("CO"));
  }
});

test('pegar "+56 9 8765 4321" con Colombia elegido cambia el selector a Chile', () => {
  assert.equal(detectarPais("+56 9 8765 4321"), "CL");
  assert.equal(detectarPais("+1 787 482 7395"), "PR");
  assert.equal(detectarPais("0052 55 4827 3956"), "MX");
  // Sin "+" no se cambia el país elegido
  assert.equal(detectarPais("310 482 7756"), null);
});

test("Colombia primero, luego en orden alfabético (22 países)", () => {
  assert.equal(PAISES[0].iso, "CO");
  const resto = PAISES.slice(1).map((p) => p.nombre);
  assert.deepEqual(resto, [...resto].sort((a, b) => a.localeCompare(b, "es")));
  assert.equal(PAISES.length, 22);
});

test("los ejemplos de cada país son celulares válidos y no son secuencias", () => {
  for (const p of PAISES) {
    const ejemplo = ejemploCelular(p.iso);
    const r = validarCelular(ejemplo, p.iso);
    assert.ok(r.ok, `${p.iso}: el ejemplo "${ejemplo}" no pasa las reglas`);
    assert.equal(esNumeroFalso(p.ejemplo), false, `${p.iso}: el ejemplo es una secuencia`);
  }
  assert.equal(ejemploCelular("CO"), "310 482 7756");
});

test('cruce: TELEFONO "+57 310 482 7756" de la hoja = "3104827756" del formulario (Colombia)', () => {
  const formulario = validarCelular("3104827756", "CO");
  assert.ok(formulario.ok);
  assert.equal(normalizarTelefono("+57 310 482 7756"), formulario.telefono);
  assert.equal(mismaPersona({ telefono: "+57 310 482 7756" }, { telefono: formulario.telefono }), true);
});

test('cruce: TELEFONO "3104827756" sin indicativo se toma como Colombia', () => {
  assert.equal(normalizarTelefono("3104827756"), "573104827756");
  // Google Sheets puede entregar el número como número, no como texto
  assert.equal(normalizarTelefono(3104827756), "573104827756");
  // Con indicativo pero sin "+": se detecta el país
  assert.equal(normalizarTelefono("525548273956"), "525548273956");
  assert.equal(normalizarTelefono("573104827756"), "573104827756");
});

test("cruce: un TELEFONO inválido en la hoja se ignora (no falla)", () => {
  assert.equal(normalizarTelefono("no tiene"), null);
  assert.equal(normalizarTelefono("123"), null);
  assert.equal(normalizarTelefono(""), null);
});

test("identidad: el celular guardado de otro país sigue siendo el mismo identificador", () => {
  assert.ok(identificadoresPersona({ telefono: "525548273956" }).includes("525548273956"));
  assert.ok(identificadoresPersona({ cuenta_dropi: "+57 310 482 7756" }).includes("573104827756"));
});

test("pantalla, WhatsApp y país", () => {
  assert.equal(formatoTelefono("573104827756"), "+57 310 482 7756");
  assert.equal(formatoTelefono("5491148273956"), "+54 9 11 4827 3956");
  assert.equal(linkWhatsAppTelefono("573104827756"), "https://wa.me/573104827756");
  assert.equal(paisDeTelefono("573104827756"), "CO");
  assert.equal(paisDeTelefono("18094827395"), "DO");
});

test("números falsos (regla 4c)", () => {
  for (const n of ["3000000000", "3111111111", "3123456789", "3987654321", "3121212121", "3003003003", "3123123123", "3555555559"]) {
    assert.equal(esNumeroFalso(n), true, n);
  }
  for (const n of ["3104827756", "3159082241", "3204417893"]) assert.equal(esNumeroFalso(n), false, n);
});

test("supabase/schema.sql tiene los patrones de celular al día (si falla: npm run generar-sql-telefono)", () => {
  const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
  assert.equal(bloqueActual(schema), bloqueSqlCelular());
});
