/**
 * CELULAR: una sola forma de leer, validar y guardar teléfonos en todo el
 * sistema (formularios, identidad, cruce con la hoja, exportación,
 * WhatsApp y pantallas). Usa libphonenumber-js con la metadata "max":
 * las reglas de cada país NO se programan a mano.
 *
 * Formato estándar = E.164 SIN el "+": indicativo + número nacional, solo
 * dígitos. Ej.: Colombia 573104827756, México 525512345678, Argentina
 * 5491123456789. El país (CO, MX, AR…) se guarda aparte.
 *
 * La base de datos repite las mismas reglas (public.problema_telefono en
 * supabase/schema.sql, con los patrones que genera
 * "npm run generar-sql-telefono").
 *
 * Este archivo no importa nada del servidor ni usa atajos "@/...": lo
 * usan el navegador, el servidor, las pruebas y los scripts.
 */
import { parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from "libphonenumber-js/max";

export type Pais = {
  iso: CountryCode;
  nombre: string;
  indicativo: string;
  /** Ejemplo de celular (número nacional, solo dígitos). Nunca una secuencia: lo revisan las pruebas. */
  ejemplo: string;
};

/**
 * Países aceptados: Colombia primero y el resto en orden alfabético.
 * Los ejemplos de la librería (getExampleNumber) casi siempre son
 * secuencias como 321 1234567, que estas mismas reglas rechazan; por eso
 * cada país tiene uno propio, válido para la librería (lo revisa
 * tests/telefono.test.ts).
 */
export const PAISES = [
  { iso: "CO", nombre: "Colombia", indicativo: "57", ejemplo: "3104827756" },
  { iso: "AR", nombre: "Argentina", indicativo: "54", ejemplo: "91148273956" },
  { iso: "BO", nombre: "Bolivia", indicativo: "591", ejemplo: "71482735" },
  { iso: "BR", nombre: "Brasil", indicativo: "55", ejemplo: "11984827395" },
  { iso: "CL", nombre: "Chile", indicativo: "56", ejemplo: "948273956" },
  { iso: "CR", nombre: "Costa Rica", indicativo: "506", ejemplo: "84827395" },
  { iso: "CU", nombre: "Cuba", indicativo: "53", ejemplo: "54827395" },
  { iso: "EC", nombre: "Ecuador", indicativo: "593", ejemplo: "984827395" },
  { iso: "SV", nombre: "El Salvador", indicativo: "503", ejemplo: "74827395" },
  { iso: "ES", nombre: "España", indicativo: "34", ejemplo: "648273956" },
  { iso: "US", nombre: "Estados Unidos", indicativo: "1", ejemplo: "2014827395" },
  { iso: "GT", nombre: "Guatemala", indicativo: "502", ejemplo: "54827395" },
  { iso: "HN", nombre: "Honduras", indicativo: "504", ejemplo: "94827395" },
  { iso: "MX", nombre: "México", indicativo: "52", ejemplo: "5548273956" },
  { iso: "NI", nombre: "Nicaragua", indicativo: "505", ejemplo: "84827395" },
  { iso: "PA", nombre: "Panamá", indicativo: "507", ejemplo: "64827395" },
  { iso: "PY", nombre: "Paraguay", indicativo: "595", ejemplo: "984827395" },
  { iso: "PE", nombre: "Perú", indicativo: "51", ejemplo: "948273956" },
  { iso: "PR", nombre: "Puerto Rico", indicativo: "1", ejemplo: "7874827395" },
  { iso: "DO", nombre: "República Dominicana", indicativo: "1", ejemplo: "8094827395" },
  { iso: "UY", nombre: "Uruguay", indicativo: "598", ejemplo: "94827395" },
  { iso: "VE", nombre: "Venezuela", indicativo: "58", ejemplo: "4124827395" },
] as const satisfies readonly Pais[];

export type CodigoPais = (typeof PAISES)[number]["iso"];
export const PAIS_POR_DEFECTO: CodigoPais = "CO";

const POR_ISO = new Map<string, Pais>(PAISES.map((p) => [p.iso, p]));

export function esPaisPermitido(v: unknown): v is CodigoPais {
  return typeof v === "string" && POR_ISO.has(v);
}

export function datosPais(iso: CodigoPais): Pais {
  return POR_ISO.get(iso)!;
}

// ---------------------------------------------------------------------
// Números falsos (se revisa el número NACIONAL, sin indicativo)
// ---------------------------------------------------------------------

/**
 * ¿Es un número inventado? Se rechaza si:
 *  - tiene el mismo dígito 7 o más veces seguidas;
 *  - tiene el mismo dígito en el 80 % o más de sus posiciones;
 *  - tiene una secuencia ascendente o descendente de 6 o más dígitos;
 *  - es un patrón repetido (3003003003, 3121212121, 3123123123).
 * Debe coincidir con public.telefono_es_falso() en supabase/schema.sql.
 */
export function esNumeroFalso(nacional: string): boolean {
  const d = nacional.replace(/\D/g, "");
  const n = d.length;
  if (n === 0) return true;

  // Mismo dígito seguido 7+ veces y secuencias de 6+
  let igual = 1;
  let sube = 1;
  let baja = 1;
  for (let i = 1; i < n; i++) {
    const dif = Number(d[i]) - Number(d[i - 1]);
    igual = dif === 0 ? igual + 1 : 1;
    sube = dif === 1 ? sube + 1 : 1;
    baja = dif === -1 ? baja + 1 : 1;
    if (igual >= 7 || sube >= 6 || baja >= 6) return true;
  }

  // Mismo dígito en el 80 % o más de las posiciones
  const cuenta = new Map<string, number>();
  for (const c of d) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  if (Math.max(...cuenta.values()) * 5 >= n * 4) return true;

  // Patrón repetido: el número (o el número sin su primer dígito, que en
  // muchos países indica que es celular) es un bloque de 2 a 4 dígitos
  // repetido al menos 3 veces.
  for (const inicio of [0, 1]) {
    const s = d.slice(inicio);
    for (let p = 2; p <= 4 && p * 3 <= s.length; p++) {
      let periodico = true;
      for (let i = p; i < s.length && periodico; i++) periodico = s[i] === s[i - p];
      if (periodico) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Lectura con la librería
// ---------------------------------------------------------------------

/**
 * Lee lo que escribió la persona. Acepta espacios, guiones, paréntesis,
 * "+" o "00" antes del indicativo. Con `pais` se interpreta como número
 * de ese país si no trae "+".
 */
function leerNumero(valor: string, pais?: CodigoPais): PhoneNumber | undefined {
  let texto = (valor ?? "").trim();
  if (!texto || /[a-z]/i.test(texto)) return undefined;
  // "0057 320…" → "+57 320…" (el 00 internacional)
  const digitos = texto.replace(/\D/g, "");
  if (!texto.startsWith("+") && digitos.startsWith("00")) texto = `+${digitos.slice(2)}`;

  const numero = parsePhoneNumberFromString(texto, pais ? { defaultCountry: pais } : undefined);
  return ajustarArgentina(numero);
}

/**
 * Argentina: los celulares llevan un 9 después del 54 (+54 9 11…). Si la
 * persona lo escribe sin el 9 ("11 2345 6789") la librería lo lee como
 * fijo; si con el 9 es un celular válido, se usa ese.
 */
function ajustarArgentina(numero: PhoneNumber | undefined): PhoneNumber | undefined {
  if (!numero || numero.countryCallingCode !== "54" || numero.nationalNumber.startsWith("9")) return numero;
  const tipo = numero.getType();
  if (tipo === "MOBILE" || tipo === "FIXED_LINE_OR_MOBILE") return numero;
  const conNueve = parsePhoneNumberFromString(`+549${numero.nationalNumber}`);
  return conNueve?.isValid() && conNueve.getType() === "MOBILE" ? conNueve : numero;
}

const sinMas = (n: PhoneNumber) => n.number.slice(1);

function paisDelNumero(n: PhoneNumber): CodigoPais | null {
  const c = n.country;
  return esPaisPermitido(c) ? c : null;
}

// ---------------------------------------------------------------------
// Validación del formulario (referentes y referidos)
// ---------------------------------------------------------------------

export type MotivoRechazo = "vacio" | "invalido" | "otro_pais" | "fijo" | "falso" | "bloqueado";

export type ResultadoCelular =
  | { ok: true; telefono: string; pais: CodigoPais; nacional: string }
  | { ok: false; pais: CodigoPais; motivo: MotivoRechazo; mensaje: string };

/** Mensaje único de rechazo: "Escribe un celular válido de Colombia, por ejemplo 310 482 7756". */
export function mensajeCelular(pais: CodigoPais) {
  return `Escribe un celular válido de ${datosPais(pais).nombre}, por ejemplo ${ejemploCelular(pais)}`;
}

/**
 * Valida el celular del formulario para el país elegido y lo deja en el
 * formato estándar. Si la persona escribió "+" con el indicativo de otro
 * país de la lista, se toma ese país (el formulario cambia el selector).
 * La lista de números bloqueados se revisa en el servidor y en la base.
 */
export function validarCelular(valor: string | null | undefined, paisElegido: string | null | undefined): ResultadoCelular {
  const elegido = esPaisPermitido(paisElegido) ? paisElegido : PAIS_POR_DEFECTO;
  const no = (pais: CodigoPais, motivo: MotivoRechazo): ResultadoCelular => ({
    ok: false,
    pais,
    motivo,
    mensaje: mensajeCelular(pais),
  });

  if (!(valor ?? "").trim()) return no(elegido, "vacio");
  const numero = leerNumero(valor ?? "", elegido);
  if (!numero) return no(elegido, "invalido");

  const pais = paisDelNumero(numero);
  if (!pais) return no(elegido, numero.country ? "otro_pais" : "invalido");
  if (!numero.isValid()) return no(pais, "invalido");

  const tipo = numero.getType();
  if (tipo !== "MOBILE" && tipo !== "FIXED_LINE_OR_MOBILE") return no(pais, "fijo");
  if (esNumeroFalso(numero.nationalNumber)) return no(pais, "falso");

  return { ok: true, telefono: sinMas(numero), pais, nacional: numero.nationalNumber };
}

/**
 * Si lo escrito empieza por "+" (o "00") con el indicativo de un país de
 * la lista, devuelve ese país (para cambiar el selector). Si no, null.
 */
export function detectarPais(valor: string | null | undefined): CodigoPais | null {
  const t = (valor ?? "").trim();
  if (!t.startsWith("+") && !t.replace(/[\s().-]/g, "").startsWith("00")) return null;
  const numero = leerNumero(t);
  return numero ? paisDelNumero(numero) : null;
}

// ---------------------------------------------------------------------
// Normalización general (hoja de activos, cuenta Dropi, datos guardados)
// ---------------------------------------------------------------------

/**
 * Formato estándar de cualquier teléfono, sin importar de dónde venga:
 *  - con "+" o "00": se detecta el país con la librería;
 *  - sin indicativo: se asume Colombia (3104827756 → 573104827756);
 *  - con indicativo pero sin "+" (525512345678): se detecta el país.
 * Devuelve null si no es un número válido (así se ignora en el cruce).
 *   "+57 310 482 7756" → "573104827756"
 *   "0057 3204417893"  → "573204417893"
 */
export function normalizarTelefono(valor: string | number | null | undefined): string | null {
  const texto = String(valor ?? "").trim();
  const d = texto.replace(/\D/g, "");
  if (!d) return null;

  const valido = (n: PhoneNumber | undefined) => (n?.isValid() ? sinMas(n) : null);
  if (texto.startsWith("+") || d.startsWith("00")) return valido(leerNumero(texto));
  return valido(leerNumero(d, "CO")) ?? valido(leerNumero(`+${d}`));
}

/**
 * Formato estándar SIN exigir que sea un celular válido: solo que tenga
 * una longitud posible para el país. Es para la lista de números
 * bloqueados, que justamente guarda números inventados.
 */
export function formatoEstandarPosible(valor: string | null | undefined, pais: string | null | undefined): string | null {
  const n = leerNumero(valor ?? "", esPaisPermitido(pais) ? pais : PAIS_POR_DEFECTO);
  return n?.isPossible() ? sinMas(n) : null;
}

/** País de un teléfono en formato estándar (573104827756 → "CO"). */
export function paisDeTelefono(telefono: string | null | undefined): CodigoPais | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (!d) return null;
  const n = parsePhoneNumberFromString(`+${d}`);
  return n ? paisDelNumero(n) : null;
}

// ---------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------

/** Colombia se muestra 3-3-4 (310 482 7756); los demás, como la librería. */
function agruparNacional(n: PhoneNumber): string {
  if (n.countryCallingCode === "57" && n.nationalNumber.length === 10) {
    const d = n.nationalNumber;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return n.formatInternational().replace(/^\+\d+\s*/, "");
}

/** Ejemplo para el placeholder: Colombia "310 482 7756", México "55 4827 3956"… */
export function ejemploCelular(pais: CodigoPais): string {
  const p = datosPais(pais);
  const n = parsePhoneNumberFromString(`+${p.indicativo}${p.ejemplo}`);
  if (!n) return p.ejemplo;
  const texto = agruparNacional(n);
  // Argentina: se escribe sin el 9 de celular (lo agrega el sistema)
  return pais === "AR" ? texto.replace(/^9\s+/, "") : texto;
}

/**
 * Para mostrar en pantalla: "573104827756" → "+57 310 482 7756".
 * Si no se puede leer (dato viejo), devuelve el texto tal cual.
 */
export function formatoTelefono(telefono: string | null | undefined): string {
  const t = (telefono ?? "").trim();
  if (!t) return "";
  const estandar = /^\d+$/.test(t) ? t : normalizarTelefono(t);
  const n = estandar ? parsePhoneNumberFromString(`+${estandar}`) : undefined;
  if (!n) return t;
  return `+${n.countryCallingCode} ${agruparNacional(n)}`;
}

/** Link de WhatsApp: wa.me/ + formato estándar (null si el número no es válido). */
export function linkWhatsAppTelefono(telefono: string | null | undefined, mensaje?: string): string | null {
  const estandar = normalizarTelefono(telefono);
  if (!estandar) return null;
  return `https://wa.me/${estandar}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
}

/** Bandera como emoji (🇨🇴). En Windows algunos navegadores muestran las letras. */
export function emojiBandera(iso: string) {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

// ---------------------------------------------------------------------
// Correo (se queda aquí por compatibilidad con los imports existentes)
// ---------------------------------------------------------------------
export function normalizarCorreo(valor: string | null | undefined): string | null {
  const c = (valor ?? "").trim().toLowerCase();
  return c || null;
}
