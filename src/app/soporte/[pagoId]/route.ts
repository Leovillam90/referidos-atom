import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Abre el soporte de un pago con un link temporal firmado (60 segundos).
 * Todo se hace con la sesión del usuario, así que Row Level Security
 * decide: el referente solo obtiene los soportes de SUS pagos y el
 * super_admin, los de todos. A nadie más se le genera el link.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/soporte/[pagoId]">) {
  const { pagoId } = await ctx.params;
  const supabase = await crearClienteServidor();

  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user) return NextResponse.redirect(new URL("/ingresar", request.url));

  const { data: pago } = await supabase
    .from("pagos")
    .select("soporte_path")
    .eq("id", pagoId)
    .maybeSingle<{ soporte_path: string }>();

  if (!pago) return new NextResponse("Soporte no encontrado", { status: 404 });

  const { data, error } = await supabase.storage
    .from("soportes-pagos")
    .createSignedUrl(pago.soporte_path, 60);

  if (error || !data?.signedUrl) {
    console.error("[soporte] link firmado:", error?.message);
    return new NextResponse("No se pudo abrir el soporte", { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
