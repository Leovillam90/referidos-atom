/**
 * npm test — reglas del programa en la base de datos (supabase/schema.sql),
 * en una base de PRUEBA en memoria. Estas pruebas DESCRIBEN el
 * comportamiento actual: si alguna falla después de un cambio, el cambio
 * alteró la lógica del bono.
 *
 * El cruce se simula con datos de prueba (no se lee la hoja real).
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarCruce,
  celularNuevo,
  crearBasePrueba,
  crearReferente,
  crearReferido,
  leerReferido,
  recalcular,
  retroceder,
  type BasePrueba,
  type FilaCruce,
} from "./apoyo/base-prueba";

let b: BasePrueba;
let n = 0;
let ref: { id: string; codigo: string; correo: string; telefono: string; dropi: string };

const noEsta = (id: string): FilaCruce => ({
  id, en_hoja: false, activo: false, cruce_por: null, plan_hoja: null, fecha_hoja: null, correo_hoja: null, telefono_hoja: null,
});
const activo = (id: string, correo: string, extra: Partial<FilaCruce> = {}): FilaCruce => ({
  id, en_hoja: true, activo: true, cruce_por: "correo", plan_hoja: "Plan Experto", fecha_hoja: null,
  correo_hoja: correo, telefono_hoja: null, ...extra,
});

before(async () => {
  b = await crearBasePrueba();
});
after(() => b.cerrar());

beforeEach(async () => {
  n++;
  const correo = `referente${n}@empresa-prueba.co`;
  const telefono = celularNuevo();
  const dropi = `tiendareferente${n}`;
  const r = await crearReferente(b, { correo, telefono, cuenta_dropi: dropi });
  ref = { ...r, correo, telefono, dropi };
});

/** Registra un referido "hace 2 días" y lo cruza una vez sin aparecer en la hoja. */
async function referidoListo(correo: string) {
  const { id } = await crearReferido(b, ref.id, { correo });
  await retroceder(b, id, 2);
  await aplicarCruce(b, [noEsta(id)]);
  return id;
}

// ---------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------
test("registro con link válido → estimado, con el bono del plan solicitado", async () => {
  const r = await crearReferido(b, ref.id, { correo: `nuevo${n}@correo-prueba.co`, plan: "experto" });
  const fila = await leerReferido(b, r.id);
  assert.equal(fila.estado_bono, "estimado");
  assert.equal(Number(fila.bono), 80000);
  assert.ok(fila.vence_en, "debe tener fecha de vencimiento");
  const dias = (new Date(fila.vence_en as string).getTime() - new Date(fila.created_at as string).getTime()) / 86_400_000;
  assert.equal(Math.round(dias), 30);
});

test("auto-referido bloqueado: mismo correo del referente", async () => {
  await assert.rejects(crearReferido(b, ref.id, { correo: ref.correo }), /AUTO_REFERIDO/);
});

test("auto-referido bloqueado: correo del referente escrito en el campo Dropi", async () => {
  await assert.rejects(
    crearReferido(b, ref.id, { correo: `otro${n}@correo-prueba.co`, cuenta_dropi: ref.correo.toUpperCase() }),
    /AUTO_REFERIDO/,
  );
});

test("auto-referido bloqueado: mismo celular del referente", async () => {
  await assert.rejects(crearReferido(b, ref.id, { correo: `otro${n}@correo-prueba.co`, telefono: ref.telefono }), /AUTO_REFERIDO/);
});

test("auto-referido bloqueado: Gmail con puntos y '+' cuenta como el mismo correo", async () => {
  const gmail = `juan.perez${n}@gmail.com`;
  const g = await crearReferente(b, { correo: gmail });
  await assert.rejects(crearReferido(b, g.id, { correo: `juanperez${n}+atom@gmail.com` }), /AUTO_REFERIDO/);
});

test("duplicado bloqueado: la misma persona no puede tener dos registros vigentes", async () => {
  const correo = `dup${n}@correo-prueba.co`;
  await crearReferido(b, ref.id, { correo });
  const otro = await crearReferente(b, { correo: `otroref${n}@empresa-prueba.co` });
  await assert.rejects(crearReferido(b, otro.id, { correo }), /DUPLICADO/);
  // También con el correo escrito en el campo Dropi
  await assert.rejects(crearReferido(b, otro.id, { correo: `x${n}@correo-prueba.co`, cuenta_dropi: correo }), /DUPLICADO/);
});

