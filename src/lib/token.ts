import "server-only";
import { createHash } from "node:crypto";

/** Huella (sha256) del token de confirmación: en la base de datos solo se guarda esto. */
export function huellaToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Los tokens son 32 bytes en base64url (43 caracteres). */
export const TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/;
