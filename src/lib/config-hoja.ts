import "server-only";

/**
 * Configuración de la Google Sheet de afiliados ATOM.
 * Todo viene de variables de entorno del servidor; nada de esto
 * llega al navegador.
 */
function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor || !valor.trim()) {
    throw new Error(`Falta la variable de entorno ${nombre} (revisa .env.local)`);
  }
  return valor.trim();
}

export function leerConfigHoja() {
  return {
    cuentaServicio: requerida("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    // En Vercel/.env la llave viene con "\n" escritos como texto.
    llavePrivada: requerida("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    idHoja: requerida("GOOGLE_SHEET_ID"),
    rango: requerida("GOOGLE_SHEET_RANGE"),
    columnas: {
      correo: requerida("SHEET_COL_CORREO"),
      telefono: requerida("SHEET_COL_TELEFONO"),
      plan: requerida("SHEET_COL_PLAN"),
    },
  };
}
