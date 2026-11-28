/**
 * Opciones de la cookie de sesión de Supabase (se suman a las de la
 * librería: path=/, 400 días). En producción (https) va con Secure: el
 * navegador nunca la envía por una conexión sin cifrar. SameSite=Lax
 * evita que otros sitios la usen en envíos de formularios.
 * No es HttpOnly porque el navegador la necesita para entrar con el código
 * del correo y para avisar a la otra pestaña (src/components/aviso-enviado.tsx).
 */
export const OPCIONES_COOKIE = {
  sameSite: "lax" as const,
  secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
};
