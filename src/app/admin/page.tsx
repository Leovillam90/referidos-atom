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
  contarRecientes,
  exigirSuperAdmin,
  traerReferidos,
  traerResumenReferentes,
  traerTelefonosSospechosos,
  type FiltroReferidos,
  type ResumenReferente,
} from "@/lib/datos-admin";
import { EN_REVISION, ESTADOS_BONO } from "@/lib/estados";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { traerPlanes } from "@/lib/planes";
import { formatoTelefono } from "@/lib/telefono";
import { cn } from "@/lib/utils";
import { BotonCruce } from "./boton-cruce";
import { SaludSistema } from "./salud-sistema";
import { TablaReferidos } from "./tabla-referidos";
import { EncabezadoAdmin } from "./encabezado";

export const metadata: Metadata = { title: "Administración · Referidos ATOM" };

// El botón «Actualizar cruce» (acción de esta página) puede tardar con miles
// de filas: hasta 60 s (máximo del plan Hobby de Vercel sin Fluid Compute).
export const maxDuration = 60;

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
          const soloSuspendidos = uno(sp.referentes) === "suspendidos";
          return <Contenido vista={vista} filtro={filtro} soloSuspendidos={soloSuspendidos} />;
        })}
      </Suspense>
    </EncabezadoAdmin>
  );
}

function Cargando() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}

