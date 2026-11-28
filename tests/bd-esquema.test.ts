/**
 * npm test — supabase/schema.sql en una base de PRUEBA en memoria.
 * Revisa que se pueda ejecutar varias veces, que actualice una base
 * creada con la versión anterior (la de Git) y las reglas generales de
 * seguridad: RLS en todas las tablas, nada para "anon" y funciones con
 * search_path fijo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { crearBasePrueba, leerEsquema, SUPABASE_SIMULADO } from "./apoyo/base-prueba";

test("schema.sql se puede ejecutar dos veces seguidas sin errores", async () => {
  const b = await crearBasePrueba();
  await b.db.exec(leerEsquema());
  await b.cerrar();
});

test("schema.sql actualiza una base creada con la versión anterior (la del último commit)", async (t) => {
  let anterior: string;
  try {
    anterior = execSync("git show HEAD:supabase/schema.sql", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    t.skip("no hay versión anterior en Git");
    return;
  }
  const vieja = await crearBaseConEsquema(anterior);
  await vieja.exec(`
    insert into auth.users (email, raw_user_meta_data) values
      ('ref.vieja@empresa.co', '{"rol":"referente","nombre":"Ref Vieja","telefono":"3104827756","cuenta_dropi":"tiendavieja"}');
  `);
  await vieja.exec(leerEsquema());
  const r = await vieja.query<{ n: number }>(`select count(*)::int as n from public.referentes`);
  assert.equal(r.rows[0].n, 1);
  await vieja.close();
});

async function crearBaseConEsquema(esquema: string) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SIMULADO);
  await db.exec(esquema);
  return db;
}

test("diagnostico(): todas las tablas, columnas, funciones y disparadores existen", async () => {
  const b = await crearBasePrueba();
  const [{ d }] = await b.sql<{ d: Record<string, unknown> }>(`select public.diagnostico() as d`);
  const tablas = d.tablas as { nombre: string; existe: boolean; rls: boolean; anon_lee: boolean }[];
  for (const t of tablas) {
    assert.equal(t.existe, true, `falta la tabla ${t.nombre}`);
    assert.equal(t.rls, true, `RLS apagado en ${t.nombre}`);
    assert.equal(t.anon_lee, false, `anon puede leer ${t.nombre}`);
  }
  assert.deepEqual(d.columnas_faltantes, []);
  for (const f of d.funciones as { nombre: string; existe: boolean }[]) assert.equal(f.existe, true, `falta ${f.nombre}`);
  for (const g of d.disparadores as { nombre: string; existe: boolean }[]) assert.equal(g.existe, true, `falta ${g.nombre}`);
  assert.equal((d.bucket as { publico: boolean }).publico, false);
  await b.cerrar();
});

test("RLS activo en TODAS las tablas del esquema public", async () => {
  const b = await crearBasePrueba();
  const sinRls = await b.sql<{ relname: string }>(`
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity`);
  assert.deepEqual(sinRls.map((x) => x.relname), []);
  await b.cerrar();
});

test("anon no tiene ningún permiso sobre tablas ni vistas de public", async () => {
  const b = await crearBasePrueba();
  const conPermiso = await b.sql<{ tabla: string; privilegio: string }>(`
    select table_name as tabla, privilege_type as privilegio
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'PUBLIC')`);
  assert.deepEqual(conPermiso, []);
  await b.cerrar();
});

test("authenticated solo puede escribir directo en telefonos_bloqueados (y RLS lo limita al super_admin)", async () => {
  const b = await crearBasePrueba();
  const escrituras = await b.sql<{ tabla: string }>(`
    select distinct table_name as tabla
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`);
  assert.deepEqual(escrituras.map((x) => x.tabla), ["telefonos_bloqueados"]);
  const columnas = await b.sql<{ tabla: string }>(`
    select distinct table_name as tabla from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')`);
  assert.deepEqual(columnas.map((x) => x.tabla), ["telefonos_bloqueados"]);
  await b.cerrar();
});

test("todas las funciones SECURITY DEFINER tienen search_path fijo", async () => {
  const b = await crearBasePrueba();
  const sinRuta = await b.sql<{ proname: string }>(`
    select p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend e where e.objid = p.oid and e.deptype = 'e')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  assert.deepEqual(sinRuta.map((x) => x.proname), [], "funciones sin search_path fijo");
  await b.cerrar();
});

test("anon solo puede ejecutar funciones inofensivas (normalizar datos, sin leer tablas)", async () => {
  const b = await crearBasePrueba();
  const filas = await b.sql<{ proname: string; definer: boolean }>(`
    select p.proname, p.prosecdef as definer
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend e where e.objid = p.oid and e.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1`);
  const permitidas = new Set([
    "normalizar_telefono", "normalizar_correo_identidad", "normalizar_dropi", "normalizar_dropi_telefono",
    "identificadores_persona", "normalizar_nombre_plan", "ocultar_correo", "celular_pais", "telefono_es_falso",
    "bloquear_identidad", "generar_codigo_referente",
  ]);
  const sobran = filas.filter((f) => !permitidas.has(f.proname));
  assert.deepEqual(sobran, [], "funciones que anon no debería poder ejecutar");
  // Ninguna de las permitidas salta RLS
  assert.deepEqual(filas.filter((f) => f.definer), []);
  await b.cerrar();
});

test("funciones de super_admin y del servidor: authenticated no ejecuta las del servidor", async () => {
  const b = await crearBasePrueba();
  const soloServidor = [
    "reglas()", "aplicar_cruce(jsonb)", "revisar_vencimientos()", "registrar_intento_referido(text, inet)",
    "registrar_intento(text, inet, integer)", "confirmar_referido(text)", "estado_identidad_referente(text, text, text)",
    "iniciar_cruce(text)", "terminar_cruce(bigint, boolean, jsonb, text)", "diagnostico()", "problema_telefono(text, text)",
    "identidad_ocupada(text[], uuid, boolean)", "dominio_excluido(text)", "buscar_plan_id(text)",
  ];
  for (const f of soloServidor) {
    const [r] = await b.sql<{ puede: boolean }>(
      `select has_function_privilege('authenticated', 'public.${f}', 'EXECUTE') as puede`,
    );
    assert.equal(r.puede, false, `authenticated puede ejecutar ${f}`);
  }
  await b.cerrar();
});
