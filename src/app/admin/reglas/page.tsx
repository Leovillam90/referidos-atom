import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirSuperAdmin } from "@/lib/datos-admin";
import { formatoFechaHoraIso } from "@/lib/formato";
import { leerReglas } from "@/lib/reglas";
import { EncabezadoAdmin } from "../encabezado";
import { FormularioReglas } from "./formulario-reglas";
import { TelefonosBloqueados, type TelefonoBloqueado } from "./telefonos-bloqueados";

export const metadata: Metadata = { title: "Reglas del programa · Administración · Referidos ATOM" };

export default function PaginaReglas() {
  return (
    <EncabezadoAdmin>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-muted" aria-busy="true" />}>
        <Contenido />
      </Suspense>
    </EncabezadoAdmin>
  );
}

type CambioReglas = {
  id: string;
  usuario_correo: string | null;
  cambios: Record<string, { antes: unknown; despues: unknown }>;
  created_at: string;
};

const NOMBRES: Record<string, string> = {
  dias_vigencia_registro: "Días de vigencia",
  dias_permanencia_para_pagar: "Días de permanencia",
  confirmacion_referido_por_correo: "Confirmación por correo",
  dominios_excluidos: "Dominios excluidos",
  max_registros_por_link_por_hora: "Máximo por hora",
};

function legible(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

async function Contenido() {
  const { supabase } = await exigirSuperAdmin();
  const [reglas, { data: historial }, { data: bloqueados }] = await Promise.all([
    leerReglas(supabase),
    supabase
      .from("reglas_historial")
      .select("id, usuario_correo, cambios, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<CambioReglas[]>(),
    supabase
      .from("telefonos_bloqueados")
      .select("telefono, nota, created_at")
      .order("created_at", { ascending: false })
      .returns<TelefonoBloqueado[]>(),
  ]);

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Reglas del programa</h1>
        <p className="text-sm text-muted-foreground">
          Todas las reglas leen estos valores. También se pueden editar en Supabase → Table Editor → reglas_programa.
          Última actualización: {formatoFechaHoraIso(reglas.updated_at)}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valores</CardTitle>
          <CardDescription>
            Al guardar, los referidos en curso se recalculan (por ejemplo, con los nuevos días de permanencia). La
            vigencia nueva aplica a los registros que se hagan desde ahora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioReglas valores={reglas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Números de celular bloqueados</CardTitle>
          <CardDescription>
            Ningún referente ni referido nuevo puede registrarse con estos números (se revisa en el formulario, en el
            servidor y en la base de datos). Se guardan en el formato estándar, ej. +57 300 000 0000 → 573000000000.
            Los números falsos (repetidos, secuencias o patrones) ya se rechazan solos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TelefonosBloqueados lista={bloqueados ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de cambios</CardTitle>
          <CardDescription>Incluye los cambios hechos desde el Table Editor de Supabase.</CardDescription>
        </CardHeader>
        <CardContent>
          {!historial?.length ? (
            <p className="py-4 text-sm text-muted-foreground">Sin cambios registrados.</p>
          ) : (
            <ol className="grid gap-3">
              {historial.map((h) => (
                <li key={h.id} className="grid gap-1 rounded-2xl border bg-dark-gunmetal/40 p-3.5 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {formatoFechaHoraIso(h.created_at)} · {h.usuario_correo ?? "Sistema"}
                  </span>
                  <ul className="grid gap-0.5 text-muted-foreground">
                    {Object.entries(h.cambios).map(([campo, c]) => (
                      <li key={campo}>
                        {NOMBRES[campo] ?? campo}: {legible(c.antes)} →{" "}
                        <span className="text-foreground">{legible(c.despues)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
