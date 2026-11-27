-- =====================================================================
--  Referidos ATOM — Esquema de base de datos (Supabase / PostgreSQL)
-- ---------------------------------------------------------------------
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede volver a ejecutar sin romper nada y sin
--  perder datos: actualiza las tablas de versiones anteriores.
--
--  Resumen:
--    super_admins         → usuarios que ven todo, editan y registran pagos
--    reglas_programa      → reglas del programa (una sola fila, editable)
--    referentes           → personas que refieren (una fila por usuario con login)
--    referentes_historial → suspensiones y reactivaciones de referentes
--    planes               → planes de ATOM y el bono que paga cada uno
--    referidos            → personas que llegan por el link /r/CODIGO
--    pagos                → pagos de bonos hechos a un referente
--    referidos_historial  → quién cambió qué, cuándo y por qué en cada referido
--    reglas_historial     → cambios en las reglas del programa
--    registros_intentos   → intentos del formulario público (límite por IP)
--    Storage "soportes-pagos" → comprobantes de pago (bucket PRIVADO)
--
--  Seguridad (Row Level Security):
--    • Un referente solo puede ver SU fila, SUS referidos, SUS pagos y
--      los soportes de SUS pagos (y nada de eso si está suspendido).
--    • El super_admin puede ver todo. Editar, suspender, cambiar reglas y
--      pagar solo se hace con funciones que verifican que quien llama es
--      super_admin.
--    • Los visitantes sin login no pueden leer ni escribir nada
--      directamente: el formulario de referidos lo guarda el servidor.
--    • Las reglas del programa (duplicados, auto-referidos, vigencia,
--      límites, exclusiones) se validan AQUÍ, en la base de datos, además
--      de en el servidor de la app.
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

-- Estados del bono (columna referidos.estado_bono, texto con lista fija):
--   pendiente_confirmacion = se registró, falta que confirme por correo
--   estimado        = registro vigente, aún no activo en ATOM
--   en_verificacion = activo en ATOM, esperando los días de permanencia
--   por_pagar       = cumplió la permanencia: hay que pagarle al referente
--   pagado          = el super_admin registró el pago
--   vencido         = pasó el plazo sin activarse (la persona queda libre)
--   ya_cliente      = ya estaba en la hoja de afiliados al registrarse
--   no_aplica       = referente suspendido o anulado por el super_admin

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
-- Funciones de apoyo: IDENTIDAD de una persona
--   Cada persona tiene un CONJUNTO de identificadores normalizados (su
--   correo, su teléfono y su cuenta Dropi). "La misma persona" = CUALQUIER
--   identificador de una coincide con CUALQUIER identificador de la otra,
--   sin importar el campo (el correo escrito como cuenta Dropi también
--   cuenta). La app usa las mismas reglas (src/lib/identidad.ts y
--   src/lib/telefono.ts).
-- ---------------------------------------------------------------------

-- Teléfono en el FORMATO ESTÁNDAR: E.164 sin el "+" (indicativo + número
-- nacional, solo dígitos). La app ya guarda los celulares así, validados
-- con libphonenumber-js (src/lib/telefono.ts); aquí solo se limpian los
-- datos viejos y los teléfonos escritos en la cuenta Dropi:
--   '+57 310-482 7756' → '573104827756'
--   '0057 3104827756'  → '573104827756'
--   '3104827756'       → '573104827756'   (sin indicativo = Colombia)
--   '525548273956'     → '525548273956'   (ya trae indicativo: no cambia)
create or replace function public.normalizar_telefono(t text)
returns text
language sql
immutable
as $$
  select case
    when e = '' then null
    when length(e) = 10 and e ~ '^(3|60)' then '57' || e
    else e
  end
  from (
    select case when left(d, 2) = '00' then substr(d, 3) else d end as e
    from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) s
  ) s2;
$$;

-- Correo comparable: minúsculas y sin espacios. En Gmail se ignoran los
-- puntos y lo que va después de "+" (Gmail los trata como el mismo buzón).
--   ' Ana.Perez+atom@Gmail.com ' → 'anaperez@gmail.com'
create or replace function public.normalizar_correo_identidad(c text)
returns text
language sql
immutable
as $$
  select case
    when v = '' then null
    when split_part(v, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(v, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else v
  end
  from (select lower(regexp_replace(coalesce(c, ''), '\s', '', 'g')) as v) s;
$$;

-- Cuenta Dropi comparable: minúsculas y sin espacios. Si es un correo,
-- se compara como correo. Respuestas que no identifican a nadie
-- ("no tengo", "ninguna", "n/a"...) no cuentan para la comparación.
create or replace function public.normalizar_dropi(t text)
returns text
language sql
immutable
as $$
  select case
    when v = '' or length(v) < 3 then null
    when v ~ '^(no|na|n/a|nn|ninguno|ninguna|notengo.*|aunnotengo.*|todaviano.*|pendiente.*|sincuenta.*|x+|-+|\.+|0+|null|none)$' then null
    when position('@' in v) > 1 then public.normalizar_correo_identidad(v)
    else ltrim(v, '@')
  end
  from (select lower(regexp_replace(coalesce(t, ''), '\s', '', 'g')) as v) s;
$$;

-- Cuenta Dropi que parece un teléfono ('+57 310 482 7756'): también se
-- compara como teléfono ('573104827756'). Si no lo parece, null.
create or replace function public.normalizar_dropi_telefono(t text)
returns text
language sql
immutable
as $$
  select case
    when v ~ '^\+?[0-9().-]+$' and length(coalesce(public.normalizar_telefono(v), '')) >= 7
      then public.normalizar_telefono(v)
  end
  from (select regexp_replace(coalesce(t, ''), '\s', '', 'g') as v) s;
$$;

-- Conjunto de identificadores de una persona (sin repetidos y ordenado).
--   ('Juan.Perez+1@gmail.com', '573104827756', 'JuanPerez@Gmail.com')
--   → {573104827756, juanperez@gmail.com}
-- Se compara con el operador && ("¿tienen algún elemento en común?").
create or replace function public.identificadores_persona(p_correo text, p_telefono text, p_dropi text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct x order by x), '{}'::text[])
  from unnest(array[
    public.normalizar_correo_identidad(p_correo),
    public.normalizar_telefono(p_telefono),
    public.normalizar_dropi(p_dropi),
    public.normalizar_dropi_telefono(p_dropi)
  ]) as x
  where x is not null;
$$;

-- Bloqueo por persona: evita que dos registros simultáneos de la misma
-- persona pasen los dos la revisión de duplicados. Se bloquea cada
-- identificador (en orden, para no trabarse entre sí).
drop function if exists public.bloquear_identidad(text, text, text);
create or replace function public.bloquear_identidad(p_ids text[])
returns void
language plpgsql
as $$
declare
  k text;
begin
  for k in select distinct x from unnest(coalesce(p_ids, '{}'::text[])) as x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended('identidad:' || k, 0));
  end loop;
end;
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
-- CELULAR (referentes y referidos). Mismas reglas que src/lib/telefono.ts:
--   • Se guarda en el formato estándar (E.164 sin "+", ej. 573104827756)
--     y el país aparte (telefono_pais = CO, MX, AR…).
--   • Debe ser un CELULAR válido del país (patrones de libphonenumber-js).
--   • No puede ser un número falso (repetido, secuencia o patrón).
--   • No puede estar en telefonos_bloqueados (la edita el super_admin).
-- ---------------------------------------------------------------------

