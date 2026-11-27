-- =====================================================================
--  Reporte: registros EXISTENTES que la regla de identidad cruzada
--  habría bloqueado o marcado. SOLO LEE, no cambia nada.
--  Úsalo después de ejecutar supabase/schema.sql (Supabase → SQL Editor).
--  También está "npm run reporte-identidades" (incluye la hoja).
-- =====================================================================

-- 1. Auto-referidos: algún dato del referido coincide con su referente
select 'auto_referido' as regla, x.id as referido_id, x.nombre, x.estado_bono, x.created_at,
       f.nombre as referente, array(select unnest(x.identificadores) intersect select unnest(f.identificadores)) as coincide_en
  from public.referidos x
  join public.referentes f on f.id = x.referente_id
 where x.identificadores && f.identificadores

union all

-- 2. Duplicados: la misma persona ya tenía otro registro vigente o con bono
select 'duplicado', x.id, x.nombre, x.estado_bono, x.created_at,
       (select string_agg(y.id::text, ', ') from public.referidos y
         where y.id <> x.id and (y.created_at, y.id) < (x.created_at, x.id) and y.identificadores && x.identificadores
           and ((y.vencido_en is null or y.vencido_en > x.created_at) and y.estado_bono <> 'no_aplica'
                or y.bono_fijado_en is not null)),
       array(select distinct unnest(x.identificadores) intersect
             select unnest(y2.identificadores) from public.referidos y2
              where y2.id <> x.id and (y2.created_at, y2.id) < (x.created_at, x.id) and y2.identificadores && x.identificadores)
  from public.referidos x
 where exists (select 1 from public.referidos y
                where y.id <> x.id and (y.created_at, y.id) < (x.created_at, x.id) and y.identificadores && x.identificadores
                  and ((y.vencido_en is null or y.vencido_en > x.created_at) and y.estado_bono <> 'no_aplica'
                       or y.bono_fijado_en is not null))

union all

-- 3. Referidos que coinciden con OTRO referente (se marcan, no se bloquean)
select 'es_otro_referente', x.id, x.nombre, x.estado_bono, x.created_at, g.nombre,
       array(select unnest(x.identificadores) intersect select unnest(g.identificadores))
  from public.referidos x
  join public.referentes g on g.id <> x.referente_id and g.identificadores && x.identificadores

union all

-- 4. Referentes duplicados (dos cuentas para la misma persona)
select 'referente_duplicado', f.id, f.nombre, null, f.created_at, g.nombre,
       array(select unnest(f.identificadores) intersect select unnest(g.identificadores))
  from public.referentes f
  join public.referentes g on (g.created_at, g.id) < (f.created_at, f.id) and g.identificadores && f.identificadores

union all

-- 5. Ya marcados por el cruce con la hoja (posible auto-referido / bono doble)
select x.revision, x.id, x.nombre, x.estado_bono, x.created_at, f.nombre, x.hoja_identificadores
  from public.referidos x
  join public.referentes f on f.id = x.referente_id
 where x.revision is not null

order by 1, 5;
