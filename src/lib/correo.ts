import "server-only";
import nodemailer from "nodemailer";
import { urlSitio } from "@/lib/config-programa";
import { formatoPesos } from "@/lib/formato";
import { logError } from "@/lib/registro";

/**
 * Envío de correos por SMTP. Todo se configura con variables de entorno
 * (ver .env.example); ninguna contraseña vive en el código.
 * Si SMTP_HOST no está configurado, los correos se omiten (y se avisa
 * en el registro del servidor) sin romper la app.
 */
function crearTransporte() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const puerto = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port: puerto,
    secure: puerto === 465, // 465 = SSL directo; 587 = STARTTLS
    // Tiempos de espera: si el servidor de correo no responde, se corta
    // y el error queda en /admin (el registro de la persona ya se guardó).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
      : undefined,
  });
}

const REMITENTE = () =>
  process.env.SMTP_FROM?.trim() || "ATOM Referidos <notificaciones@atomapp.com.co>";

export async function enviarCorreo(opciones: { para: string; asunto: string; texto: string; html: string }) {
  const transporte = crearTransporte();
  if (!transporte) {
    logError("[correo] SMTP_HOST no está configurado; no se envió un correo");
    return;
  }
  await transporte.sendMail({
    from: REMITENTE(),
    to: opciones.para,
    subject: opciones.asunto,
    text: opciones.texto,
    html: opciones.html,
  });
}

/** Los nombres los escriben los visitantes: se escapan antes de ponerlos en el HTML. */
function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/*
 * Diseño de marca ATOM para correos (mismo diseño que las plantillas de
 * Supabase en /emails). Tablas y estilos en línea para que se vea bien en
 * Gmail, Outlook y el celular. Tipografía segura: Helvetica/Arial.
 * Contrastes: texto #1D2935 sobre blanco 14.8:1 · botón #1D2935 sobre
 * #0DE8C0 9.4:1 · pie #5B6675 sobre #EEF1F5 5.2:1.
 */
const FUENTE = "'Helvetica Neue',Helvetica,Arial,sans-serif";

