// Sin imports: lo usan la exportación de /admin y las pruebas.

/** `{ digitos }`: número largo que Excel debe dejar como texto (el celular). */
export type Celda = string | number | null | undefined | { digitos: string };

/**
 * ¿Excel (o Google Sheets / LibreOffice) lo interpretaría como fórmula?
 * Empieza (después de espacios) por = + - @, tabulador o retorno, o por
 * sus versiones "anchas" (＝ ＋ － ＠).
 */
const PARECE_FORMULA = /^[\s ]*[=+\-@＝＋－＠]|^[\t\r\n]/;

/** Texto seguro para una celda: si parece fórmula, se le antepone ' (Excel lo muestra como texto). */
export function celdaSegura(t: string): string {
  const v = PARECE_FORMULA.test(t) ? `'${t}` : t;
  return /[";\n\r]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV para Excel en español (Colombia): ";" separa columnas y "," los
 * decimales. Los celulares van como ="573104827756" para que Excel no los
 * convierta en número (solo si son SOLO dígitos; si no, van como texto
 * protegido, igual que cualquier otro valor escrito por una persona).
 */
export function aCsv(filas: Celda[][]): string {
  return filas
    .map((fila) =>
      fila
        .map((celda) => {
          if (celda === null || celda === undefined) return "";
          if (typeof celda === "number") return Number.isFinite(celda) ? String(celda).replace(".", ",") : "";
          if (typeof celda === "object") {
            return /^\d{1,20}$/.test(celda.digitos) ? `"=""${celda.digitos}"""` : celdaSegura(celda.digitos);
          }
          return celdaSegura(celda);
        })
        .join(";"),
    )
    .join("\r\n");
}
