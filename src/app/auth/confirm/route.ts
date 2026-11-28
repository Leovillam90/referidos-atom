import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Aquí llega la persona cuando hace clic en el link mágico del correo.
 * Acepta los dos formatos que puede enviar Supabase:
 *   ?token_hash=...&type=email  (plantilla recomendada; funciona en cualquier navegador)
 *   ?code=...                   (plantilla por defecto; mismo navegador donde se pidió)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = (searchParams.get("type") ?? "email") as EmailOtpType;
  const codigo = searchParams.get("code");

  // Solo se permite volver a rutas internas (evita redirecciones a otros sitios)
  const siguiente = searchParams.get("next") ?? "/panel";
  const destino = siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/panel";

  const supabase = await crearClienteServidor();

  let error: unknown = null;
  if (tokenHash) {
    ({ error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash }));
  } else if (codigo) {
    ({ error } = await supabase.auth.exchangeCodeForSession(codigo));
  } else {
    error = new Error("Link sin token");
  }

  if (error) {
    console.error("[auth/confirm]", error);
    return NextResponse.redirect(new URL("/auth/error", origin));
  }

  // "bienvenida=1": el panel muestra "Ya puedes cerrar la otra pestaña" y
  // avisa a la pestaña donde se pidió el link (ver AvisoBienvenida).
  const url = new URL(destino, origin);
  url.searchParams.set("bienvenida", "1");
  return NextResponse.redirect(url);
}
