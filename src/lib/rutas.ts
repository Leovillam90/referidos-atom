// Sin imports: lo usan el servidor y las pruebas.

/**
 * Solo se permite volver a rutas internas (evita redirecciones a otros
 * sitios). Se arma la dirección completa y se compara el dominio: así no
 * pasan trucos como "//otro.com", "/\otro.com" o "https://otro.com".
 */
export function rutaInterna(siguiente: string | null, origen: string): string {
  if (!siguiente) return "/panel";
  try {
    const url = new URL(siguiente, origen);
    if (url.origin !== origen) return "/panel";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/panel";
  }
}
