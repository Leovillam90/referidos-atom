import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { leerAfiliados } from "@/lib/hoja-afiliados";

type ReferidoParaCruce = {
  id: string;
  correo: string;
  telefono_normalizado: string | null;
  afiliado_atom: boolean | null;
  cruce_por: "correo" | "telefono" | null;
  plan_hoja: string | null;
};

export type ResumenCruce = {
  filasHoja: number;
  revisados: number;
  activos: number;
  porCorreo: number;
  porTelefono: number;
  sinCruce: number;
  cambios: number;
  omitidos: number; // editados a mano o pagados: el cruce no los toca
  sinPlan: number; // activos cuyo plan de la hoja no coincide con la tabla "planes"
};

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE = 500;

/**
 * Cruza los referidos con la Google Sheet de afiliados:
 *   1. Busca por correo.
 *   2. Si no aparece, busca por teléfono normalizado.
 * Guarda si está activo en ATOM, cómo se encontró y el plan de la hoja.
 * La base de datos calcula después el bono y su estado (ver
 * calcular_bono_referido en supabase/schema.sql).
 *
 * Los referidos editados a mano por el super_admin y los ya pagados
 * NO se tocan. Sin `referidoId` revisa todos los demás.
 */
export async function cruzarReferidos(opciones: { referidoId?: string } = {}): Promise<ResumenCruce> {
  const supabase = crearClienteAdmin();
  const indice = await leerAfiliados();

  // 1. Traer los referidos que sigue la hoja (de a 1000, el máximo por consulta)
  const referidos: ReferidoParaCruce[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    let consulta = supabase
      .from("referidos")
      .select("id, correo, telefono_normalizado, afiliado_atom, cruce_por, plan_hoja")
      .eq("editado_manual", false)
      .neq("estado_bono", "pagado")
      .order("created_at", { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (opciones.referidoId) consulta = consulta.eq("id", opciones.referidoId);

    const { data, error } = await consulta.returns<ReferidoParaCruce[]>();
    if (error) throw new Error(`No se pudieron leer los referidos: ${error.message}`);
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
    revisados: referidos.length,
    activos: 0,
    porCorreo: 0,
    porTelefono: 0,
    sinCruce: 0,
    cambios: 0,
    omitidos: Math.max(0, (total ?? referidos.length) - referidos.length),
    sinPlan: 0,
  };

  const resultados = referidos.map((r) => {
    let afiliado = indice.porCorreo.get(r.correo);
    let cruce_por: "correo" | "telefono" | null = afiliado ? "correo" : null;
    if (!afiliado && r.telefono_normalizado) {
      afiliado = indice.porTelefono.get(r.telefono_normalizado);
      if (afiliado) cruce_por = "telefono";
    }

    const nuevo = {
      id: r.id,
      afiliado_atom: Boolean(afiliado),
      cruce_por,
      plan_hoja: afiliado?.plan ?? null,
    };

    if (nuevo.afiliado_atom) {
      resumen.activos++;
      if (cruce_por === "correo") resumen.porCorreo++;
      else resumen.porTelefono++;
    } else {
      resumen.sinCruce++;
    }

    if (r.afiliado_atom !== nuevo.afiliado_atom || r.cruce_por !== nuevo.cruce_por || r.plan_hoja !== nuevo.plan_hoja) {
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

  // 4. Activos cuyo plan no se reconoció (quedan "por pagar" sin bono)
  if (!opciones.referidoId) {
    const { count } = await supabase
      .from("referidos")
      .select("id", { count: "exact", head: true })
      .eq("estado_bono", "por_pagar")
      .is("bono", null);
    resumen.sinPlan = count ?? 0;
  }

  return resumen;
}
