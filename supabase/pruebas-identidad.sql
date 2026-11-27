-- =====================================================================
--  Pruebas de la identidad cruzada EN LA BASE DE DATOS
-- ---------------------------------------------------------------------
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run (después de ejecutar supabase/schema.sql).
--
--  Crea referentes y referidos de prueba, revisa las reglas y DESHACE
--  TODO al final: no deja ningún dato ni envía correos. El resultado es
--  una tabla con cada prueba y "OK" o "FALLA".
-- =====================================================================

create or replace function pg_temp.probar_identidad()
returns table (prueba text, resultado text, detalle text)
language plpgsql
as $$
declare
  res text[] := '{}';
  -- Una fila por prueba: 'nombre|OK|detalle'
  ok   boolean;
  a uuid; b uuid; c uuid; d uuid; e uuid;
  r1 uuid; r2 uuid; r3 uuid;
  v public.referidos;
  version text := 'pruebas';

begin
  begin  -- todo lo de este bloque se deshace al final

    -- ---------------------------------------------------------------
    -- Referentes de prueba
    -- ---------------------------------------------------------------
    a := gen_random_uuid(); b := gen_random_uuid(); c := gen_random_uuid(); d := gen_random_uuid();
    insert into auth.users (id, email, raw_user_meta_data) values
      (a, 'ana.gomez@pruebas-atom.test',
        jsonb_build_object('rol', 'referente', 'nombre', 'Ana Prueba', 'telefono', '3105550000', 'cuenta_dropi', 'tiendaana')),
      (b, 'bruno@pruebas-atom.test',
        jsonb_build_object('rol', 'referente', 'nombre', 'Bruno Prueba', 'telefono', '3105550001', 'cuenta_dropi', 'ventas.bruno@gmail.com')),
      (c, 'carla@pruebas-atom.test',
        jsonb_build_object('rol', 'referente', 'nombre', 'Carla Prueba', 'telefono', '3105550002', 'cuenta_dropi', 'tiendacarla')),
      (d, 'dario@pruebas-atom.test',
        jsonb_build_object('rol', 'referente', 'nombre', 'Dario Prueba', 'telefono', '3105550003', 'cuenta_dropi', 'tiendadario'));

    -- 1. Correo del referente puesto como cuenta Dropi del referido → bloquea
    begin
      insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
      values (a, 'Otra Persona', 'otra@pruebas-atom.test', '3209998888', ' Ana.Gomez@Pruebas-Atom.test ', 'proveedor', true, version, md5(random()::text));
      res := res || 'Correo del referente como cuenta Dropi del referido|FALLA|se guardó';
    exception when others then
      res := res || ('Correo del referente como cuenta Dropi del referido|' ||
                     case when sqlerrm like '%AUTO_REFERIDO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;

    -- 2. Cuenta Dropi del referente puesta como correo del referido → bloquea
    begin
      insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
      values (b, 'Otra Persona', 'ventasbruno+promo@gmail.com', '3209998887', 'otra', 'proveedor', true, version, md5(random()::text));
      res := res || 'Cuenta Dropi del referente como correo del referido|FALLA|se guardó';
    exception when others then
      res := res || ('Cuenta Dropi del referente como correo del referido|' ||
                     case when sqlerrm like '%AUTO_REFERIDO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;

    -- 3. juan.perez+1@gmail.com vs juanperez@gmail.com → misma persona (duplicado)
    insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
    values (a, 'Juan Perez', 'juan.perez+1@gmail.com', '3001110000', 'juantienda', 'marca', true, version, md5(random()::text))
    returning id into r1;
    update public.referidos set confirmado_en = coalesce(confirmado_en, now()),
                                vence_en = coalesce(vence_en, now() + interval '30 days') where id = r1;
    begin
      insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
      values (c, 'Juan Perez', 'juanperez@gmail.com', '3001110001', 'otratienda', 'marca', true, version, md5(random()::text));
      res := res || 'juan.perez+1@gmail.com vs juanperez@gmail.com|FALLA|se guardó el duplicado';
    exception when others then
      res := res || ('juan.perez+1@gmail.com vs juanperez@gmail.com|' ||
                     case when sqlerrm like '%DUPLICADO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;

    -- 4. Teléfono "+57 300 123 4567" vs "3001234567" → misma persona
    ok := public.identificadores_persona(null, '+57 300 123 4567', null)
          && public.identificadores_persona(null, '3001234567', null);
    res := res || ('Teléfono +57 300 123 4567 vs 3001234567|' || case when ok then 'OK' else 'FALLA' end || '|');
    -- …y escrito en la cuenta Dropi de otro referido, contra el teléfono del referente
    begin
      insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
      values (c, 'Otra Persona', 'otra2@pruebas-atom.test', '3209998886', '+57 310 555 0002', 'proveedor', true, version, md5(random()::text));
      res := res || 'Teléfono del referente como cuenta Dropi|FALLA|se guardó';
    exception when others then
      res := res || ('Teléfono del referente como cuenta Dropi|' ||
                     case when sqlerrm like '%AUTO_REFERIDO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;

    -- 5. Datos distintos en el formulario, pero buyer_email de la hoja = correo del referente
    insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
    values (d, 'Cliente Nuevo', 'cliente.nuevo@otra-pruebas.test', '3157778899', 'clientenuevo', 'marca', true, version, md5(random()::text))
    returning id into r2;
    update public.referidos set confirmado_en = coalesce(confirmado_en, now()),
                                vence_en = coalesce(vence_en, now() + interval '30 days'),
                                created_at = now() - interval '2 days' where id = r2;
    perform public.aplicar_cruce(jsonb_build_array(jsonb_build_object(
      'id', r2, 'en_hoja', true, 'activo', true, 'cruce_por', 'telefono', 'plan_hoja', null,
      'fecha_hoja', to_char(current_date, 'YYYY-MM-DD'),
      'correo_hoja', 'DARIO@pruebas-atom.test', 'telefono_hoja', '3157778899')));
    select * into v from public.referidos where id = r2;
    res := res || ('buyer_email de la hoja = correo del referente|' ||
                   case when v.estado_bono = 'posible_auto_referido' and v.revision = 'posible_auto_referido'
                             and coalesce(v.bono, 0) = 0 then 'OK' else 'FALLA' end ||
                   '|estado=' || v.estado_bono || ' bono=' || coalesce(v.bono::text, 'null'));

    -- 6. Un solo referente por persona: otro correo pero el teléfono de Ana
    begin
      insert into auth.users (id, email, raw_user_meta_data) values
        (gen_random_uuid(), 'ana.otra.cuenta@pruebas-atom.test',
         jsonb_build_object('rol', 'referente', 'nombre', 'Ana Otra', 'telefono', '+57 310 555 0000', 'cuenta_dropi', 'nueva'));
      res := res || 'Segunda cuenta de referente con el teléfono de otro|FALLA|se creó';
    exception when others then
      res := res || ('Segunda cuenta de referente con el teléfono de otro|' ||
                     case when sqlerrm like '%REFERENTE_DUPLICADO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;
    -- …ni con su correo escrito como cuenta Dropi
    begin
      insert into auth.users (id, email, raw_user_meta_data) values
        (gen_random_uuid(), 'tercera@pruebas-atom.test',
         jsonb_build_object('rol', 'referente', 'nombre', 'Ana Tercera', 'telefono', '3119990000', 'cuenta_dropi', 'ana.gomez@pruebas-atom.test'));
      res := res || 'Segunda cuenta de referente con el correo de otro como Dropi|FALLA|se creó';
    exception when others then
      res := res || ('Segunda cuenta de referente con el correo de otro como Dropi|' ||
                     case when sqlerrm like '%REFERENTE_DUPLICADO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;

    -- 7. El referente cambia su teléfono: el anterior sigue contando
    update public.referentes set telefono = '3119990001' where id = c;
    begin
      insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
      values (c, 'Carla Otra', 'carla.otra@otra-pruebas.test', '3105550002', 'x1y2z3', 'marca', true, version, md5(random()::text));
      res := res || 'Teléfono anterior del referente|FALLA|se guardó';
    exception when others then
      res := res || ('Teléfono anterior del referente|' ||
                     case when sqlerrm like '%AUTO_REFERIDO%' then 'OK' else 'FALLA' end || '|' || sqlerrm);
    end;

    -- 8. Sin bono doble: dos referidos con la misma fila de la hoja
    e := gen_random_uuid();
    insert into auth.users (id, email, raw_user_meta_data) values
      (e, 'elena@pruebas-atom.test',
        jsonb_build_object('rol', 'referente', 'nombre', 'Elena Prueba', 'telefono', '3105550004', 'cuenta_dropi', 'tiendaelena'));
    insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
    values (b, 'Persona Uno', 'uno@otra-pruebas.test', '3170000001', 'tiendauno', 'marca', true, version, md5(random()::text))
    returning id into r1;
    insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
    values (e, 'Persona Dos', 'dos@otra-pruebas.test', '3170000002', 'tiendados', 'marca', true, version, md5(random()::text))
    returning id into r3;
    update public.referidos set confirmado_en = coalesce(confirmado_en, now()),
                                vence_en = coalesce(vence_en, now() + interval '30 days'),
                                created_at = now() - interval '2 days' where id in (r1, r3);
    perform public.aplicar_cruce(jsonb_build_array(jsonb_build_object(
      'id', r1, 'en_hoja', true, 'activo', true, 'cruce_por', 'correo', 'plan_hoja', null,
      'fecha_hoja', to_char(current_date, 'YYYY-MM-DD'),
      'correo_hoja', 'afiliado.compartido@otra-pruebas.test', 'telefono_hoja', '3180000000')));
    perform public.aplicar_cruce(jsonb_build_array(jsonb_build_object(
      'id', r3, 'en_hoja', true, 'activo', true, 'cruce_por', 'correo', 'plan_hoja', null,
      'fecha_hoja', to_char(current_date, 'YYYY-MM-DD'),
      'correo_hoja', 'Afiliado.Compartido@otra-pruebas.test', 'telefono_hoja', '3180000000')));
    select * into v from public.referidos where id = r3;
    ok := (select bono_fijado_en is not null from public.referidos where id = r1)
          and v.estado_bono = 'afiliado_duplicado' and v.bono_fijado_en is null;
    res := res || ('Misma fila de la hoja en dos referidos: un solo bono|' || case when ok then 'OK' else 'FALLA' end ||
                   '|segundo: estado=' || v.estado_bono);

    -- 9. Otro referente registrado como referido: se guarda, marcado
    insert into public.referidos (referente_id, nombre, correo, telefono, cuenta_dropi, tipo, autoriza_datos, version_politica, token_confirmacion_hash)
    values (e, 'Ana Como Referida', 'ana.nueva@otra-pruebas.test', '3105550000', 'otra-ana', 'marca', true, version, md5(random()::text))
    returning id into r2;
    res := res || ('Referido que es otro referente queda marcado|' ||
                   case when (select es_referente from public.referidos where id = r2) then 'OK' else 'FALLA' end || '|');

    raise exception using errcode = 'P0099', message = 'deshacer';
  exception when sqlstate 'P0099' then
    null;  -- se deshizo todo lo de las pruebas
  end;

  return query
    select split_part(x, '|', 1), split_part(x, '|', 2), nullif(split_part(x, '|', 3), '')
    from unnest(res) as x;
end;
$$;

select * from pg_temp.probar_identidad();