-- >>> CELULARES POR PAÍS (generado con: npm run generar-sql-telefono; no editar a mano)
create or replace function public.celular_pais(p_pais text)
returns table (indicativo text, patron_celular text)
language sql
immutable
as $$
  select v.indicativo, v.patron_celular
  from (values
    ('CO', '57', '333301[0-5]\d{3}|3333(?:00|2[5-9]|[3-9]\d)\d{4}|(?:3(?:24[1-9]|3(?:00|3[0-24-9]))|9408)\d{6}|3(?:0[0-5]|1\d|2[0-3]|5[01]|70)\d{7}'),
    ('AR', '54', '93(?:7(?:1[15]|81)|8(?:21|4[16]|69|9[12]))[46]\d{5}|9(?:2(?:2(?:2[59]|44|52)|3(?:26|44)|47[35]|9(?:[07]2|2[26]|34|46))|3327)[45]\d{5}|9(?:2(?:657|9(?:54|66))|3(?:48[27]|7(?:55|77)|8(?:65|78)))[2-8]\d{5}|9(?:2(?:284|3(?:02|23)|477|622|920)|3(?:4(?:46|89|92)|541))[2-7]\d{5}|(?:675\d|9(?:11[0-8]\d|2(?:2(?:0[45]|1[2-6]|3[3-6])|3(?:[06]4|7[45])|494|6(?:04|1[2-8]|[36][45]|4[3-6])|80[45]|9(?:[17][4-6]|[48][45]|9[3-6]))|3(?:364|4(?:1[2-8]|[25][4-6]|3[3-6]|84)|5(?:1[2-9]|[38][4-6])|6(?:2[45]|44)|7[069][45]|8(?:0[45]|1[2-7]|3[4-6]|5[3-6]|7[2-6]|8[3-68]))))\d{6}|9(?:2(?:2(?:62|81)|320|9(?:42|83))|3(?:329|4(?:62|7[16])|5(?:43|64)|7(?:18|5[17])))[2-6]\d{5}|92(?:2(?:21|4[23]|6[145]|7[1-4]|8[356]|9[267])|3(?:16|3[13-8]|43|5[346-8]|9[3-5])|6(?:2[46]|4[78]|5[1568])|9(?:03|2[1457-9]|3[1356]|4[08]|[56][23]|82))4\d{5}|9(?:2(?:257|3(?:24|46|92)|9(?:01|23|64))|3(?:4(?:42|64)|5(?:25|37|4[47]|71)|7(?:35|72)|825))[3-6]\d{5}|9(?:2(?:2(?:02|2[3467]|4[156]|5[45]|6[6-8]|91)|3(?:1[47]|25|[45][25]|96)|47[48]|625|932)|3(?:38[2578]|4(?:0[0-24-9]|3[78]|4[457]|58|6[035-9]|72|83|9[136-8])|5(?:2[124]|[368][23]|4[2689]|7[2-6])|7(?:16|2[15]|3[14]|4[13]|5[468]|7[3-5]|8[26])|8(?:2[67]|3[278]|4[3-5]|5[78]|6[1-378]|[78]7|94)))[4-6]\d{5}'),
    ('BO', '591', '(?:57|[67]\d)\d{6}'),
    ('BR', '55', '(?:[14689][1-9]|2[12478]|3[1-578]|5[13-5]|7[13-579])(?:7|9\d)\d{7}'),
    ('CL', '56', '2(?:1982[0-6]|3314[05-9])\d{3}|(?:2(?:1(?:160|962)|3(?:(?:[24]\d|50)\d|3(?:[0346-9]\d|1[0-35-9]|2[1-9]|5[0-24-9])|600)|646[59])|80[1-8]\d\d|9(?:(?:10[0-2]|7[1-9]\d)\d|3(?:[0-57-9]\d\d|6(?:0[02-9]|[1-9]\d))|6(?:[0-8]\d\d|9(?:[02-79]\d|1[05-9]))|9(?:[03-9]\d\d|1(?:[0235-9]\d|4[0-24-9])|2(?:[0-79]\d|8[0-46-9]))))\d{4}|(?:22|3[2-5]|[47][1-35]|5[1-3578]|6[13-57]|8[1-9]|9[2458])\d{7}'),
    ('CR', '506', '(?:3005\d|6500[01])\d{3}|(?:5[07]|6[0-4]|7[0-3]|8[3-9])\d{6}'),
    ('CU', '53', '(?:5\d|6[2-4])\d{6}'),
    ('EC', '593', '964[0-2]\d{5}|9(?:3[0-29]|[57][89]|6[0-36-9]|[89]\d)\d{6}'),
    ('SV', '503', '[5-7]\d{7}'),
    ('ES', '34', '9(?:6906(?:09|10)|7390\d\d)\d\d|(?:6\d|7[1-48])\d{7}'),
    ('US', '1', '983[2-57-9]\d{6}|(?:2(?:0[1-35-9]|1[02-9]|2[03-57-9]|3[1459]|4[08]|5[1-46]|6[0279]|7[02469]|8[13])|3(?:0[1-57-9]|1[02-9]|2[013-79]|3[0-24679]|4[167]|5[0-3]|6[01349]|8[056])|4(?:0[124-9]|1[02-579]|2[3-5]|3[0245]|4[023578]|58|6[349]|7[02589]|8[04])|5(?:0[1-57-9]|1[0235-8]|20|3[0149]|4[01]|5[179]|6[1-47]|7[0-5]|8[0256])|6(?:0[1-35-9]|1[024-9]|2[03689]|3[016]|4[0156]|5[01679]|6[0-279]|78|8[0-269])|7(?:0[1-46-8]|1[2-9]|2[04-8]|3[0-2478]|4[0378]|5[47]|6[02359]|7[0-59]|8[156])|8(?:0[1-68]|1[02-8]|2[0168]|3[0-2589]|4[03578]|5[046-9]|6[02-5]|7[028])|9(?:0[1346-9]|1[02-9]|2[0589]|3[0146-8]|4[01357-9]|5[12469]|7[0-3589]|8[04-69]))[2-9]\d{6}'),
    ('GT', '502', '(?:[3-5]\d\d|80[0-4])\d{5}'),
    ('HN', '504', '[37-9]\d{7}'),
    ('MX', '52', '(?:2(?:2\d|3[1-35-8]|4[13-9]|7[1-689]|8[1-578]|9[467])|3(?:1[1-79]|[2458][1-9]|3\d|7[1-8]|9[1-5])|4(?:1[1-57-9]|[267][1-9]|3[1-8]|[45]\d|8[1-35-9]|9[2-689])|5(?:[56]\d|88|9[1-79])|6(?:1[2-68]|[2-4][1-9]|5[1-36-9]|6[0-57-9]|7[1-7]|8[67]|9[4-8])|7(?:[1346][1-9]|[27]\d|5[13-9]|8[1-69]|9[17])|8(?:1\d|2[13-689]|3[1-6]|4[124-6]|6[1246-9]|7[0-378]|9[12479])|9(?:1[346-9]|2[1-4]|3[2-46-8]|5[1348]|[69]\d|7[12]|8[1-8]))\d{7}'),
    ('NI', '505', '(?:5(?:5[0-7]|[78]\d)|6(?:20|3[035]|4[045]|5[05]|77|8[1-9]|9[059])|(?:7[5-8]|8\d)\d)\d{5}'),
    ('PA', '507', '(?:1[16]1|21[89]|6\d{3}|8(?:1[01]|7[23]))\d{4}'),
    ('PY', '595', '9881\d{5}|9(?:51|6[129]|7[1-6]|8[1-7]|9[1-5])\d{6}'),
    ('PE', '51', '9\d{8}'),
    ('PR', '1', '(?:787|939)[2-9]\d{6}'),
    ('DO', '1', '8[024]9[2-9]\d{6}'),
    ('UY', '598', '9[1-9]\d{6}'),
    ('VE', '58', '4(?:1[24-8]|2[246])\d{7}')
  ) as v(pais, indicativo, patron_celular)
  where v.pais = p_pais;
$$;
-- <<< CELULARES POR PAÍS

-- ¿Es un número inventado? Se revisa el número NACIONAL (sin indicativo):
--   • el mismo dígito 7 o más veces seguidas (3000000000);
--   • el mismo dígito en el 80 % o más de las posiciones;
--   • una secuencia ascendente o descendente de 6 o más (123456, 987654);
--   • un patrón repetido (3003003003, 3121212121, 3123123123).
create or replace function public.telefono_es_falso(p_nacional text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p_nacional, ''), '\D', '', 'g');
  n int := length(regexp_replace(coalesce(p_nacional, ''), '\D', '', 'g'));
  i int;
  dif int;
  igual int := 1;
  sube int := 1;
  baja int := 1;
  maximo int;
  ini int;
  s text;
  p int;
  periodico boolean;
begin
  if n = 0 then
    return true;
  end if;

  for i in 2..n loop
    dif := substr(d, i, 1)::int - substr(d, i - 1, 1)::int;
    igual := case when dif = 0 then igual + 1 else 1 end;
    sube := case when dif = 1 then sube + 1 else 1 end;
    baja := case when dif = -1 then baja + 1 else 1 end;
    if igual >= 7 or sube >= 6 or baja >= 6 then
      return true;
    end if;
  end loop;

  select max(t.c) into maximo
  from (select count(*) as c from regexp_split_to_table(d, '') as x group by x) t;
  if maximo * 5 >= n * 4 then
    return true;
  end if;

  -- El número (o el número sin su primer dígito) es un bloque de 2 a 4
  -- dígitos repetido al menos 3 veces
  for ini in 0..1 loop
    s := substr(d, ini + 1);
    p := 2;
    while p <= 4 and p * 3 <= length(s) loop
      periodico := true;
      for i in (p + 1)..length(s) loop
        if substr(s, i, 1) <> substr(s, i - p, 1) then
          periodico := false;
          exit;
        end if;
      end loop;
      if periodico then
        return true;
      end if;
      p := p + 1;
    end loop;
  end loop;
  return false;
end;
$$;

-- Números bloqueados (en el formato estándar). Los edita el super_admin
-- en /admin/reglas. Los valores iniciales se cargan solo la primera vez
-- (si el super_admin quita uno, no vuelve a aparecer al re-ejecutar).
do $$ begin
  if to_regclass('public.telefonos_bloqueados') is null then
    create table public.telefonos_bloqueados (
      telefono   text primary key check (telefono ~ '^[1-9][0-9]{6,14}$'),
      nota       text check (nota is null or length(nota) <= 200),
      creado_por uuid references auth.users (id) on delete set null,
      created_at timestamptz not null default now()
    );
    insert into public.telefonos_bloqueados (telefono, nota) values
      ('573000000000', 'Valor inicial'),
      ('573001234567', 'Valor inicial'),
      ('573111111111', 'Valor inicial'),
      ('573123456789', 'Valor inicial'),
      ('573333333333', 'Valor inicial'),
      ('573999999999', 'Valor inicial');
  end if;
end $$;

