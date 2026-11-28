/**
 * npm test — la app (src/lib/identidad.ts, src/lib/telefono.ts) y la base
 * de datos (supabase/schema.sql) deben normalizar EXACTAMENTE igual el
 * correo, el celular y la cuenta Dropi. Si no, la app diría "puedes
 * registrarte" y la base lo rechazaría (o al revés).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearBasePrueba, type BasePrueba } from "./apoyo/base-prueba";
import { identificadoresPersona, normalizarCorreoIdentidad, normalizarDropi } from "../src/lib/identidad";
import { normalizarTelefono } from "../src/lib/telefono";

let b: BasePrueba;
before(async () => {
  b = await crearBasePrueba();
});
after(() => b.cerrar());

const CORREOS = [
  " Ana.Perez+atom@Gmail.com ", "juan.perez@googlemail.com", "VENTAS@Empresa.CO", "a.b.c+x+y@gmail.com",
  "sin-arroba", "", "  ", "persona@sub.dominio.com.co",
];
const TELEFONOS = ["+57 310-482 7756", "0057 3104827756", "3104827756", "525548273956", "(310) 482.7756", "", "abc", "6012345678"];
const DROPI = [
  "no tengo", "N/A", "ninguna", "@TiendaAna", "Ana.Perez+promo@gmail.com", "+57 310 482 7756", "tienda ana", "xx",
  "pendiente por crear", "000", "Tienda-Ana_2", "ab",
];

test("correo: la app y la base normalizan igual", async () => {
  for (const c of CORREOS) {
    const [{ v }] = await b.sql<{ v: string | null }>(`select public.normalizar_correo_identidad($1) as v`, [c]);
    assert.equal(normalizarCorreoIdentidad(c), v, JSON.stringify(c));
  }
});

test("celular: la app y la base normalizan igual", async () => {
  for (const t of TELEFONOS) {
    const [{ v }] = await b.sql<{ v: string | null }>(`select public.normalizar_telefono($1) as v`, [t]);
    assert.equal(normalizarTelefono(t), v, JSON.stringify(t));
  }
});

test("cuenta Dropi: la app y la base normalizan igual", async () => {
  for (const d of DROPI) {
    const [{ v }] = await b.sql<{ v: string | null }>(`select public.normalizar_dropi($1) as v`, [d]);
    assert.equal(normalizarDropi(d), v, JSON.stringify(d));
  }
});

test("conjunto de identificadores: la app y la base dan el mismo resultado", async () => {
  const casos = [
    { correo: "Ana.Perez+1@gmail.com", telefono: "573104827756", cuenta_dropi: "AnaPerez@Gmail.com" },
    { correo: "ventas@empresa.co", telefono: "+57 320 998 8877", cuenta_dropi: "+57 310 482 7756" },
    { correo: "x@y.co", telefono: "", cuenta_dropi: "no tengo" },
  ];
  for (const p of casos) {
    const [{ v }] = await b.sql<{ v: string[] }>(`select public.identificadores_persona($1, $2, $3) as v`, [
      p.correo, p.telefono, p.cuenta_dropi,
    ]);
    assert.deepEqual(identificadoresPersona(p), v, JSON.stringify(p));
  }
});
