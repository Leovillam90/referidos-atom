import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activo, EstadoBonoEtiqueta } from "@/components/estado-bono";
import { AvisoTelefonoSospechoso, CelularWhatsApp } from "@/components/celular-whatsapp";
import {
  exigirSuperAdmin,
  traerHistorial,
  traerReferido,
  traerTelefonosSospechosos,
  type HistorialItem,
} from "@/lib/datos-admin";
import { nombrePlan, SIN_BONO, tituloEstado, type Plan } from "@/lib/estados";
import { formatoFecha, formatoFechaHoraIso, formatoPesos } from "@/lib/formato";
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

  const [r, planes, historial, sospechosos] = await Promise.all([
    traerReferido(supabase, id),
    traerPlanes(supabase),
    traerHistorial(supabase, id),
    traerTelefonosSospechosos(supabase),
  ]);
  if (!r) return <NoEncontrado />;
  const sospechoso = sospechosos.find((s) => s.referidos.includes(r.id));

  return (
    <>
      <div className="grid gap-1">
        <Link href={`/admin/referentes/${r.referente_id}`} className="text-sm text-muted-foreground hover:underline">
          ← Referidos de {r.referente?.nombre ?? "este referente"}
        </Link>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{r.nombre ?? r.correo}</h1>
        <p className="text-sm text-muted-foreground">
          {r.correo} · <CelularWhatsApp telefono={r.telefono} /> · Dropi: {r.cuenta_dropi} · <span className="capitalize">{r.tipo}</span> ·
          registrado el {formatoFecha(r.created_at)}
        </p>
      </div>

      {(r.revision || r.es_referente || sospechoso) && (
        <div role="alert" className="grid gap-1 rounded-3xl border border-destructive/60 bg-destructive/10 p-4 text-sm">
          {r.revision === "posible_auto_referido" && (
            <p>
              <span className="font-bold">Posible auto-referido:</span> el correo o el teléfono de su fila en la hoja de
              afiliados coincide con los datos (actuales o anteriores) de su referente. No genera bono. Si lo revisaste
              y es válido, haz una excepción manual con el motivo.
            </p>
          )}
          {r.revision === "afiliado_duplicado" && (
            <p>
              <span className="font-bold">Afiliado ya bonificado:</span> esa misma fila de la hoja de afiliados ya generó
              bono con otro referido. No genera un segundo bono salvo excepción manual.
            </p>
          )}
          {sospechoso && <AvisoTelefonoSospechoso registros={sospechoso.registros} />}
          {r.es_referente && (
            <p>
              <span className="font-bold">También es referente:</span> al registrarse, sus datos coincidían con los de
              otro referente del programa.
            </p>
          )}
        </div>
      )}

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
          <Dato titulo="Bono">
            {SIN_BONO.includes(r.estado_bono) ? "—" : formatoPesos(r.bono)}
            {r.bono_fijado_en && <span className="text-muted-foreground"> (fijo desde {formatoFecha(r.bono_fijado_en)})</span>}
          </Dato>
          <Dato titulo="Estado">
            <EstadoBonoEtiqueta estado={r.estado_bono} pago={r.pago} plazo={r} />
          </Dato>
          <Dato titulo="Origen de los datos">
            {r.estado_bono === "pagado"
              ? "Pagado: ya no cambia"
              : r.editado_manual
                ? "Excepción manual (las reglas y el cruce no lo cambian)"
                : "Sigue las reglas y la hoja de afiliados"}
          </Dato>
          <Dato titulo="Confirmación por correo">
            {!r.requiere_confirmacion
              ? "No se pidió"
              : r.confirmado_en
                ? `Confirmó el ${formatoFechaHoraIso(r.confirmado_en)}`
                : "Pendiente"}
          </Dato>
          <Dato titulo="Vigencia del registro">
            {r.vencido_en
              ? `Venció el ${formatoFecha(r.vencido_en)}`
              : r.vence_en
                ? `Hasta el ${formatoFecha(r.vence_en)}`
                : "Empieza al confirmar"}
          </Dato>
          <Dato titulo="En la hoja">
            {r.en_hoja === null ? "Sin revisar" : r.en_hoja ? "Sí" : "No"}
            {r.cliente_previo && <span className="text-sea-green"> · ya era cliente al registrarse</span>}
          </Dato>
          <Dato titulo="Fecha de activación">
            {r.fecha_activacion
              ? `${formatoFecha(r.fecha_activacion)} (${r.fecha_activacion_origen === "hoja" ? "según la hoja" : "detectada por el cruce"})`
              : "—"}
          </Dato>
          <Dato titulo="Activo sin interrupción desde">{r.activo_desde ? formatoFecha(r.activo_desde) : "—"}</Dato>
          <Dato titulo="Pasa a por pagar">
            {r.por_pagar_desde
              ? `Pasó el ${formatoFecha(r.por_pagar_desde)}`
              : r.fecha_por_pagar
                ? formatoFecha(r.fecha_por_pagar)
                : "—"}
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
            <CardTitle>Excepción manual</CardTitle>
            <CardDescription>
              Para hacer una excepción a cualquier regla (vigencia, ya cliente, permanencia, bono). Al guardar, el
              referido queda marcado como &quot;editado a mano&quot;: las reglas y el cruce con la hoja dejan de cambiarlo.
              El motivo es obligatorio y queda en el historial.
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
                vence_en: r.vence_en,
              }}
            />
            {r.editado_manual && (
              <div className="grid gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  ¿Quieres que vuelva a seguir las reglas y la hoja de afiliados? Se recalculan su estado y su bono.
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
          <CardDescription>Quién cambió qué, cuándo y por qué.</CardDescription>
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
  en_hoja: "En la hoja",
  confirmado_en: "Confirmó por correo",
  vence_en: "Vence",
  vencido_en: "Venció",
  cliente_previo: "Ya era cliente",
  fecha_activacion: "Fecha de activación",
  bono_fijado_en: "Bono fijado",
  revision: "En revisión",
};

const CAMPOS_FECHA = ["confirmado_en", "vence_en", "vencido_en", "fecha_activacion", "bono_fijado_en"];

function valorLegible(campo: string, v: unknown, planes: Plan[]) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (campo === "bono") return formatoPesos(v as number);
  if (campo === "estado_bono" || campo === "revision") return tituloEstado(String(v));
  if (campo === "plan_afiliado_id") return nombrePlan(planes, String(v)) ?? "—";
  if (campo === "pago_id") return "registrado";
  if (CAMPOS_FECHA.includes(campo)) return formatoFechaHoraIso(String(v));
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
      {h.motivo && (
        <p className="text-muted-foreground">
          Motivo: <span className="text-foreground">{h.motivo}</span>
        </p>
      )}
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
