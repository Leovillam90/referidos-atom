import "server-only";
import { logError, registrarError } from "@/lib/registro";

/**
 * Verificación anti-robots con Cloudflare Turnstile (gratis).
 * Se activa solo si están las DOS variables:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (clave del sitio, va al navegador)
 *   TURNSTILE_SECRET_KEY            (clave secreta, solo en el servidor)
 * Si falta alguna, los formularios funcionan igual sin la verificación
 * (y "npm run verificar" lo muestra como aviso).
 */
export function claveSitioTurnstile(): string | null {
  const sitio = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secreta = process.env.TURNSTILE_SECRET_KEY?.trim();
  return sitio && secreta ? sitio : null;
}

/** true si el visitante pasó la verificación (o si Turnstile no está configurado). */
export async function verificarTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secreta = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!claveSitioTurnstile() || !secreta) return true;
  if (!token) return false;

  try {
    const cuerpo = new URLSearchParams({ secret: secreta, response: token });
    if (ip) cuerpo.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    const datos = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!datos.success) logError("[turnstile] rechazado:", datos["error-codes"]);
    return datos.success === true;
  } catch (e) {
    // Si Cloudflare no responde, no se bloquea a las personas: los
    // límites por hora de la base de datos siguen protegiendo el formulario.
    void registrarError("turnstile sin respuesta", e, { guardar: true });
    return true;
  }
}