-- ¿Qué tiene de malo este celular? null = está bien.
--   'formato'    = no es E.164 sin "+" (solo dígitos, 7 a 15)
--   'pais'       = el país no está en la lista
--   'indicativo' = no empieza por el indicativo de su país
--   'no_celular' = no es un celular válido de ese país (fijo, longitud…)
--   'falso'      = número inventado (ver telefono_es_falso)
--   'bloqueado'  = está en telefonos_bloqueados
create or replace function public.problema_telefono(p_telefono text, p_pais text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  v_nacional text;
begin
  if coalesce(p_telefono, '') !~ '^[1-9][0-9]{6,14}$' then
    return 'formato';
  end if;
  select * into c from public.celular_pais(p_pais);
  if not found then
    return 'pais';
  end if;
  if left(p_telefono, length(c.indicativo)) <> c.indicativo then
    return 'indicativo';
  end if;
  v_nacional := substr(p_telefono, length(c.indicativo) + 1);
  if v_nacional !~ ('^(?:' || c.patron_celular || ')$') then
    return 'no_celular';
  end if;
  if public.telefono_es_falso(v_nacional) then
    return 'falso';
  end if;
  if exists (select 1 from public.telefonos_bloqueados b where b.telefono = p_telefono) then
    return 'bloqueado';
  end if;
  return null;
end;
$$;

-- Disparador de referentes y referidos: deja el teléfono en el formato
-- estándar y rechaza el registro si el celular no cumple las reglas.
-- Solo revisa cuando el teléfono cambia (los datos viejos no se tocan).
create or replace function public.validar_telefono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problema text;
begin
  new.telefono := coalesce(public.normalizar_telefono(new.telefono), new.telefono);
  -- Compatibilidad: si no llega el país y es un número de Colombia
  if new.telefono_pais is null and new.telefono ~ '^57[0-9]{10}$' then
    new.telefono_pais := 'CO';
  end if;
  if tg_op = 'UPDATE'
     and new.telefono is not distinct from old.telefono
     and new.telefono_pais is not distinct from old.telefono_pais then
    return new;
  end if;
  v_problema := public.problema_telefono(new.telefono, new.telefono_pais);
  if v_problema is not null then
    raise exception 'TELEFONO_INVALIDO' using errcode = 'P0001', detail = v_problema;
  end if;
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
-- Tabla: reglas_programa (UNA sola fila)
--   Se edita en /admin/reglas o en Supabase → Table Editor →
--   reglas_programa. Todas las reglas leen estos valores.
-- ---------------------------------------------------------------------
create table if not exists public.reglas_programa (
  id boolean primary key default true check (id),  -- garantiza una sola fila
  dias_vigencia_registro          int not null default 30 check (dias_vigencia_registro between 1 and 365),
  dias_permanencia_para_pagar     int not null default 30 check (dias_permanencia_para_pagar between 0 and 365),
  confirmacion_referido_por_correo boolean not null default false,
  dominios_excluidos              text not null default '',  -- ej: atomsolutionsdata.com,atomapp.com.co
  max_registros_por_link_por_hora int not null default 10 check (max_registros_por_link_por_hora between 1 and 1000),
  updated_at  timestamptz not null default now()
);

insert into public.reglas_programa (id) values (true) on conflict (id) do nothing;

drop trigger if exists reglas_updated_at on public.reglas_programa;
create trigger reglas_updated_at
  before update on public.reglas_programa
  for each row execute function public.actualizar_updated_at();

-- La fila de reglas no se puede borrar (sin ella el programa no funciona)
create or replace function public.impedir_borrar_reglas()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La fila de reglas_programa no se puede borrar; edita sus valores' using errcode = '42501';
end;
$$;

drop trigger if exists reglas_no_borrar on public.reglas_programa;
create trigger reglas_no_borrar
  before delete on public.reglas_programa
  for each row execute function public.impedir_borrar_reglas();

-- Las reglas vigentes (la única fila)
create or replace function public.reglas()
returns public.reglas_programa
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.reglas_programa;
begin
  select * into r from public.reglas_programa where id;
  if not found then
    raise exception 'Falta la fila de reglas_programa: ejecuta de nuevo supabase/schema.sql';
  end if;
  return r;
end;
$$;

-- ¿El correo es de un dominio excluido (empleados)? Acepta subdominios.
create or replace function public.dominio_excluido(p_correo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reglas_programa r,
         unnest(string_to_array(lower(regexp_replace(r.dominios_excluidos, '\s', '', 'g')), ',')) as d(dominio)
    where r.id
      and ltrim(d.dominio, '@') <> ''
      and (
        split_part(lower(trim(p_correo)), '@', 2) = ltrim(d.dominio, '@')
        or split_part(lower(trim(p_correo)), '@', 2) like '%.' || ltrim(d.dominio, '@')
      )
  );
$$;

-- Historial de cambios en las reglas (también los hechos en el Table Editor)
create table if not exists public.reglas_historial (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references auth.users (id) on delete set null,
  usuario_correo text,
  cambios        jsonb not null,
  created_at     timestamptz not null default now()
);

create or replace function public.registrar_historial_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campo text;
  antes jsonb := to_jsonb(old) - 'updated_at';
  despues jsonb := to_jsonb(new) - 'updated_at';
  cambios jsonb := '{}'::jsonb;
begin
  for campo in select jsonb_object_keys(despues) loop
    if (antes -> campo) is distinct from (despues -> campo) then
      cambios := cambios || jsonb_build_object(campo, jsonb_build_object('antes', antes -> campo, 'despues', despues -> campo));
    end if;
  end loop;
  if cambios <> '{}'::jsonb then
    insert into public.reglas_historial (usuario_id, usuario_correo, cambios)
    values (auth.uid(), coalesce(auth.jwt() ->> 'email', 'Table Editor / sistema'), cambios);
  end if;
  return null;
end;
$$;

drop trigger if exists reglas_historial_cambios on public.reglas_programa;
create trigger reglas_historial_cambios
  after update on public.reglas_programa
  for each row execute function public.registrar_historial_reglas();

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

alter table public.referentes
  -- Identidad comparable (ver funciones de arriba)
  add column if not exists correo_identidad  text generated always as (public.normalizar_correo_identidad(correo)) stored,
  add column if not exists dropi_normalizada text generated always as (public.normalizar_dropi(cuenta_dropi)) stored,
  -- Autorización de tratamiento de datos (Ley 1581 de 2012). Vacías en los
  -- referentes que se registraron antes de pedir la casilla.
  add column if not exists autoriza_datos   boolean,
  add column if not exists autorizado_en    timestamptz,
  add column if not exists version_politica text,
  -- Términos del programa aceptados al registrarse
  add column if not exists acepta_terminos       boolean,
  add column if not exists terminos_aceptados_en timestamptz,
  add column if not exists version_terminos      text,
  -- Suspensión (la decide el super_admin, con motivo)
  add column if not exists suspendido        boolean not null default false,
  add column if not exists suspendido_en     timestamptz,
  add column if not exists motivo_suspension text,
  -- Identificadores de la persona (correo, teléfono, cuenta Dropi). Se
  -- ACUMULAN: si el referente cambia su teléfono o su cuenta Dropi, los
  -- anteriores siguen contando (así no puede cambiarlos para referirse a
  -- sí mismo). Los mantiene el disparador referentes_identidad.
  add column if not exists identificadores text[] not null default '{}',
  -- País del celular (CO, MX, AR…). El teléfono va en el formato estándar.
  add column if not exists telefono_pais text check (telefono_pais is null or telefono_pais ~ '^[A-Z]{2}$');

create index if not exists referentes_suspendido_idx on public.referentes (suspendido);
create index if not exists referentes_telefono_idx on public.referentes (telefono_normalizado);
create index if not exists referentes_identificadores_idx on public.referentes using gin (identificadores);

-- Referentes que ya existían: se calculan sus identificadores (sin el
-- disparador, para no rechazar datos viejos; ver el reporte en
-- supabase/reporte-identidades.sql).
drop trigger if exists referentes_identidad on public.referentes;
update public.referentes f
   set identificadores = (
     select coalesce(array_agg(distinct x order by x), '{}'::text[])
     from unnest(f.identificadores || public.identificadores_persona(f.correo, f.telefono, f.cuenta_dropi)) as x)
 where not (public.identificadores_persona(f.correo, f.telefono, f.cuenta_dropi) <@ f.identificadores);

-- Un solo referente por persona: si el correo, el teléfono o la cuenta
-- Dropi (en cualquier campo) ya es de otro referente, se rechaza.
create or replace function public.validar_identidad_referente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[] := public.identificadores_persona(new.correo, new.telefono, new.cuenta_dropi);
begin
  if tg_op = 'UPDATE' then
    -- Los identificadores nunca se pierden (ni se pueden escribir a mano)
    new.identificadores := (
      select coalesce(array_agg(distinct x order by x), '{}'::text[])
      from unnest(coalesce(old.identificadores, '{}'::text[]) || v_ids) as x);
    -- Sin datos nuevos, no hay nada que revisar
    if v_ids <@ coalesce(old.identificadores, '{}'::text[]) then
      return new;
    end if;
  else
    new.identificadores := v_ids;
  end if;

  perform public.bloquear_identidad(v_ids);
  if exists (select 1 from public.referentes f where f.id <> new.id and f.identificadores && v_ids) then
    raise exception 'REFERENTE_DUPLICADO' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger referentes_identidad
  before insert or update of correo, telefono, cuenta_dropi, identificadores on public.referentes
  for each row execute function public.validar_identidad_referente();

-- Celular válido (ver validar_telefono). El nombre empieza por "a" para
-- que corra antes que la revisión de identidad (orden alfabético).
drop trigger if exists referentes_a_telefono on public.referentes;
create trigger referentes_a_telefono
  before insert or update of telefono, telefono_pais on public.referentes
  for each row execute function public.validar_telefono();

drop trigger if exists referentes_updated_at on public.referentes;
create trigger referentes_updated_at
  before update on public.referentes
  for each row execute function public.actualizar_updated_at();

-- ¿El usuario con sesión es un referente NO suspendido?
create or replace function public.referente_habilitado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.referentes f where f.id = auth.uid() and not f.suspendido);
$$;

-- Cuando alguien se registra como referente (login por link mágico),
-- la app envía nombre, teléfono, cuenta Dropi y las aceptaciones como
-- "metadata". Este disparador crea su fila de referente automáticamente.
-- Solo actúa si la metadata trae rol = 'referente' (así un super_admin
-- creado a mano no queda registrado como referente).
-- Los correos de dominios excluidos (empleados) se rechazan aquí también.
create or replace function public.crear_referente_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'rol', '') = 'referente' then
    if public.dominio_excluido(new.email) then
      raise exception 'DOMINIO_EXCLUIDO' using errcode = 'P0001';
    end if;

    insert into public.referentes (
      id, nombre, correo, telefono, telefono_pais, cuenta_dropi,
      autoriza_datos, autorizado_en, version_politica,
      acepta_terminos, terminos_aceptados_en, version_terminos
    )
    values (
      new.id,
      trim(new.raw_user_meta_data ->> 'nombre'),
      lower(trim(new.email)),
      trim(new.raw_user_meta_data ->> 'telefono'),
      nullif(upper(trim(new.raw_user_meta_data ->> 'telefono_pais')), ''),
      trim(new.raw_user_meta_data ->> 'cuenta_dropi'),
      (new.raw_user_meta_data ->> 'autoriza_datos') = 'true',
      case when (new.raw_user_meta_data ->> 'autoriza_datos') = 'true' then now() end,
      nullif(trim(new.raw_user_meta_data ->> 'version_politica'), ''),
      (new.raw_user_meta_data ->> 'acepta_terminos') = 'true',
      case when (new.raw_user_meta_data ->> 'acepta_terminos') = 'true' then now() end,
      nullif(trim(new.raw_user_meta_data ->> 'version_terminos'), '')
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

-- Revisión previa del registro de referentes (la usa el servidor para
-- dar un mensaje claro; el disparador referentes_identidad lo vuelve a
-- revisar al crear la fila):
--   'mismo_correo' = ya es referente con ESE correo (se le manda el link para entrar)
--   'ocupada'      = otro referente ya tiene alguno de estos identificadores
--   'libre'        = puede registrarse
create or replace function public.estado_identidad_referente(p_correo text, p_telefono text, p_dropi text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.referentes f where f.correo = lower(trim(p_correo))) then 'mismo_correo'
    when exists (select 1 from public.referentes f
                  where f.identificadores && public.identificadores_persona(p_correo, p_telefono, p_dropi)) then 'ocupada'
    else 'libre'
  end;
$$;

-- Historial de suspensiones y reactivaciones
create table if not exists public.referentes_historial (
  id             uuid primary key default gen_random_uuid(),
  referente_id   uuid not null references public.referentes (id) on delete cascade,
  usuario_id     uuid references auth.users (id) on delete set null,
  usuario_correo text,
  accion         text not null,
  motivo         text,
  created_at     timestamptz not null default now()
);

create index if not exists referentes_historial_idx on public.referentes_historial (referente_id, created_at desc);

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
  afiliado_atom       boolean,              -- ESTADO MANUAL = ACTIVE; null = todavía no se ha cruzado
  cruce_por           public.metodo_cruce,  -- cómo se encontró (correo o teléfono)
  plan_hoja           text,                 -- el plan tal como aparece en la hoja
  plan_afiliado_id    text references public.planes (id) on update cascade,
  cruce_actualizado_en timestamptz,

  -- Bono (pago único por referido)
  bono                numeric(14, 2) check (bono is null or bono >= 0),
  estado_bono         text not null default 'estimado',
  editado_manual      boolean not null default false, -- true = las reglas y el cruce ya no lo cambian
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
  add column if not exists estado_bono text not null default 'estimado',
  add column if not exists editado_manual boolean not null default false,
  add column if not exists pago_id uuid references public.pagos (id) on delete restrict;

-- El estado del bono antes era un "enum" de Postgres; ahora es texto con
-- una lista fija (así se pueden agregar estados sin pasos extra).
do $$ begin
  if to_regtype('public.estado_bono') is not null then
    drop function if exists public.editar_referido(uuid, text, boolean, numeric, public.estado_bono);
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'referidos'
                 and column_name = 'estado_bono' and udt_name = 'estado_bono') then
      alter table public.referidos drop constraint if exists referidos_pagado_con_pago;
      alter table public.referidos alter column estado_bono drop default;
      alter table public.referidos alter column estado_bono type text using estado_bono::text;
      alter table public.referidos alter column estado_bono set default 'estimado';
    end if;
    drop type public.estado_bono;
  end if;