test("registro permitido de nuevo después de vencido", async () => {
  const correo = `vuelve${n}@correo-prueba.co`;
  const { id } = await crearReferido(b, ref.id, { correo });
  await retroceder(b, id, 31);
  await aplicarCruce(b, [noEsta(id)]); // un cruce después del plazo confirma que no se activó
  assert.equal((await leerReferido(b, id)).estado_bono, "vencido");
  const otro = await crearReferente(b, { correo: `otroref${n}@empresa-prueba.co` });
  const nuevo = await crearReferido(b, otro.id, { correo });
  assert.equal(nuevo.estado_bono, "estimado");
});

test("celulares falsos o inválidos rechazados por la base de datos", async () => {
  for (const telefono of ["573000000000", "573123456789", "573333333333", "573121212121", "576012345678", "12345"]) {
    await assert.rejects(
      crearReferido(b, ref.id, { correo: `falso${n}-${telefono}@correo-prueba.co`, telefono }),
      /TELEFONO_INVALIDO/,
      telefono,
    );
  }
});

test("celular en la lista de bloqueados rechazado", async () => {
  const telefono = celularNuevo();
  await b.sql(`insert into public.telefonos_bloqueados (telefono, nota) values ($1, 'prueba')`, [telefono]);
  await assert.rejects(crearReferido(b, ref.id, { correo: `bloq${n}@correo-prueba.co`, telefono }), /TELEFONO_INVALIDO/);
});

test("límite de registros por link por hora", async () => {
  await b.sql(`update public.reglas_programa set max_registros_por_link_por_hora = 2`);
  try {
    await crearReferido(b, ref.id, { correo: `lim1-${n}@correo-prueba.co` });
    await crearReferido(b, ref.id, { correo: `lim2-${n}@correo-prueba.co` });
    await assert.rejects(crearReferido(b, ref.id, { correo: `lim3-${n}@correo-prueba.co` }), /LIMITE/);
  } finally {
    await b.sql(`update public.reglas_programa set max_registros_por_link_por_hora = 10`);
  }
});

test("los campos del sistema no se pueden enviar al crear (estado, bono, pago)", async () => {
  const [r] = await b.como<{ id: string }>({ rol: "service_role" }, `
    insert into public.referidos (referente_id, correo, telefono, telefono_pais, cuenta_dropi, tipo, autoriza_datos,
      version_politica, estado_bono, bono, bono_fijado_en, editado_manual)
    values ($1, $2, $3, 'CO', $4, 'marca', true, 'v', 'por_pagar', 999999, now(), true) returning id`,
    [ref.id, `trampa${n}@correo-prueba.co`, celularNuevo(), `trampa${n}`]);
  const fila = await leerReferido(b, r.id);
  assert.equal(fila.estado_bono, "estimado");
  assert.equal(fila.bono_fijado_en, null);
  assert.equal(fila.editado_manual, false);
});

// ---------------------------------------------------------------------
// Cruce con la hoja (simulada)
// ---------------------------------------------------------------------
test("cruce: ESTADO MANUAL = ACTIVE → en_verificacion con el bono del plan de la hoja (fijado)", async () => {
  const correo = `activo${n}@correo-prueba.co`;
  const id = await referidoListo(correo);
  await aplicarCruce(b, [activo(id, correo, { plan_hoja: "PLAN CONTROL" })]);
  const fila = await leerReferido(b, id);
  assert.equal(fila.estado_bono, "en_verificacion");
  assert.equal(Number(fila.bono), 100000);
  assert.ok(fila.bono_fijado_en);
});

test("cruce: cumplida la permanencia (30 días ACTIVE) → por_pagar", async () => {
  const correo = `perm${n}@correo-prueba.co`;
  const id = await referidoListo(correo);
  await aplicarCruce(b, [activo(id, correo)]);
  await retroceder(b, id, 29);
  assert.equal((await recalcular(b, id)).estado_bono, "en_verificacion");
  await retroceder(b, id, 2);
  const fila = await recalcular(b, id);
  assert.equal(fila.estado_bono, "por_pagar");
  assert.equal(Number(fila.bono), 80000);
});

test("cruce: deja de estar ACTIVE antes de la permanencia → vuelve a estimado (el bono sigue fijado)", async () => {
  const correo = `cae${n}@correo-prueba.co`;
  const id = await referidoListo(correo);
  await aplicarCruce(b, [activo(id, correo)]);
  await aplicarCruce(b, [{ ...activo(id, correo), activo: false }]);
  const fila = await leerReferido(b, id);
  assert.equal(fila.estado_bono, "estimado");
  assert.ok(fila.bono_fijado_en);
});

