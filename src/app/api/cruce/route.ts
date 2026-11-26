import { NextResponse, type NextRequest } from "next/server";
import { cruzarReferidos } from "@/lib/cruce";

/**
 * Cruce automático con la Google Sheet (lo llama Vercel Cron una vez al
 * día, ver vercel.json). Vercel envía "Authorization: Bearer CRON_SECRET";
 * sin esa clave nadie más puede ejecutarlo.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resumen = await cruzarReferidos();
    console.log("[cron cruce]", resumen);
    return NextResponse.json({ ok: true, resumen });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    console.error("[cron cruce]", mensaje);
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
