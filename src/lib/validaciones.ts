import { z } from "zod";
import { normalizarCorreo, normalizarTelefono } from "@/lib/telefono";

/** Correo: se guarda siempre en minúsculas y sin espacios. */
export const campoCorreo = z
  .string({ error: "Escribe tu correo" })
  .transform((v) => normalizarCorreo(v) ?? "")
  .pipe(z.email({ error: "Escribe un correo válido" }).max(254));

/**
 * Teléfono colombiano: se quitan espacios, guiones y +57.
 * Debe quedar con 10 dígitos: celular (3XX) o fijo (60X).
 */
export const campoTelefono = z
  .string({ error: "Escribe tu teléfono" })
  .transform((v) => normalizarTelefono(v) ?? "")
  .pipe(
    z.string().regex(/^(3\d{9}|60\d{8})$/, {
      error: "Escribe un número de 10 dígitos (ej. 300 123 4567)",
    }),
  );

export const campoCuentaDropi = z
  .string({ error: "Escribe tu cuenta Dropi" })
  .trim()
  .min(2, { error: "Escribe tu cuenta Dropi" })
  .max(120, { error: "Máximo 120 caracteres" });

// Un checkbox marcado envía "on"; si no se marca, no envía nada.
const campoAutorizaDatos = z.literal("on", {
  error: "Debes aceptar la política de tratamiento de datos para continuar",
});

export const esquemaRegistroReferente = z.object({
  nombre: z
    .string({ error: "Escribe tu nombre" })
    .trim()
    .min(2, { error: "Escribe tu nombre completo" })
    .max(120, { error: "Máximo 120 caracteres" }),
  correo: campoCorreo,
  telefono: campoTelefono,
  cuenta_dropi: campoCuentaDropi,
  autoriza_datos: campoAutorizaDatos,
});

export const esquemaIngreso = z.object({
  correo: campoCorreo,
});

/** Código del link /r/CODIGO (mismo formato que en la base de datos). */
export const campoCodigo = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,16}$/));

const campoNombre = z
  .string({ error: "Escribe tu nombre" })
  .trim()
  .min(2, { error: "Escribe tu nombre completo" })
  .max(120, { error: "Máximo 120 caracteres" });

/** Formulario público que llena el referido desde /r/CODIGO. */
export const esquemaReferido = z.object({
  codigo: campoCodigo,
  nombre: campoNombre,
  // Que el plan exista y esté activo se verifica contra la tabla "planes"
  plan_solicitado: z.string().trim().min(1, { error: "Elige el plan que te interesa" }),
  correo: campoCorreo,
  telefono: campoTelefono,
  cuenta_dropi: campoCuentaDropi,
  tipo: z.enum(["proveedor", "marca"], { error: "Elige si eres proveedor o marca" }),
  autoriza_datos: campoAutorizaDatos,
});

/** Pesos colombianos escritos por el super_admin: "150.000", "150000", "$150.000". */
const campoPesos = z
  .string()
  .transform((v) => v.replace(/[^\d]/g, ""))
  .pipe(z.string().regex(/^\d{1,12}$/, { error: "Escribe un valor en pesos, sin decimales" }))
  .transform(Number);

/** Edición manual de un referido (super_admin). */
export const esquemaEdicionReferido = z.object({
  id: z.uuid(),
  plan_afiliado_id: z
    .string()
    .trim()
    .transform((v) => v || null),
  afiliado_atom: z.enum(["si", "no"], { error: "Indica si está activo en ATOM" }).transform((v) => v === "si"),
  bono: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(campoPesos.nullable()),
  estado_bono: z.enum(["estimado", "por_pagar", "no_aplica"], { error: "Elige un estado" }),
});

/** Registro de un pago (super_admin). */
export const esquemaPago = z.object({
  referenteId: z.uuid(),
  referidoIds: z.array(z.uuid()).min(1, { error: "Elige al menos un referido" }),
  fecha: z.iso.date({ error: "Escribe la fecha de pago" }),
  valor: campoPesos,
  nota: z.string().trim().max(500, { error: "Máximo 500 caracteres" }).optional(),
  soportePath: z.string().min(1, { error: "Adjunta el soporte del pago" }),
});

export const TIPOS_SOPORTE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export const MAX_SOPORTE_BYTES = 5 * 1024 * 1024;

/** Convierte los errores de zod en { campo: "mensaje" } para el formulario. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "general");
    if (!salida[campo]) salida[campo] = issue.message;
  }
  return salida;
}
