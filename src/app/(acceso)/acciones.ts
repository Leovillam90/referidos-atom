"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import {
  erroresPorCampo,
  esquemaIngreso,
  esquemaRegistroReferente,
} from "@/lib/validaciones";

export type EstadoFormulario = {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string>;
};

function urlDeRegreso() {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${sitio}/auth/confirm?next=/panel`;
}

/** Traduce los errores de Supabase a mensajes entendibles. */
function mensajeDeError(error: { message?: string; status?: number; code?: string }) {
  const texto = (error.message ?? "").toLowerCase();
  if (error.status === 429 || texto.includes("rate limit") || texto.includes("security purposes")) {
    return "Pediste varios links seguidos. Espera un minuto y vuelve a intentarlo.";
  }
  return "No pudimos enviar el correo. Intenta de nuevo en unos minutos.";
}

function leer(formData: FormData, campo: string) {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
}

export async function registrarReferente(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = {
    nombre: leer(formData, "nombre"),
    correo: leer(formData, "correo"),
    telefono: leer(formData, "telefono"),
    cuenta_dropi: leer(formData, "cuenta_dropi"),
  };

  // Campo trampa invisible: las personas no lo ven, los robots lo llenan.
  if (leer(formData, "sitio_web")) {
    return { ok: true, mensaje: "Revisa tu correo para continuar." };
  }

  const resultado = esquemaRegistroReferente.safeParse(valores);
  if (!resultado.success) {
    return { ok: false, errores: erroresPorCampo(resultado.error), valores };
  }
  const datos = resultado.data;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email: datos.correo,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: urlDeRegreso(),
      // Esta "metadata" la usa la base de datos para crear la fila del
      // referente (ver crear_referente_desde_auth en supabase/schema.sql).
      data: {
        rol: "referente",
        nombre: datos.nombre,
        telefono: datos.telefono,
        cuenta_dropi: datos.cuenta_dropi,
      },
    },
  });

  if (error) {
    console.error("[registro] signInWithOtp:", error.status, error.message);
    return { ok: false, mensaje: mensajeDeError(error), valores };
  }

  return {
    ok: true,
    mensaje: `Te enviamos un link a ${datos.correo}. Ábrelo para confirmar tu registro y entrar a tu panel.`,
  };
}

export async function enviarLinkIngreso(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = { correo: leer(formData, "correo") };

  const resultado = esquemaIngreso.safeParse(valores);
  if (!resultado.success) {
    return { ok: false, errores: erroresPorCampo(resultado.error), valores };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email: resultado.data.correo,
    options: { shouldCreateUser: false, emailRedirectTo: urlDeRegreso() },
  });

  // Si el correo no está registrado, Supabase devuelve error, pero NO lo
  // contamos: así nadie puede averiguar qué correos están inscritos.
  const correoNoRegistrado =
    error && (error.code === "otp_disabled" || /signups not allowed/i.test(error.message));

  if (error && !correoNoRegistrado) {
    console.error("[ingreso] signInWithOtp:", error.status, error.message);
    return { ok: false, mensaje: mensajeDeError(error), valores };
  }

  return {
    ok: true,
    mensaje: `Si ${resultado.data.correo} está registrado, te llegará un link para entrar. Revisa también la carpeta de spam.`,
  };
}