end $$;

alter table public.referidos
  -- Identidad comparable (ver funciones de arriba)
  add column if not exists correo_identidad  text generated always as (public.normalizar_correo_identidad(correo)) stored,
  add column if not exists dropi_normalizada text generated always as (public.normalizar_dropi(cuenta_dropi)) stored,
  -- Confirmación por correo (si la regla está activa)
  add column if not exists requiere_confirmacion   boolean not null default false,
  add column if not exists token_confirmacion_hash text,          -- sha256 del token del correo
  add column if not exists confirmado_en           timestamptz,   -- null = pendiente de confirmar
  -- Vigencia del registro
  add column if not exists vence_en    timestamptz,               -- fin del plazo para activarse
  add column if not exists vencido_en  timestamptz,               -- cuándo venció (la persona quedó libre)
  -- Datos de la hoja para las reglas
  add column if not exists en_hoja                    boolean,    -- aparece en la hoja con cualquier estado
  add column if not exists cliente_previo             boolean,    -- ya estaba en la hoja al registrarse (null = sin revisar)
  add column if not exists fecha_activacion_hoja      date,       -- columna SHEET_COL_FECHA_ACTIVACION (opcional)
  add column if not exists fecha_activacion_detectada timestamptz, -- primera vez que el cruce vio ESTADO MANUAL = ACTIVE
  add column if not exists fecha_activacion           timestamptz, -- la que usan las reglas (hoja o detectada)
  add column if not exists fecha_activacion_origen    text check (fecha_activacion_origen is null or fecha_activacion_origen in ('hoja', 'cruce')),
  add column if not exists activo_desde               timestamptz, -- inicio de la racha ACTIVE actual (permanencia)
  -- Bono único y fijo
  add column if not exists bono_fijado_en       timestamptz,       -- cuándo se fijó el bono (activación válida)
  add column if not exists plan_hoja_activacion text,              -- plan de la hoja en el momento de activarse
  add column if not exists fecha_por_pagar      timestamptz,       -- cuándo pasa (o pasó) a por_pagar
  add column if not exists por_pagar_desde      timestamptz,       -- cuándo cumplió la permanencia
  -- Identidad cruzada (ver identificadores_persona)
  add column if not exists identificadores text[]
    generated always as (public.identificadores_persona(correo, telefono, cuenta_dropi)) stored,
  add column if not exists hoja_identificadores text[],            -- buyer_email y TELEFONO de su fila en la hoja
  add column if not exists es_referente boolean not null default false, -- al registrarse coincidía con OTRO referente
  -- Revisión del super_admin (no genera bono mientras tanto). Una vez
  -- puesta no se quita sola; se resuelve con una "Excepción manual".
  --   posible_auto_referido = su fila de la hoja coincide con el referente
  --   afiliado_duplicado    = esa fila de la hoja ya generó bono con otro referido
  add column if not exists revision text
    check (revision is null or revision in ('posible_auto_referido', 'afiliado_duplicado')),
  -- País del celular (CO, MX, AR…). El teléfono va en el formato estándar.
  add column if not exists telefono_pais text check (telefono_pais is null or telefono_pais ~ '^[A-Z]{2}$');

alter table public.referidos drop constraint if exists referidos_estado_valido;
alter table public.referidos add constraint referidos_estado_valido check (estado_bono in (
  'pendiente_confirmacion', 'estimado', 'en_verificacion', 'por_pagar', 'pagado', 'vencido', 'ya_cliente', 'no_aplica',
  'posible_auto_referido', 'afiliado_duplicado'
));

do $$ begin
  alter table public.referidos
    add constraint referidos_pagado_con_pago
    check ((estado_bono = 'pagado') = (pago_id is not null));
exception when duplicate_object then null; end $$;

-- Antes un correo solo podía estar una vez. Ahora una persona puede
-- registrarse de nuevo cuando su registro anterior vence; la regla de
-- "un solo registro vigente" la valida validar_nuevo_referido().
drop index if exists public.referidos_correo_unico;
create index if not exists referidos_correo_idx     on public.referidos (correo_identidad);
create index if not exists referidos_telefono_idx   on public.referidos (telefono_normalizado);
create index if not exists referidos_dropi_idx      on public.referidos (dropi_normalizada);
create index if not exists referidos_identificadores_idx      on public.referidos using gin (identificadores);
create index if not exists referidos_hoja_identificadores_idx on public.referidos using gin (hoja_identificadores);
create index if not exists referidos_revision_idx   on public.referidos (revision) where revision is not null;
create index if not exists referidos_referente_idx  on public.referidos (referente_id, created_at);
create index if not exists referidos_ip_idx         on public.referidos (ip_origen, created_at);
create index if not exists referidos_afiliado_idx   on public.referidos (afiliado_atom);
create index if not exists referidos_estado_idx     on public.referidos (estado_bono);
create index if not exists referidos_pago_idx       on public.referidos (pago_id);
create unique index if not exists referidos_token_idx on public.referidos (token_confirmacion_hash);

drop trigger if exists referidos_updated_at on public.referidos;
create trigger referidos_updated_at
  before update on public.referidos
  for each row execute function public.actualizar_updated_at();

-- Celular válido (ver validar_telefono). "referidos_a_telefono" corre
-- antes que "referidos_alta_validar" (orden alfabético).
drop trigger if exists referidos_a_telefono on public.referidos;
create trigger referidos_a_telefono
  before insert or update of telefono, telefono_pais on public.referidos
  for each row execute function public.validar_telefono();

-- ---------------------------------------------------------------------
-- Celulares SOSPECHOSOS: el mismo celular en 3 o más registros
-- (referentes y referidos, vigentes o vencidos). No se bloquean: se
-- muestran en /admin para revisión. Solo el super_admin o el servidor.
-- ---------------------------------------------------------------------
create or replace function public.telefonos_sospechosos()
returns table (telefono text, registros int, referentes uuid[], referidos uuid[])
language sql
stable
security definer
set search_path = public
as $$
  select t.telefono,
         count(*)::int,
         coalesce(array_agg(t.id) filter (where t.tabla = 'referente'), '{}'::uuid[]),
         coalesce(array_agg(t.id) filter (where t.tabla = 'referido'), '{}'::uuid[])
  from (
    select f.telefono_normalizado as telefono, f.id, 'referente' as tabla from public.referentes f
    union all
    select x.telefono_normalizado, x.id, 'referido' from public.referidos x
  ) t
  where t.telefono is not null
    and (public.es_super_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role')
  group by t.telefono
  having count(*) >= 3
  order by count(*) desc, t.telefono;
$$;

-- ---------------------------------------------------------------------
-- Intentos del formulario público (para el límite por IP). Se borran
-- solos a los 2 días (en el cruce diario).
-- ---------------------------------------------------------------------
create table if not exists public.registros_intentos (
  id         bigint generated always as identity primary key,
  codigo     text,
  ip         inet,
  created_at timestamptz not null default now()
);

create index if not exists registros_intentos_ip_idx on public.registros_intentos (ip, created_at);

-- ---------------------------------------------------------------------
-- ¿Esta persona ya está "ocupada" en el programa?
--   Un registro ocupa a la persona si está VIGENTE: confirmado, sin
--   vencer y que no sea "no aplica". Con p_historico = true también la
--   ocupa cualquier registro que alguna vez generó bono (el bono es
--   único en la vida del programa), también si su fila de la hoja
--   coincide con esta persona.
--   La comparación es cruzada: cualquier identificador contra cualquiera.
-- ---------------------------------------------------------------------
drop function if exists public.identidad_ocupada(text, text, text, uuid, boolean);
create or replace function public.identidad_ocupada(p_ids text[], p_excluir uuid, p_historico boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.referidos x
    where x.id is distinct from p_excluir
      and x.identificadores && p_ids
      and (
        (x.vencido_en is null and x.confirmado_en is not null and x.estado_bono <> 'no_aplica')
        or (p_historico and x.bono_fijado_en is not null)
      )
  ) or (p_historico and exists (
    select 1 from public.referidos x
    where x.id is distinct from p_excluir
      and x.hoja_identificadores && p_ids
      and x.bono_fijado_en is not null
  ));
$$;

-- ---------------------------------------------------------------------
-- Reglas al CREAR un referido (se ejecuta antes de guardar)
--   • El link debe estar activo y el referente no suspendido.
--   • No auto-referirse: ningún identificador (correo, teléfono o cuenta
--     Dropi, en cualquier campo) puede coincidir con los del referente.
--   • Sin duplicados: un solo registro vigente por persona (misma
--     comparación cruzada).
--   • Si coincide con OTRO referente, queda marcado (es_referente).
--   • Límite de registros por link y por IP en la última hora.
--   • Fija la vigencia o deja el registro pendiente de confirmación.
-- Los errores llevan una clave que la app traduce a un mensaje amable.
-- ---------------------------------------------------------------------
create or replace function public.validar_nuevo_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reglas_programa := public.reglas();
  f public.referentes;
  -- (la columna "identificadores" todavía no está calculada aquí)
  v_ids text[] := public.identificadores_persona(new.correo, new.telefono, new.cuenta_dropi);
begin
  select * into f from public.referentes where id = new.referente_id;
  if not found or not f.activo or f.suspendido then
    raise exception 'LINK_NO_DISPONIBLE' using errcode = 'P0001';
  end if;

  -- Cruzado: el correo del referente escrito como cuenta Dropi (o al revés) también cuenta
  if v_ids && f.identificadores then
    raise exception 'AUTO_REFERIDO' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('referente:' || new.referente_id::text, 0));
  perform public.bloquear_identidad(v_ids);

  if public.identidad_ocupada(v_ids, null, true) then
    raise exception 'DUPLICADO' using errcode = 'P0001';
  end if;

  -- ¿Es otro referente del programa? No se bloquea: queda marcado para el super_admin
  new.es_referente := exists (
    select 1 from public.referentes g where g.id <> f.id and g.identificadores && v_ids);

  if (select count(*) from public.referidos x
       where x.referente_id = new.referente_id and x.created_at > now() - interval '1 hour')
     >= r.max_registros_por_link_por_hora then
    raise exception 'LIMITE' using errcode = 'P0001';
  end if;
  if new.ip_origen is not null
     and (select count(*) from public.referidos x
           where x.ip_origen = new.ip_origen and x.created_at > now() - interval '1 hour')
         >= r.max_registros_por_link_por_hora then
    raise exception 'LIMITE' using errcode = 'P0001';
  end if;

  -- Campos que solo calcula el sistema (nadie los puede enviar al crear)
  new.estado_bono := 'estimado';
  new.editado_manual := false;
  new.pago_id := null;
  new.afiliado_atom := null;
  new.en_hoja := null;
  new.cliente_previo := null;
  new.plan_afiliado_id := null;
  new.vencido_en := null;
  new.fecha_activacion_hoja := null;
  new.fecha_activacion_detectada := null;
  new.fecha_activacion := null;
  new.fecha_activacion_origen := null;
  new.activo_desde := null;
  new.bono_fijado_en := null;
  new.plan_hoja_activacion := null;
  new.fecha_por_pagar := null;
  new.por_pagar_desde := null;
  new.hoja_identificadores := null;
  new.revision := null;
  new.created_at := now();

  new.requiere_confirmacion := r.confirmacion_referido_por_correo;
  if new.requiere_confirmacion then
    if new.token_confirmacion_hash is null then
      raise exception 'Falta el token de confirmación' using errcode = '22023';
    end if;
    new.confirmado_en := null;
    new.vence_en := null;  -- el plazo empieza al confirmar
  else
    new.token_confirmacion_hash := null;
    new.confirmado_en := now();
    new.vence_en := now() + make_interval(days => r.dias_vigencia_registro);
  end if;
  return new;
