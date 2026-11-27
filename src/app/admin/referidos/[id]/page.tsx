import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activo, EstadoBonoEtiqueta } from "@/components/estado-bono";
import { exigirSuperAdmin, traerHistorial, traerReferido, type HistorialItem } from "@/lib/datos-admin";
import { nombrePlan, tituloEstado, type Plan } from "@/lib/estados";
import { formatoFecha, formatoFechaHoraIso, formatoPesos, formatoTelefono } from "@/lib/formato";
import { traerPlanes } from "@/lib/planes";
import { EncabezadoAdmin } from "../../encabezado";
import { BotonVolverAHoja, FormularioEdicion } from "./formulario-edicion";

export const metadata: Metadata = { title: "Referido · Administración · Referidos ATOM" };

export default function PaginaReferido({ params }: PageProps<"/admin/referidos/[id]">) {
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
  const { supabase } = await exigirSuperAdmin();
  if (!z.uuid().safeParse(id).success) return <NoEncontrado />;

  const [r, planes, historial] = await Promise.all([
    traerReferido(supabase, id),
    traerPlanes(supabase),
    traerHistorial(supabase, id),
  ]);
  if (!r) return <NoEncontrado />;

  return (
    <>
      <div className="grid gap-1">
        <Link href={`/admin/referentes/${r.referente_id}`} className="text-sm text-muted-foreground hover:underline">
          ← Referidos de {r.referente?.nombre ?? "este referente"}
        </Link>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{r.nombre ?? r.correo}</h1>
        <p className="text-sm text-muted-foreground">
          {r.correo} · {formatoTelefono(r.telefono)} · Dropi: {r.cuenta_dropi} · <span className="capitalize">{r.tipo}</span> ·
          registrado el {formatoFecha(r.created_at)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado actual</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <Dato titulo="Plan solicitado">{nombrePlan(planes, r.plan_solicitado) ?? "—"}</Dato>
          <Dato titulo="Plan en la hoja">{r.plan_hoja ?? "—"}</Dato>
          <Dato titulo="Plan afiliado">{nombrePlan(planes, r.plan_afiliado_id) ?? "—"}</Dato>
          <Dato titulo="Activo en ATOM">
            <Activo valor={r.afiliado_atom} />
            {r.cruce_por && <span className="text-muted-foreground"> (por {r.cruce_por === "correo" ? "correo" : "teléfono"})</span>}
          </Dato>
          <Dato titulo="Bono">{r.estado_bono === "no_aplica" ? "—" : formatoPesos(r.bono)}</Dato>
          <Dato titulo="Estado">
            <EstadoBonoEtiqueta estado={r.estado_bono} pago={r.pago} />
          </Dato>
          <Dato titulo="Origen de los datos">
            {r.estado_bono === "pagado"
              ? "Pagado: ya no cambia"
              : r.editado_manual
                ? "Editado a mano (el cruce no lo cambia)"
                : "Sigue la hoja de afiliados"}
          </Dato>
          <Dato titulo="Último cruce">{r.cruce_actualizado_en ? formatoFechaHoraIso(r.cruce_actualizado_en) : "Nunca"}</Dato>
          <Dato titulo="Autorización de datos">
            {formatoFechaHoraIso(r.autorizado_en)} · versión {r.version_politica}
          </Dato>
        </CardContent>
      </Card>

      {r.estado_bono === "pagado" ? (
        <Card>
          <CardHeader>
            <CardTitle>Editar</CardTitle>
            <CardDescription>Este referido ya está pagado, por eso no se puede editar.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Editar a mano</CardTitle>
            <CardDescription>
              Al guardar, el referido queda marcado como &quot;editado a mano&quot; y el cruce con la hoja deja de
              cambiarlo. Cada cambio queda en el historial.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <FormularioEdicion
              id={r.id}
              planes={planes}
              valores={{
                plan_afiliado_id: r.plan_afiliado_id,
                afiliado_atom: r.afiliado_atom,
                bono: r.bono === null ? null : Number(r.bono),
                estado_bono: r.estado_bono,
              }}
            />
            {r.editado_manual && (
              <div className="grid gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  ¿Quieres que vuelva a tomar los datos de la hoja de afiliados? Se recalculan su estado y su bono.
                </p>
                <BotonVolverAHoja id={r.id} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>Quién cambió qué y cuándo.</CardDescription>
        </CardHeader>
        <CardContent>
          {historial.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Sin cambios registrados.</p>
          ) : (
            <ol className="grid gap-3">
              {historial.map((h) => (
                <EntradaHistorial key={h.id} h={h} planes={planes} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}

const CAMPOS: Record<string, string> = {
  afiliado_atom: "Activo en ATOM",
  plan_hoja: "Plan en la hoja",
  plan_afiliado_id: "Plan afiliado",
  bono: "Bono",
  estado_bono: "Estado",
  editado_manual: "Editado a mano",
  pago_id: "Pago",
};

function valorLegible(campo: string, v: unknown, planes: Plan[]) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (campo === "bono") return formatoPesos(v as number);
  if (campo === "estado_bono") return tituloEstado(String(v));
  if (campo === "plan_afiliado_id") return nombrePlan(planes, String(v)) ?? "—";
  if (campo === "pago_id") return "registrado";
  return String(v);
}

function EntradaHistorial({ h, planes }: { h: HistorialItem; planes: Plan[] }) {
  return (
    <li className="grid gap-1 rounded-2xl border bg-dark-gunmetal/40 p-3.5 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="font-medium">{h.accion}</span>
        <span className="text-xs text-muted-foreground">
          {formatoFechaHoraIso(h.created_at)} · {h.usuario_correo ?? "Sistema"}
        </span>
      </div>
      <ul className="grid gap-0.5 text-muted-foreground">
        {Object.entries(h.cambios).map(([campo, c]) => (
          <li key={campo}>
            {CAMPOS[campo] ?? campo}: {valorLegible(campo, c.antes, planes)} → {" "}
            <span className="text-foreground">{valorLegible(campo, c.despues, planes)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <div>{children}</div>
    </div>
  );
}

function NoEncontrado() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Referido no encontrado</CardTitle>
        <CardDescription>
          <Link href="/admin" className="underline">
            Volver a administración
          </Link>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
