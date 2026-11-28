import "server-only";
import { correoNuevoReferido, enviarCorreo } from "@/lib/correo";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/** Correo al referente con el estado ya calculado (por si resultó "ya era cliente"). */
export async function avisarAlReferente(referidoId: string, diasVigencia: number | null) {
  const { data: r } = await crearClienteAdmin()
    .from("referidos")
    .select("nombre, correo_oculto, bono, estado_bono, plan_solicitado, referente:referentes(nombre, correo), plan:planes!referidos_plan_solicitado_fkey(nombre)")
    .eq("id", referidoId)
    .maybeSingle<{
      nombre: string | null;
      correo_oculto: string | null;
      bono: number | string | null;
      estado_bono: string;
      referente: { nombre: string; correo: string } | null;
      plan: { nombre: string } | null;
    }>();
  if (!r?.referente) return;
  const correo = correoNuevoReferido({
    referenteNombre: r.referente.nombre,
    // Al referente nunca se le envía el correo de su referido (solo una pista)
    referidoNombre: r.nombre ?? r.correo_oculto ?? "Tu referido",
    plan: r.plan?.nombre ?? null,
    bono: r.bono === null ? null : Number(r.bono),
    yaCliente: r.estado_bono === "ya_cliente",
    diasVigencia,
  });
  await enviarCorreo({ para: r.referente.correo, ...correo });
}
