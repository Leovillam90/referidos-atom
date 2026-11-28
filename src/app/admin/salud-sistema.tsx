import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatoFechaHoraIso } from "@/lib/formato";
import { traerSaludSistema } from "@/lib/datos-admin";
import { cn } from "@/lib/utils";

/**
 * Aviso del estado del sistema en /admin: último cruce completo (cron o
 * botón) y fallas de correo, hoja o anti-robots de los últimos 7 días.
 * Si todo está bien, una sola línea discreta.
 */
export async function SaludSistema({ supabase }: { supabase: SupabaseClient }) {
  const { ultimo, errores, totalErrores: count, atrasado } = await traerSaludSistema(supabase);
  const falloCruce = ultimo?.estado === "error";
  const hayErrores = (count ?? 0) > 0;
  const alerta = falloCruce || hayErrores || atrasado;

  return (
    <section
      aria-label="Estado del sistema"
      className={cn(
        "grid gap-2 rounded-3xl border p-4 text-sm",
        alerta ? "border-destructive/60 bg-destructive/10" : "border-border bg-dark-gunmetal/40 text-muted-foreground",
      )}
    >
      <p>
        <span className="font-bold text-foreground">Último cruce completo: </span>
        {ultimo
          ? `${formatoFechaHoraIso(ultimo.iniciado_en)} (${ultimo.origen === "cron" ? "automático" : "botón"}) — ${
              { ok: "sin errores", error: "FALLÓ", en_curso: "en curso", omitido: "omitido" }[ultimo.estado]
            }`
          : "todavía no hay registro."}
        {falloCruce && ultimo?.error && <span className="block text-destructive">{ultimo.error}</span>}
        {atrasado && ultimo && !falloCruce && (
          <span className="block">Hace más de 36 horas que no corre: revisa el cron en Vercel o usa «Actualizar cruce».</span>
        )}
      </p>
      {hayErrores && (
        <div className="grid gap-1">
          <p className="font-bold text-foreground">
            {count === 1 ? "1 falla" : `${count} fallas`} de servicios externos en los últimos 7 días (los registros
            se guardaron igual):
          </p>
          <ul className="grid gap-1">
            {errores.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{formatoFechaHoraIso(e.created_at)} · {e.origen}:</span> {e.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/admin/estado" className="w-fit font-medium text-primary underline-offset-4 hover:underline">
        Revisar la configuración completa
      </Link>
    </section>
  );
}
