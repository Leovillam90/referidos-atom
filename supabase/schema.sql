-- =====================================================================
--  Referidos ATOM — Esquema de base de datos (Supabase / PostgreSQL)
-- ---------------------------------------------------------------------
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede volver a ejecutar sin romper nada y sin
--  perder datos: actualiza las tablas de versiones anteriores.
--
--  Resumen:
--    super_admins         → usuarios que ven todo, editan y registran pagos
--    referentes           → personas que refieren (una fila por usuario con login)
--    planes               → planes de ATOM y el bono que paga cada uno
--    referidos            → personas que llegan por el link /r/CODIGO
--    pagos                → pagos de bonos hechos a un referente
--    referidos_historial  → quién cambió qué y cuándo en cada referido
--    Storage "soportes-pagos" → comprobantes de pago (bucket PRIVADO)
--
--  Seguridad (Row Level Security):
--    • Un referente solo puede ver SU fila, SUS referidos, SUS pagos y
--      los soportes de SUS pagos.
--    • El super_admin puede ver todo. Editar y pagar solo se hace con
--      funciones que verifican que quien llama es super_admin.
--    • Los visitantes sin login no pueden leer ni escribir nada
--      directamente: el formulario de referidos lo guarda el servidor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.tipo_referido as enum ('proveedor', 'marca');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.metodo_cruce as enum ('correo', 'telefono');
exception when duplicate_object then null; end $$;

-- estimado  = registrado, aún no activo en ATOM (bono del plan solicitado)
-- por_pagar = activo en ATOM (bono del plan afiliado según la hoja)
-- pagado    = el super_admin registró el pago
-- no_aplica = no se activó o el super_admin lo anuló
do $$ begin
  create type public.estado_bono as enum ('estimado', 'por_pagar', 'pagado', 'no_aplica');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Actualización desde versiones anteriores (si no aplica, no hace nada)
-- ---------------------------------------------------------------------
drop view if exists public.referidos_sin_cruce;

do $$ begin
  -- El rol "administrador" ahora se llama "super_admin"
  if to_regclass('public.administradores') is not null
     and to_regclass('public.super_admins') is null then
    alter table public.administradores rename to super_admins;
  end if;
  if to_regclass('public.super_admins') is not null then
    drop policy if exists "admin ve administradores" on public.super_admins;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Funciones de apoyo
-- ---------------------------------------------------------------------

-- Deja el teléfono solo con dígitos y sin el indicativo de Colombia.
--   '+57 300-123 4567' → '3001234567'
--   '0057 3001234567'  → '3001234567'
-- La app usa exactamente la misma regla al leer la Google Sheet.
create or replace function public.normalizar_telefono(t text)
returns text
language sql
immutable
as $$
  select case
    when d is null or d = '' then null
    when length(d) = 14 and left(d, 4) = '0057' then substr(d, 5)
    when length(d) = 12 and left(d, 2) = '57'   then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) s;
$$;