end;
$$;

-- El nombre empieza por "alta" para que corra ANTES que el cálculo del
-- bono (Postgres ejecuta los disparadores en orden alfabético).
drop trigger if exists referidos_alta_validar on public.referidos;
create trigger referidos_alta_validar
  before insert on public.referidos
  for each row execute function public.validar_nuevo_referido();

-- ---------------------------------------------------------------------
-- Cálculo automático del estado y el bono (antes de cada guardado)
--   Si el super_admin lo editó a mano o ya está pagado: no se toca.
--   En orden:
--    0. En revisión (posible auto-referido o fila de la hoja que ya generó
--       bono con otro referido) → ese estado, bono 0, hasta que el
--       super_admin lo resuelva con una excepción manual.
--    1. Vencido           → se queda vencido (bono 0).
--    2. Ya era cliente    → ya_cliente (bono 0).
--    3. Referente suspendido → no_aplica.
--    4. Sin confirmar     → pendiente_confirmacion (vence si pasa el plazo).
--    5. Activación válida (después del registro y dentro de la vigencia)
--       → se FIJA el bono con el plan del momento. Nunca se recalcula.
--    6. Con bono fijado   → en_verificacion mientras cumple la permanencia,
--       luego por_pagar (definitivo). Si deja de estar ACTIVE antes, estimado.
--    7. Sin activarse y con el plazo vencido (y un cruce posterior al
--       plazo que lo confirma) → vencido.
--    8. Si no             → estimado, bono del plan solicitado.
-- ---------------------------------------------------------------------
create or replace function public.calcular_bono_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reglas_programa;
  v_bogota constant text := 'America/Bogota';
  v_valida boolean;
  v_cruce_anterior timestamptz;  -- fecha del cruce anterior a este cambio
begin
  if new.editado_manual or new.estado_bono = 'pagado' then
    return new;
  end if;
  r := public.reglas();
  if tg_op = 'UPDATE' then
    v_cruce_anterior := old.cruce_actualizado_en;
  end if;

  -- 0. En revisión del super_admin: nunca pasa a por_pagar
  if new.revision is not null then
    new.estado_bono := new.revision;
    new.bono := 0;
    new.fecha_por_pagar := null;
    return new;
  end if;

  -- 1. Vencido (definitivo)
  if new.vencido_en is not null then
    new.estado_bono := 'vencido';
    new.bono := 0;
    return new;
  end if;

  -- 2. Ya era cliente al registrarse
  if new.cliente_previo then
    new.estado_bono := 'ya_cliente';
    new.bono := 0;
    return new;
  end if;

  -- 3. Referente suspendido
  if exists (select 1 from public.referentes f where f.id = new.referente_id and f.suspendido) then
    new.estado_bono := 'no_aplica';
    return new;
  end if;

  -- 4. Pendiente de confirmación (no cuenta para la vigencia)
  if new.confirmado_en is null then
    if now() > new.created_at + make_interval(days => r.dias_vigencia_registro) then
      new.vencido_en := now();
      new.estado_bono := 'vencido';
      new.bono := 0;
    else
      new.estado_bono := 'pendiente_confirmacion';
      new.bono := (select p.bono from public.planes p where p.id = new.plan_solicitado);
    end if;
    return new;
  end if;

  -- 5. ¿Activación válida? (se revisa una sola vez)
  if new.bono_fijado_en is null and new.afiliado_atom and new.fecha_activacion is not null then
    if (new.fecha_activacion at time zone v_bogota)::date < (new.created_at at time zone v_bogota)::date then
      -- Se activó ANTES de registrarse: ya era cliente
      new.cliente_previo := true;
      new.estado_bono := 'ya_cliente';
      new.bono := 0;
      return new;
    end if;
    v_valida :=
      (new.fecha_activacion at time zone v_bogota)::date <= (new.vence_en at time zone v_bogota)::date
      -- Detectada por el cruce: pudo activarse en cualquier momento desde
      -- el cruce anterior. Si ese cruce fue dentro del plazo, se acepta.
      or (new.fecha_activacion_origen = 'cruce'
          and v_cruce_anterior is not null
          and v_cruce_anterior <= new.vence_en);
    -- Sin bono doble: si esa misma fila de la hoja (buyer_email o
    -- TELEFONO) ya generó bono con otro referido, este no genera otro.
    if v_valida and exists (
      select 1 from public.referidos x
       where x.id <> new.id
         and x.bono_fijado_en is not null
         and x.estado_bono not in ('no_aplica', 'vencido', 'posible_auto_referido', 'afiliado_duplicado')
         and x.hoja_identificadores && new.hoja_identificadores
    ) then
      new.revision := 'afiliado_duplicado';
      new.estado_bono := 'afiliado_duplicado';
      new.bono := 0;
      return new;
    end if;
    if v_valida then
      new.bono_fijado_en := now();
      new.plan_hoja_activacion := new.plan_hoja;
      new.plan_afiliado_id := null;  -- se resuelve abajo con el plan de este momento
    end if;
  end if;

  -- 6. Bono fijado: único y fijo
  if new.bono_fijado_en is not null then
    if new.plan_afiliado_id is null then
      new.plan_afiliado_id := public.buscar_plan_id(new.plan_hoja_activacion);
      new.bono := (select p.bono from public.planes p where p.id = new.plan_afiliado_id);
    end if;

    if new.por_pagar_desde is not null then
      new.estado_bono := 'por_pagar';
    elsif new.afiliado_atom and new.activo_desde is not null then
      new.fecha_por_pagar := new.activo_desde + make_interval(days => r.dias_permanencia_para_pagar);
      if now() >= new.fecha_por_pagar then
        new.por_pagar_desde := now();
        new.estado_bono := 'por_pagar';
      else
        new.estado_bono := 'en_verificacion';
      end if;
    else
      -- Dejó de estar ACTIVE antes de cumplir la permanencia
      new.fecha_por_pagar := null;
      new.estado_bono := 'estimado';
    end if;
    return new;
  end if;

  -- 7. Venció sin activarse (solo si hubo un cruce después del plazo)
  if new.vence_en is not null and now() > new.vence_en
     and new.cruce_actualizado_en is not null and new.cruce_actualizado_en > new.vence_en then
    new.vencido_en := now();
    new.estado_bono := 'vencido';
    new.bono := 0;
    return new;
  end if;

  -- 8. Vigente, aún sin activarse
  new.plan_afiliado_id := null;
  new.fecha_por_pagar := null;
  new.estado_bono := 'estimado';
  new.bono := (select p.bono from public.planes p where p.id = new.plan_solicitado);
  return new;
end;
$$;

drop trigger if exists referidos_calcular_bono on public.referidos;
create trigger referidos_calcular_bono
  before insert or update on public.referidos
  for each row execute function public.calcular_bono_referido();

-- Si cambias el bono, el nombre o los alias de un plan, se recalculan
-- los referidos que siguen las reglas. Los bonos ya FIJADOS no cambian.
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
   where not editado_manual and estado_bono not in ('pagado', 'vencido', 'ya_cliente');
  return null;
end;
$$;

drop trigger if exists planes_recalcular on public.planes;
create trigger planes_recalcular
  after insert or update on public.planes
  for each statement execute function public.recalcular_por_planes();

-- Igual cuando cambian las reglas (por ejemplo, los días de permanencia)
create or replace function public.recalcular_por_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.accion', 'Cambio en las reglas del programa', true);
  update public.referidos
     set plan_hoja = plan_hoja
   where not editado_manual and estado_bono not in ('pagado', 'vencido', 'ya_cliente');
  return null;
end;
$$;

drop trigger if exists reglas_recalcular on public.reglas_programa;
create trigger reglas_recalcular
  after update on public.reglas_programa
  for each statement execute function public.recalcular_por_reglas();

-- ---------------------------------------------------------------------
-- Historial: quién cambió qué, cuándo y por qué
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

alter table public.referidos_historial add column if not exists motivo text;

create index if not exists historial_referido_idx on public.referidos_historial (referido_id, created_at desc);

create or replace function public.registrar_historial_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campos constant text[] := array[
    'afiliado_atom', 'en_hoja', 'plan_hoja', 'plan_afiliado_id', 'bono', 'estado_bono', 'editado_manual',
    'pago_id', 'confirmado_en', 'vence_en', 'vencido_en', 'cliente_previo', 'fecha_activacion', 'bono_fijado_en',
    'revision'
  ];
  campo text;
  antes jsonb := to_jsonb(old);
  despues jsonb := to_jsonb(new);
  cambios jsonb := '{}'::jsonb;
  v_motivo text := nullif(current_setting('app.motivo', true), '');
