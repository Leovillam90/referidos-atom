import "server-only";
import { connection } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { campoCodigo } from "@/lib/validaciones";

export type ReferentePublico = {
  id: string;
  nombre: string;
  correo: string;
  // Identificadores (correo, teléfono, cuenta Dropi, también los anteriores),
  // para la regla de no auto-referirse
  identificadores: string[] | null;
};

/**
 * Busca por su código del link /r/CODIGO un referente con el link activo
 * y NO suspendido.
 * Usa la clave secreta (los visitantes no tienen acceso a la tabla),
 * por eso solo debe devolverse al navegador el primer nombre.
 */
export async function buscarReferentePorCodigo(codigo: string): Promise<ReferentePublico | null> {
  const valido = campoCodigo.safeParse(codigo);
  if (!valido.success) return null;

  // Dato en vivo (el link puede desactivarse): se consulta en cada visita,
  // no mientras Next.js prepara la página por adelantado.
  await connection();

  const { data, error } = await crearClienteAdmin()
    .from("referentes")
    .select("id, nombre, correo, identificadores")
    .eq("codigo", valido.data)
    .eq("activo", true)
    .eq("suspendido", false)
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
