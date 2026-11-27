import { z } from "zod";
import { ESTADOS_MANUALES } from "@/lib/estados";
import { normalizarCorreo } from "@/lib/telefono";

/** Correo: se guarda siempre en minúsculas y sin espacios. */
export const campoCorreo = z
  .string({ error: "Escribe tu correo" })
  .transform((v) => normalizarCorreo(v) ?? "")
  .pipe(z.email({ error: "Escribe un correo válido" }).max(254));

/**
 * El CELULAR no va en estos esquemas: se valida con validarCelular()
 * (src/lib/telefono.ts) y en el servidor con revisarCelular(), porque
 * depende del país elegido y de la lista de números bloqueados.
 */

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
  cuenta_dropi: campoCuentaDropi,
  autoriza_datos: campoAutorizaDatos,
  acepta_terminos: z.literal("on", {
    error: "Debes aceptar los términos del programa de referidos para continuar",
  }),
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

/** Motivo obligatorio de toda excepción o acción del super_admin (queda en el historial). */
const campoMotivo = z
  .string({ error: "Escribe el motivo" })
  .trim()
  .min(5, { error: "Escribe el motivo (mínimo 5 caracteres)" })
  .max(500, { error: "Máximo 500 caracteres" });

/** Excepción manual sobre un referido (super_admin). */
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
  estado_bono: z.enum(ESTADOS_MANUALES, { error: "Elige un estado" }),
  // Nueva fecha límite de la vigencia (opcional, "AAAA-MM-DD", fin del día en Colombia)
  vence_en: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.iso.date({ error: "Fecha no válida" }).nullable())
    .transform((v) => (v ? `${v}T23:59:59-05:00` : null)),
  motivo: campoMotivo,
});

export const esquemaMotivo = z.object({ id: z.uuid(), motivo: campoMotivo });

/** Reglas del programa (/admin/reglas). */
const entero = (min: number, max: number, nombre: string) =>
  z.coerce
    .number({ error: `Escribe ${nombre}` })
    .int({ error: "Debe ser un número entero" })
    .min(min, { error: `Mínimo ${min}` })
    .max(max, { error: `Máximo ${max}` });

export const esquemaReglas = z.object({
  dias_vigencia_registro: entero(1, 365, "los días de vigencia"),
  dias_permanencia_para_pagar: entero(0, 365, "los días de permanencia"),
  confirmacion_referido_por_correo: z.enum(["si", "no"]).transform((v) => v === "si"),
  dominios_excluidos: z
    .string()
    .transform((v) =>
      v
        .toLowerCase()
        .replace(/\s/g, "")
        .split(",")
        .map((d) => d.replace(/^@+/, ""))
        .filter(Boolean),
    )
    .pipe(
      z.array(
        z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, { error: "Escribe dominios separados por coma, ej. atomapp.com.co" }),
      ),
    )
    .transform((l) => [...new Set(l)].join(",")),
  max_registros_por_link_por_hora: entero(1, 1000, "el límite por hora"),
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
