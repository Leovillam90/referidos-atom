import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { mensajeCelular, validarCelular, type ResultadoCelular } from "@/lib/telefono";
import { logError } from "@/lib/registro";

/**
 * Validación del celular en el servidor: las mismas reglas del navegador
 * (src/lib/telefono.ts) más la lista de números bloqueados. La base de
 * datos lo vuelve a revisar al guardar (disparador validar_telefono).
 */
export async function revisarCelular(valor: string, pais: string): Promise<ResultadoCelular> {
  const r = validarCelular(valor, pais);
  if (!r.ok) return r;

  const { data, error } = await crearClienteAdmin()
    .from("telefonos_bloqueados")
    .select("telefono")
    .eq("telefono", r.telefono)
    .maybeSingle();
  // Si la consulta falla, decide la base de datos al guardar
  if (error) logError("[celular] lista de bloqueados:", error.message);
  if (data) return { ok: false, pais: r.pais, motivo: "bloqueado", mensaje: mensajeCelular(r.pais) };
  return r;
}
