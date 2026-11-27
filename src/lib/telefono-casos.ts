/**
 * Casos de prueba de las reglas del CELULAR. Los usan "npm test"
 * (tests/telefono.test.ts) y "npm run verificar" (que además los prueba
 * contra la base de datos con public.problema_telefono).
 *
 * Nota: "55 1234 5678" (México), "11 2345 6789" (Argentina) y
 * "+56 9 8765 4321" (Chile) contienen secuencias de 6 o más dígitos
 * (12345678, 23456789, 98765432), así que la regla de números falsos los
 * rechaza. Para probar la normalización de esos países se usan números
 * equivalentes sin secuencia.
 */
import type { CodigoPais } from "./telefono";

export type CasoValido = { texto: string; pais: CodigoPais; telefono: string; paisFinal: CodigoPais; nota: string };
export type CasoRechazado = { texto: string; pais: CodigoPais; nota: string };

export const CASOS_VALIDOS: CasoValido[] = [
  { texto: "310 482 7756", pais: "CO", telefono: "573104827756", paisFinal: "CO", nota: "con espacios" },
  { texto: "+57 315-908-2241", pais: "CO", telefono: "573159082241", paisFinal: "CO", nota: "con + y guiones" },
  { texto: "0057 3204417893", pais: "CO", telefono: "573204417893", paisFinal: "CO", nota: "con 00 internacional" },
  { texto: "(310) 482-7756", pais: "CO", telefono: "573104827756", paisFinal: "CO", nota: "con paréntesis" },
  { texto: "55 4827 3956", pais: "MX", telefono: "525548273956", paisFinal: "MX", nota: "México: agrega el 52" },
  { texto: "11 4827 3956", pais: "AR", telefono: "5491148273956", paisFinal: "AR", nota: "Argentina: agrega el 9 de celular" },
  { texto: "+56 9 4827 3956", pais: "CO", telefono: "56948273956", paisFinal: "CL", nota: "pegado con +56 → Chile" },
];

export const CASOS_RECHAZADOS: CasoRechazado[] = [
  { texto: "123456789", pais: "CO", nota: "longitud y secuencia" },
  { texto: "00000000", pais: "CO", nota: "ceros" },
  { texto: "111111111111111", pais: "CO", nota: "repetido" },
  { texto: "3000000000", pais: "CO", nota: "mismo dígito 7+ veces" },
  { texto: "3111111111", pais: "CO", nota: "mismo dígito" },
  { texto: "3123456789", pais: "CO", nota: "secuencia ascendente" },
  { texto: "3987654321", pais: "CO", nota: "secuencia descendente" },
  { texto: "3121212121", pais: "CO", nota: "patrón repetido" },
  { texto: "3003003003", pais: "CO", nota: "patrón repetido" },
  { texto: "3123123123", pais: "CO", nota: "patrón repetido" },
  { texto: "6012345678", pais: "CO", nota: "fijo" },
  { texto: "39012345678", pais: "CO", nota: "longitud incorrecta" },
  { texto: "abc", pais: "CO", nota: "letras" },
  { texto: "55 1234 5678", pais: "MX", nota: "secuencia 12345678" },
  { texto: "11 2345 6789", pais: "AR", nota: "secuencia 23456789" },
  { texto: "+56 9 8765 4321", pais: "CO", nota: "secuencia 98765432" },
];
