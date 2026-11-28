import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { rutaInterna } from "@/lib/rutas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { logError } from "@/lib/registro";

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

  const destino = rutaInterna(searchParams.get("next"), origin);

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
    logError("[auth/confirm]", error);
    return NextResponse.redirect(new URL("/auth/error", origin));
  }

  // "bienvenida=1": el panel muestra "Ya puedes cerrar la otra pestaña" y
  // avisa a la pestaña donde se pidió el link (ver AvisoBienvenida).
  const url = new URL(destino, origin);
  url.searchParams.set("bienvenida", "1");
  return NextResponse.redirect(url);
}

