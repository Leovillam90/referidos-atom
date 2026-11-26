import "server-only";
import { auth, sheets } from "@googleapis/sheets";
import { leerConfigHoja } from "@/lib/config-hoja";
import { normalizarCorreo, normalizarTelefono } from "@/lib/telefono";

export type Afiliado = {
  fila: number; // número de fila en la hoja (para poder buscarla a mano)
  plan: string | null; // el plan tal como está escrito en la hoja
};

export type IndiceAfiliados = {
  porCorreo: Map<string, Afiliado>;
  porTelefono: Map<string, Afiliado>;
  filas: number;
};

/** "Valor Comisión " → "valor comision" (sin tildes, mayúsculas ni espacios extra). */
function normalizarTitulo(t: unknown) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Lee la Google Sheet de afiliados (solo lectura) y arma un índice
 * por correo y por teléfono normalizado. Si un correo o teléfono se
 * repite en la hoja, cuenta la primera fila donde aparece.
 */
export async function leerAfiliados(): Promise<IndiceAfiliados> {
  const config = leerConfigHoja();

  const cliente = new auth.JWT({
    email: config.cuentaServicio,
    key: config.llavePrivada,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const respuesta = await sheets({ version: "v4", auth: cliente }).spreadsheets.values.get({
    spreadsheetId: config.idHoja,
    range: config.rango,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const [titulos = [], ...filas] = (respuesta.data.values ?? []) as unknown[][];
  const titulosNorm = titulos.map(normalizarTitulo);

  const columna = (nombre: string) => {
    const i = titulosNorm.indexOf(normalizarTitulo(nombre));
    if (i < 0) {
      const encontrados = titulos.map((t) => `"${String(t)}"`).join(", ") || "(ninguno)";
      throw new Error(
        `La hoja no tiene la columna "${nombre}". Títulos encontrados en la primera fila: ${encontrados}. ` +
          "Revisa las variables SHEET_COL_*.",
      );
    }
    return i;
  };

  const c = {
    correo: columna(config.columnas.correo),
    telefono: columna(config.columnas.telefono),
    plan: columna(config.columnas.plan),
  };

  const porCorreo = new Map<string, Afiliado>();
  const porTelefono = new Map<string, Afiliado>();

  filas.forEach((fila, i) => {
    const afiliado: Afiliado = {
      fila: i + 2, // +1 por los títulos, +1 porque la hoja empieza en 1
      plan: texto(fila[c.plan]),
    };
    const correo = normalizarCorreo(texto(fila[c.correo]));
    const telefono = normalizarTelefono(texto(fila[c.telefono]));
    if (correo && !porCorreo.has(correo)) porCorreo.set(correo, afiliado);
    if (telefono && !porTelefono.has(telefono)) porTelefono.set(telefono, afiliado);
  });

  return { porCorreo, porTelefono, filas: filas.length };
}
