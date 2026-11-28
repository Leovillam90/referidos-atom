import { NextResponse, type NextRequest } from "next/server";
import {
  traerPagos,
  traerReferentes,
  traerReferidos,
  traerResumenReferentes,
  verificarSuperAdmin,
  type FiltroReferidos,
} from "@/lib/datos-admin";
import { esEstadoBono, nombrePlan, SIN_BONO, tituloEstado } from "@/lib/estados";
import { formatoFechaHoraIso } from "@/lib/formato";
import { paisDeTelefono } from "@/lib/telefono";
import { traerPlanes } from "@/lib/planes";
import { aCsv, type Celda } from "@/lib/csv";

/** Celular en el formato estándar, como texto para que Excel no lo vuelva 5,73E+11. */
const celular = (t: string) => ({ digitos: t });

/**
 * Descarga de reportes en CSV (se abre directo en Excel):
 *   /admin/exportar?vista=referidos&estado=por_pagar  → referidos (filtro opcional)
 *   /admin/exportar?vista=referentes                  → referentes con sus totales
 *   /admin/exportar?vista=pagos                       → pagos registrados
 */
export async function GET(request: NextRequest) {
  const { supabase, datos } = await verificarSuperAdmin();
  if (!datos) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const vista = sp.get("vista") ?? "referidos";
  const estado = sp.get("estado") ?? "todos";
  const filtro: FiltroReferidos = esEstadoBono(estado) || estado === "sin_cruce" ? (estado as FiltroReferidos) : "todos";

  let filas: Celda[][];
  let nombre: string;
  const fechaHoy = formatoFechaHoraIso(new Date().toISOString()).slice(0, 10);

  if (vista === "referentes") {
    const referentes = await traerResumenReferentes(datos);
    nombre = `referentes-${fechaHoy}`;
    filas = [
      ["Nombre", "Correo", "País", "Celular", "Cuenta Dropi", "Código", "Link activo", "Suspendido", "Motivo suspensión",
        "Referidos", "Activos en ATOM", "Bono estimado", "Bono en verificación", "Bono por pagar", "Bono pagado",
        "Fecha de registro", "Versión términos", "Aceptó términos el", "Versión política", "Autorizó datos el"],
      ...referentes.map((f) => [
        f.nombre, f.correo, f.telefono_pais ?? paisDeTelefono(f.telefono) ?? "", celular(f.telefono), f.cuenta_dropi, f.codigo, f.activo ? "Sí" : "No",
        f.suspendido ? "Sí" : "No", f.motivo_suspension ?? "",
        f.referidos, f.activos, f.totales.estimado, f.totales.en_verificacion, f.totales.por_pagar, f.totales.pagado,
        formatoFechaHoraIso(f.created_at), f.version_terminos ?? "", formatoFechaHoraIso(f.terminos_aceptados_en),
        f.version_politica ?? "", formatoFechaHoraIso(f.autorizado_en),
      ]),
    ];
  } else if (vista === "pagos") {
    const [pagos, referentes, referidos] = await Promise.all([
      traerPagos(supabase),
      traerReferentes(supabase),
      traerReferidos(datos, { filtro: "pagado" }),
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
    const [referidos, planes] = await Promise.all([traerReferidos(datos, { filtro }), traerPlanes(supabase)]);
    nombre = `referidos-${filtro === "todos" ? "" : `${filtro}-`}${fechaHoy}`;
    filas = [
      [
        "Fecha de registro", "Referente", "Correo referente", "Código referente",
        "Nombre referido", "Correo referido", "País", "Celular", "Cuenta Dropi", "Tipo",
        "Plan solicitado", "Activo en ATOM", "Cruce por", "Plan en la hoja", "Plan afiliado",
        "Bono", "Estado del bono", "Editado a mano", "Fecha de pago", "Último cruce",
        "Autorizó datos el", "Versión política",
        "Confirmó por correo el", "Vence el", "Venció el", "Ya era cliente", "Fecha de activación",
        "Origen fecha activación", "Bono fijado el", "Pasa a por pagar el",
      ],
      ...referidos.map((r) => [
        formatoFechaHoraIso(r.created_at),
        r.referente?.nombre ?? "", r.referente?.correo ?? "", r.referente?.codigo ?? "",
        r.nombre ?? "", r.correo, r.telefono_pais ?? paisDeTelefono(r.telefono) ?? "", celular(r.telefono), r.cuenta_dropi, r.tipo,
        nombrePlan(planes, r.plan_solicitado) ?? "",
        r.afiliado_atom === true ? "Sí" : r.afiliado_atom === false ? "No" : "Pendiente",
        r.cruce_por ?? "", r.plan_hoja ?? "", nombrePlan(planes, r.plan_afiliado_id) ?? "",
        SIN_BONO.includes(r.estado_bono) || r.bono === null ? null : Number(r.bono),
        tituloEstado(r.estado_bono), r.editado_manual ? "Sí" : "No",
        r.pago?.fecha_pago ?? "", formatoFechaHoraIso(r.cruce_actualizado_en),
        formatoFechaHoraIso(r.autorizado_en), r.version_politica,
        formatoFechaHoraIso(r.confirmado_en), formatoFechaHoraIso(r.vence_en), formatoFechaHoraIso(r.vencido_en),
        r.cliente_previo ? "Sí" : "No", formatoFechaHoraIso(r.fecha_activacion),
        r.fecha_activacion_origen === "hoja" ? "Hoja" : r.fecha_activacion_origen === "cruce" ? "Detectada por el cruce" : "",
        formatoFechaHoraIso(r.bono_fijado_en), formatoFechaHoraIso(r.por_pagar_desde ?? r.fecha_por_pagar),
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