test("bono único: un cambio de plan después de fijarlo no cambia el bono", async () => {
  const correo = `unico${n}@correo-prueba.co`;
  const id = await referidoListo(correo);
  await aplicarCruce(b, [activo(id, correo, { plan_hoja: "Plan Escala" })]);
  await aplicarCruce(b, [activo(id, correo, { plan_hoja: "Plan Control" })]);
  assert.equal(Number((await leerReferido(b, id)).bono), 20000);
});

test("ya_cliente: aparece en la hoja justo al registrarse → bono 0", async () => {
  const correo = `yacliente${n}@correo-prueba.co`;
  const { id } = await crearReferido(b, ref.id, { correo });
  await aplicarCruce(b, [activo(id, correo)]);
  const fila = await leerReferido(b, id);
  assert.equal(fila.estado_bono, "ya_cliente");
  assert.equal(Number(fila.bono), 0);
});

test("ya_cliente: la fecha de activación de la hoja es anterior al registro → bono 0", async () => {
  const correo = `antes${n}@correo-prueba.co`;
  const { id } = await crearReferido(b, ref.id, { correo });
  await retroceder(b, id, 2);
  await aplicarCruce(b, [activo(id, correo, { fecha_hoja: "2020-01-01" })]);
  assert.equal((await leerReferido(b, id)).estado_bono, "ya_cliente");
});

test("vencido: pasan los 30 días sin activarse → vencido, bono 0", async () => {
  const id = await referidoListo(`vence${n}@correo-prueba.co`); // ya lleva 2 días
  await retroceder(b, id, 27); // día 29
  await aplicarCruce(b, [noEsta(id)]);
  assert.equal((await leerReferido(b, id)).estado_bono, "estimado");
  await retroceder(b, id, 2);
  await aplicarCruce(b, [noEsta(id)]);
  const fila = await leerReferido(b, id);
  assert.equal(fila.estado_bono, "vencido");
  assert.equal(Number(fila.bono), 0);
});

test("posible_auto_referido: la fila de la hoja tiene el celular del referente → bono 0 y en revisión", async () => {
  const correo = `auto${n}@correo-prueba.co`;
  const id = await referidoListo(correo);
  await aplicarCruce(b, [activo(id, correo, { telefono_hoja: ref.telefono })]);
  const fila = await leerReferido(b, id);
  assert.equal(fila.estado_bono, "posible_auto_referido");
  assert.equal(Number(fila.bono), 0);
});

test("afiliado_duplicado: la misma fila de la hoja no genera dos bonos", async () => {
  const correoHoja = `filahoja${n}@correo-prueba.co`;
  const id1 = await referidoListo(`uno${n}@correo-prueba.co`);
  await aplicarCruce(b, [activo(id1, correoHoja)]);
  assert.equal((await leerReferido(b, id1)).estado_bono, "en_verificacion");

  const otro = await crearReferente(b, { correo: `otroref${n}@empresa-prueba.co` });
  const { id: id2 } = await crearReferido(b, otro.id, { correo: `dos${n}@correo-prueba.co` });
  await retroceder(b, id2, 2);
  await aplicarCruce(b, [noEsta(id2)]);
  await aplicarCruce(b, [activo(id2, correoHoja)]);
  assert.equal((await leerReferido(b, id2)).estado_bono, "afiliado_duplicado");
});

test("suspensión: los bonos no pagados pasan a no_aplica; al reactivar vuelven a las reglas", async () => {
  const [{ id: adminId }] = await b.sql<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`adm${n}@x.co`]);
  await b.sql(`insert into public.super_admins (user_id) values ($1)`, [adminId]);
  const admin = { rol: "authenticated" as const, uid: adminId };
  const { id } = await crearReferido(b, ref.id, { correo: `susp${n}@correo-prueba.co` });
  await b.como(admin, `select public.suspender_referente($1, 'motivo de prueba')`, [ref.id]);
  assert.equal((await leerReferido(b, id)).estado_bono, "no_aplica");
  await b.como(admin, `select public.reactivar_referente($1, 'motivo de prueba')`, [ref.id]);
  assert.equal((await leerReferido(b, id)).estado_bono, "estimado");
});

