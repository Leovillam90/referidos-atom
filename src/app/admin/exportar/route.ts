import { NextResponse, type NextRequest } from "next/server";
import {
  traerPagos,
  traerReferentes,
  traerReferidos,
  traerResumenReferentes,
  verificarSuperAdmin,
  type FiltroReferidos,
} from "@/lib/datos-admin";
import { esEstadoBono, nombrePlan, tituloEstado } from "@/lib/estados";
import { formatoFechaHoraIso } from "@/lib/formato";
import { traerPlanes } from "@/lib/planes";

type Celda = string | number | null;

/**
 * Descarga de reportes en CSV (se abre directo en Excel):
 *   /admin/exportar?vista=referidos&estado=por_pagar  → referidos (filtro opcional)
 *   /admin/exportar?vista=referentes                  → referentes con sus totales
 *   /admin/exportar?vista=pagos                       → pagos registrados
 */
export async function GET(request: NextRequest) {
  const { supabase, esSuperAdmin } = await verificarSuperAdmin();
  if (!esSuperAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const vista = sp.get("vista") ?? "referidos";
  const estado = sp.get("estado") ?? "todos";
  const filtro: FiltroReferidos = esEstadoBono(estado) || estado === "sin_cruce" ? (estado as FiltroReferidos) : "todos";

  let filas: Celda[][];
  let nombre: string;
  const fechaHoy = formatoFechaHoraIso(new Date().toISOString()).slice(0, 10);

  if (vista === "referentes") {
    const referentes = await traerResumenReferentes(supabase);
    nombre = `referentes-${fechaHoy}`;
    filas = [
      ["Nombre", "Correo", "Teléfono", "Cuenta Dropi", "Código", "Link activo", "Referidos", "Activos en ATOM",
        "Bono estimado", "Bono por pagar", "Bono pagado", "Fecha de registro"],
      ...referentes.map((f) => [
        f.nombre, f.correo, f.telefono, f.cuenta_dropi, f.codigo, f.activo ? "Sí" : "No",
        f.referidos, f.activos, f.totales.estimado, f.totales.por_pagar, f.totales.pagado,
        formatoFechaHoraIso(f.created_at),
      ]),
    ];
  } else if (vista === "pagos") {
    const [pagos, referentes, referidos] = await Promise.all([
      traerPagos(supabase),
      traerReferentes(supabase),
      traerReferidos(supabase, { filtro: "pagado" }),
    ]);
    const referente = new Map(referentes.map((f) => [f.id, f]));
    nombre = `pagos-${fechaHoy}`;
    filas = [
      ["Fecha de pago", "Referente", "Correo referente", "Código", "Valor pagado", "Cantidad de referidos",
        "Referidos", "Nota", "Registrado el"],
      ...pagos.map((p) => {
        const cubiertos = referidos.filter((r) => r.pago?.id === p.id);
        const f = referente.get(p.referente_id);
        return [
          p.fecha_pago, f?.nombre ?? "", f?.correo ?? "", f?.codigo ?? "", Number(p.valor_pagado),
          cubiertos.length, cubiertos.map((r) => r.nombre ?? r.correo).join(", "), p.nota ?? "",
          formatoFechaHoraIso(p.created_at),
        ];
      }),
    ];
  } else {
    const [referidos, planes] = await Promise.all([traerReferidos(supabase, { filtro }), traerPlanes(supabase)]);
    nombre = `referidos-${filtro === "todos" ? "" : `${filtro}-`}${fechaHoy}`;
    filas = [
      [
        "Fecha de registro", "Referente", "Correo referente", "Código referente",
        "Nombre referido", "Correo referido", "Teléfono", "Cuenta Dropi", "Tipo",
        "Plan solicitado", "Activo en ATOM", "Cruce por", "Plan en la hoja", "Plan afiliado",
        "Bono", "Estado del bono", "Editado a mano", "Fecha de pago", "Último cruce",
        "Autorizó datos el", "Versión política",
      ],
      ...referidos.map((r) => [
        formatoFechaHoraIso(r.created_at),
        r.referente?.nombre ?? "", r.referente?.correo ?? "", r.referente?.codigo ?? "",
        r.nombre ?? "", r.correo, r.telefono, r.cuenta_dropi, r.tipo,
        nombrePlan(planes, r.plan_solicitado) ?? "",
        r.afiliado_atom === true ? "Sí" : r.afiliado_atom === false ? "No" : "Pendiente",
        r.cruce_por ?? "", r.plan_hoja ?? "", nombrePlan(planes, r.plan_afiliado_id) ?? "",
        r.estado_bono === "no_aplica" || r.bono === null ? null : Number(r.bono),
        tituloEstado(r.estado_bono), r.editado_manual ? "Sí" : "No",
        r.pago?.fecha_pago ?? "", formatoFechaHoraIso(r.cruce_actualizado_en),
        formatoFechaHoraIso(r.autorizado_en), r.version_politica,
      ]),
    ];
  }

  // "﻿" hace que Excel reconozca las tildes (UTF-8).
  return new NextResponse("﻿" + aCsv(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="referidos-atom-${nombre}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Excel en español (Colombia) usa ";" para separar columnas y ","
 * para los decimales. Los textos que empiezan por = + - @ se protegen
 * para que Excel no los ejecute como fórmulas.
 */
function aCsv(filas: Celda[][]) {
  return filas
    .map((fila) =>
      fila
        .map((celda) => {
          if (celda === null || celda === undefined) return "";
          if (typeof celda === "number") return String(celda).replace(".", ",");
          let t = celda;
          if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
          return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(";"),
    )
    .join("\r\n");
}
