import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ¿El encabezado "Authorization: Bearer ..." trae la clave esperada?
 * Se compara a tiempo constante (no se puede adivinar letra por letra
 * midiendo cuánto tarda la respuesta). Sin clave configurada, nadie pasa.
 */
export function claveAutorizada(encabezado: string | null, esperada: string | undefined): boolean {
  const clave = esperada?.trim();
  if (!clave || clave.length < 16 || !encabezado?.startsWith("Bearer ")) return false;
  const recibida = encabezado.slice("Bearer ".length).trim();
  const a = createHash("sha256").update(recibida).digest();
  const b = createHash("sha256").update(clave).digest();
  return timingSafeEqual(a, b);
}
