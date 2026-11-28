// Sin "server-only": lo usan el servidor y las pruebas.
import { randomBytes } from "node:crypto";

/**
 * Código corto para rastrear un error inesperado (ej. "R-4F2A").
 * Se le muestra a la persona y queda en el log de Vercel y en
 * errores_sistema: si escribe por WhatsApp con el código, se busca así
 * en Vercel → Logs.
 */
export function codigoReferencia(): string {
  return `R-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export const FORMATO_CODIGO_REFERENCIA = /^R-[0-9A-F]{4}$/;
