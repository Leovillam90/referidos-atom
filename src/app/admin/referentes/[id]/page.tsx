import type { Metadata } from "next";
import { TarjetaResumen } from "@/components/tarjeta-resumen";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calcularTotales,
  COLUMNAS_REFERENTE,
  exigirSuperAdmin,
  traerHistorialReferente,
  traerPagos,
  traerReferidos,
  traerTelefonosSospechosos,
  type ReferenteAdmin,
} from "@/lib/datos-admin";
import { AvisoTelefonoSospechoso, CelularWhatsApp } from "@/components/celular-whatsapp";
import { nombrePlan } from "@/lib/estados";
import { formatoFecha, formatoFechaHoraIso, formatoPesos } from "@/lib/formato";
import { traerPlanes } from "@/lib/planes";
import { EncabezadoAdmin } from "../../encabezado";
import { TablaReferidos } from "../../tabla-referidos";
import { FormularioPago } from "./formulario-pago";
import { FormularioSuspension } from "./formulario-suspension";

export const metadata: Metadata = { title: "Referente · Administración · Referidos ATOM" };

export default function PaginaReferente({ params }: PageProps<"/admin/referentes/[id]">) {
  return (
    <EncabezadoAdmin>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-muted" aria-busy="true" />}>
        {params.then(({ id }) => (
          <Contenido id={id} />
        ))}
      </Suspense>
    </EncabezadoAdmin>
  );
}

async function Contenido({ id }: { id: string }) {
  const { supabase, datos } = await exigirSuperAdmin();
  if (!z.uuid().safeParse(id).success) return <NoEncontrado />;

  const [{ data: referente }, referidos, planes, pagos, historial] = await Promise.all([
    supabase.from("referentes").select(COLUMNAS_REFERENTE).eq("id", id).maybeSingle<ReferenteAdmin>(),
    traerReferidos(datos, { referenteId: id }),
    traerPlanes(supabase),
    traerPagos(supabase, id),
    traerHistorialReferente(supabase, id),
  ]);
  if (!referente) return <NoEncontrado />;
  const sospechoso = (await traerTelefonosSospechosos(supabase)).find((s) => s.referentes.includes(referente.id));

  const totales = calcularTotales(referidos);
  const porPagar = referidos
    .filter((r) => r.estado_bono === "por_pagar")
    .map((r) => ({
      id: r.id,
      nombre: r.nombre ?? r.correo,
      detalle: `${nombrePlan(planes, r.plan_afiliado_id) ?? r.plan_hoja ?? "Plan sin definir"} · ${r.correo}`,
      bono: r.bono === null ? null : Number(r.bono),
    }));
  const hoy = formatoFechaHoraIso(new Date().toISOString()).slice(0, 10);

  return (
    <>
      <div className="grid gap-1">
        <Link href="/admin?vista=referentes" className="text-sm text-muted-foreground hover:underline">
          ← Todos los referentes
        </Link>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{referente.nombre}</h1>
        <p className="text-sm text-muted-foreground">
          {referente.correo} · <CelularWhatsApp telefono={referente.telefono} /> · Dropi: {referente.cuenta_dropi} · Código{" "}
          <span className="font-mono">{referente.codigo}</span>
          {!referente.activo && <span className="text-destructive"> · link inactivo</span>}
          {referente.suspendido && <span className="font-bold text-destructive"> · SUSPENDIDO</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          Términos:{" "}
          {referente.terminos_aceptados_en
            ? `aceptó la versión ${referente.version_terminos ?? "—"} el ${formatoFechaHoraIso(referente.terminos_aceptados_en)}`
            : "sin registro (se registró antes de pedirlos)"}
          {" · "}Política de datos:{" "}
          {referente.autorizado_en
            ? `versión ${referente.version_politica ?? "—"} el ${formatoFechaHoraIso(referente.autorizado_en)}`
            : "sin registro"}
        </p>
      </div>

      {sospechoso && (
        <div role="alert" className="grid gap-1 rounded-3xl border border-destructive/60 bg-destructive/10 p-4 text-sm">
          <AvisoTelefonoSospechoso registros={sospechoso.registros} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Resumen titulo="Estimado" valor={formatoPesos(totales.estimado)} />
        <Resumen titulo="En verificación" valor={formatoPesos(totales.en_verificacion)} />
        <Resumen titulo="Por pagar" valor={formatoPesos(totales.por_pagar)} />
        <Resumen titulo="Pagado" valor={formatoPesos(totales.pagado)} />
      </div>

      <Card className={referente.suspendido ? "border-destructive/60" : undefined}>
        <CardHeader>
          <CardTitle>{referente.suspendido ? "Referente suspendido" : "Suspender referente"}</CardTitle>
          <CardDescription>
            {referente.suspendido
              ? `Desde el ${formatoFecha(referente.suspendido_en ?? referente.created_at)}. Motivo: ${referente.motivo_suspension ?? "—"}. ` +
                "Al reactivarlo, sus referidos vuelven a seguir las reglas (los que mientras tanto registró otro referente quedan vencidos)."
              : "Un referente suspendido no puede entrar a su panel ni recibir referidos nuevos (su link dice «Este link no está disponible»), y sus bonos no pagados pasan a «no aplica». Se puede reactivar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormularioSuspension id={referente.id} suspendido={referente.suspendido} />
          {historial.length > 0 && (
            <ol className="grid gap-2 border-t pt-4 text-sm">
              {historial.map((h) => (
                <li key={h.id} className="grid gap-0.5">
                  <span>
                    <span className="font-medium">{h.accion}</span>
                    <span className="text-muted-foreground"> · {formatoFechaHoraIso(h.created_at)} · {h.usuario_correo ?? "Sistema"}</span>
                  </span>
                  {h.motivo && <span className="text-muted-foreground">Motivo: {h.motivo}</span>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrar pago</CardTitle>
          <CardDescription>
            Elige los referidos &quot;por pagar&quot; que cubre el pago. El referente recibirá un correo y podrá ver
            el soporte en su panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioPago referenteId={referente.id} porPagar={porPagar} hoy={hoy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referidos ({referidos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {referidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Este referente todavía no tiene referidos.</p>
          ) : (
            <TablaReferidos referidos={referidos} planes={planes} mostrarReferente={false} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos ({pagos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pagos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay pagos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Referidos</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Soporte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell data-label="Fecha de pago" className="whitespace-nowrap">{formatoFecha(`${p.fecha_pago}T12:00:00`)}</TableCell>
                    <TableCell data-label="Valor" className="text-right tabular-nums">{formatoPesos(p.valor_pagado)}</TableCell>
                    <TableCell data-label="Referidos">
                      {referidos
                        .filter((r) => r.pago?.id === p.id)
                        .map((r) => r.nombre ?? r.correo)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell data-label="Nota" className="max-w-xs whitespace-normal text-muted-foreground">{p.nota ?? "—"}</TableCell>
                    <TableCell data-label="Soporte">
                      <Link href={`/soporte/${p.id}`} target="_blank" prefetch={false} className="text-sm font-medium text-primary hover:underline">
                        Ver soporte
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function NoEncontrado() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Referente no encontrado</CardTitle>
        <CardDescription>
          <Link href="/admin" className="underline">
            Volver a administración
          </Link>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: string }) {
  return <TarjetaResumen titulo={titulo} valor={valor} />;
}
