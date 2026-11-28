import { NextResponse, type NextRequest } from "next/server";
import { cruceCompleto } from "@/lib/cruce";
import { claveAutorizada } from "@/lib/clave-servidor";
import { registrarError } from "@/lib/registro";

/** Tiempo máximo de la función en Vercel (segundos). Plan Hobby: hasta 60 sin Fluid Compute. */
export const maxDuration = 60;

/**
 * Cruce automático con la Google Sheet (lo llama Vercel Cron una vez al
 * día, ver vercel.json). Vercel envía "Authorization: Bearer CRON_SECRET";
 * sin esa clave nadie más puede ejecutarlo. Cada ejecución queda en la
 * tabla ejecuciones_cruce (se ve en /admin) y nunca corren dos a la vez.
 */
export async function GET(request: NextRequest) {
  if (!claveAutorizada(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const r = await cruceCompleto("cron");
    if (r.estado === "ocupado") {
      return NextResponse.json({ ok: true, omitido: "Ya había un cruce en curso" });
    }
    console.log("[cron cruce]", JSON.stringify(r.resumen));
    return NextResponse.json({ ok: true, resumen: r.resumen });
  } catch (e) {
    await registrarError("cron cruce", e, { guardar: true });
    return NextResponse.json({ ok: false, error: "El cruce falló. El detalle está en /admin." }, { status: 500 });
  }
}
