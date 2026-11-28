import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { leerAfiliados } from "@/lib/hoja-afiliados";
import { buscarEnHoja, esPosibleAutoReferido, identificadoresHoja } from "@/lib/identidad";
import { logError, ocultarDatos, textoError } from "@/lib/registro";

type ReferidoParaCruce = {
  id: string;
  identificadores: string[] | null;
  referente: { identificadores: string[] | null } | null;
  en_hoja: boolean | null;
  afiliado_atom: boolean | null;
  cruce_por: "correo" | "telefono" | null;
  plan_hoja: string | null;
};

export type ResumenCruce = {
  filasHoja: number;
  telefonosInvalidosHoja: number; // filas con TELEFONO inválido: se cruzaron solo por buyer_email
  revisados: number;
  activos: number; // ESTADO MANUAL = activo
  enHojaNoActivos: number; // aparecen en la hoja con otro estado
  porCorreo: number;
  porTelefono: number;
  sinCruce: number;
  cambios: number;
  omitidos: number; // editados a mano, pagados, vencidos o ya clientes: el cruce no los toca
  sinPlan: number; // con bono fijado pero cuyo plan de la hoja no coincide con la tabla "planes"
  vencidos: number; // pasaron a "vencido" en esta revisión
  posiblesAutoReferidos: number; // su fila de la hoja coincide con su referente (bono 0, en revisión)
  enRevision: number; // total en revisión del super_admin (auto-referidos y afiliados con bono doble)
};

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE = 500;

/**
 * Cruza los referidos con la Google Sheet de afiliados usando TODOS los
 * identificadores del referido (correo, teléfono y cuenta Dropi, sin
 * importar en qué campo los escribió):
 *   1. Busca cada uno como correo (en Gmail no cuentan puntos ni "+").
 *   2. Si no aparece, busca cada uno como teléfono normalizado.
 * Envía a la base el buyer_email y el TELEFONO de la fila encontrada: la
 * base los compara con TODOS los identificadores del referente y, si
 * coinciden, deja el referido como "posible_auto_referido" (bono 0, en
 * revisión). También evita el bono doble si esa fila ya generó bono con
 * otro referido.
 * Guarda si aparece en la hoja, si está activo (columna de estado), cómo
 * se encontró, el plan y la fecha de activación (si la hoja la tiene).
 * La base de datos aplica después las reglas del programa: ya cliente,
 * vigencia, permanencia y bono fijo (ver calcular_bono_referido en
 * supabase/schema.sql).
 *
 * Sin `referidoId` revisa todos y al final revisa los vencimientos.
 */
