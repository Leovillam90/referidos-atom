import type { Metadata } from "next";
import { TarjetaResumen } from "@/components/tarjeta-resumen";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activo, EstadoBonoEtiqueta } from "@/components/estado-bono";
import { obtenerPanelReferente, type ReferidoDelPanel } from "@/lib/sesion";
import { nombrePlan, SIN_BONO, type PlanBasico } from "@/lib/estados";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { urlSitio } from "@/lib/config-programa";
import { cerrarSesion } from "./acciones";
import { CopiarLink } from "./copiar-link";
import { AvisoBienvenida } from "./aviso-bienvenida";
import { MarcoApp } from "@/components/marco-app";
import { Mascota } from "@/components/mascota";

export const metadata: Metadata = { title: "Mi panel · Referidos ATOM" };

export default function PaginaPanel() {
  return (
    <MarcoApp
      inicio="/panel"
      etiqueta="Referidos"
      acciones={
        <form action={cerrarSesion}>
          <Button type="submit" variant="ghost" size="sm">
            Cerrar sesión
          </Button>
        </form>
      }
    >
      <AvisoBienvenida />
      {/* La sesión se lee en el momento de la visita, por eso va dentro de Suspense */}
      <Suspense fallback={<CargandoPanel />}>
        <ContenidoPanel />
      </Suspense>
    </MarcoApp>
  );
}

function CargandoPanel() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando tu panel">
      <div className="h-8 w-64 animate-pulse rounded-full bg-muted" />
      <div className="h-32 animate-pulse rounded-3xl bg-muted" />
      <div className="h-64 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}

async function ContenidoPanel() {
  const { referente, referidos, planes, esSuperAdmin } = await obtenerPanelReferente();

  if (!referente) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{esSuperAdmin ? "Cuenta de super administrador" : "Tu cuenta no es de referente"}</CardTitle>
          <CardDescription>
            {esSuperAdmin
              ? "Desde administración ves todos los referidos, el cruce con la hoja, los pagos y los reportes."
              : "Este correo no tiene un perfil de referente. Escríbenos si crees que es un error."}
          </CardDescription>
        </CardHeader>
        {esSuperAdmin && (
          <CardContent>
            <Link href="/admin" className={buttonVariants()}>
              Ir a administración
            </Link>
          </CardContent>
        )}
      </Card>
    );
  }

  if (referente.suspendido) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta de referente está suspendida</CardTitle>
          <CardDescription>
            Mientras esté suspendida no puedes ver tu panel y tu link no recibe referidos nuevos. Si crees que es un
            error, escríbenos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const link = `${urlSitio()}/r/${referente.codigo}`;
  const total = (...estados: ReferidoDelPanel["estado_bono"][]) =>
    referidos.filter((r) => estados.includes(r.estado_bono)).reduce((s, r) => s + (Number(r.bono) || 0), 0);

  return (
    <>
      {/* Bienvenida: saludo y link a la izquierda, mascota a la derecha "señalándolos" */}
      <section
        aria-labelledby="saludo-panel"
        className="zona-saludo borde-degradado grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-4 gap-y-5 rounded-3xl p-5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:p-7 md:grid-cols-[minmax(0,1fr)_11rem] md:gap-x-8 lg:grid-cols-[minmax(0,1fr)_13rem] lg:px-10"
      >
        <div className="grid gap-1.5 self-center">
          <p className="text-xs font-bold tracking-[0.2em] text-sea-green uppercase">Mi panel de referente</p>
          <h1 id="saludo-panel" className="text-[clamp(1.6rem,1.2rem+1.8vw,2.5rem)] leading-tight font-black tracking-tight">
            Hola, {referente.nombre.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Aquí ves a las personas que se registraron con tu link y tus bonos.
          </p>
          {esSuperAdmin && (
            <div className="pt-2">
              <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Ir a administración
              </Link>
            </div>
          )}
        </div>

        {/* En el celular pequeña junto al saludo; en PC grande ocupando las dos filas */}
        <div className="w-full py-2 md:row-span-2">
          <Mascota
            prioridad
            parallax
            sizes="(min-width: 1024px) 208px, (min-width: 768px) 176px, (min-width: 640px) 128px, 96px"
          />
        </div>

        <div className="dispara-saludo col-span-2 flex min-w-0 flex-col gap-2 md:col-span-1">
          <h2 className="text-base font-bold">Tu link de referido</h2>
          <p className="text-sm text-muted-foreground">
            Compártelo con proveedores y marcas. Cuando se registren con él, aparecerán abajo.
          </p>
          {referente.activo ? (
            <CopiarLink url={link} />
          ) : (
            <p className="text-sm text-destructive">Tu link está desactivado. Escríbenos para revisarlo.</p>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Resumen
          titulo="Estimado"
          valor={formatoPesos(total("estimado", "pendiente_confirmacion"))}
          detalle="Referidos que aún no se activan"
        />
        <Resumen
          titulo="En verificación"
          valor={formatoPesos(total("en_verificacion"))}
          detalle="Activos, cumpliendo la permanencia"
        />
        <Resumen titulo="Por pagar" valor={formatoPesos(total("por_pagar"))} detalle="Listos para pagarte" />
        <Resumen titulo="Pagado" valor={formatoPesos(total("pagado"))} detalle="Bonos que ya recibiste" />
      </div>


      <Card>
        <CardHeader>
          <CardTitle>Mis referidos ({referidos.length})</CardTitle>
          <CardDescription>
            El bono es un pago único por referido. Mientras no se active es un estimado según el plan que
            le interesa; al activarse en ATOM queda fijo con el plan que tomó. Cada registro tiene un plazo para
            activarse: si vence, la persona queda libre. Ver los{" "}
            <Link href="/terminos" className="text-primary underline-offset-4 hover:underline">
              términos del programa
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no tienes referidos. ¡Comparte tu link para empezar!
            </p>
          ) : (
            <TablaReferidos referidos={referidos} planes={planes} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Resumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return <TarjetaResumen titulo={titulo} valor={valor} detalle={detalle} />;
}

function TablaReferidos({ referidos, planes }: { referidos: ReferidoDelPanel[]; planes: PlanBasico[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Referido</TableHead>
          <TableHead>Plan solicitado</TableHead>
          <TableHead>Plan afiliado</TableHead>
          <TableHead>Activo en ATOM</TableHead>
          <TableHead className="text-right">Bono</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referidos.map((r) => (
          <TableRow key={r.id}>
            <TableCell data-label="Referido">
              <div className="grid">
                <span className="font-medium">{r.nombre ?? r.correo}</span>
                <span className="text-xs text-muted-foreground">{formatoFecha(r.created_at)}</span>
              </div>
            </TableCell>
            <TableCell data-label="Plan solicitado">{nombrePlan(planes, r.plan_solicitado) ?? "—"}</TableCell>
            <TableCell data-label="Plan afiliado">{nombrePlan(planes, r.plan_afiliado_id) ?? (r.afiliado_atom ? r.plan_hoja : null) ?? "—"}</TableCell>
            <TableCell data-label="Activo en ATOM">
              <Activo valor={r.afiliado_atom} />
            </TableCell>
            <TableCell data-label="Bono" className="text-right tabular-nums">
              {SIN_BONO.includes(r.estado_bono) ? "—" : formatoPesos(r.bono)}
            </TableCell>
            <TableCell data-label="Estado">
              <EstadoBonoEtiqueta estado={r.estado_bono} pago={r.pago} plazo={r} paraReferente />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
