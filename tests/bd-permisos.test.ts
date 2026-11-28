/**
 * npm test — quién puede ver y hacer qué (Row Level Security y permisos),
 * en una base de PRUEBA en memoria con supabase/schema.sql.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarCruce,
  crearBasePrueba,
  crearReferente,
  crearReferido,
  retroceder,
  recalcular,
  type BasePrueba,
} from "./apoyo/base-prueba";

let b: BasePrueba;
let ana: { id: string; codigo: string };
let beto: { id: string; codigo: string };
let adminId: string;
let referidoDeAna: string;
let referidoDeBeto: string;

const sesion = (uid: string, email?: string) => ({ rol: "authenticated" as const, uid, email });

before(async () => {
  b = await crearBasePrueba();
  ana = await crearReferente(b, { correo: "ana@empresa-prueba.co" });
  beto = await crearReferente(b, { correo: "beto@empresa-prueba.co" });
  [{ id: adminId }] = await b.sql<{ id: string }>(
    `insert into auth.users (email) values ('admin@empresa-prueba.co') returning id`,
  );
  await b.sql(`insert into public.super_admins (user_id) values ($1)`, [adminId]);
  ({ id: referidoDeAna } = await crearReferido(b, ana.id, { correo: "cliente1@correo-prueba.co" }));
  ({ id: referidoDeBeto } = await crearReferido(b, beto.id, { correo: "cliente2@correo-prueba.co" }));
});

after(() => b.cerrar());

test("un visitante sin sesión (anon) no puede leer ninguna tabla", async () => {
  for (const tabla of ["referentes", "referidos", "pagos", "planes", "super_admins", "reglas_programa", "errores_sistema"]) {
    await assert.rejects(b.como({ rol: "anon" }, `select * from public.${tabla}`), /permission denied/, tabla);
  }
});

test("un visitante sin sesión no puede crear referidos directamente", async () => {
  await assert.rejects(
    b.como({ rol: "anon" }, `insert into public.referidos (referente_id, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica)
      values ($1, 'x@y.co', '573104827756', 'x', 'marca', true, 'v')`, [ana.id]),
    /permission denied/,
  );
});

test("el referente solo ve SU fila de referente", async () => {
  const filas = await b.como<{ id: string }>(sesion(ana.id), `select id from public.referentes`);
  assert.deepEqual(filas.map((f) => f.id), [ana.id]);
});

test("el referente solo ve SUS referidos", async () => {
  const filas = await b.como<{ id: string }>(sesion(ana.id), `select id from public.referidos`);
  assert.deepEqual(filas.map((f) => f.id), [referidoDeAna]);
});

test("el referente NO puede leer correo, celular ni cuenta Dropi de sus referidos", async () => {
  for (const col of ["correo", "telefono", "telefono_normalizado", "cuenta_dropi", "correo_identidad",
    "dropi_normalizada", "identificadores", "hoja_identificadores", "ip_origen", "user_agent", "token_confirmacion_hash"]) {
    await assert.rejects(b.como(sesion(ana.id), `select ${col} from public.referidos`), /permission denied/, col);
  }
  const [r] = await b.como<{ correo_oculto: string; nombre: string }>(
    sesion(ana.id), `select nombre, correo_oculto from public.referidos`);
  assert.equal(r.correo_oculto, "cl•••@correo-prueba.co");
});

test("el referente no puede cambiar su fila (ni rol, ni código, ni suspensión, ni datos)", async () => {
  for (const set of ["nombre = 'Otro'", "suspendido = false", "codigo = 'ZZZZZZZZ'", "cuenta_dropi = 'otra@persona.co'"]) {
    await assert.rejects(b.como(sesion(ana.id), `update public.referentes set ${set} where id = $1`, [ana.id]),
      /permission denied/, set);
  }
});

test("nadie puede nombrarse super_admin", async () => {
  await assert.rejects(
    b.como(sesion(ana.id), `insert into public.super_admins (user_id) values ($1)`, [ana.id]),
    /permission denied/,
  );
  const [{ es }] = await b.como<{ es: boolean }>(sesion(ana.id), `select public.es_super_admin() as es`);
  assert.equal(es, false);
});

test("el referente no puede cambiar ni borrar referidos, pagos, reglas ni historial", async () => {
  await assert.rejects(b.como(sesion(ana.id), `update public.referidos set estado_bono = 'por_pagar'`), /permission denied/);
  await assert.rejects(b.como(sesion(ana.id), `delete from public.referidos`), /permission denied/);
  await assert.rejects(b.como(sesion(ana.id), `truncate public.referidos`), /permission denied/);
  await assert.rejects(b.como(sesion(ana.id), `update public.reglas_programa set dias_vigencia_registro = 365`), /permission denied/);
  await assert.rejects(b.como(sesion(ana.id), `insert into public.pagos (referente_id, fecha_pago, valor_pagado, soporte_path)
    values ($1, now(), 1, 'x')`, [ana.id]), /permission denied/);
});

test("solo el super_admin edita, suspende, cambia reglas y registra pagos (las funciones lo verifican)", async () => {
  const llamadas = [
    [`select public.editar_referido($1, null, true, 99999, 'por_pagar', null, 'motivo de prueba')`, [referidoDeAna]],
    [`select public.volver_a_usar_hoja($1, 'motivo de prueba')`, [referidoDeAna]],
    [`select public.suspender_referente($1, 'motivo de prueba')`, [beto.id]],
    [`select public.reactivar_referente($1, 'motivo de prueba')`, [beto.id]],
    [`select public.actualizar_reglas(30, 0, false, '', 1000)`, []],
    [`select public.registrar_pago($1::uuid, array[$2]::uuid[], current_date, 1, null, $1::text || '/x.pdf')`, [ana.id, referidoDeAna]],
  ] as const;
  for (const [consulta, params] of llamadas) {
    await assert.rejects(b.como(sesion(ana.id), consulta, [...params]), /super_admin/, consulta);
  }
});

test("el referente no puede ejecutar las funciones del servidor (cruce, confirmación, diagnóstico)", async () => {
  for (const f of [`public.aplicar_cruce('[]'::jsonb)`, `public.revisar_vencimientos()`, `public.diagnostico()`,
    `public.confirmar_referido('x')`, `public.iniciar_cruce('admin')`]) {
    await assert.rejects(b.como(sesion(ana.id), `select ${f}`), /permission denied/, f);
  }
});

test("el super_admin ve todos los referidos (por RLS) y su historial", async () => {
  const filas = await b.como<{ id: string }>(sesion(adminId), `select id from public.referidos order by id`);
  assert.equal(filas.length, 2);
  await b.como(sesion(adminId), `select * from public.referidos_historial`);
});

test("soporte del pago: lo abre su dueño y el super_admin, NO otro referente", async () => {
  // Referido de Ana listo para pagar
  await aplicarCruce(b, [{ id: referidoDeAna, en_hoja: false, activo: false, cruce_por: null, plan_hoja: null,
    fecha_hoja: null, correo_hoja: null, telefono_hoja: null }]);
  await retroceder(b, referidoDeAna, 1);
  await aplicarCruce(b, [{ id: referidoDeAna, en_hoja: true, activo: true, cruce_por: "correo", plan_hoja: "Plan Experto",
    fecha_hoja: null, correo_hoja: "cliente1@correo-prueba.co", telefono_hoja: null }]);
  await retroceder(b, referidoDeAna, 31);
  const r = await recalcular(b, referidoDeAna);
  assert.equal(r.estado_bono, "por_pagar");

  const ruta = `${ana.id}/soporte.pdf`;
  await b.sql(`insert into storage.objects (bucket_id, name) values ('soportes-pagos', $1)`, [ruta]);
  await b.como(sesion(adminId, "admin@empresa-prueba.co"),
    `select public.registrar_pago($1, array[$2]::uuid[], current_date, 80000, 'pago de prueba', $3)`,
    [ana.id, referidoDeAna, ruta]);

  const [pagado] = await b.como<{ estado_bono: string }>(sesion(ana.id), `select estado_bono from public.referidos where id = $1`, [referidoDeAna]);
  assert.equal(pagado.estado_bono, "pagado");

  const verSoporte = (uid: string) =>
    b.como<{ name: string }>(sesion(uid), `select name from storage.objects where bucket_id = 'soportes-pagos'`);
  assert.deepEqual((await verSoporte(ana.id)).map((o) => o.name), [ruta]);
  assert.deepEqual((await verSoporte(adminId)).map((o) => o.name), [ruta]);
  assert.deepEqual(await verSoporte(beto.id), []);
  assert.deepEqual(await b.como(sesion(beto.id), `select * from public.pagos`), []);
});

test("el soporte debe estar en la carpeta del referente pagado", async () => {
  await assert.rejects(
    b.como(sesion(adminId), `select public.registrar_pago($1, array[$2]::uuid[], current_date, 1, null, $3)`,
      [beto.id, referidoDeBeto, `${ana.id}/otro.pdf`]),
    /no corresponde/,
  );
});

test("referente suspendido: no ve sus referidos ni pagos, y su link no recibe referidos", async () => {
  await b.como(sesion(adminId), `select public.suspender_referente($1, 'motivo de prueba')`, [ana.id]);
  assert.deepEqual(await b.como(sesion(ana.id), `select id from public.referidos`), []);
  assert.deepEqual(await b.como(sesion(ana.id), `select id from public.pagos`), []);
  await assert.rejects(crearReferido(b, ana.id, { correo: "nuevo@correo-prueba.co" }), /LINK_NO_DISPONIBLE/);
  await b.como(sesion(adminId), `select public.reactivar_referente($1, 'motivo de prueba')`, [ana.id]);
});

test("errores del sistema y ejecuciones del cruce: solo el super_admin los ve", async () => {
  await b.sql(`insert into public.errores_sistema (origen, mensaje) values ('correo', 'prueba')`);
  assert.deepEqual(await b.como(sesion(ana.id), `select * from public.errores_sistema`), []);
  assert.equal((await b.como(sesion(adminId), `select * from public.errores_sistema`)).length, 1);
});
