import type { Metadata } from "next";
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
  exigirSuperAdmin,
  traerPagos,
  traerReferidos,
  type ReferenteAdmin,
} from "@/lib/datos-admin";
import { nombrePlan } from "@/lib/estados";
import { formatoFecha, formatoFechaHoraIso, formatoPesos, formatoTelefono } from "@/lib/formato";
import { traerPlanes } from "@/lib/planes";
import { EncabezadoAdmin } from "../../encabezado";
import { TablaReferidos } from "../../tabla-referidos";
import { FormularioPago } from "./formulario-pago";

export const metadata: Metadata = { title: "Referente · Administración · Referidos ATOM" };

export default function PaginaReferente({ params }: PageProps<"/admin/referentes/[id]">) {
  return (
    <EncabezadoAdmin>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        {params.then(({ id }) => (
          <Contenido id={id} />
        ))}
      </Suspense>
    </EncabezadoAdmin>
  );
}

async function Contenido({ id }: { id: string }) {
  const { supabase } = await exigirSuperAdmin();
  if (!z.uuid().safeParse(id).success) return <NoEncontrado />;

  const [{ data: referente }, referidos, planes, pagos] = await Promise.all([
    supabase
      .from("referentes")
      .select("id, nombre, correo, telefono, cuenta_dropi, codigo, activo, created_at")
      .eq("id", id)
      .maybeSingle<ReferenteAdmin>(),
    traerReferidos(supabase, { referenteId: id }),
    traerPlanes(supabase),
    traerPagos(supabase, id),
  ]);
  if (!referente) return <NoEncontrado />;

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
        <h1 className="text-2xl font-semibold tracking-tight">{referente.nombre}</h1>
        <p className="text-sm text-muted-foreground">
          {referente.correo} · {formatoTelefono(referente.telefono)} · Dropi: {referente.cuenta_dropi} · Código{" "}
          <span className="font-mono">{referente.codigo}</span>
          {!referente.activo && <span className="text-destructive"> · link inactivo</span>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Resumen titulo="Estimado" valor={formatoPesos(totales.estimado)} />
        <Resumen titulo="Por pagar" valor={formatoPesos(totales.por_pagar)} />
        <Resumen titulo="Pagado" valor={formatoPesos(totales.pagado)} />
      </div>

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
                    <TableCell className="whitespace-nowrap">{formatoFecha(`${p.fecha_pago}T12:00:00`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatoPesos(p.valor_pagado)}</TableCell>
                    <TableCell>
                      {referidos
                        .filter((r) => r.pago?.id === p.id)
                        .map((r) => r.nombre ?? r.correo)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{p.nota ?? "—"}</TableCell>
                    <TableCell>
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
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valor}</CardTitle>
      </CardHeader>
    </Card>
  );
}
