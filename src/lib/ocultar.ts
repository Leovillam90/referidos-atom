// Sin imports: lo usan el servidor, los scripts y las pruebas.

/**
 * Registro de errores SIN datos personales (Ley 1581).
 * Los mensajes de servicios externos (SMTP, Google, Supabase) a veces
 * traen el correo o el celular de la persona; antes de escribirlos en los
 * logs de Vercel o en la tabla errores_sistema se tapan:
 *   "550 user ana.perez@gmail.com unknown" → "550 user a•••@gmail.com unknown"
 *   "telefono 573104827756"                → "telefono 57•••••••756"
 */
export function ocultarDatos(texto: string): string {
  return texto
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1•••@$2")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => {
      const d = m.replace(/\D/g, "");
      return d.length < 8 ? m : `${d.slice(0, 2)}${"•".repeat(Math.max(3, d.length - 5))}${d.slice(-3)}`;
    })
    // Llaves o tokens largos que pudieran venir en un mensaje
    .replace(/\b(sb_secret_|sb_publishable_|eyJ)[A-Za-z0-9._-]{10,}/g, "$1•••")
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[llave oculta]");
}

export function textoError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
