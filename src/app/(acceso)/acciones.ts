"use server";

import { headers } from "next/headers";
import { revisarCelular } from "@/lib/celular-servidor";
import { linkWhatsAppAyuda, urlSitio } from "@/lib/config-programa";
import { esDominioExcluido } from "@/lib/identidad";
import { permitirIntento } from "@/lib/limites";
import { errorConCodigo, ipDelVisitante, logError } from "@/lib/registro";
import { leerReglas } from "@/lib/reglas";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarTurnstile } from "@/lib/turnstile";
import {
  erroresPorCampo,
  esquemaIngreso,
  esquemaRegistroReferente,
} from "@/lib/validaciones";

export type EstadoFormulario = {
  ok: boolean;
  mensaje?: string;
  /** Link que acompaña al mensaje (ej. WhatsApp para dudas) */
  enlace?: { texto: string; url: string };
  /** Código de un error inesperado (ej. R-4F2A): está en los logs de Vercel */
  codigo?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string>;
  /** Correo al que se envió el link y el código (pantalla de espera) */
  correo?: string;
};

function urlDeRegreso() {
  return `${urlSitio()}/auth/confirm?next=/panel`;
}

function esLimiteDeSupabase(error: { message?: string; status?: number }) {
  const texto = (error.message ?? "").toLowerCase();
  return error.status === 429 || texto.includes("rate limit") || texto.includes("security purposes");
}

/** Traduce los errores de Supabase a mensajes entendibles. */
function mensajeDeError(error: { message?: string; status?: number; code?: string }) {
  if (esLimiteDeSupabase(error)) return MENSAJE_LIMITE_LINKS;
  return "No pudimos enviar el correo. Intenta de nuevo en unos minutos.";
}

const MENSAJE_LIMITE = "Hiciste muchos intentos en poco tiempo. Espera una hora y vuelve a intentarlo.";
const MENSAJE_LIMITE_LINKS = "Pediste varios links seguidos. Espera un minuto y vuelve a intentarlo.";
const MENSAJE_REVISA_CAMPOS = "Revisa los campos marcados en rojo.";

const MENSAJE_YA_REFERENTE =
  "Ya hay una cuenta de referente con estos datos (correo, celular o cuenta Dropi). " +
  "Si es tuya, entra con el correo con el que te registraste. Si crees que es un error, escríbenos por WhatsApp.";

function conWhatsApp(mensaje: string, valores: Record<string, string>): EstadoFormulario {
  const url = linkWhatsAppAyuda();
  return { ok: false, mensaje, valores, enlace: url ? { texto: "Escríbenos por WhatsApp", url } : undefined };
}

/**
 * Error inesperado: queda en el log (y en errores_sistema) con un código
 * corto, y la persona ve ese mismo código para poder rastrearlo.
 */
async function fallaInesperada(
  etapa: string,
  valores: Record<string, string>,
  ...detalle: unknown[]
): Promise<EstadoFormulario> {
  const codigo = await errorConCodigo("registro", etapa, ...detalle);
  return {
    ...conWhatsApp(
      "No pudimos completar tu registro por un problema de nuestro lado. Intenta de nuevo en unos minutos; " +
        "si vuelve a pasar, escríbenos por WhatsApp con el código de abajo.",
      valores,
    ),
    codigo,
  };
}

function leer(formData: FormData, campo: string) {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
}

function leerValores(formData: FormData) {
  return {
    nombre: leer(formData, "nombre"),
    correo: leer(formData, "correo"),
    telefono: leer(formData, "telefono"),
    telefono_pais: leer(formData, "telefono_pais"),
    cuenta_dropi: leer(formData, "cuenta_dropi"),
  };
}

/**
 * Registro de un referente. Errores esperables (datos del formulario,
 * casillas sin marcar, correo ya registrado, cuenta ocupada, límites) →
 * mensaje específico. Cualquier otro → fallaInesperada(), con código.
 */
export async function registrarReferente(
  anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  try {
    return await registrarReferenteSinCapturar(anterior, formData);
  } catch (e) {
    return fallaInesperada("excepción", leerValores(formData), e);
  }
}

