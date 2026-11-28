"use server";

import { after } from "next/server";
import { avisarAlReferente } from "@/lib/avisos";
import { cruzarReferidos } from "@/lib/cruce";
import { leerReglas } from "@/lib/reglas";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { huellaToken, TOKEN_VALIDO } from "@/lib/token";
import { logError, registrarError } from "@/lib/registro";

export type EstadoConfirmacion = { ok: boolean; mensaje?: string };

const RESULTADOS: Record<string, EstadoConfirmacion> = {
  ok: { ok: true, mensaje: "¡Listo! Confirmaste tu registro. Nuestro equipo te contactará pronto." },
  ya_confirmado: { ok: true, mensaje: "Tu registro ya estaba confirmado. No tienes que hacer nada más." },
  vencido: { ok: false, mensaje: "Este link venció. Si quieres participar, pide a quien te invitó que te envíe su link de nuevo." },
  duplicado: { ok: false, mensaje: "Ya estás registrado en el programa; si tienes dudas escríbenos por WhatsApp." },
  no_disponible: { ok: false, mensaje: "Este link no está disponible." },
  no_valido: { ok: false, mensaje: "Este link no es válido. Revisa que lo hayas copiado completo." },
};

/**
 * El referido confirma que lo invitó ese referente. Se hace con un botón
 * (no al abrir el link) para que los revisores automáticos de correo no
 * confirmen por la persona.
 */
export async function confirmarRegistro(_anterior: EstadoConfirmacion, formData: FormData): Promise<EstadoConfirmacion> {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN_VALIDO.test(token)) return RESULTADOS.no_valido;

  const admin = crearClienteAdmin();
  const { data, error } = await admin.rpc("confirmar_referido", { p_token_hash: huellaToken(token) });
  if (error) {
    logError("[confirmar]", error.message);
    return { ok: false, mensaje: "No pudimos confirmar tu registro. Intenta de nuevo en unos minutos." };
  }

  const r = data as { resultado: string; referido_id?: string };
  if (r.resultado === "ok" && r.referido_id) {
    const id = r.referido_id;
    // Después de responder: cruce con la hoja y correo al referente
    after(async () => {
      try {
        await cruzarReferidos({ referidoId: id });
      } catch (e) {
        await registrarError("cruce inmediato", e, { guardar: true });
      }
      try {
        const reglas = await leerReglas(admin);
        await avisarAlReferente(id, reglas.dias_vigencia_registro);
      } catch (e) {
        await registrarError("correo de nuevo referido", e, { guardar: true });
      }
    });
  }
  return RESULTADOS[r.resultado] ?? RESULTADOS.no_valido;
}
