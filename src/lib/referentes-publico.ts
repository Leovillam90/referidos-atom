import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { campoCodigo } from "@/lib/validaciones";

export type ReferentePublico = {
  id: string;
  nombre: string;
  correo: string;
};

/**
 * Busca un referente ACTIVO por su código del link /r/CODIGO.
 * Usa la clave secreta (los visitantes no tienen acceso a la tabla),
 * por eso solo debe devolverse al navegador el primer nombre.
 */
export async function buscarReferentePorCodigo(codigo: string): Promise<ReferentePublico | null> {
  const valido = campoCodigo.safeParse(codigo);
  if (!valido.success) return null;

  const { data, error } = await crearClienteAdmin()
    .from("referentes")
    .select("id, nombre, correo")
    .eq("codigo", valido.data)
    .eq("activo", true)
    .maybeSingle<ReferentePublico>();

  if (error) {
    console.error("[referido] buscar referente:", error.message);
    throw new Error("No se pudo verificar el link");
  }
  return data;
}

export function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0] ?? "";
}