begin
  foreach campo in array campos loop
    if (antes -> campo) is distinct from (despues -> campo) then
      cambios := cambios || jsonb_build_object(
        campo, jsonb_build_object('antes', antes -> campo, 'despues', despues -> campo));
    end if;
  end loop;

  if cambios <> '{}'::jsonb or v_motivo is not null then
    insert into public.referidos_historial (referido_id, usuario_id, usuario_correo, accion, motivo, cambios)
    values (
      new.id,
      auth.uid(),
      auth.jwt() ->> 'email',
      coalesce(nullif(current_setting('app.accion', true), ''),
               case when auth.uid() is null then 'Sistema' else 'Cambio' end),
      v_motivo,
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
-- Recibe una lista JSON:
--   [{id, en_hoja, activo, cruce_por, plan_hoja, fecha_hoja, correo_hoja, telefono_hoja}, ...]
--   activo     = ESTADO MANUAL es ACTIVE
--   fecha_hoja = fecha de activación de la hoja ("AAAA-MM-DD") o null
--   correo_hoja, telefono_hoja = buyer_email y TELEFONO de esa fila (la base los normaliza)
-- Si la fila de la hoja coincide con CUALQUIER identificador del
-- referente (también los que tuvo antes), el referido queda como
-- "posible_auto_referido": bono 0 y en revisión del super_admin.
-- No toca referidos editados a mano, pagados, vencidos ni ya clientes.
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
  -- Un cruce a la vez (el diario y el botón podrían coincidir)
  perform pg_advisory_xact_lock(hashtextextended('aplicar_cruce', 0));
  update public.referidos r
     set -- Fila de la hoja asociada (queda fija una vez se fija el bono)
         hoja_identificadores = case
           when r.bono_fijado_en is not null and r.hoja_identificadores is not null then r.hoja_identificadores
           when d.en_hoja and cardinality(h.ids) > 0 then h.ids
           else r.hoja_identificadores end,
         revision = coalesce(r.revision,
           case when d.en_hoja and h.ids && f.identificadores then 'posible_auto_referido' end),
         en_hoja       = d.en_hoja,
         afiliado_atom = d.activo,
         cruce_por     = d.cruce_por,
         plan_hoja     = d.plan_hoja,
         fecha_activacion_hoja = d.fecha_hoja,
         -- ¿Ya era cliente? Se decide en la PRIMERA revisión: si aparece en
         -- la hoja (con cualquier estado) justo al registrarse, o con una
         -- fecha de activación anterior al registro.
         cliente_previo = coalesce(r.cliente_previo,
           d.en_hoja and (
             now() - r.created_at < interval '15 minutes'
             or d.fecha_hoja is null
             or d.fecha_hoja < (r.created_at at time zone 'America/Bogota')::date)),
         fecha_activacion_detectada = coalesce(r.fecha_activacion_detectada, case when d.activo then now() end),
         fecha_activacion = coalesce(r.fecha_activacion, case when d.activo then
           coalesce(d.fecha_hoja::timestamp at time zone 'America/Bogota', now()) end),
         fecha_activacion_origen = coalesce(r.fecha_activacion_origen, case when d.activo then
           case when d.fecha_hoja is not null then 'hoja' else 'cruce' end end),
         -- Racha ACTIVE actual (para la permanencia). La primera empieza en
         -- la fecha de activación; si se cae y vuelve, empieza de nuevo.
         activo_desde = case when d.activo then coalesce(r.activo_desde,
           case when r.fecha_activacion_detectada is null
                then coalesce(d.fecha_hoja::timestamp at time zone 'America/Bogota', now())
                else now() end) end,
         cruce_actualizado_en = now()
    from jsonb_to_recordset(datos) as d(
      id uuid, en_hoja boolean, activo boolean, cruce_por public.metodo_cruce, plan_hoja text, fecha_hoja date,
      correo_hoja text, telefono_hoja text)
    cross join lateral (select public.identificadores_persona(d.correo_hoja, d.telefono_hoja, null) as ids) h
    cross join public.referentes f
   where r.id = d.id
     and f.id = r.referente_id
     and not r.editado_manual
     and r.estado_bono not in ('pagado', 'vencido', 'ya_cliente');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Revisión por tiempo (después del cruce diario y del botón "Actualizar
-- cruce"): vencimientos, pendientes sin confirmar y permanencias cumplidas.
-- También borra los intentos del formulario de hace más de 2 días.
create or replace function public.revisar_vencimientos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform set_config('app.accion', 'Revisión de vencimientos', true);
  update public.referidos
     set plan_hoja = plan_hoja
   where not editado_manual
     and estado_bono in ('pendiente_confirmacion', 'estimado', 'en_verificacion')
     and (
       confirmado_en is null
       or (bono_fijado_en is null and vence_en < now())
       or (estado_bono = 'en_verificacion' and fecha_por_pagar <= now())
     );
  get diagnostics n = row_count;

  delete from public.registros_intentos where created_at < now() - interval '2 days';
  return n;
end;
$$;

-- Límite de intentos del formulario público por IP (última hora).
-- Devuelve false si ya llegó al límite; si no, anota el intento.
create or replace function public.registrar_intento_referido(p_codigo text, p_ip inet)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reglas_programa := public.reglas();
begin
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('intento:' || p_ip::text, 0));
    if (select count(*) from public.registros_intentos i
         where i.ip = p_ip and i.created_at > now() - interval '1 hour')
       >= r.max_registros_por_link_por_hora then
      return false;
    end if;
  end if;
  insert into public.registros_intentos (codigo, ip) values (left(upper(p_codigo), 16), p_ip);
  return true;
end;
$$;

-- Confirmación del referido desde el link del correo.
-- Recibe el sha256 del token. Devuelve {resultado, referido_id, referente_id}:
--   ok · ya_confirmado · no_valido · vencido · duplicado · no_disponible
create or replace function public.confirmar_referido(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reglas_programa := public.reglas();
  v public.referidos;
  f public.referentes;
begin
  select * into v from public.referidos where token_confirmacion_hash = p_token_hash for update;
  if not found then
    return jsonb_build_object('resultado', 'no_valido');
  end if;
  if v.confirmado_en is not null then
    return jsonb_build_object('resultado', 'ya_confirmado', 'referido_id', v.id);
  end if;
  if v.vencido_en is not null or v.estado_bono = 'vencido'
     or now() > v.created_at + make_interval(days => r.dias_vigencia_registro) then
    update public.referidos set plan_hoja = plan_hoja where id = v.id;  -- queda vencido
    return jsonb_build_object('resultado', 'vencido');
  end if;

  select * into f from public.referentes where id = v.referente_id;
  if not found or not f.activo or f.suspendido then
    return jsonb_build_object('resultado', 'no_disponible');
  end if;

  perform public.bloquear_identidad(v.identificadores);
  if public.identidad_ocupada(v.identificadores, v.id, true) then
    perform set_config('app.accion', 'Confirmación rechazada: ya tiene otro registro vigente', true);
    update public.referidos set vencido_en = now() where id = v.id;
    return jsonb_build_object('resultado', 'duplicado');
  end if;

  perform set_config('app.accion', 'Confirmación del referido por correo', true);
  update public.referidos
     set confirmado_en = now(),
         vence_en = now() + make_interval(days => r.dias_vigencia_registro)
   where id = v.id;
  return jsonb_build_object('resultado', 'ok', 'referido_id', v.id, 'referente_id', v.referente_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Acciones del super_admin (cada una verifica el rol antes de actuar)
-- ---------------------------------------------------------------------

-- Excepción manual a las reglas. Queda marcado "editado_manual", con
-- motivo obligatorio en el historial, y las reglas y el cruce dejan de
-- cambiarlo.
drop function if exists public.editar_referido(uuid, text, boolean, numeric, text);
create or replace function public.editar_referido(
  p_id uuid,
  p_plan_afiliado_id text,
  p_afiliado_atom boolean,
  p_bono numeric,
  p_estado text,
  p_vence_en timestamptz,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reglas_programa := public.reglas();
  v public.referidos;
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede editar referidos' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la excepción (mínimo 5 caracteres)' using errcode = '22023';
  end if;
  if p_estado = 'pagado' then
    raise exception 'Para marcar como pagado usa "Registrar pago"' using errcode = '22023';
  end if;
  if p_estado not in ('estimado', 'en_verificacion', 'por_pagar', 'vencido', 'ya_cliente', 'no_aplica') then
    raise exception 'Estado no válido' using errcode = '22023';
  end if;
  if p_bono is not null and p_bono < 0 then
    raise exception 'El bono no puede ser negativo' using errcode = '22023';
  end if;
  if p_plan_afiliado_id is not null and not exists (select 1 from public.planes where id = p_plan_afiliado_id) then
    raise exception 'El plan no existe' using errcode = '22023';
  end if;

  select * into v from public.referidos where id = p_id for update;
  if not found or v.estado_bono = 'pagado' then
    raise exception 'El referido no existe o ya está pagado' using errcode = 'P0002';
  end if;

  -- Aun con excepción, una persona no puede quedar con dos registros vigentes
  if p_estado in ('estimado', 'en_verificacion', 'por_pagar', 'ya_cliente') then
    perform public.bloquear_identidad(v.identificadores);
    if public.identidad_ocupada(v.identificadores, v.id, false) then
      raise exception 'Esta persona tiene otro registro vigente. Márcalo primero como vencido o no aplica.' using errcode = '22023';
    end if;
  end if;

  perform set_config('app.accion', 'Excepción manual', true);
  perform set_config('app.motivo', trim(p_motivo), true);
  update public.referidos
     set plan_afiliado_id = p_plan_afiliado_id,
         afiliado_atom    = p_afiliado_atom,
         bono             = p_bono,
         estado_bono      = p_estado,
         confirmado_en    = coalesce(confirmado_en, now()),
         vence_en         = coalesce(p_vence_en, vence_en, now() + make_interval(days => r.dias_vigencia_registro)),
         vencido_en       = case when p_estado = 'vencido' then coalesce(vencido_en, now()) end,
         cliente_previo   = (p_estado = 'ya_cliente'),
         bono_fijado_en   = case when p_estado in ('en_verificacion', 'por_pagar')
                                 then coalesce(bono_fijado_en, now()) else bono_fijado_en end,
         editado_manual   = true
   where id = p_id;
end;
$$;

-- Quitar la marca de edición manual: el referido vuelve a seguir las reglas.
drop function if exists public.volver_a_usar_hoja(uuid);
create or replace function public.volver_a_usar_hoja(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede hacer esto' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres)' using errcode = '22023';
  end if;

  perform set_config('app.accion', 'Volver a seguir las reglas', true);
  perform set_config('app.motivo', trim(p_motivo), true);
  update public.referidos
     set editado_manual = false
   where id = p_id and estado_bono <> 'pagado';

  if not found then
    raise exception 'El referido no existe o ya está pagado' using errcode = 'P0002';
  end if;
end;
$$;

-- Suspender a un referente: no entra al panel, su link deja de recibir
-- referidos y sus bonos no pagados pasan a "no aplica".
create or replace function public.suspender_referente(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede suspender referentes' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la suspensión (mínimo 5 caracteres)' using errcode = '22023';
  end if;

  update public.referentes
     set suspendido = true, suspendido_en = now(), motivo_suspension = trim(p_motivo)
   where id = p_id and not suspendido;
  if not found then
    raise exception 'El referente no existe o ya está suspendido' using errcode = 'P0002';
  end if;

  insert into public.referentes_historial (referente_id, usuario_id, usuario_correo, accion, motivo)
  values (p_id, auth.uid(), auth.jwt() ->> 'email', 'Suspensión', trim(p_motivo));

  perform set_config('app.accion', 'Suspensión del referente', true);
  perform set_config('app.motivo', trim(p_motivo), true);
  -- Los editados a mano también pasan a "no aplica" (y siguen siendo manuales)
  update public.referidos set estado_bono = 'no_aplica'
   where referente_id = p_id and estado_bono <> 'pagado' and editado_manual;
  update public.referidos set plan_hoja = plan_hoja
   where referente_id = p_id and estado_bono <> 'pagado' and not editado_manual;
end;
$$;

create or replace function public.reactivar_referente(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede reactivar referentes' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la reactivación (mínimo 5 caracteres)' using errcode = '22023';
  end if;

  update public.referentes
     set suspendido = false, suspendido_en = null, motivo_suspension = null
   where id = p_id and suspendido;
  if not found then
    raise exception 'El referente no existe o no está suspendido' using errcode = 'P0002';
  end if;

  insert into public.referentes_historial (referente_id, usuario_id, usuario_correo, accion, motivo)
  values (p_id, auth.uid(), auth.jwt() ->> 'email', 'Reactivación', trim(p_motivo));

  perform set_config('app.accion', 'Reactivación del referente', true);
  perform set_config('app.motivo', trim(p_motivo), true);
  -- Personas que durante la suspensión registró otro referente: su
  -- registro con este referente vence (no puede haber dos vigentes).
  update public.referidos x
     set vencido_en = now()
   where x.referente_id = p_id
     and x.estado_bono <> 'pagado' and not x.editado_manual
     and x.vencido_en is null and x.bono_fijado_en is null
     and public.identidad_ocupada(x.identificadores, x.id, true);
  -- El resto vuelve a seguir las reglas (los manuales quedan como están)
  update public.referidos set plan_hoja = plan_hoja
   where referente_id = p_id and estado_bono <> 'pagado' and not editado_manual;
end;
$$;

-- Cambiar las reglas del programa desde /admin/reglas
create or replace function public.actualizar_reglas(
  p_dias_vigencia int,
  p_dias_permanencia int,
  p_confirmacion boolean,
  p_dominios text,
  p_max_por_hora int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dominios text;
begin
  if not public.es_super_admin() then
    raise exception 'Solo un super_admin puede cambiar las reglas' using errcode = '42501';
  end if;

  -- "Atom.com, @atomapp.com.co ,," → "atom.com,atomapp.com.co"
  select coalesce(string_agg(distinct ltrim(d, '@'), ',' order by ltrim(d, '@')), '')
    into v_dominios
    from unnest(string_to_array(lower(regexp_replace(coalesce(p_dominios, ''), '\s', '', 'g')), ',')) as d
   where ltrim(d, '@') <> '';
  if v_dominios <> '' and v_dominios !~ '^([a-z0-9-]+\.)+[a-z]{2,}(,([a-z0-9-]+\.)+[a-z]{2,})*$' then
    raise exception 'Revisa los dominios: escríbelos separados por coma, ej. atomapp.com.co' using errcode = '22023';
  end if;

  update public.reglas_programa
     set dias_vigencia_registro           = p_dias_vigencia,
         dias_permanencia_para_pagar      = p_dias_permanencia,
         confirmacion_referido_por_correo = p_confirmacion,
         dominios_excluidos               = v_dominios,
         max_registros_por_link_por_hora  = p_max_por_hora
   where id;
exception
  when check_violation then
    raise exception 'Algún valor está fuera del rango permitido' using errcode = '22023';
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
-- referente (no suspendido) dueño del pago al que pertenece ese soporte.
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
      or (
        public.referente_habilitado()
        and exists (
          select 1 from public.pagos p
          where p.soporte_path = storage.objects.name
            and p.referente_id = auth.uid()
        )
      )
    )
  );

-- =====================================================================
--  ROW LEVEL SECURITY (reglas de quién ve qué)
-- =====================================================================
alter table public.super_admins         enable row level security;
alter table public.reglas_programa      enable row level security;
alter table public.reglas_historial     enable row level security;
alter table public.referentes           enable row level security;
alter table public.referentes_historial enable row level security;
alter table public.planes               enable row level security;
alter table public.referidos            enable row level security;
alter table public.pagos                enable row level security;
alter table public.referidos_historial  enable row level security;
alter table public.registros_intentos   enable row level security;
alter table public.telefonos_bloqueados enable row level security;

-- Limpieza de políticas previas (para poder re-ejecutar el archivo)
drop policy if exists "super_admin ve super_admins"       on public.super_admins;
drop policy if exists "super_admin ve las reglas"         on public.reglas_programa;
drop policy if exists "super_admin ve historial reglas"   on public.reglas_historial;
drop policy if exists "referente ve su perfil"            on public.referentes;
drop policy if exists "referente edita su perfil"         on public.referentes;
drop policy if exists "super_admin ve historial referentes" on public.referentes_historial;
drop policy if exists "usuarios ven los planes"           on public.planes;
drop policy if exists "referente ve sus referidos"        on public.referidos;
drop policy if exists "referente ve sus pagos"            on public.pagos;
drop policy if exists "super_admin ve el historial"       on public.referidos_historial;
drop policy if exists "super_admin ve bloqueados"         on public.telefonos_bloqueados;
drop policy if exists "super_admin agrega bloqueados"     on public.telefonos_bloqueados;
drop policy if exists "super_admin quita bloqueados"      on public.telefonos_bloqueados;

-- La función del rol anterior ya no se usa
drop function if exists public.es_admin();

-- super_admins: solo los super_admin pueden ver la lista
create policy "super_admin ve super_admins"
  on public.super_admins for select
  to authenticated
  using (public.es_super_admin());

-- reglas y su historial: solo el super_admin (los cambios, con actualizar_reglas)
create policy "super_admin ve las reglas"
  on public.reglas_programa for select
  to authenticated
  using (public.es_super_admin());

create policy "super_admin ve historial reglas"
  on public.reglas_historial for select
  to authenticated
  using (public.es_super_admin());

-- referentes: cada uno ve su propia fila; el super_admin ve todas
create policy "referente ve su perfil"
  on public.referentes for select
  to authenticated
  using (id = auth.uid() or public.es_super_admin());

-- referentes: cada uno (no suspendido) puede corregir sus datos de contacto
create policy "referente edita su perfil"
  on public.referentes for update
  to authenticated
  using (id = auth.uid() and not suspendido)
  with check (id = auth.uid() and not suspendido);

create policy "super_admin ve historial referentes"
  on public.referentes_historial for select
  to authenticated
  using (public.es_super_admin());

-- planes: cualquier usuario con sesión los puede ver (nombres y bonos).
-- Los visitantes sin sesión (los referidos) NO ven los bonos.
create policy "usuarios ven los planes"
  on public.planes for select
  to authenticated
  using (true);

-- referidos: cada referente (no suspendido) ve solo los suyos; el super_admin ve todos
create policy "referente ve sus referidos"
  on public.referidos for select
  to authenticated
  using ((referente_id = auth.uid() and public.referente_habilitado()) or public.es_super_admin());

-- pagos: cada referente (no suspendido) ve solo los suyos; el super_admin ve todos
create policy "referente ve sus pagos"
  on public.pagos for select
  to authenticated
  using ((referente_id = auth.uid() and public.referente_habilitado()) or public.es_super_admin());

-- historial: solo el super_admin
create policy "super_admin ve el historial"
  on public.referidos_historial for select
  to authenticated
  using (public.es_super_admin());

-- registros_intentos: sin políticas → nadie la lee desde el navegador.

-- telefonos_bloqueados: solo el super_admin la ve y la edita (/admin/reglas)
create policy "super_admin ve bloqueados"
  on public.telefonos_bloqueados for select
  to authenticated
  using (public.es_super_admin());

create policy "super_admin agrega bloqueados"
  on public.telefonos_bloqueados for insert
  to authenticated
  with check (public.es_super_admin() and creado_por = auth.uid());

create policy "super_admin quita bloqueados"
  on public.telefonos_bloqueados for delete
  to authenticated
  using (public.es_super_admin());

-- No hay políticas de INSERT / UPDATE / DELETE en referidos, pagos,
-- reglas ni historiales: nadie puede cambiarlos desde el navegador. Los
-- cambios se hacen con las funciones de arriba (que verifican el rol) o
-- desde el servidor con la clave secreta.

-- ---------------------------------------------------------------------
-- Permisos por tabla y columna
-- ---------------------------------------------------------------------
revoke all on public.super_admins, public.reglas_programa, public.reglas_historial, public.referentes,
              public.referentes_historial, public.planes, public.referidos, public.pagos,
              public.referidos_historial, public.registros_intentos, public.telefonos_bloqueados from anon;

revoke all on public.registros_intentos from authenticated;
revoke insert, update, delete on public.super_admins, public.reglas_programa, public.reglas_historial,
              public.referentes, public.referentes_historial, public.planes, public.referidos,
              public.pagos, public.referidos_historial from authenticated;

grant usage on schema public to authenticated, service_role;
grant select, insert, delete on public.telefonos_bloqueados to authenticated;
grant select on public.super_admins, public.reglas_programa, public.reglas_historial, public.referentes,
                public.referentes_historial, public.planes, public.pagos, public.referidos_historial
  to authenticated;

-- referidos: con sesión se pueden leer todas las columnas MENOS la IP,
-- el navegador y el token de confirmación (datos que el referente no
-- necesita ver).
revoke select on public.referidos from authenticated;
grant select (
  id, referente_id, nombre, correo, telefono, telefono_normalizado, cuenta_dropi, tipo, plan_solicitado,
  autoriza_datos, autorizado_en, version_politica,
  afiliado_atom, cruce_por, plan_hoja, plan_afiliado_id, cruce_actualizado_en,
  bono, estado_bono, editado_manual, pago_id, created_at, updated_at,
  correo_identidad, dropi_normalizada, requiere_confirmacion, confirmado_en, vence_en, vencido_en,
  en_hoja, cliente_previo, fecha_activacion_hoja, fecha_activacion_detectada, fecha_activacion,
  fecha_activacion_origen, activo_desde, bono_fijado_en, plan_hoja_activacion, fecha_por_pagar, por_pagar_desde,
  identificadores, es_referente, revision, telefono_pais
) on public.referidos to authenticated;

-- Un referente solo puede cambiar nombre, teléfono y cuenta Dropi
-- (nunca su código, correo, estado ni suspensión).
grant update (nombre, telefono, telefono_pais, cuenta_dropi) on public.referentes to authenticated;

-- El servidor (clave secreta = rol service_role) guarda el formulario
-- público y el cruce. Los proyectos nuevos de Supabase ya no dan estos
-- permisos automáticamente, por eso se dan aquí de forma explícita.
grant select, insert, update, delete
  on public.super_admins, public.reglas_programa, public.reglas_historial, public.referentes,
     public.referentes_historial, public.planes, public.referidos, public.pagos,
     public.referidos_historial, public.registros_intentos, public.telefonos_bloqueados
  to service_role;

-- Funciones: por defecto Postgres deja ejecutarlas a todos; se restringe.
revoke all on function public.es_super_admin()                                       from public, anon;
revoke all on function public.referente_habilitado()                                 from public, anon;
revoke all on function public.reglas()                                               from public, anon, authenticated;
revoke all on function public.dominio_excluido(text)                                 from public, anon, authenticated;
revoke all on function public.buscar_plan_id(text)                                   from public, anon, authenticated;
revoke all on function public.identidad_ocupada(text[], uuid, boolean)                from public, anon, authenticated;
revoke all on function public.bloquear_identidad(text[])                             from public, anon, authenticated;
revoke all on function public.aplicar_cruce(jsonb)                                   from public, anon, authenticated;
revoke all on function public.revisar_vencimientos()                                 from public, anon, authenticated;
revoke all on function public.registrar_intento_referido(text, inet)                 from public, anon, authenticated;
revoke all on function public.confirmar_referido(text)                               from public, anon, authenticated;
revoke all on function public.estado_identidad_referente(text, text, text)            from public, anon, authenticated;
revoke all on function public.editar_referido(uuid, text, boolean, numeric, text, timestamptz, text) from public, anon;
revoke all on function public.volver_a_usar_hoja(uuid, text)                         from public, anon;
revoke all on function public.suspender_referente(uuid, text)                        from public, anon;
revoke all on function public.reactivar_referente(uuid, text)                        from public, anon;
revoke all on function public.actualizar_reglas(int, int, boolean, text, int)        from public, anon;
revoke all on function public.registrar_pago(uuid, uuid[], date, numeric, text, text) from public, anon;
revoke all on function public.problema_telefono(text, text)                         from public, anon, authenticated;
revoke all on function public.telefonos_sospechosos()                               from public, anon;

grant execute on function public.es_super_admin()       to authenticated, service_role;
grant execute on function public.referente_habilitado() to authenticated, service_role;
grant execute on function public.reglas()               to service_role;
grant execute on function public.dominio_excluido(text) to service_role;
grant execute on function public.buscar_plan_id(text)   to service_role;
grant execute on function public.identidad_ocupada(text[], uuid, boolean) to service_role;
grant execute on function public.aplicar_cruce(jsonb)   to service_role;
grant execute on function public.revisar_vencimientos() to service_role;
grant execute on function public.registrar_intento_referido(text, inet) to service_role;
grant execute on function public.confirmar_referido(text) to service_role;
grant execute on function public.estado_identidad_referente(text, text, text) to service_role;
grant execute on function public.editar_referido(uuid, text, boolean, numeric, text, timestamptz, text) to authenticated;
grant execute on function public.volver_a_usar_hoja(uuid, text)  to authenticated;
grant execute on function public.suspender_referente(uuid, text) to authenticated;
grant execute on function public.reactivar_referente(uuid, text) to authenticated;
grant execute on function public.actualizar_reglas(int, int, boolean, text, int) to authenticated;
grant execute on function public.registrar_pago(uuid, uuid[], date, numeric, text, text) to authenticated;
grant execute on function public.problema_telefono(text, text) to service_role;
grant execute on function public.telefonos_sospechosos()      to authenticated, service_role;

-- =====================================================================
--  DIAGNÓSTICO (lo usan /admin/estado y "npm run verificar")
--  Revisa que existan tablas, columnas, RLS, funciones, disparadores, el
--  bucket privado, las reglas y al menos un super_admin. No devuelve
--  datos personales. Solo lo puede ejecutar el servidor (clave secreta).
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
      from unnest(array['super_admins','reglas_programa','reglas_historial','referentes','referentes_historial',
                        'planes','referidos','pagos','referidos_historial','registros_intentos',
                        'telefonos_bloqueados'])
           with ordinality as t(nombre, orden)
      left join pg_class c on c.relname = t.nombre and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    ),
    'columnas_faltantes', (
      select coalesce(jsonb_agg(x.col order by x.col), '[]'::jsonb)
      from unnest(array[
        'referentes.suspendido','referentes.correo_identidad','referentes.dropi_normalizada',
        'referentes.version_terminos','referentes.version_politica',
        'referidos.correo_identidad','referidos.dropi_normalizada','referidos.confirmado_en',
        'referidos.vence_en','referidos.vencido_en','referidos.cliente_previo','referidos.fecha_activacion',
        'referidos.activo_desde','referidos.bono_fijado_en','referidos.fecha_por_pagar',
        'referidos_historial.motivo','referentes.identificadores','referidos.identificadores',
        'referidos.hoja_identificadores','referidos.revision','referidos.es_referente',
        'referentes.telefono_pais','referidos.telefono_pais'
      ]) as x(col)
      where not exists (
        select 1 from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = split_part(x.col, '.', 1)
          and ic.column_name = split_part(x.col, '.', 2)
      )
    ),
    'funciones', (
      select jsonb_agg(jsonb_build_object(
        'nombre', f.nombre,
        'existe', exists (select 1 from pg_proc p where p.proname = f.nombre and p.pronamespace = 'public'::regnamespace)
      ) order by f.orden)
      from unnest(array[
        'es_super_admin','referente_habilitado','reglas','dominio_excluido','normalizar_telefono',
        'normalizar_correo_identidad','normalizar_dropi','normalizar_nombre_plan','buscar_plan_id',
        'generar_codigo_referente','crear_referente_desde_auth','identidad_ocupada','bloquear_identidad',
        'validar_nuevo_referido','calcular_bono_referido','recalcular_por_planes','recalcular_por_reglas',
        'registrar_historial_referido','registrar_historial_reglas','aplicar_cruce','revisar_vencimientos',
        'registrar_intento_referido','confirmar_referido','editar_referido','volver_a_usar_hoja',
        'suspender_referente','reactivar_referente','actualizar_reglas','registrar_pago',
        'normalizar_dropi_telefono','identificadores_persona','validar_identidad_referente','estado_identidad_referente',
        'celular_pais','telefono_es_falso','problema_telefono','validar_telefono','telefonos_sospechosos'
      ]) with ordinality as f(nombre, orden)
    ),
    'disparadores', (
      select jsonb_agg(jsonb_build_object(
        'nombre', d.nombre,
        'existe', exists (select 1 from pg_trigger g where g.tgname = d.nombre and not g.tgisinternal)
      ) order by d.orden)
      from unnest(array[
        'al_crear_usuario','referidos_alta_validar','referidos_calcular_bono','referidos_historial_cambios',
        'planes_recalcular','reglas_recalcular','reglas_historial_cambios','reglas_no_borrar',
        'referidos_updated_at','referentes_updated_at','planes_updated_at','reglas_updated_at','referentes_identidad',
        'referentes_a_telefono','referidos_a_telefono'
      ]) with ordinality as d(nombre, orden)
    ),
    'reglas', (select to_jsonb(r) - 'id' from public.reglas_programa r where r.id),
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

-- =====================================================================
--  Datos de versiones anteriores
-- =====================================================================
select set_config('app.accion', 'Actualización del sistema', true);

-- (El orden importa: cada "update" recalcula el estado de la fila.)

-- 1. Activos con la versión anterior (por pagar o pagados): su bono queda fijado
update public.referidos
   set confirmado_en = coalesce(confirmado_en, created_at),
       vence_en = coalesce(vence_en, created_at + make_interval(days => (public.reglas()).dias_vigencia_registro)),
       cliente_previo = coalesce(cliente_previo, false),
       bono_fijado_en = coalesce(bono_fijado_en, updated_at),
       plan_hoja_activacion = coalesce(plan_hoja_activacion, plan_hoja),
       fecha_activacion = coalesce(fecha_activacion, cruce_actualizado_en, updated_at),
       fecha_activacion_detectada = coalesce(fecha_activacion_detectada, cruce_actualizado_en, updated_at),
       fecha_activacion_origen = coalesce(fecha_activacion_origen, 'cruce'),
       activo_desde = case when afiliado_atom then coalesce(activo_desde, cruce_actualizado_en, updated_at) end,
       por_pagar_desde = case when estado_bono = 'pagado' then coalesce(por_pagar_desde, updated_at) else por_pagar_desde end
 where estado_bono in ('por_pagar', 'pagado') and bono_fijado_en is null;

-- 2. Registros creados antes de la vigencia: el plazo empieza en su fecha de registro.
--    Los ya cruzados con la versión anterior no se marcan como "ya cliente".
update public.referidos
   set confirmado_en = coalesce(confirmado_en, created_at),
       vence_en = coalesce(vence_en, created_at + make_interval(days => (public.reglas()).dias_vigencia_registro)),
       cliente_previo = case when cruce_actualizado_en is not null then coalesce(cliente_previo, false) else cliente_previo end
 where confirmado_en is null and not requiere_confirmacion;

-- 3. Recalcula el estado de los referidos con las reglas nuevas
update public.referidos set plan_hoja = plan_hoja
 where not editado_manual and estado_bono <> 'pagado';

-- 4. Teléfonos al FORMATO ESTÁNDAR (E.164 sin "+"). Los que no traen
--    indicativo se toman como de Colombia. No se rechaza ninguno: los
--    inválidos o sospechosos se ven con "npm run reporte-telefonos".
--    Sin disparadores, para no cambiar estados ni el historial.
--    Al re-ejecutar no cambia nada (la conversión ya está hecha).
alter table public.referentes disable trigger user;
update public.referentes
   set telefono = coalesce(public.normalizar_telefono(telefono), telefono),
       telefono_pais = coalesce(telefono_pais,
         case when public.normalizar_telefono(telefono) ~ '^57[0-9]{10}$' then 'CO' end)
 where telefono is distinct from coalesce(public.normalizar_telefono(telefono), telefono)
    or (telefono_pais is null and public.normalizar_telefono(telefono) ~ '^57[0-9]{10}$');
-- Los identificadores acumulados (teléfonos viejos de 10 dígitos) también
update public.referentes f
   set identificadores = (
     select coalesce(array_agg(distinct z.y order by z.y), '{}'::text[])
     from (select case when x ~ '^[0-9]+$' then public.normalizar_telefono(x) else x end as y
           from unnest(f.identificadores || public.identificadores_persona(f.correo, f.telefono, f.cuenta_dropi)) as x) z
     where z.y is not null)
 where exists (select 1 from unnest(f.identificadores) as x
               where x ~ '^[0-9]+$' and x is distinct from public.normalizar_telefono(x))
    or not (public.identificadores_persona(f.correo, f.telefono, f.cuenta_dropi) <@ f.identificadores);
alter table public.referentes enable trigger user;

alter table public.referidos disable trigger user;
-- (al tocar la fila se recalculan telefono_normalizado e identificadores)
update public.referidos x
   set telefono = coalesce(public.normalizar_telefono(x.telefono), x.telefono),
       telefono_pais = coalesce(x.telefono_pais,
         case when public.normalizar_telefono(x.telefono) ~ '^57[0-9]{10}$' then 'CO' end)
 where x.telefono is distinct from coalesce(public.normalizar_telefono(x.telefono), x.telefono)
    or (x.telefono_pais is null and public.normalizar_telefono(x.telefono) ~ '^57[0-9]{10}$')
    or x.identificadores is distinct from public.identificadores_persona(x.correo, x.telefono, x.cuenta_dropi);
update public.referidos x
   set hoja_identificadores = (
     select coalesce(array_agg(distinct z.y order by z.y), '{}'::text[])
     from (select case when h ~ '^[0-9]+$' then public.normalizar_telefono(h) else h end as y
           from unnest(x.hoja_identificadores) as h) z
     where z.y is not null)
 where exists (select 1 from unnest(x.hoja_identificadores) as h
               where h ~ '^[0-9]+$' and h is distinct from public.normalizar_telefono(h));
alter table public.referidos enable trigger user;

-- =====================================================================
--  Para nombrar un super_admin (hazlo después de que esa persona
--  haya iniciado sesión al menos una vez):
--
--  insert into public.super_admins (user_id)
--  select id from auth.users where email = 'correo-del-super-admin@ejemplo.com';
-- =====================================================================
