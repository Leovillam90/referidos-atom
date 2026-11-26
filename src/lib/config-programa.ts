/**
 * Enlaces de la página de gracias del referido.
 * Se pueden cambiar con variables de entorno sin tocar código.
 */
export const LINK_DROPI_ATOM = process.env.LINK_DROPI_ATOM?.trim() || null;

export const LINK_VIDEOS_ACTIVACION =
  process.env.LINK_VIDEOS_ACTIVACION?.trim() || "https://www.youtube.com/playlist?list=PLJxe4Q_nt4qE";

/** Números de WhatsApp para solicitar la capacitación (con indicativo 57). */
export const WHATSAPP_CAPACITACION = (process.env.WHATSAPP_CAPACITACION ?? "573122521130,573189762642")
  .split(",")
  .map((n) => n.replace(/\D/g, ""))
  .filter(Boolean);

export function linkWhatsApp(numero: string, plan: string | null) {
  const mensaje =
    `Hola, me registré en el programa de referidos de ATOM` +
    (plan ? ` y me interesa el ${plan}` : "") +
    `. Quiero solicitar mi capacitación.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** 573122521130 → 312 252 1130 */
export function formatoWhatsApp(numero: string) {
  const local = numero.startsWith("57") && numero.length === 12 ? numero.slice(2) : numero;
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : numero;
}

export function urlSitio() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
