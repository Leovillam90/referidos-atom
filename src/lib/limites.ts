import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/registro";

/**
 * Intentos por IP y por hora en los formularios de acceso (además del
 * límite propio de Supabase Auth y de Turnstile). El formulario de
 * referidos usa la regla max_registros_por_link_por_hora de /admin/reglas.
 */
export const INTENTOS_POR_HORA = {
  ingreso: 10, // pedir link o código de acceso
  registro_referente: 10, // formulario /registro
} as const;

/**
 * true si la IP todavía puede intentarlo (y anota el intento). Si la base
 * no responde, deja pasar: Supabase Auth tiene su propio límite.
 */
export async function permitirIntento(tipo: keyof typeof INTENTOS_POR_HORA, ip: string | null): Promise<boolean> {
  const { data, error } = await crearClienteAdmin().rpc("registrar_intento", {
    p_tipo: tipo,
    p_ip: ip,
    p_max: INTENTOS_POR_HORA[tipo],
  });
  if (error) {
    await registrarError(`limite ${tipo}`, error);
    return true;
  }
  return data !== false;
}
