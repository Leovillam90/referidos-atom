/**
 * Dirección pública de la app. Todo link absoluto (link de referido,
 * botones de los correos, confirmaciones, imagen para compartir) sale de
 * aquí, a partir de NEXT_PUBLIC_SITE_URL.
 *
 * Sin dependencias para que también funcione desde la terminal
 * (npm run verificar y los scripts).
 */

/** Dominio de producción. npm run verificar exige que NEXT_PUBLIC_SITE_URL sea este en producción. */
export const SITIO_PRODUCCION = "https://referidos.atomsolutionsdata.com";

/** NEXT_PUBLIC_SITE_URL sin "/" final (si falta: el dominio en producción, localhost en desarrollo). */
export function urlSitio() {
  const valor = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (valor) return valor.replace(/\/+$/, "");
  return process.env.VERCEL_ENV === "production" ? SITIO_PRODUCCION : "http://localhost:3000";
}
