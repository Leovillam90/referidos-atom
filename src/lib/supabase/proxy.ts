import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { OPCIONES_COOKIE } from "@/lib/supabase/cookies";

/** Rutas que exigen haber iniciado sesión. */
const RUTAS_PROTEGIDAS = ["/panel", "/admin", "/soporte"];

/**
 * Se ejecuta antes de cada página:
 *  1. Renueva la sesión de Supabase (las cookies vencen cada hora).
 *  2. Si alguien sin sesión intenta entrar al panel, lo manda a /ingresar.
 * Es solo un filtro rápido: cada página vuelve a verificar la sesión.
 */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: OPCIONES_COOKIE,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Importante: no poner código entre createServerClient y getClaims().
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims);

  const ruta = request.nextUrl.pathname;
  const protegida = RUTAS_PROTEGIDAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));

  if (protegida && !conSesion) {
    const url = request.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = "";
    const redireccion = NextResponse.redirect(url);
    // Conservar las cookies que Supabase haya actualizado
    respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
    return redireccion;
  }

  return respuesta;
}
