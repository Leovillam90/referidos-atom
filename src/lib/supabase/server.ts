import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el servidor que actúa "como el usuario
 * con sesión iniciada" (lee la sesión desde las cookies).
 * También respeta Row Level Security.
 */
export async function crearClienteServidor() {
  // La sesión se verifica comparando el vencimiento del token con la hora
  // actual (Date.now). Next.js no permite usar la hora mientras prepara la
  // página por adelantado (prefetch), así que esperamos a la visita real.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // Se ignora; la sesión se refresca en otra petición.
          }
        },
      },
    },
  );
}
