import { NextResponse, type NextRequest } from "next/server";
import { claveAutorizada } from "@/lib/clave-servidor";
import { verificarConexionCorreo } from "@/lib/correo";
import { verificarSuperAdmin } from "@/lib/datos-admin";
import { verificarConexionHoja } from "@/lib/hoja-afiliados";
import { ocultarDatos, textoError } from "@/lib/registro";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

type Servicio = { ok: boolean; ms: number; detalle?: string };

/** Corre una revisión con tiempo máximo; nunca lanza. */
async function revisar(fn: () => Promise<string | void>, ms = 15_000): Promise<Servicio> {
  const inicio = Date.now();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const detalle = await Promise.race([
      fn(),
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error(`no respondió en ${ms / 1000} s`)), ms);
      }),
    ]);
    return { ok: true, ms: Date.now() - inicio, ...(detalle ? { detalle } : {}) };
  } catch (e) {
    // Sin datos personales ni claves (ocultarDatos tapa correos, teléfonos y llaves)
    return { ok: false, ms: Date.now() - inicio, detalle: ocultarDatos(textoError(e)).slice(0, 300) };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Salud de la app para monitoreo (UptimeRobot, Better Stack, etc.).
 * Revisa la conexión a Supabase, a la Google Sheet y al servidor SMTP.
 * Responde 200 si todo funciona y 503 si algo falla.
 * Acceso: "Authorization: Bearer SALUD_SECRET" (o CRON_SECRET si no
 * configuraste SALUD_SECRET), o con la sesión de un super_admin.
 */
export async function GET(request: NextRequest) {
  const autorizacion = request.headers.get("authorization");
  const conClave =
    claveAutorizada(autorizacion, process.env.SALUD_SECRET) || claveAutorizada(autorizacion, process.env.CRON_SECRET);
  if (!conClave && !(await verificarSuperAdmin()).esSuperAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [supabase, hoja, correo] = await Promise.all([
    revisar(async () => {
      const { error } = await crearClienteAdmin().from("reglas_programa").select("id").limit(1);
      if (error) throw new Error(error.message);
      const { data: ultimo } = await crearClienteAdmin()
        .from("ejecuciones_cruce")
        .select("estado, iniciado_en")
        .neq("estado", "omitido")
        .order("iniciado_en", { ascending: false })
        .limit(1)
        .maybeSingle<{ estado: string; iniciado_en: string }>();
      return ultimo ? `último cruce: ${ultimo.estado} (${ultimo.iniciado_en})` : "sin cruces registrados";
    }),
    revisar(() => verificarConexionHoja()),
    revisar(async () => ((await verificarConexionCorreo()) === "sin_configurar" ? "SMTP sin configurar" : undefined)),
  ]);

  const ok = supabase.ok && hoja.ok && correo.ok;
  return NextResponse.json(
    { ok, revisado_en: new Date().toISOString(), servicios: { supabase, hoja, correo } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
