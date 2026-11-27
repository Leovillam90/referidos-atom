/**
 * npm test
 * Pruebas de la regla de identidad cruzada (src/lib/identidad.ts).
 * Las mismas reglas en la base de datos se prueban con
 * supabase/pruebas-identidad.sql.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buscarEnHoja,
  coinciden,
  esPosibleAutoReferido,
  identificadoresHoja,
  identificadoresPersona,
  mismaPersona,
  normalizarCorreoIdentidad,
  normalizarDropi,
} from "../src/lib/identidad";
import { normalizarTelefono } from "../src/lib/telefono";

const referente = {
  correo: "ana.gomez@empresa.co",
  telefono: "3105550000",
  cuenta_dropi: "tiendaana",
};

test("correo del referente puesto como cuenta Dropi del referido → bloquea", () => {
  const referido = { correo: "otra.persona@empresa.co", telefono: "3209998888", cuenta_dropi: " Ana.Gomez@Empresa.co " };
  assert.equal(mismaPersona(referido, referente), true);
});

test("cuenta Dropi del referente puesta como correo del referido → bloquea", () => {
  const conDropiCorreo = { correo: "ana@empresa.co", telefono: "3105550000", cuenta_dropi: "ventas.ana@gmail.com" };
  const referido = { correo: "ventasana+promo@gmail.com", telefono: "3001112222", cuenta_dropi: "otra" };
  assert.equal(mismaPersona(referido, conDropiCorreo), true);
});

test("juan.perez+1@gmail.com vs juanperez@gmail.com → misma persona", () => {
  assert.equal(normalizarCorreoIdentidad("juan.perez+1@gmail.com"), "juanperez@gmail.com");
  assert.equal(
    mismaPersona({ correo: "juan.perez+1@gmail.com" }, { correo: "juanperez@gmail.com" }),
    true,
  );
  // googlemail.com es el mismo buzón
  assert.equal(normalizarCorreoIdentidad("Juan.Perez@GoogleMail.com"), "juanperez@gmail.com");
});

test('teléfono "+57 300 123 4567" vs "3001234567" → misma persona (formato estándar 573001234567)', () => {
  assert.equal(normalizarTelefono("+57 300 123 4567"), "573001234567");
  assert.equal(mismaPersona({ telefono: "+57 300 123 4567" }, { telefono: "3001234567" }), true);
});

test("teléfono escrito como cuenta Dropi también cuenta", () => {
  assert.equal(mismaPersona({ cuenta_dropi: "+57 310 555 0000" }, referente), true);
});

test("datos distintos en el formulario pero buyer_email de la hoja = correo del referente → posible_auto_referido", () => {
  const referido = { correo: "cliente.nuevo@otra.com", telefono: "3157778899", cuenta_dropi: "clientenuevo" };
  // En el formulario NO coincide con el referente…
  assert.equal(mismaPersona(referido, referente), false);

  // …pero en la hoja se encuentra por su teléfono y la fila tiene el correo del referente
  const fila = { correo: normalizarCorreoIdentidad("ANA.GOMEZ@empresa.co"), telefono: normalizarTelefono("3157778899") };
  const indice = {
    porCorreo: new Map([[fila.correo!, fila]]),
    porTelefono: new Map([[fila.telefono!, fila]]),
  };
  const hallado = buscarEnHoja(identificadoresPersona(referido), indice);
  assert.ok(hallado, "el referido debe aparecer en la hoja");
  assert.equal(hallado.cruce_por, "telefono");
  assert.equal(
    esPosibleAutoReferido(identificadoresHoja(hallado.afiliado.correo, hallado.afiliado.telefono), identificadoresPersona(referente)),
    true,
  );
});

test("TELEFONO de la hoja = teléfono del referente → posible_auto_referido", () => {
  assert.equal(
    esPosibleAutoReferido(identificadoresHoja("alguien@otra.com", "+57 310 555 0000"), identificadoresPersona(referente)),
    true,
  );
});

test("personas distintas no coinciden", () => {
  const otro = { correo: "pedro@otra.com", telefono: "3001234567", cuenta_dropi: "pedrotienda" };
  assert.equal(mismaPersona(otro, referente), false);
  assert.equal(esPosibleAutoReferido(identificadoresHoja("pedro@otra.com", "3001234567"), identificadoresPersona(referente)), false);
});

test("respuestas como «no tengo» en la cuenta Dropi no identifican a nadie", () => {
  assert.equal(normalizarDropi("No tengo"), null);
  assert.equal(normalizarDropi("N/A"), null);
  assert.equal(mismaPersona({ cuenta_dropi: "no tengo" }, { cuenta_dropi: "No tengo" }), false);
});

test("el cruce busca en la hoja con cualquier identificador (correo escrito en la cuenta Dropi)", () => {
  const fila = { correo: "maria@gmail.com", telefono: "3000000001" };
  const indice = { porCorreo: new Map([["maria@gmail.com", fila]]), porTelefono: new Map<string, typeof fila>() };
  const ids = identificadoresPersona({ correo: "maria.trabajo@empresa.co", telefono: "3110000000", cuenta_dropi: "Maria@gmail.com" });
  assert.equal(buscarEnHoja(ids, indice)?.afiliado, fila);
});

test("coinciden() compara todas las combinaciones y no falla con listas vacías", () => {
  assert.equal(coinciden(["a", "b"], ["c", "b"]), true);
  assert.equal(coinciden([], ["a"]), false);
  assert.equal(coinciden(["a"], []), false);
});
