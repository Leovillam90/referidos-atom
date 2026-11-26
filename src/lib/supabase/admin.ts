import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave SECRETA de Supabase. Ignora Row Level Security.
 * Solo se usa en el servidor para tareas controladas:
 *   - guardar el formulario público de referidos
 *   - guardar el resultado del cruce con la Google Sheet
 * El import "server-only" hace fallar la compilación si alguien
 * intenta usarlo en código que llega al navegador.
 */
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!clave) {
    throw new Error("Falta SUPABASE_SECRET_KEY en .env.local (o en las variables de Vercel)");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    clave,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
