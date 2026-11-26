import "server-only";
import nodemailer from "nodemailer";
import { urlSitio } from "@/lib/config-programa";
import { formatoPesos } from "@/lib/formato";

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
    console.warn("[correo] SMTP_HOST no está configurado; no se envió:", opciones.asunto);
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

function plantilla(titulo: string, parrafos: string[], boton: { texto: string; url: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#ffffff;border-radius:12px;padding:24px">
    <p style="margin:0 0 16px;font-weight:bold">Referidos ATOM</p>
    <h1 style="margin:0 0 16px;font-size:20px">${titulo}</h1>
    ${parrafos.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${p}</p>`).join("")}
    <p style="margin:24px 0 0"><a href="${boton.url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px">${boton.texto}</a></p>
  </div>
  <p style="font-size:12px;color:#71717a;margin:16px 0 0">Recibes este correo porque participas en el programa de referidos de ATOM.</p>
</div></body></html>`;
}

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? "";

export function correoNuevoReferido(d: {
  referenteNombre: string;
  referidoNombre: string;
  plan: string | null;
  bono: number | null;
}) {
  const plan = d.plan ?? "Sin plan definido";
  const bono = d.bono !== null ? formatoPesos(d.bono) : "Por definir";
  const panel = `${urlSitio()}/panel`;
  return {
    asunto: `Nuevo referido: ${d.referidoNombre}`,
    texto:
      `Hola ${primerNombre(d.referenteNombre)},\n\n` +
      `${d.referidoNombre} se registró con tu link de referido.\n` +
      `Plan de interés: ${plan}\nBono estimado: ${bono}\n\n` +
      `El bono se confirma cuando tu referido quede activo en ATOM.\nVer tu panel: ${panel}`,
    html: plantilla(
      "¡Tienes un nuevo referido!",
      [
        `Hola ${escapar(primerNombre(d.referenteNombre))},`,
        `<strong>${escapar(d.referidoNombre)}</strong> se registró con tu link de referido.`,
        `Plan de interés: <strong>${escapar(plan)}</strong><br>Bono estimado: <strong>${bono}</strong>`,
        `El bono se confirma cuando tu referido quede activo en ATOM.`,
      ],
      { texto: "Ver mi panel", url: panel },
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
