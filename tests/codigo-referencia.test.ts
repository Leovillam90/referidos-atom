import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoReferencia, FORMATO_CODIGO_REFERENCIA } from "../src/lib/codigo-referencia";

test("el código de referencia tiene el formato R-XXXX", () => {
  for (let i = 0; i < 200; i++) assert.match(codigoReferencia(), FORMATO_CODIGO_REFERENCIA);
});

test("los códigos de referencia varían", () => {
  const codigos = new Set(Array.from({ length: 50 }, () => codigoReferencia()));
  assert.ok(codigos.size > 40);
});
