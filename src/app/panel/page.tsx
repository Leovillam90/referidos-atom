import type { Metadata } from "next";
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
import { nombrePlan, type PlanBasico } from "@/lib/estados";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { urlSitio } from "@/lib/config-programa";
import { cerrarSesion } from "./acciones";
import { CopiarLink } from "./copiar-link";

export const metadata: Metadata = { title: "Mi panel · Referidos ATOM" };

export default function PaginaPanel() {
  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold tracking-tight">Referidos ATOM</span>
          <form action={cerrarSesion}>
            <Button type="submit" variant="ghost">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
        {/* La sesión se lee en el momento de la visita, por eso va dentro de Suspense */}
        <Suspense fallback={<CargandoPanel />}>
          <ContenidoPanel />
        </Suspense>
      </main>
    </div>
  );
}

function CargandoPanel() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando tu panel">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
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

  const link = `${urlSitio()}/r/${referente.codigo}`;
  const total = (estado: ReferidoDelPanel["estado_bono"]) =>
    referidos.filter((r) => r.estado_bono === estado).reduce((s, r) => s + (Number(r.bono) || 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Hola, {referente.nombre.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">Aquí ves a las personas que se registraron con tu link y tus bonos.</p>
        </div>
        {esSuperAdmin && (
          <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
            Ir a administración
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Resumen titulo="Estimado" valor={formatoPesos(total("estimado"))} detalle="Referidos que aún no se activan" />
        <Resumen titulo="Por pagar" valor={formatoPesos(total("por_pagar"))} detalle="Referidos activos en ATOM" />
        <Resumen titulo="Pagado" valor={formatoPesos(total("pagado"))} detalle="Bonos que ya recibiste" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tu link de referido</CardTitle>
          <CardDescription>
            Compártelo con proveedores y marcas. Cuando se registren con él, aparecerán abajo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referente.activo ? (
            <CopiarLink url={link} />
          ) : (
            <p className="text-sm text-destructive">Tu link está desactivado. Escríbenos para revisarlo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mis referidos ({referidos.length})</CardTitle>
          <CardDescription>
            El bono es un pago único por referido. Mientras no se active es un estimado según el plan que
            le interesa; al activarse en ATOM se calcula con el plan que tomó.
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
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valor}</CardTitle>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </CardHeader>
    </Card>
  );
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
            <TableCell>
              <div className="grid">
                <span className="font-medium">{r.nombre ?? r.correo}</span>
                <span className="text-xs text-muted-foreground">{formatoFecha(r.created_at)}</span>
              </div>
            </TableCell>
            <TableCell>{nombrePlan(planes, r.plan_solicitado) ?? "—"}</TableCell>
            <TableCell>{nombrePlan(planes, r.plan_afiliado_id) ?? (r.afiliado_atom ? r.plan_hoja : null) ?? "—"}</TableCell>
            <TableCell>
              <Activo valor={r.afiliado_atom} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.estado_bono === "no_aplica" ? "—" : formatoPesos(r.bono)}
            </TableCell>
            <TableCell>
              <EstadoBonoEtiqueta estado={r.estado_bono} pago={r.pago} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
