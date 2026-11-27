import type { Metadata } from "next";
import { TarjetaResumen } from "@/components/tarjeta-resumen";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
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
  traerReferidos,
  traerResumenReferentes,
  type FiltroReferidos,
  type ResumenReferente,
} from "@/lib/datos-admin";
import { ESTADOS_BONO } from "@/lib/estados";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { traerPlanes } from "@/lib/planes";
import { cn } from "@/lib/utils";
import { BotonCruce } from "./boton-cruce";
import { TablaReferidos } from "./tabla-referidos";
import { EncabezadoAdmin } from "./encabezado";

export const metadata: Metadata = { title: "Administración · Referidos ATOM" };

const FILTROS: { id: FiltroReferidos; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  ...ESTADOS_BONO.map((e) => ({ id: e.id, titulo: e.titulo })),
  { id: "sin_cruce", titulo: "Sin cruce con la hoja" },
];

type Vista = "referentes" | "referidos";

export default function PaginaAdmin({ searchParams }: PageProps<"/admin">) {
  return (
    <EncabezadoAdmin>
      {/* La sesión y los filtros se leen en el momento de la visita */}
      <Suspense fallback={<Cargando />}>
        {searchParams.then((sp) => {
          const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
          const vista: Vista = uno(sp.vista) === "referidos" ? "referidos" : "referentes";
          const estado = uno(sp.estado);
          const filtro = FILTROS.some((f) => f.id === estado) ? (estado as FiltroReferidos) : "todos";
          return <Contenido vista={vista} filtro={filtro} />;
        })}
      </Suspense>
    </EncabezadoAdmin>
  );
}

function Cargando() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      <div className="grid gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}

async function Contenido({ vista, filtro }: { vista: Vista; filtro: FiltroReferidos }) {
  const { supabase } = await exigirSuperAdmin();
  const [todos, planes] = await Promise.all([traerReferidos(supabase), traerPlanes(supabase)]);
  const referentes = vista === "referentes" ? await traerResumenReferentes(supabase, todos) : [];

  const totales = calcularTotales(todos);
  const sinCruce = todos.filter((r) => r.afiliado_atom !== true).length;
  const ultimoCruce = todos
    .map((r) => r.cruce_actualizado_en)
    .filter((f): f is string => Boolean(f))
    .sort()
    .at(-1);

  const visibles =
    filtro === "todos"
      ? todos
      : filtro === "sin_cruce"
        ? todos.filter((r) => r.afiliado_atom !== true)
        : todos.filter((r) => r.estado_bono === filtro);

  const exportar =
    vista === "referentes" ? "/admin/exportar?vista=referentes" : `/admin/exportar?vista=referidos&estado=${filtro}`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        <Resumen titulo="Estimado" valor={formatoPesos(totales.estimado)} />
        <Resumen titulo="Por pagar" valor={formatoPesos(totales.por_pagar)} />
        <Resumen titulo="Pagado" valor={formatoPesos(totales.pagado)} />
        <Resumen titulo="Referidos" valor={String(todos.length)} detalle={`${sinCruce} sin cruce con la hoja`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cruce con la hoja de afiliados</CardTitle>
          <CardDescription>
            Busca cada referido en la Google Sheet: primero por correo y, si no aparece, por teléfono.
            Se hace solo al registrarse cada referido y una vez al día. No cambia los referidos pagados
            ni los editados a mano.
            {ultimoCruce && <> Último cruce: {formatoFecha(ultimoCruce)}.</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BotonCruce />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <nav aria-label="Vistas" className="flex flex-wrap gap-1">
            <Pestana href="/admin?vista=referentes" activa={vista === "referentes"}>
              Por referente
            </Pestana>
            <Pestana href="/admin?vista=referidos" activa={vista === "referidos"}>
              Todos los referidos
            </Pestana>
          </nav>

          {vista === "referidos" && (
            <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <Link
                  key={f.id}
                  href={`/admin?vista=referidos&estado=${f.id}`}
                  aria-current={filtro === f.id ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors",
                    filtro === f.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {f.titulo}
                </Link>
              ))}
            </nav>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardDescription>
              {vista === "referentes"
                ? "Cada referente con sus totales. Entra a uno para registrar pagos."
                : `${visibles.length} referidos. Entra a uno para editarlo o ver su historial.`}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              {/* Links normales (no Link de Next) porque descargan un archivo */}
              <a href={exportar} className={buttonVariants({ variant: "outline", size: "sm" })} download>
                <Download aria-hidden />
                Exportar a Excel
              </a>
              <a href="/admin/exportar?vista=pagos" className={buttonVariants({ variant: "ghost", size: "sm" })} download>
                <Download aria-hidden />
                Exportar pagos
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {vista === "referentes" ? (
            <TablaReferentes referentes={referentes} />
          ) : visibles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay referidos con este filtro.</p>
          ) : (
            <TablaReferidos referidos={visibles} planes={planes} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Pestana({ href, activa, children }: { href: string; activa: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activa ? "page" : undefined}
      className={buttonVariants({ variant: activa ? "secondary" : "ghost", size: "sm" })}
    >
      {children}
    </Link>
  );
}

function Resumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return <TarjetaResumen titulo={titulo} valor={valor} detalle={detalle} />;
}

function TablaReferentes({ referentes }: { referentes: ResumenReferente[] }) {
  if (referentes.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay referentes.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Referente</TableHead>
          <TableHead>Código</TableHead>
          <TableHead className="text-right">Referidos</TableHead>
          <TableHead className="text-right">Activos</TableHead>
          <TableHead className="text-right">Estimado</TableHead>
          <TableHead className="text-right">Por pagar</TableHead>
          <TableHead className="text-right">Pagado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referentes.map((f) => (
          <TableRow key={f.id}>
            <TableCell>
              <Link href={`/admin/referentes/${f.id}`} className="grid hover:underline">
                <span className="font-medium">{f.nombre}</span>
                <span className="text-xs text-muted-foreground">{f.correo}</span>
              </Link>
            </TableCell>
            <TableCell>
              <span className={cn("font-mono text-xs", !f.activo && "text-muted-foreground line-through")}>
                {f.codigo}
              </span>
              {!f.activo && <span className="ml-2 text-xs text-destructive">inactivo</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{f.referidos}</TableCell>
            <TableCell className="text-right tabular-nums">{f.activos}</TableCell>
            <TableCell className="text-right tabular-nums">{formatoPesos(f.totales.estimado)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{formatoPesos(f.totales.por_pagar)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatoPesos(f.totales.pagado)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
