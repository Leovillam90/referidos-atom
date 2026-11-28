import { createBrowserClient } from "@supabase/ssr";
import { OPCIONES_COOKIE } from "@/lib/supabase/cookies";

/**
 * Cliente de Supabase para el navegador.
 * Usa solo la clave pública: lo que puede ver queda limitado por
 * las reglas de Row Level Security definidas en supabase/schema.sql.
 */
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: OPCIONES_COOKIE },
  );
}
