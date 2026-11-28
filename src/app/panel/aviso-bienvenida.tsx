"use client";

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/client";

const DURACION_MS = 3000;

/**
 * Cuando el link del correo abre el panel en una pestaña nueva
 * (/auth/confirm agrega "?bienvenida=1"):
 *  • muestra "¡Bienvenido! Ya puedes cerrar la otra pestaña" durante 3 s;
 *  • crea el cliente de Supabase del navegador: al encontrar la sesión en
 *    las cookies avisa (SIGNED_IN) a las demás pestañas, y la pestaña de
 *    "Revisa tu correo" pasa sola al panel.
 */
export function AvisoBienvenida() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("bienvenida") !== "1") return;

    // Quitar el parámetro: si recarga la página, no vuelve a salir
    url.searchParams.delete("bienvenida");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

    void crearClienteNavegador().auth.getSession();

    const mostrar = setTimeout(() => setVisible(true), 0);
    const ocultar = setTimeout(() => setVisible(false), DURACION_MS);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(ocultar);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className="flex items-center gap-3 rounded-2xl border border-sea-green/40 bg-dark-gunmetal/95 px-4 py-3 text-sm shadow-lg backdrop-blur animate-in fade-in slide-in-from-top-2"
      >
        <CircleCheck className="size-5 shrink-0 text-sea-green" aria-hidden />
        <p>
          <span className="font-bold">¡Bienvenido!</span>{" "}
          <span className="text-muted-foreground">Ya puedes cerrar la otra pestaña.</span>
        </p>
      </div>
    </div>
  );
}
