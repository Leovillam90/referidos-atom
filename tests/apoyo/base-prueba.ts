/**
 * Base de datos de PRUEBA en memoria (PGlite = PostgreSQL real compilado
 * a WebAssembly). No se conecta a Supabase ni a internet: cada prueba
 * arranca una base vacía, le carga supabase/schema.sql completo y la
 * descarta al terminar. Así se prueban las reglas del bono, los
 * disparadores, Row Level Security y los permisos sin tocar producción.
 *
 * Supabase trae cosas que un Postgres normal no tiene (los roles anon /
 * authenticated / service_role, el esquema auth con auth.uid() y
 * auth.jwt(), y el esquema storage). Aquí se crean versiones mínimas que
 * se comportan igual para lo que usa schema.sql.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const RAIZ = join(__dirname, "..", "..");

export const SUPABASE_SIMULADO = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Igual que Supabase: todo lo que se cree en public queda con TODOS los
-- permisos para anon, authenticated y service_role (schema.sql los recorta).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text
);
alter table storage.objects enable row level security;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on storage.objects to authenticated, service_role;
`;

export type Sesion =
  | { rol: "anon" }
  | { rol: "service_role" }
  | { rol: "authenticated"; uid: string; email?: string };

export type BasePrueba = {
  db: PGlite;
  /** Ejecuta como superusuario (equivale al SQL Editor de Supabase). */
  sql: <T = Record<string, unknown>>(consulta: string, params?: unknown[]) => Promise<T[]>;
  /** Ejecuta con el rol y la sesión indicados (como lo haría la API de Supabase). */
  como: <T = Record<string, unknown>>(sesion: Sesion, consulta: string, params?: unknown[]) => Promise<T[]>;
  cerrar: () => Promise<void>;
};

export function leerEsquema() {
  return readFileSync(join(RAIZ, "supabase", "schema.sql"), "utf8");
}

export async function crearBasePrueba(): Promise<BasePrueba> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SIMULADO);
  await db.exec(leerEsquema());

  const sql: BasePrueba["sql"] = async (consulta, params) => {
    const r = await db.query(consulta, params);
    return r.rows as never;
  };

  const como: BasePrueba["como"] = async (sesion, consulta, params) => {
    const claims =
      sesion.rol === "authenticated"
        ? { sub: sesion.uid, role: "authenticated", email: sesion.email ?? null }
        : { role: sesion.rol };
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${sesion.rol}`);
      const r = await tx.query(consulta, params);
      return r.rows as never;
    });
  };

  return { db, sql, como, cerrar: () => db.close() };
}

// ---------------------------------------------------------------------
// Datos de prueba (todos inventados; los celulares son válidos para las
// reglas pero no son números reales conocidos)
// ---------------------------------------------------------------------

let contador = 0;
/** Celular colombiano válido y distinto en cada llamada (no es secuencia ni repetido). */
export function celularNuevo() {
  contador++;
  const base = 4827000 + contador * 37;
  return `57310${String(base).padStart(7, "0")}`;
}

/** Crea un usuario en auth.users con rol referente (dispara crear_referente_desde_auth). */
export async function crearReferente(
  b: BasePrueba,
  datos: { correo: string; nombre?: string; telefono?: string; cuenta_dropi?: string },
): Promise<{ id: string; codigo: string }> {
  const meta = {
    rol: "referente",
    nombre: datos.nombre ?? "Referente Prueba",
    telefono: datos.telefono ?? celularNuevo(),
    telefono_pais: "CO",
    cuenta_dropi: datos.cuenta_dropi ?? `dropi-${datos.correo.split("@")[0]}`,
    autoriza_datos: "true",
    version_politica: "v-prueba",
    acepta_terminos: "true",
    version_terminos: "t-prueba",
  };
  const [u] = await b.sql<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [datos.correo, JSON.stringify(meta)],
  );
  const [f] = await b.sql<{ codigo: string }>(`select codigo from public.referentes where id = $1`, [u.id]);
  return { id: u.id, codigo: f.codigo };
}

/** Inserta un referido como lo hace el servidor (rol service_role). */
export async function crearReferido(
  b: BasePrueba,
  referenteId: string,
  datos: { correo: string; telefono?: string; cuenta_dropi?: string; plan?: string; ip?: string; nombre?: string },
): Promise<{ id: string; estado_bono: string }> {
  const [r] = await b.como<{ id: string; estado_bono: string }>(
    { rol: "service_role" },
    `insert into public.referidos
       (referente_id, nombre, plan_solicitado, correo, telefono, telefono_pais, cuenta_dropi, tipo,
        autoriza_datos, version_politica, ip_origen, token_confirmacion_hash)
     values ($1, $2, $3, $4, $5, 'CO', $6, 'proveedor', true, 'v-prueba', $7, md5(random()::text))
     returning id, estado_bono`,
    [
      referenteId,
      datos.nombre ?? "Referido Prueba",
      datos.plan ?? "experto",
      datos.correo,
      datos.telefono ?? celularNuevo(),
      datos.cuenta_dropi ?? `tienda-${datos.correo.split("@")[0]}`,
      datos.ip ?? null,
    ],
  );
  return r;
}

/** Resultado del cruce para un referido, en el formato que recibe aplicar_cruce(). */
export type FilaCruce = {
  id: string;
  en_hoja: boolean;
  activo: boolean;
  cruce_por: "correo" | "telefono" | null;
  plan_hoja: string | null;
  fecha_hoja: string | null;
  correo_hoja: string | null;
  telefono_hoja: string | null;
};

export async function aplicarCruce(b: BasePrueba, filas: FilaCruce[]) {
  const [r] = await b.como<{ n: number }>({ rol: "service_role" }, `select public.aplicar_cruce($1::jsonb) as n`, [
    JSON.stringify(filas),
  ]);
  return r.n;
}

export async function leerReferido(b: BasePrueba, id: string) {
  const [r] = await b.sql<Record<string, unknown>>(`select * from public.referidos where id = $1`, [id]);
  return r;
}

/**
 * Mueve en el tiempo un referido (sin disparadores) para simular que
 * pasaron días: resta `dias` a todas sus fechas.
 */
export async function retroceder(b: BasePrueba, id: string, dias: number) {
  const campos = [
    "created_at", "autorizado_en", "confirmado_en", "vence_en", "fecha_activacion", "fecha_activacion_detectada",
    "activo_desde", "bono_fijado_en", "fecha_por_pagar", "cruce_actualizado_en",
  ];
  const sets = campos.map((c) => `${c} = ${c} - make_interval(days => ${Number(dias)})`).join(", ");
  await b.db.exec(`alter table public.referidos disable trigger user`);
  await b.sql(`update public.referidos set ${sets} where id = $1`, [id]);
  await b.db.exec(`alter table public.referidos enable trigger user`);
}

/** "Toca" la fila para que el disparador recalcule su estado. */
export async function recalcular(b: BasePrueba, id: string) {
  await b.sql(`update public.referidos set plan_hoja = plan_hoja where id = $1`, [id]);
  return leerReferido(b, id);
}