test("excepción manual: exige motivo y queda en el historial", async () => {
  const [{ id: adminId }] = await b.sql<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`adm2-${n}@x.co`]);
  await b.sql(`insert into public.super_admins (user_id) values ($1)`, [adminId]);
  const admin = { rol: "authenticated" as const, uid: adminId, email: `adm2-${n}@x.co` };
  const { id } = await crearReferido(b, ref.id, { correo: `manual${n}@correo-prueba.co` });
  await assert.rejects(
    b.como(admin, `select public.editar_referido($1, null, true, 5000, 'por_pagar', null, 'no')`, [id]),
    /motivo/,
  );
  await b.como(admin, `select public.editar_referido($1, null, true, 5000, 'por_pagar', null, 'Acuerdo comercial')`, [id]);
  const fila = await leerReferido(b, id);
  assert.equal(fila.estado_bono, "por_pagar");
  assert.equal(fila.editado_manual, true);
  const [h] = await b.sql<{ motivo: string; accion: string }>(
    `select motivo, accion from public.referidos_historial where referido_id = $1 order by created_at desc limit 1`, [id]);
  assert.equal(h.motivo, "Acuerdo comercial");
  assert.equal(h.accion, "Excepción manual");
});

// ---------------------------------------------------------------------
// Confirmación por correo (regla opcional)
// ---------------------------------------------------------------------
test("con confirmación activa: pendiente_confirmacion hasta confirmar; el plazo empieza al confirmar", async () => {
  await b.sql(`update public.reglas_programa set confirmacion_referido_por_correo = true`);
  try {
    const { id } = await crearReferido(b, ref.id, { correo: `conf${n}@correo-prueba.co` });
    let fila = await leerReferido(b, id);
    assert.equal(fila.estado_bono, "pendiente_confirmacion");
    assert.equal(fila.vence_en, null);
    const [{ r }] = await b.como<{ r: { resultado: string } }>({ rol: "service_role" },
      `select public.confirmar_referido($1) as r`, [fila.token_confirmacion_hash]);
    assert.equal(r.resultado, "ok");
    fila = await leerReferido(b, id);
    assert.equal(fila.estado_bono, "estimado");
    assert.ok(fila.vence_en);
    const [{ r: otra }] = await b.como<{ r: { resultado: string } }>({ rol: "service_role" },
      `select public.confirmar_referido($1) as r`, [fila.token_confirmacion_hash]);
    assert.equal(otra.resultado, "ya_confirmado");
  } finally {
    await b.sql(`update public.reglas_programa set confirmacion_referido_por_correo = false`);
  }
});

// ---------------------------------------------------------------------
// Cruce: control de concurrencia
// ---------------------------------------------------------------------
test("dos cruces completos no corren a la vez: el segundo queda 'omitido'", async () => {
  const servidor = { rol: "service_role" as const };
  const [{ id: primero }] = await b.como<{ id: number | null }>(servidor, `select public.iniciar_cruce('cron') as id`);
  assert.ok(primero);
  const [{ id: segundo }] = await b.como<{ id: number | null }>(servidor, `select public.iniciar_cruce('admin') as id`);
  assert.equal(segundo, null);
  await b.como(servidor, `select public.terminar_cruce($1, true, '{"revisados":1}'::jsonb, null)`, [primero]);
  const [{ id: tercero }] = await b.como<{ id: number | null }>(servidor, `select public.iniciar_cruce('admin') as id`);
  assert.ok(tercero);
  await b.como(servidor, `select public.terminar_cruce($1, false, null, 'falla de prueba')`, [tercero]);
  const estados = await b.sql<{ estado: string }>(`select estado from public.ejecuciones_cruce order by id`);
  assert.deepEqual(estados.map((e) => e.estado), ["ok", "omitido", "error"]);
});

test("límite de intentos para pedir el link de acceso (por IP)", async () => {
  const servidor = { rol: "service_role" as const };
  const ip = `10.0.${n}.1`;
  const pedir = async () =>
    (await b.como<{ ok: boolean }>(servidor, `select public.registrar_intento('ingreso', $1::inet, 3) as ok`, [ip]))[0].ok;
  assert.equal(await pedir(), true);
  assert.equal(await pedir(), true);
  assert.equal(await pedir(), true);
  assert.equal(await pedir(), false);
  // No afecta el límite del formulario de referidos
  const [{ ok }] = await b.como<{ ok: boolean }>(servidor, `select public.registrar_intento_referido('ABCDEFGH', $1::inet) as ok`, [ip]);
  assert.equal(ok, true);
});