function plantilla(titulo: string, parrafos: string[], boton: { texto: string; url: string }) {
  const logo = `${urlSitio()}/brand/logo-horizontal-texto-blanco.png`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:${FUENTE};color:#1d2935">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f5"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden">
    <tr><td align="center" style="background:#1d2935;padding:28px 24px">
      <img src="${logo}" width="180" alt="ATOM Solutions Data" style="display:block;width:180px;max-width:100%;height:auto;border:0">
    </td></tr>
    <tr><td style="height:4px;line-height:4px;font-size:0;background:#6884c5;background-image:linear-gradient(90deg,#c81fda,#6884c5,#0de8c0)">&nbsp;</td></tr>
    <tr><td style="padding:32px 28px 8px">
      <h1 style="margin:0 0 16px;font-family:${FUENTE};font-size:24px;line-height:1.25;font-weight:900;color:#1d2935">${titulo}</h1>
      ${parrafos.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#1d2935">${p}</p>`).join("")}
    </td></tr>
    <tr><td style="padding:12px 28px 36px">
      <a href="${boton.url}" style="display:inline-block;background:#0de8c0;color:#1d2935;font-family:${FUENTE};font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:999px">${boton.texto}</a>
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#5b6675">Recibes este correo porque participas en el programa de referidos de ATOM Solutions Data.<br>Confianza · Seguridad · Calidad · Rapidez · Acompañamiento</p>
</td></tr></table>
</body></html>`;
}

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? "";

export function correoNuevoReferido(d: {
  referenteNombre: string;
  referidoNombre: string;
  plan: string | null;
  bono: number | null;
  yaCliente: boolean;
  diasVigencia: number | null;
}) {
  const plan = d.plan ?? "Sin plan definido";
  const bono = d.bono !== null ? formatoPesos(d.bono) : "Por definir";
  const panel = `${urlSitio()}/panel`;
  const plazo = d.diasVigencia
    ? `Tiene ${d.diasVigencia} días para activarse en ATOM para que el bono cuente para ti.`
    : "El bono se confirma cuando tu referido quede activo en ATOM.";
  const lineas = d.yaCliente
    ? {
        texto: `Plan de interés: ${plan}

Esta persona ya era cliente de ATOM, por eso este registro no genera bono.`,
        html: [
          `Plan de interés: <strong>${escapar(plan)}</strong>`,
          `Esta persona <strong>ya era cliente de ATOM</strong>, por eso este registro no genera bono.`,
        ],
      }
    : {
        texto: `Plan de interés: ${plan}
Bono estimado: ${bono}

${plazo}`,
        html: [`Plan de interés: <strong>${escapar(plan)}</strong><br>Bono estimado: <strong>${bono}</strong>`, plazo],
      };
  return {
    asunto: `Nuevo referido: ${d.referidoNombre}`,
    texto:
      `Hola ${primerNombre(d.referenteNombre)},

` +
      `${d.referidoNombre} se registró con tu link de referido.
` +
      `${lineas.texto}
Ver tu panel: ${panel}`,
    html: plantilla(
      "¡Tienes un nuevo referido!",
      [
        `Hola ${escapar(primerNombre(d.referenteNombre))},`,
        `<strong>${escapar(d.referidoNombre)}</strong> se registró con tu link de referido.`,
        ...lineas.html,
      ],
      { texto: "Ver mi panel", url: panel },
    ),
  };
}

/** Al referido: confirmar que de verdad lo invitó ese referente. */
export function correoConfirmacionReferido(d: {
  referidoNombre: string;
  referenteNombre: string;
  url: string;
  diasVigencia: number;
}) {
  return {
    asunto: `Confirma tu registro en ATOM`,
    texto:
      `Hola ${primerNombre(d.referidoNombre)},

` +
      `Recibimos tu registro en el programa de referidos de ATOM.
` +
      `Confirma que te invitó ${d.referenteNombre} abriendo este link:
${d.url}

` +
      `El link sirve durante ${d.diasVigencia} días. Si no conoces a esta persona o no te registraste, ignora este correo.`,
    html: plantilla(
      "Confirma tu registro",
      [
        `Hola ${escapar(primerNombre(d.referidoNombre))},`,
        `Recibimos tu registro en el programa de referidos de ATOM.`,
        `Confirma que te invitó <strong>${escapar(d.referenteNombre)}</strong>.`,
        `El link sirve durante ${d.diasVigencia} días. Si no conoces a esta persona o no te registraste, ignora este correo.`,
      ],
      { texto: "Sí, confirmo mi registro", url: d.url },
    ),
  };
}

export function correoPagoRegistrado(d: {
  referenteNombre: string;
  valor: number;
  fecha: string; // ej. "26 nov 2026"
  referidos: number;
}) {
  const panel = `${urlSitio()}/panel`;
  const valor = formatoPesos(d.valor);
  const cubre = d.referidos === 1 ? "1 referido" : `${d.referidos} referidos`;
  return {
    asunto: `Registramos tu pago de ${valor}`,
    texto:
      `Hola ${primerNombre(d.referenteNombre)},\n\n` +
      `Registramos un pago de bonos de referidos a tu favor.\n` +
      `Valor: ${valor}\nFecha de pago: ${d.fecha}\nCubre: ${cubre}\n\n` +
      `Puedes ver el soporte en tu panel: ${panel}`,
    html: plantilla(
      "Registramos tu pago",
      [
        `Hola ${escapar(primerNombre(d.referenteNombre))},`,
        `Registramos un pago de bonos de referidos a tu favor.`,
        `Valor: <strong>${valor}</strong><br>Fecha de pago: <strong>${escapar(d.fecha)}</strong><br>Cubre: ${cubre}`,
        `Puedes ver el soporte del pago en tu panel.`,
      ],
      { texto: "Ver el soporte en mi panel", url: panel },
    ),
  };
}

/** Para /api/salud: ¿el servidor de correo acepta la conexión y el usuario? (no envía nada) */
export async function verificarConexionCorreo(): Promise<"ok" | "sin_configurar"> {
  const transporte = crearTransporte();
  if (!transporte) return "sin_configurar";
  await transporte.verify();
  transporte.close();
  return "ok";
}