export async function cruzarReferidos(opciones: { referidoId?: string } = {}): Promise<ResumenCruce> {
  const supabase = crearClienteAdmin();
  const inicio = new Date().toISOString();
  const indice = await leerAfiliados();

  // 1. Traer los referidos que siguen las reglas (de a 1000, el máximo por consulta)
  const referidos: ReferidoParaCruce[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    let consulta = supabase
      .from("referidos")
      .select("id, identificadores, referente:referentes(identificadores), en_hoja, afiliado_atom, cruce_por, plan_hoja")
      .eq("editado_manual", false)
      .not("estado_bono", "in", "(pagado,vencido,ya_cliente)")
      .order("created_at", { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (opciones.referidoId) consulta = consulta.eq("id", opciones.referidoId);

    const { data, error } = await consulta.returns<ReferidoParaCruce[]>();
    if (error) throw new Error(`No se pudieron leer los referidos: ${error.message}. ¿Ejecutaste de nuevo supabase/schema.sql?`);
    referidos.push(...(data ?? []));
    if (!data || data.length < TAMANO_PAGINA) break;
  }

  const { count: total } = await supabase
    .from("referidos")
    .select("id", { count: "exact", head: true })
    .match(opciones.referidoId ? { id: opciones.referidoId } : {});

  // 2. Calcular el resultado de cada uno
  const resumen: ResumenCruce = {
    filasHoja: indice.filas,
    telefonosInvalidosHoja: indice.telefonosInvalidos,
    revisados: referidos.length,
    activos: 0,
    enHojaNoActivos: 0,
    porCorreo: 0,
    porTelefono: 0,
    sinCruce: 0,
    cambios: 0,
    omitidos: Math.max(0, (total ?? referidos.length) - referidos.length),
    sinPlan: 0,
    vencidos: 0,
    posiblesAutoReferidos: 0,
    enRevision: 0,
  };

  const resultados = referidos.map((r) => {
    const hallado = buscarEnHoja(r.identificadores ?? [], indice);
    const afiliado = hallado?.afiliado;
    const cruce_por = hallado?.cruce_por ?? null;
    if (
      afiliado &&
      esPosibleAutoReferido(identificadoresHoja(afiliado.correo, afiliado.telefono), r.referente?.identificadores ?? [])
    ) {
      resumen.posiblesAutoReferidos++;
    }

    const nuevo = {
      id: r.id,
      en_hoja: Boolean(afiliado),
      activo: afiliado?.activo ?? false,
      cruce_por,
      plan_hoja: afiliado?.plan ?? null,
      fecha_hoja: afiliado?.fechaActivacion ?? null,
      // Ya en el formato estándar; la base los compara con el referente
      correo_hoja: afiliado?.correo ?? null,
      telefono_hoja: afiliado?.telefono ?? null,
    };

    if (!afiliado) resumen.sinCruce++;
    else {
      if (nuevo.activo) resumen.activos++;
      else resumen.enHojaNoActivos++;
      if (cruce_por === "correo") resumen.porCorreo++;
      else resumen.porTelefono++;
    }

    if (
      r.en_hoja !== nuevo.en_hoja ||
      r.afiliado_atom !== nuevo.activo ||
      r.cruce_por !== nuevo.cruce_por ||
      r.plan_hoja !== nuevo.plan_hoja
    ) {
      resumen.cambios++;
    }
    return nuevo;
  });

  // 3. Guardar en lotes (también actualiza la fecha del último cruce)
  for (let i = 0; i < resultados.length; i += TAMANO_LOTE) {
    const { error } = await supabase.rpc("aplicar_cruce", {
      datos: resultados.slice(i, i + TAMANO_LOTE),
    });
    if (error) {
      throw new Error(
        `No se pudo guardar el cruce: ${error.message}. ¿Ejecutaste de nuevo supabase/schema.sql?`,
      );
    }
  }

  if (!opciones.referidoId) {
    // 4. Vencimientos, pendientes sin confirmar y permanencias cumplidas
    const { error } = await supabase.rpc("revisar_vencimientos");
    if (error) throw new Error(`No se pudieron revisar los vencimientos: ${error.message}`);

    const [{ count: vencidos }, { count: sinPlan }, { count: enRevision }] = await Promise.all([
      supabase.from("referidos").select("id", { count: "exact", head: true }).gte("vencido_en", inicio),
      // 5. Con bono fijado pero el plan de la hoja no se reconoció (quedan sin bono)
      supabase
        .from("referidos")
        .select("id", { count: "exact", head: true })
        .not("bono_fijado_en", "is", null)
        .is("bono", null)
        .neq("estado_bono", "pagado"),
      // 6. En revisión del super_admin (no generan bono)
      supabase
        .from("referidos")
        .select("id", { count: "exact", head: true })
        .in("estado_bono", ["posible_auto_referido", "afiliado_duplicado"]),
    ]);
    resumen.vencidos = vencidos ?? 0;
    resumen.sinPlan = sinPlan ?? 0;
    resumen.enRevision = enRevision ?? 0;
  }

  return resumen;
}

export type ResultadoCruceCompleto =
  | { estado: "ok"; resumen: ResumenCruce }
  | { estado: "ocupado" }; // ya había otro cruce completo en curso

/**
 * Cruce COMPLETO (cron diario o botón "Actualizar cruce" de /admin):
 *   1. Pide turno en la base (iniciar_cruce): si ya hay otro en curso, no
 *      hace nada y devuelve "ocupado" (dos cruces nunca se pisan).
 *   2. Cruza todos los referidos y revisa vencimientos.
 *   3. Deja registrado el resultado o el error en ejecuciones_cruce
 *      (se ve en /admin), sin datos personales.
 */
export async function cruceCompleto(origen: "cron" | "admin"): Promise<ResultadoCruceCompleto> {
  const supabase = crearClienteAdmin();
  const { data: id, error } = await supabase.rpc("iniciar_cruce", { p_origen: origen });
  if (error) {
    throw new Error(`No se pudo iniciar el cruce: ${error.message}. ¿Ejecutaste de nuevo supabase/schema.sql?`);
  }
  if (id === null) return { estado: "ocupado" };

  try {
    const resumen = await cruzarReferidos();
    await supabase.rpc("terminar_cruce", { p_id: id, p_ok: true, p_resumen: resumen, p_error: null });
    return { estado: "ok", resumen };
  } catch (e) {
    const mensaje = ocultarDatos(textoError(e));
    const { error: errorFin } = await supabase.rpc("terminar_cruce", {
      p_id: id,
      p_ok: false,
      p_resumen: null,
      p_error: mensaje,
    });
    if (errorFin) logError("[cruce] no se pudo registrar el error:", errorFin.message);
    throw e;
  }
}
