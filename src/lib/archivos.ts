// Sin imports: lo usan el servidor y las pruebas.

/**
 * Tipo REAL de un archivo por sus primeros bytes ("firma"), sin creer en
 * la extensión ni en lo que diga el navegador. Solo reconoce los tipos
 * permitidos para los soportes de pago; cualquier otra cosa → null.
 */
export function tipoRealSoporte(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  const empieza = (firma: number[], desde = 0) => firma.every((b, i) => bytes[desde + i] === b);
  if (empieza([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  if (empieza([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}
