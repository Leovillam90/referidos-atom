import { formatoTelefono, normalizarTelefono } from "./telefono";

/**
 * Enlaces de la página de gracias del referido.
 * Se pueden cambiar con variables de entorno sin tocar código.
 */
export const LINK_DROPI_ATOM = process.env.LINK_DROPI_ATOM?.trim() || null;

export const LINK_VIDEOS_ACTIVACION =
  process.env.LINK_VIDEOS_ACTIVACION?.trim() || "https://www.youtube.com/playlist?list=PLJxe4Q_nt4qE";

/**
 * Números de WhatsApp para solicitar la capacitación, en el formato
 * estándar (E.164 sin "+"; sin indicativo se asume Colombia).
 */
export const WHATSAPP_CAPACITACION = (process.env.WHATSAPP_CAPACITACION ?? "573122521130,573189762642")
  .split(",")
  .map((n) => normalizarTelefono(n))
  .filter((n): n is string => Boolean(n));

export function linkWhatsApp(numero: string, plan: string | null) {
  const mensaje =
    `Hola, me registré en el programa de referidos de ATOM` +
    (plan ? ` y me interesa el ${plan}` : "") +
    `. Quiero solicitar mi capacitación.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** WhatsApp para dudas sobre el registro (el primer número de WHATSAPP_CAPACITACION). */
export function linkWhatsAppAyuda() {
  const numero = WHATSAPP_CAPACITACION[0];
  if (!numero) return null;
  const mensaje = "Hola, tengo una duda sobre mi registro en el programa de referidos de ATOM.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** 573122521130 → +57 312 252 1130 */
export function formatoWhatsApp(numero: string) {
  return formatoTelefono(numero);
}

export { urlSitio } from "./sitio";
