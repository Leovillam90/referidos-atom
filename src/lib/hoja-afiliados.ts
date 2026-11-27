import "server-only";
import { auth, sheets } from "@googleapis/sheets";
import { leerConfigHoja } from "@/lib/config-hoja";
import { normalizarCorreoIdentidad } from "@/lib/identidad";
import { normalizarTelefono } from "@/lib/telefono";

export type Afiliado = {
  fila: number; // número de fila en la hoja (para poder buscarla a mano)
  plan: string | null; // el plan tal como está escrito en la hoja
  activo: boolean; // la columna de estado tiene el valor activo (ej. ACTIVE)
  fechaActivacion: string | null; // "AAAA-MM-DD" (solo si se configuró la columna)
  correo: string | null; // buyer_email normalizado (regla de identidad)
  telefono: string | null; // TELEFONO en el formato estándar (null si no es un número válido)
};

export type IndiceAfiliados = {
  porCorreo: Map<string, Afiliado>;
  porTelefono: Map<string, Afiliado>;
  filas: number;
  conFecha: boolean;
  /** Filas con algo escrito en TELEFONO que no es un número válido (se cruzan solo por buyer_email) */
  telefonosInvalidos: number;
};

/** "Valor Comisión " → "valor comision" (sin tildes, mayúsculas ni espacios extra). */
export function normalizarTitulo(t: unknown) {
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
 * Fecha de la hoja → "AAAA-MM-DD".
 * Acepta el número interno de Google Sheets (días desde 1899-12-30),
 * "2026-11-26", "26/11/2026" y "26-11-2026" (día primero, como en Colombia).
 */
export function fechaDeHoja(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = texto(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return armarFecha(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return armarFecha(+m[3], +m[2], +m[1]);
  return null;
}

function armarFecha(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/**
 * Lee la Google Sheet de afiliados (solo lectura) y arma un índice por
 * correo (con la regla de identidad: en Gmail no cuentan puntos ni "+")
 * y por teléfono en el formato estándar (normalizarTelefono: si trae
 * indicativo, con o sin "+", se detecta el país; si no, se asume
 * Colombia). Un TELEFONO inválido no hace fallar el cruce: se ignora,
 * la fila se cruza por buyer_email y se cuenta en telefonosInvalidos. Si un correo o teléfono se repite en la
 * hoja, cuenta la primera fila donde aparece.
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

  const columna = (nombre: string, variable: string) => {
    const i = titulosNorm.indexOf(normalizarTitulo(nombre));
    if (i < 0) {
      const encontrados = titulos.map((t) => `"${String(t)}"`).join(", ") || "(ninguno)";
      throw new Error(
        `La hoja no tiene la columna "${nombre}" (${variable}). Títulos encontrados en la primera fila: ${encontrados}.`,
      );
    }
    return i;
  };

  const c = {
    correo: columna(config.columnas.correo, "SHEET_COL_CORREO"),
    telefono: columna(config.columnas.telefono, "SHEET_COL_TELEFONO"),
    plan: columna(config.columnas.plan, "SHEET_COL_PLAN"),
    estado: columna(config.columnas.estado, "SHEET_COL_ESTADO"),
    fecha: config.columnas.fechaActivacion
      ? columna(config.columnas.fechaActivacion, "SHEET_COL_FECHA_ACTIVACION")
      : -1,
  };

  const porCorreo = new Map<string, Afiliado>();
  const porTelefono = new Map<string, Afiliado>();
  let telefonosInvalidos = 0;

  filas.forEach((fila, i) => {
    const telefonoHoja = texto(fila[c.telefono]);
    const afiliado: Afiliado = {
      fila: i + 2, // +1 por los títulos, +1 porque la hoja empieza en 1
      plan: texto(fila[c.plan]),
      activo: (texto(fila[c.estado]) ?? "").toLowerCase() === config.valorActivo,
      fechaActivacion: c.fecha >= 0 ? fechaDeHoja(fila[c.fecha]) : null,
      correo: normalizarCorreoIdentidad(texto(fila[c.correo])),
      telefono: normalizarTelefono(telefonoHoja),
    };
    if (telefonoHoja && !afiliado.telefono) telefonosInvalidos++;
    const { correo, telefono } = afiliado;
    if (correo && !porCorreo.has(correo)) porCorreo.set(correo, afiliado);
    if (telefono && !porTelefono.has(telefono)) porTelefono.set(telefono, afiliado);
  });

  return { porCorreo, porTelefono, filas: filas.length, conFecha: c.fecha >= 0, telefonosInvalidos };
}
