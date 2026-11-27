/**
 * Identidad de una persona en el programa.
 *
 * Cada persona (referente, referido o fila de la hoja de afiliados) tiene
 * un CONJUNTO de identificadores normalizados: su correo, su teléfono y su
 * cuenta Dropi. Dos personas son "la misma" si CUALQUIER identificador de
 * una coincide con CUALQUIER identificador de la otra, sin importar en qué
 * campo se escribió (el correo puesto como cuenta Dropi también cuenta).
 *
 * Estas reglas deben coincidir con public.normalizar_correo_identidad(),
 * public.normalizar_dropi(), public.normalizar_dropi_telefono() y
 * public.identificadores_persona() en supabase/schema.sql: la base de
 * datos es la que manda; aquí se usan para dar mensajes claros y para el
 * cruce con la hoja.
 *
 * Este archivo no importa nada (ni "server-only" ni atajos "@/..."):
 * así lo pueden usar las pruebas y los scripts de la terminal.
 */
import { normalizarTelefono } from "./telefono";

/** " Ana.Perez+atom@Gmail.com " → "anaperez@gmail.com" (en Gmail no cuentan los puntos ni lo de después de "+"). */
export function normalizarCorreoIdentidad(valor: string | null | undefined): string | null {
  const v = (valor ?? "").replace(/\s/g, "").toLowerCase();
  if (!v) return null;
  const [usuario, dominio] = v.split("@");
  if (dominio === "gmail.com" || dominio === "googlemail.com") {
    return `${usuario.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return v;
}

const DROPI_SIN_DATO =
  /^(no|na|n\/a|nn|ninguno|ninguna|notengo.*|aunnotengo.*|todaviano.*|pendiente.*|sincuenta.*|x+|-+|\.+|0+|null|none)$/;

/**
 * Cuenta Dropi comparable: minúsculas y sin espacios; si parece correo, se
 * normaliza como correo. Respuestas como "no tengo" no identifican a nadie:
 * devuelve null.
 */
export function normalizarDropi(valor: string | null | undefined): string | null {
  const v = (valor ?? "").replace(/\s/g, "").toLowerCase();
  if (!v || v.length < 3 || DROPI_SIN_DATO.test(v)) return null;
  if (v.indexOf("@") > 0) return normalizarCorreoIdentidad(v);
  return v.replace(/^@+/, "");
}

/**
 * Si la cuenta Dropi parece un teléfono ("+57 310 482 7756"), también se
 * compara como teléfono, en el formato estándar ("573104827756"). Si no, null.
 */
export function normalizarDropiTelefono(valor: string | null | undefined): string | null {
  const v = (valor ?? "").replace(/\s/g, "");
  if (!/^\+?[0-9().-]+$/.test(v)) return null;
  const tel = normalizarTelefono(v);
  return tel && tel.length >= 7 ? tel : null;
}

export type DatosPersona = {
  correo?: string | null;
  telefono?: string | null;
  cuenta_dropi?: string | null;
};

/** Conjunto de identificadores normalizados de una persona (sin repetidos, ordenado). */
export function identificadoresPersona(p: DatosPersona): string[] {
  const ids = [
    normalizarCorreoIdentidad(p.correo),
    normalizarTelefono(p.telefono),
    normalizarDropi(p.cuenta_dropi),
    normalizarDropiTelefono(p.cuenta_dropi),
  ].filter((x): x is string => Boolean(x));
  return [...new Set(ids)].sort();
}

/** Identificadores de una fila de la hoja de afiliados (buyer_email y TELEFONO). */
export function identificadoresHoja(correo: string | null | undefined, telefono: string | null | undefined): string[] {
  return identificadoresPersona({ correo, telefono });
}

/** ¿Algún identificador de A coincide con alguno de B? (todas las combinaciones) */
export function coinciden(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const conjunto = new Set(a);
  return b.some((x) => conjunto.has(x));
}

/** ¿Son la misma persona? */
export function mismaPersona(a: DatosPersona, b: DatosPersona): boolean {
  return coinciden(identificadoresPersona(a), identificadoresPersona(b));
}

/**
 * Busca a un referido en el índice de la hoja usando TODOS sus
 * identificadores: primero como correo, luego como teléfono.
 */
export function buscarEnHoja<A>(
  ids: readonly string[],
  indice: { porCorreo: Map<string, A>; porTelefono: Map<string, A> },
): { afiliado: A; cruce_por: "correo" | "telefono" } | null {
  for (const id of ids) {
    const a = indice.porCorreo.get(id);
    if (a) return { afiliado: a, cruce_por: "correo" };
  }
  for (const id of ids) {
    const a = indice.porTelefono.get(id);
    if (a) return { afiliado: a, cruce_por: "telefono" };
  }
  return null;
}

/**
 * Regla del cruce: si la fila de la hoja (buyer_email o TELEFONO) coincide
 * con cualquier identificador del REFERENTE, es un posible auto-referido.
 * La base de datos vuelve a hacer esta comparación en aplicar_cruce().
 */
export function esPosibleAutoReferido(idsHoja: readonly string[], idsReferente: readonly string[]): boolean {
  return coinciden(idsHoja, idsReferente);
}

/** ¿El correo es de alguno de los dominios (lista separada por comas)? Acepta subdominios. */
export function esDominioExcluido(correo: string, dominios: string): boolean {
  const dominio = correo.trim().toLowerCase().split("@")[1] ?? "";
  if (!dominio) return false;
  return dominios
    .toLowerCase()
    .replace(/\s/g, "")
    .split(",")
    .map((d) => d.replace(/^@+/, ""))
    .filter(Boolean)
    .some((d) => dominio === d || dominio.endsWith(`.${d}`));
}