async function registrarReferenteSinCapturar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = leerValores(formData);

  // Campo trampa invisible: las personas no lo ven, los robots lo llenan.
  if (leer(formData, "sitio_web")) {
    return { ok: true, mensaje: "Revisa tu correo para continuar." };
  }

  // Nombre, correo, Dropi y las dos casillas (autorización de datos y
  // términos): cada error se muestra en su campo.
  const resultado = esquemaRegistroReferente.safeParse({
    ...valores,
    autoriza_datos: formData.get("autoriza_datos") ?? undefined,
    acepta_terminos: formData.get("acepta_terminos") ?? undefined,
  });
  // Celular: reglas por país, números falsos y lista de bloqueados
  const celular = await revisarCelular(valores.telefono, valores.telefono_pais);
  valores.telefono_pais = celular.pais;
  if (!resultado.success || !celular.ok) {
    return {
      ok: false,
      mensaje: MENSAJE_REVISA_CAMPOS,
      errores: {
        ...(resultado.success ? {} : erroresPorCampo(resultado.error)),
        ...(celular.ok ? {} : { telefono: celular.mensaje }),
      },
      valores,
    };
  }
  const datos = { ...resultado.data, telefono: celular.telefono, telefono_pais: celular.pais };

  const version = process.env.POLITICA_DATOS_VERSION?.trim();
  const versionTerminos = process.env.TERMINOS_VERSION?.trim();
  if (!version || !versionTerminos) {
    const faltan = [!version && "POLITICA_DATOS_VERSION", !versionTerminos && "TERMINOS_VERSION"].filter(Boolean);
    return fallaInesperada("configuración", valores, `Falta la variable de entorno ${faltan.join(" y ")}`);
  }

  const h = await headers();
  const ip = ipDelVisitante(h);
  if (!(await verificarTurnstile(leer(formData, "cf-turnstile-response"), ip))) {
    return { ok: false, mensaje: "Confirma la verificación anti-robots y vuelve a enviar el formulario.", valores };
  }
  if (!(await permitirIntento("registro_referente", ip))) {
    return { ok: false, mensaje: MENSAJE_LIMITE, valores };
  }

  // Correos de dominios excluidos (empleados). La base de datos lo
  // vuelve a revisar al crear el referente.
  let reglas: Awaited<ReturnType<typeof leerReglas>>;
  try {
    reglas = await leerReglas();
  } catch (e) {
    return fallaInesperada("reglas", valores, e);
  }
  if (esDominioExcluido(datos.correo, reglas.dominios_excluidos)) {
    return {
      ok: false,
      mensaje: MENSAJE_REVISA_CAMPOS,
      errores: { correo: "Este correo no puede registrarse como referente del programa." },
      valores,
    };
  }

  // Un solo referente por persona: correo, teléfono y cuenta Dropi se
  // comparan cruzados contra TODOS los referentes. La base de datos lo
  // vuelve a revisar al crear la fila (disparador referentes_identidad).
  const revisarIdentidad = () =>
    crearClienteAdmin().rpc("estado_identidad_referente", {
      p_correo: datos.correo,
      p_telefono: datos.telefono,
      p_dropi: datos.cuenta_dropi,
    });
  const { data: identidad, error: errorIdentidad } = await revisarIdentidad();
  if (errorIdentidad) {
    return fallaInesperada("identidad", valores, errorIdentidad.code, errorIdentidad.message);
  }
  if (identidad === "ocupada") return conWhatsApp(MENSAJE_YA_REFERENTE, valores);
  // Ya es referente con este correo: el link solo lo deja entrar a su panel.
  const yaRegistrado = identidad === "mismo_correo";

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email: datos.correo,
    options: {
      shouldCreateUser: !yaRegistrado,
      emailRedirectTo: urlDeRegreso(),
      // Esta "metadata" la usa la base de datos para crear la fila del
      // referente (ver crear_referente_desde_auth en supabase/schema.sql).
      data: yaRegistrado
        ? undefined
        : {
            rol: "referente",
            nombre: datos.nombre,
            telefono: datos.telefono, // formato estándar (E.164 sin "+")
            telefono_pais: datos.telefono_pais,
            cuenta_dropi: datos.cuenta_dropi,
            // Prueba de la autorización (Ley 1581 de 2012) y de los términos
            autoriza_datos: true,
            version_politica: version,
            acepta_terminos: true,
            version_terminos: versionTerminos,
          },
    },
  });

  if (error) {
    if (esLimiteDeSupabase(error)) return { ok: false, mensaje: MENSAJE_LIMITE_LINKS, valores };
    // "Database error saving new user": el disparador de la base rechazó la
    // cuenta, pero Supabase no dice por qué. Se vuelve a revisar la
    // identidad (otra persona pudo registrar esos datos hace un instante);
    // si sigue libre, es un error inesperado.
    if ((error.message ?? "").toLowerCase().includes("database error")) {
      const otra = await revisarIdentidad();
      if (otra.data === "ocupada" || otra.data === "mismo_correo") return conWhatsApp(MENSAJE_YA_REFERENTE, valores);
    }
    return fallaInesperada("signInWithOtp", valores, error.status, error.code, error.message);
  }

  return {
    ok: true,
    correo: datos.correo,
    mensaje: yaRegistrado
      ? `Este correo ya está registrado como referente. Te enviamos un link a ${datos.correo} para entrar a tu panel, o escribe aquí el código que trae.`
      : `Te enviamos un link a ${datos.correo}. Ábrelo para confirmar tu registro y entrar a tu panel, o escribe aquí el código que trae.`,
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

  const ip = ipDelVisitante(await headers());
  if (!(await verificarTurnstile(leer(formData, "cf-turnstile-response"), ip))) {
    return { ok: false, mensaje: "Confirma la verificación anti-robots y vuelve a intentarlo.", valores };
  }
  if (!(await permitirIntento("ingreso", ip))) {
    return { ok: false, mensaje: MENSAJE_LIMITE, valores };
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
    logError("[ingreso] signInWithOtp:", error.status, error.message);
    return { ok: false, mensaje: mensajeDeError(error), valores };
  }

  return {
    ok: true,
    correo: resultado.data.correo,
    mensaje: `Si ${resultado.data.correo} está registrado, te llegará un link para entrar y un código. Revisa también la carpeta de spam.`,
  };
}