async function Contenido({
  vista,
  filtro,
  soloSuspendidos,
}: {
  vista: Vista;
  filtro: FiltroReferidos;
  soloSuspendidos: boolean;
}) {
  const { supabase, datos } = await exigirSuperAdmin();
  const [todos, planes, sospechosos] = await Promise.all([
    traerReferidos(datos),
    traerPlanes(supabase),
    traerTelefonosSospechosos(supabase),
  ]);
  // Nombres para la lista de celulares sospechosos
  const nombreReferido = new Map(todos.map((r) => [r.id, r.nombre ?? r.correo]));
  const nombreReferente = new Map(todos.map((r) => [r.referente_id, r.referente?.nombre ?? "Referente"]));
  const todosReferentes = vista === "referentes" ? await traerResumenReferentes(datos, todos) : [];
  const referentes = soloSuspendidos ? todosReferentes.filter((f) => f.suspendido) : todosReferentes;

  // Aviso: personas que ya eran clientes y se registraron como referidos (últimos 30 días)
  const yaClientes = contarRecientes(todos, "ya_cliente", 30);
  // Referidos en revisión (posible auto-referido o afiliado que ya generó bono)
  const enRevision = todos.filter((r) => EN_REVISION.includes(r.estado_bono)).length;
  const autoReferidos = todos.filter((r) => r.estado_bono === "posible_auto_referido").length;

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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Resumen titulo="Estimado" valor={formatoPesos(totales.estimado)} />
        <Resumen titulo="En verificación" valor={formatoPesos(totales.en_verificacion)} />
        <Resumen titulo="Por pagar" valor={formatoPesos(totales.por_pagar)} />
        <Resumen titulo="Pagado" valor={formatoPesos(totales.pagado)} />
        <Resumen titulo="Referidos" valor={String(todos.length)} detalle={`${sinCruce} sin cruce con la hoja`} />
      </div>

      <SaludSistema supabase={supabase} />

      {enRevision > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-destructive/60 bg-destructive/10 p-4 text-sm">
          <p>
            <span className="font-bold">
              {enRevision === 1 ? "1 referido está en revisión" : `${enRevision} referidos están en revisión`}
            </span>{" "}
            {autoReferidos > 0 && <>({autoReferidos} por posible auto-referido: su fila de la hoja coincide con el referente) </>}
            y no generan bono hasta que los revises. Ábrelos y resuélvelos con una excepción manual (con motivo).
          </p>
          <Link
            href={`/admin?vista=referidos&estado=${autoReferidos > 0 ? "posible_auto_referido" : "afiliado_duplicado"}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Revisarlos
          </Link>
        </div>
      )}

      {yaClientes > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sea-green/50 bg-sea-green/10 p-4 text-sm">
          <p>
            <span className="font-bold">
              {yaClientes === 1
                ? "1 persona que ya era cliente de ATOM se registró como referido"
                : `${yaClientes} personas que ya eran clientes de ATOM se registraron como referidos`}
            </span>{" "}
            en los últimos 30 días. Quedaron como «Ya era cliente» y no generan bono.
          </p>
          <Link
            href="/admin?vista=referidos&estado=ya_cliente"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Revisarlos
          </Link>
        </div>
      )}

      {sospechosos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Celulares sospechosos ({sospechosos.length})</CardTitle>
            <CardDescription>
              El mismo celular aparece en 3 o más registros (referentes o referidos, vigentes o vencidos). Puede ser
              fraude: no se bloquean, revísalos. Para bloquear un número usa Reglas → Números bloqueados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {sospechosos.map((t) => (
                <li key={t.telefono} className="grid gap-1 rounded-2xl border bg-dark-gunmetal/40 p-3">
                  <span className="font-bold tabular-nums">
                    {formatoTelefono(t.telefono)} · {t.registros} registros
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                    {t.referentes.map((id) => (
                      <Link key={id} href={`/admin/referentes/${id}`} className="hover:underline">
                        Referente: {nombreReferente.get(id) ?? "ver"}
                      </Link>
                    ))}
                    {t.referidos.map((id) => (
                      <Link key={id} href={`/admin/referidos/${id}`} className="hover:underline">
                        Referido: {nombreReferido.get(id) ?? "ver"}
                      </Link>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cruce con la hoja de afiliados</CardTitle>
          <CardDescription>
            Busca cada referido en la Google Sheet: primero por correo y, si no aparece, por teléfono, y
            aplica las reglas del programa (ya cliente, vigencia, permanencia y vencimientos). Se hace solo
            al registrarse cada referido y una vez al día. No cambia los referidos pagados, vencidos, ya
            clientes ni los editados a mano.
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

          {vista === "referentes" && (
            <nav aria-label="Filtrar referentes" className="flex flex-wrap gap-1">
              {[
                { href: "/admin?vista=referentes", titulo: "Todos", activo: !soloSuspendidos },
                { href: "/admin?vista=referentes&referentes=suspendidos", titulo: "Suspendidos", activo: soloSuspendidos },
              ].map((f) => (
                <Link
                  key={f.titulo}
                  href={f.href}
                  aria-current={f.activo ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors",
                    f.activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {f.titulo}
                </Link>
              ))}
            </nav>
          )}

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
                ? `${referentes.length} referentes. Entra a uno para registrar pagos o suspenderlo.`
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
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay referentes con este filtro.</p>;
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
          <TableHead className="text-right">En verificación</TableHead>
          <TableHead className="text-right">Por pagar</TableHead>
          <TableHead className="text-right">Pagado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referentes.map((f) => (
          <TableRow key={f.id}>
            <TableCell data-label="Referente">
              <Link href={`/admin/referentes/${f.id}`} className="grid hover:underline">
                <span className="font-medium">{f.nombre}</span>
                <span className="text-xs text-muted-foreground">{f.correo}</span>
              </Link>
            </TableCell>
            <TableCell data-label="Código">
              <span className={cn("font-mono text-xs", !f.activo && "text-muted-foreground line-through")}>
                {f.codigo}
              </span>
              {!f.activo && <span className="ml-2 text-xs text-destructive">inactivo</span>}
              {f.suspendido && <span className="ml-2 text-xs font-bold text-destructive">suspendido</span>}
            </TableCell>
            <TableCell data-label="Referidos" className="text-right tabular-nums">{f.referidos}</TableCell>
            <TableCell data-label="Activos" className="text-right tabular-nums">{f.activos}</TableCell>
            <TableCell data-label="Estimado" className="text-right tabular-nums">{formatoPesos(f.totales.estimado)}</TableCell>
            <TableCell data-label="En verificación" className="text-right tabular-nums">{formatoPesos(f.totales.en_verificacion)}</TableCell>
            <TableCell data-label="Por pagar" className="text-right font-medium tabular-nums">{formatoPesos(f.totales.por_pagar)}</TableCell>
            <TableCell data-label="Pagado" className="text-right tabular-nums">{formatoPesos(f.totales.pagado)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