-- Nombre de plan comparable: sin tildes, minúsculas, sin la palabra "plan".
--   'Plan  Experto ' → 'experto'
create or replace function public.normalizar_nombre_plan(t text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(trim(coalesce(t, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
        '^plan\s+', ''),
      '\s+', ' ', 'g'),
    '');
$$;

-- Código corto para el link /r/CODIGO (8 caracteres, sin letras confusas
-- como 0/O o 1/I/L).
create or replace function public.generar_codigo_referente()
returns text
language plpgsql
volatile
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo text;
  i int;
begin
  loop
    v_codigo := '';
    for i in 1..8 loop
      v_codigo := v_codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.referentes r where r.codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

create or replace function public.actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabla: super_admins
-- ---------------------------------------------------------------------
create table if not exists public.super_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ¿El usuario que hace la consulta es super_admin?
-- "security definer" permite consultarlo sin abrir la tabla a todos.
create or replace function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.super_admins a where a.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Tabla: planes (se edita en Supabase → Table Editor → planes)
--   bono  = valor que se paga al referente, una sola vez por referido
--   alias = otros nombres con que el plan puede aparecer en la Google
--           Sheet, ej. {"Escala mensual","ESCALA PRO"}
-- ---------------------------------------------------------------------
create table if not exists public.planes (
  id         text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  nombre     text not null unique check (length(trim(nombre)) between 2 and 80),
  bono       numeric(14, 2) not null check (bono >= 0),
  alias      text[] not null default '{}',
  activo     boolean not null default true,  -- false = no aparece en el formulario
  orden      int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists planes_updated_at on public.planes;
create trigger planes_updated_at
  before update on public.planes
  for each row execute function public.actualizar_updated_at();

-- Valores iniciales. "do nothing": si ya los editaste, no se sobrescriben.
insert into public.planes (id, nombre, bono, orden) values
  ('escala',  'Plan Escala',   20000, 1),
  ('experto', 'Plan Experto',  80000, 2),
  ('control', 'Plan Control', 100000, 3)
on conflict (id) do nothing;

-- Encuentra el plan que corresponde al texto de la hoja (por nombre o alias).
create or replace function public.buscar_plan_id(t text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.planes p
  where public.normalizar_nombre_plan(t) is not null
    and (
      public.normalizar_nombre_plan(p.nombre) = public.normalizar_nombre_plan(t)
      or p.id = public.normalizar_nombre_plan(t)
      or exists (
        select 1 from unnest(p.alias) a
        where public.normalizar_nombre_plan(a) = public.normalizar_nombre_plan(t)
      )
    )
  order by p.orden
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Tabla: referentes
-- ---------------------------------------------------------------------
create table if not exists public.referentes (
  id           uuid primary key references auth.users (id) on delete cascade,
  nombre       text not null check (length(trim(nombre)) between 2 and 120),
  correo       text not null unique check (correo = lower(trim(correo))),
  telefono     text not null,
  telefono_normalizado text generated always as (public.normalizar_telefono(telefono)) stored,
  cuenta_dropi text not null,
  codigo       text not null unique default public.generar_codigo_referente()
                 check (codigo ~ '^[A-Z0-9]{6,16}$'),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Autorización de tratamiento de datos del referente (Ley 1581 de 2012):
-- versión de la política que aceptó y cuándo. Quedan vacías en los
-- referentes que se registraron antes de pedir la casilla.
alter table public.referentes add column if not exists autoriza_datos   boolean;
alter table public.referentes add column if not exists autorizado_en    timestamptz;
alter table public.referentes add column if not exists version_politica text;

drop trigger if exists referentes_updated_at on public.referentes;
create trigger referentes_updated_at
  before update on public.referentes
  for each row execute function public.actualizar_updated_at();

-- Cuando alguien se registra como referente (login por link mágico),
-- la app envía nombre, teléfono y cuenta Dropi como "metadata".
-- Este disparador crea su fila de referente automáticamente.
-- Solo actúa si la metadata trae rol = 'referente' (así un super_admin
-- creado a mano no queda registrado como referente).
create or replace function public.crear_referente_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'rol', '') = 'referente' then
    insert into public.referentes (
      id, nombre, correo, telefono, cuenta_dropi,
      autoriza_datos, autorizado_en, version_politica
    )
    values (
      new.id,
      trim(new.raw_user_meta_data ->> 'nombre'),
      lower(trim(new.email)),
      trim(new.raw_user_meta_data ->> 'telefono'),
      trim(new.raw_user_meta_data ->> 'cuenta_dropi'),
      (new.raw_user_meta_data ->> 'autoriza_datos') = 'true',
      case when (new.raw_user_meta_data ->> 'autoriza_datos') = 'true' then now() end,
      nullif(trim(new.raw_user_meta_data ->> 'version_politica'), '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_referente_desde_auth();

-- ---------------------------------------------------------------------
-- Tabla: pagos (un pago puede cubrir varios referidos de un referente)
-- ---------------------------------------------------------------------
create table if not exists public.pagos (
  id           uuid primary key default gen_random_uuid(),
  referente_id uuid not null references public.referentes (id) on delete restrict,
  fecha_pago   date not null,
  valor_pagado numeric(14, 2) not null check (valor_pagado >= 0),
  nota         text check (nota is null or length(nota) <= 500),
  soporte_path text not null,  -- ruta del archivo en el bucket "soportes-pagos"
  creado_por   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists pagos_referente_idx on public.pagos (referente_id);

-- ---------------------------------------------------------------------
-- Tabla: referidos
-- ---------------------------------------------------------------------
create table if not exists public.referidos (
  id            uuid primary key default gen_random_uuid(),
  referente_id  uuid not null references public.referentes (id) on delete restrict,

  -- Datos del formulario
  nombre        text check (nombre is null or length(trim(nombre)) between 2 and 120),
  correo        text not null check (correo = lower(trim(correo))),
  telefono      text not null,
  telefono_normalizado text generated always as (public.normalizar_telefono(telefono)) stored,
  cuenta_dropi  text not null,
  tipo          public.tipo_referido not null,
  plan_solicitado text references public.planes (id) on update cascade,

  -- Autorización de tratamiento de datos (Ley 1581 de 2012).
  -- Se guarda la prueba: que aceptó, cuándo, qué versión de la política
  -- y desde dónde (IP / navegador).
  autoriza_datos      boolean not null check (autoriza_datos = true),
  autorizado_en       timestamptz not null default now(),
  version_politica    text not null,
  ip_origen           inet,
  user_agent          text,

  -- Resultado del cruce con la Google Sheet de afiliados ATOM
  afiliado_atom       boolean,              -- "activo en ATOM"; null = todavía no se ha cruzado
  cruce_por           public.metodo_cruce,  -- cómo se encontró (correo o teléfono)
  plan_hoja           text,                 -- el plan tal como aparece en la hoja
  plan_afiliado_id    text references public.planes (id) on update cascade,
  cruce_actualizado_en timestamptz,

  -- Bono (pago único por referido)
  bono                numeric(14, 2) check (bono is null or bono >= 0),
  estado_bono         public.estado_bono not null default 'estimado',
  editado_manual      boolean not null default false, -- true = el cruce ya no lo cambia
  pago_id             uuid references public.pagos (id) on delete restrict,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Columnas nuevas para bases de datos creadas con versiones anteriores
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'referidos' and column_name = 'plan')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'referidos' and column_name = 'plan_hoja') then
    alter table public.referidos rename column plan to plan_hoja;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'referidos' and column_name = 'valor_comision')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'referidos' and column_name = 'bono') then
    alter table public.referidos rename column valor_comision to bono;
  end if;
end $$;

alter table public.referidos
  add column if not exists nombre text check (nombre is null or length(trim(nombre)) between 2 and 120),
  add column if not exists plan_solicitado text references public.planes (id) on update cascade,
  add column if not exists plan_hoja text,
  add column if not exists plan_afiliado_id text references public.planes (id) on update cascade,
  add column if not exists bono numeric(14, 2) check (bono is null or bono >= 0),
  add column if not exists estado_bono public.estado_bono not null default 'estimado',
  add column if not exists editado_manual boolean not null default false,
  add column if not exists pago_id uuid references public.pagos (id) on delete restrict;

do $$ begin
  alter table public.referidos
    add constraint referidos_pagado_con_pago
    check ((estado_bono = 'pagado') = (pago_id is not null));
exception when duplicate_object then null; end $$;

-- Un mismo correo solo puede ser referido una vez (evita que dos
-- referentes reclamen a la misma persona).
create unique index if not exists referidos_correo_unico on public.referidos (correo);
create index if not exists referidos_referente_idx on public.referidos (referente_id);
create index if not exists referidos_telefono_idx  on public.referidos (telefono_normalizado);
create index if not exists referidos_afiliado_idx  on public.referidos (afiliado_atom);
create index if not exists referidos_estado_idx    on public.referidos (estado_bono);
create index if not exists referidos_pago_idx      on public.referidos (pago_id);

drop trigger if exists referidos_updated_at on public.referidos;
create trigger referidos_updated_at
  before update on public.referidos
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------
-- Cálculo automático del bono y su estado
--   • Si el super_admin lo editó a mano o ya está pagado: no se toca.
--   • Activo en ATOM  → "por_pagar", bono del plan afiliado (según la hoja).
--   • No activo aún   → "estimado",  bono del plan solicitado.
-- ---------------------------------------------------------------------
create or replace function public.calcular_bono_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.editado_manual or new.estado_bono = 'pagado' then
    return new;
  end if;

  if new.afiliado_atom then
    new.plan_afiliado_id := public.buscar_plan_id(new.plan_hoja);
    new.estado_bono := 'por_pagar';
    new.bono := (select p.bono from public.planes p where p.id = new.plan_afiliado_id);
  else
    new.plan_afiliado_id := null;
    new.estado_bono := 'estimado';
    new.bono := (select p.bono from public.planes p where p.id = new.plan_solicitado);
  end if;
  return new;
end;
$$;

drop trigger if exists referidos_calcular_bono on public.referidos;
create trigger referidos_calcular_bono
  before insert or update on public.referidos
  for each row execute function public.calcular_bono_referido();

-- Si cambias el bono, el nombre o los alias de un plan, se recalculan
-- los referidos que no están pagados ni editados a mano.
create or replace function public.recalcular_por_planes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.accion', 'Cambio en la tabla de planes', true);
  update public.referidos
     set plan_hoja = plan_hoja  -- "toca" la fila para que se recalcule
   where not editado_manual and estado_bono <> 'pagado';
  return null;
end;
$$;

drop trigger if exists planes_recalcular on public.planes;
create trigger planes_recalcular
  after insert or update on public.planes
  for each statement execute function public.recalcular_por_planes();

-- ---------------------------------------------------------------------
-- Historial: quién cambió qué y cuándo
-- ---------------------------------------------------------------------
create table if not exists public.referidos_historial (
  id             uuid primary key default gen_random_uuid(),
  referido_id    uuid not null references public.referidos (id) on delete cascade,
  usuario_id     uuid references auth.users (id) on delete set null, -- null = sistema
  usuario_correo text,
  accion         text not null,
  cambios        jsonb not null,  -- { "campo": { "antes": ..., "despues": ... } }
  created_at     timestamptz not null default now()
);

create index if not exists historial_referido_idx on public.referidos_historial (referido_id, created_at desc);

create or replace function public.registrar_historial_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campos constant text[] := array[
    'afiliado_atom', 'plan_hoja', 'plan_afiliado_id', 'bono', 'estado_bono', 'editado_manual', 'pago_id'
  ];
  campo text;
  antes jsonb := to_jsonb(old);
  despues jsonb := to_jsonb(new);
  cambios jsonb := '{}'::jsonb;
begin
  foreach campo in array campos loop
    if (antes -> campo) is distinct from (despues -> campo) then
      cambios := cambios || jsonb_build_object(
        campo, jsonb_build_object('antes', antes -> campo, 'despues', despues -> campo));
    end if;
  end loop;

  if cambios <> '{}'::jsonb then
    insert into public.referidos_historial (referido_id, usuario_id, usuario_correo, accion, cambios)
    values (
      new.id,
      auth.uid(),
      auth.jwt() ->> 'email',
      coalesce(nullif(current_setting('app.accion', true), ''),
               case when auth.uid() is null then 'Sistema' else 'Cambio' end),
      cambios
    );
  end if;
  return null;
end;
$$;

drop trigger if exists referidos_historial_cambios on public.referidos;
create trigger referidos_historial_cambios
  after update on public.referidos
  for each row execute function public.registrar_historial_referido();

-- ---------------------------------------------------------------------
-- Guardar el resultado del cruce con la Google Sheet en un solo paso.
-- Recibe una lista JSON: [{id, afiliado_atom, cruce_por, plan_hoja}, ...]
-- No toca referidos editados a mano ni pagados.
-- Solo la puede ejecutar el servidor (clave secreta); ver permisos abajo.
-- ---------------------------------------------------------------------
drop function if exists public.aplicar_cruce(jsonb);
create function public.aplicar_cruce(datos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform set_config('app.accion', 'Cruce con la hoja', true);
  update public.referidos r
     set afiliado_atom        = d.afiliado_atom,
         cruce_por            = d.cruce_por,
         plan_hoja            = d.plan_hoja,
         cruce_actualizado_en = now()
    from jsonb_to_recordset(datos) as d(
      id uuid, afiliado_atom boolean, cruce_por public.metodo_cruce, plan_hoja text)
   where r.id = d.id
     and not r.editado_manual
     and r.estado_bono <> 'pagado';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- Acciones del super_admin (cada una verifica el rol antes de actuar)
-- ---------------------------------------------------------------------

-- Editar a mano un referido. Queda marcado "editado_manual" y el cruce
-- con la hoja deja de cambiarlo.
create or replace function public.editar_referido(
  p_id uuid,
  p_plan_afiliado_id text,
  p_afiliado_atom boolean,
  p_bono numeric,
  p_estado public.estado_bono
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede editar referidos' using errcode = '42501';
  end if;
  if p_estado = 'pagado' then
    raise exception 'Para marcar como pagado usa "Registrar pago"' using errcode = '22023';
  end if;
  if p_bono is not null and p_bono < 0 then
    raise exception 'El bono no puede ser negativo' using errcode = '22023';
  end if;
  if p_plan_afiliado_id is not null and not exists (select 1 from public.planes where id = p_plan_afiliado_id) then
    raise exception 'El plan no existe' using errcode = '22023';
  end if;

  perform set_config('app.accion', 'Edición manual', true);
  update public.referidos
     set plan_afiliado_id = p_plan_afiliado_id,
         afiliado_atom    = p_afiliado_atom,
         bono             = p_bono,
         estado_bono      = p_estado,
         editado_manual   = true
   where id = p_id and estado_bono <> 'pagado';

  if not found then
    raise exception 'El referido no existe o ya está pagado' using errcode = 'P0002';
  end if;
end;
$$;

-- Quitar la marca de edición manual: el referido vuelve a seguir la hoja.
create or replace function public.volver_a_usar_hoja(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede hacer esto' using errcode = '42501';
  end if;

  perform set_config('app.accion', 'Volver a usar la hoja', true);
  update public.referidos
     set editado_manual = false
   where id = p_id and estado_bono <> 'pagado';

  if not found then
    raise exception 'El referido no existe o ya está pagado' using errcode = 'P0002';
  end if;
end;
$$;

-- Registrar un pago que cubre uno o varios referidos "por_pagar" de un
-- mismo referente. Todo o nada: si algo no cuadra, no se guarda nada.
create or replace function public.registrar_pago(
  p_referente_id uuid,
  p_referidos uuid[],
  p_fecha date,
  p_valor numeric,
  p_nota text,
  p_soporte_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago uuid;
  v_validos int;
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede registrar pagos' using errcode = '42501';
  end if;
  if coalesce(array_length(p_referidos, 1), 0) = 0 then
    raise exception 'Elige al menos un referido' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'El valor pagado no es válido' using errcode = '22023';
  end if;
  if p_soporte_path is null or left(p_soporte_path, length(p_referente_id::text) + 1) <> p_referente_id::text || '/' then
    raise exception 'El soporte no corresponde a este referente' using errcode = '22023';
  end if;

  -- Bloquea las filas para que dos pagos no cubran el mismo referido
  select count(*) into v_validos
    from (select 1 from public.referidos
           where id = any(p_referidos)
             and referente_id = p_referente_id
             and estado_bono = 'por_pagar'
           for update) s;

  if v_validos <> (select count(distinct x) from unnest(p_referidos) x) then
    raise exception 'Algunos referidos ya no están "por pagar" o no son de este referente' using errcode = '22023';
  end if;

  insert into public.pagos (referente_id, fecha_pago, valor_pagado, nota, soporte_path, creado_por)
  values (p_referente_id, p_fecha, p_valor, nullif(trim(p_nota), ''), p_soporte_path, auth.uid())
  returning id into v_pago;

  perform set_config('app.accion', 'Pago registrado', true);
  update public.referidos
     set estado_bono = 'pagado', pago_id = v_pago
   where id = any(p_referidos);

  return v_pago;
end;
$$;

-- =====================================================================
--  STORAGE: soportes de pago (bucket PRIVADO, máx. 5 MB, imagen o PDF)
--  Ruta de cada archivo: <id del referente>/<archivo>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soportes-pagos', 'soportes-pagos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ver (y generar links temporales firmados): el super_admin, o el
-- referente dueño del pago al que pertenece ese soporte.
-- No hay políticas para subir/borrar: solo el servidor sube archivos,
-- con un permiso de un solo uso que crea después de verificar al super_admin.
drop policy if exists "soportes: ver los propios o super_admin" on storage.objects;
create policy "soportes: ver los propios o super_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'soportes-pagos'
    and (
      public.es_super_admin()
      or exists (
        select 1 from public.pagos p
        where p.soporte_path = storage.objects.name
          and p.referente_id = auth.uid()
      )
    )
  );

-- =====================================================================
--  ROW LEVEL SECURITY (reglas de quién ve qué)
-- =====================================================================
alter table public.super_admins        enable row level security;
alter table public.referentes          enable row level security;
alter table public.planes              enable row level security;
alter table public.referidos           enable row level security;
alter table public.pagos               enable row level security;
alter table public.referidos_historial enable row level security;

-- Limpieza de políticas previas (para poder re-ejecutar el archivo)
drop policy if exists "super_admin ve super_admins"   on public.super_admins;
drop policy if exists "referente ve su perfil"        on public.referentes;
drop policy if exists "referente edita su perfil"     on public.referentes;
drop policy if exists "usuarios ven los planes"       on public.planes;
drop policy if exists "referente ve sus referidos"    on public.referidos;
drop policy if exists "referente ve sus pagos"        on public.pagos;
drop policy if exists "super_admin ve el historial"   on public.referidos_historial;

-- La función del rol anterior ya no se usa
drop function if exists public.es_admin();

-- super_admins: solo los super_admin pueden ver la lista
create policy "super_admin ve super_admins"
  on public.super_admins for select
  to authenticated
  using (public.es_super_admin());

-- referentes: cada uno ve su propia fila; el super_admin ve todas
create policy "referente ve su perfil"
  on public.referentes for select
  to authenticated
  using (id = auth.uid() or public.es_super_admin());

-- referentes: cada uno puede corregir sus propios datos de contacto
create policy "referente edita su perfil"
  on public.referentes for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- planes: cualquier usuario con sesión los puede ver (nombres y bonos).
-- Los visitantes sin sesión (los referidos) NO ven los bonos.
create policy "usuarios ven los planes"
  on public.planes for select
  to authenticated
  using (true);

-- referidos: cada referente ve solo los suyos; el super_admin ve todos
create policy "referente ve sus referidos"
  on public.referidos for select
  to authenticated
  using (referente_id = auth.uid() or public.es_super_admin());

-- pagos: cada referente ve solo los suyos; el super_admin ve todos
create policy "referente ve sus pagos"
  on public.pagos for select
  to authenticated
  using (referente_id = auth.uid() or public.es_super_admin());

-- historial: solo el super_admin
create policy "super_admin ve el historial"
  on public.referidos_historial for select
  to authenticated
  using (public.es_super_admin());

-- No hay políticas de INSERT / UPDATE / DELETE en referidos, pagos ni
-- historial: nadie puede cambiarlos desde el navegador. Los cambios se
-- hacen con las funciones de arriba (que verifican el rol) o desde el
-- servidor con la clave secreta.

-- ---------------------------------------------------------------------
-- Permisos por tabla y columna
-- ---------------------------------------------------------------------
revoke all on public.super_admins, public.referentes, public.planes, public.referidos,
              public.pagos, public.referidos_historial from anon;

revoke insert, update, delete on public.super_admins, public.referentes, public.planes,
              public.referidos, public.pagos, public.referidos_historial from authenticated;

grant usage on schema public to authenticated, service_role;
grant select on public.super_admins, public.referentes, public.planes, public.referidos,
                public.pagos, public.referidos_historial to authenticated;
-- Un referente solo puede cambiar nombre, teléfono y cuenta Dropi
-- (nunca su código, correo ni estado).
grant update (nombre, telefono, cuenta_dropi) on public.referentes to authenticated;

-- El servidor (clave secreta = rol service_role) guarda el formulario
-- público y el cruce. Los proyectos nuevos de Supabase ya no dan estos
-- permisos automáticamente, por eso se dan aquí de forma explícita.
grant select, insert, update, delete
  on public.super_admins, public.referentes, public.planes, public.referidos,
     public.pagos, public.referidos_historial
  to service_role;

-- Funciones: por defecto Postgres deja ejecutarlas a todos; se restringe.
revoke all on function public.es_super_admin()                                      from public, anon;
revoke all on function public.buscar_plan_id(text)                                  from public, anon, authenticated;
revoke all on function public.aplicar_cruce(jsonb)                                  from public, anon, authenticated;
revoke all on function public.editar_referido(uuid, text, boolean, numeric, public.estado_bono) from public, anon;
revoke all on function public.volver_a_usar_hoja(uuid)                              from public, anon;
revoke all on function public.registrar_pago(uuid, uuid[], date, numeric, text, text) from public, anon;

grant execute on function public.es_super_admin()   to authenticated, service_role;
grant execute on function public.buscar_plan_id(text) to service_role;
grant execute on function public.aplicar_cruce(jsonb) to service_role;
grant execute on function public.editar_referido(uuid, text, boolean, numeric, public.estado_bono) to authenticated;
grant execute on function public.volver_a_usar_hoja(uuid) to authenticated;
grant execute on function public.registrar_pago(uuid, uuid[], date, numeric, text, text) to authenticated;

-- =====================================================================
--  DIAGNÓSTICO (lo usan /admin/estado y "npm run verificar")
--  Revisa que existan tablas, RLS, funciones, disparadores, el bucket
--  privado y al menos un super_admin. No devuelve datos personales.
--  Solo lo puede ejecutar el servidor (clave secreta).
-- =====================================================================
create or replace function public.diagnostico()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'tablas', (
      select jsonb_agg(jsonb_build_object(
        'nombre', t.nombre,
        'existe', c.oid is not null,
        'rls', coalesce(c.relrowsecurity, false),
        'politicas', (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.nombre),
        'anon_lee', case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end
      ) order by t.orden)
      from unnest(array['super_admins','referentes','planes','referidos','pagos','referidos_historial'])
           with ordinality as t(nombre, orden)
      left join pg_class c on c.relname = t.nombre and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    ),
    'funciones', (
      select jsonb_agg(jsonb_build_object(
        'nombre', f.nombre,
        'existe', exists (select 1 from pg_proc p where p.proname = f.nombre and p.pronamespace = 'public'::regnamespace)
      ) order by f.orden)
      from unnest(array[
        'es_super_admin','normalizar_telefono','normalizar_nombre_plan','buscar_plan_id',
        'generar_codigo_referente','crear_referente_desde_auth','calcular_bono_referido',
        'recalcular_por_planes','registrar_historial_referido','aplicar_cruce',
        'editar_referido','volver_a_usar_hoja','registrar_pago'
      ]) with ordinality as f(nombre, orden)
    ),
    'disparadores', (
      select jsonb_agg(jsonb_build_object(
        'nombre', d.nombre,
        'existe', exists (select 1 from pg_trigger g where g.tgname = d.nombre and not g.tgisinternal)
      ) order by d.orden)
      from unnest(array[
        'al_crear_usuario','referidos_calcular_bono','referidos_historial_cambios',
        'planes_recalcular','referidos_updated_at','referentes_updated_at','planes_updated_at'
      ]) with ordinality as d(nombre, orden)
    ),
    'bucket', (
      select jsonb_build_object(
        'publico', b.public, 'limite', b.file_size_limit, 'tipos', to_jsonb(b.allowed_mime_types))
      from storage.buckets b where b.id = 'soportes-pagos'
    ),
    'politica_storage', exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'soportes: ver los propios o super_admin'
    ),
    'super_admins', (select count(*) from public.super_admins)
  );
$$;

revoke all on function public.diagnostico() from public, anon, authenticated;
grant execute on function public.diagnostico() to service_role;

-- Recalcula el bono de los referidos existentes con las reglas nuevas
select set_config('app.accion', 'Actualización del sistema', true);
update public.referidos set plan_hoja = plan_hoja
 where not editado_manual and estado_bono <> 'pagado';

-- =====================================================================
--  Para nombrar un super_admin (hazlo después de que esa persona
--  haya iniciado sesión al menos una vez):
--
--  insert into public.super_admins (user_id)
--  select id from auth.users where email = 'correo-del-super-admin@ejemplo.com';
-- =====================================================================
