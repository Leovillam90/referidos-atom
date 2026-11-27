import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { exigirSuperAdmin } from "@/lib/datos-admin";
import { contar, verificarConfiguracion, type Estado } from "@/lib/verificacion";
import { cn } from "@/lib/utils";
import { EncabezadoAdmin } from "../encabezado";

export const metadata: Metadata = { title: "Estado de la configuración · Referidos ATOM" };

const ICONO: Record<Estado, string> = { ok: "✅", aviso: "⚠️", error: "❌" };

export default function PaginaEstado() {
  return (
    <EncabezadoAdmin>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Estado de la configuración</h1>
          <p className="text-sm text-muted-foreground">
            Revisa variables, base de datos, Google Sheet, correo y enlaces. Nunca se muestra el valor de una clave.
            También puedes correrlo en la terminal con <code className="font-mono">npm run verificar</code>.
          </p>
        </div>
        {/* Link normal para que vuelva a ejecutar toda la revisión */}
        <a href="/admin/estado" className={buttonVariants({ variant: "outline" })}>
          Volver a revisar
        </a>
      </div>
      <Suspense fallback={<Cargando />}>
        <Resultados />
      </Suspense>
    </EncabezadoAdmin>
  );
}

function Cargando() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Revisando la configuración">
      <p className="text-sm text-muted-foreground">Revisando… (puede tardar unos segundos)</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted" />
      ))}
    </div>
  );
}

async function Resultados() {
  await exigirSuperAdmin();
  const grupos = await verificarConfiguracion();
  const t = contar(grupos);

  return (
    <>
      <Card size="sm" className={cn(t.errores > 0 && "border-destructive")}>
        <CardHeader>
          <CardTitle>
            {t.errores === 0 ? "✅ Todo lo esencial está configurado" : `❌ Hay ${t.errores} cosa(s) por corregir`}
          </CardTitle>
          <CardDescription>
            {t.ok} bien · {t.avisos} aviso(s) · {t.errores} por corregir
          </CardDescription>
        </CardHeader>
      </Card>

      {grupos.map((g) => (
        <Card key={g.titulo}>
          <CardHeader>
            <CardTitle>{g.titulo}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {g.resultados.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span aria-label={r.estado === "ok" ? "bien" : r.estado === "aviso" ? "aviso" : "error"} className="shrink-0">
                    {ICONO[r.estado]}
                  </span>
                  <div className="grid gap-0.5">
                    <span className={cn(r.estado === "error" && "font-medium")}>{r.titulo}</span>
                    {r.detalle && <span className="text-xs text-muted-foreground">{r.detalle}</span>}
                    {r.solucion && r.estado !== "ok" && (
                      <span className="text-xs">
                        <span className="font-medium">Qué hacer:</span> {r.solucion}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
