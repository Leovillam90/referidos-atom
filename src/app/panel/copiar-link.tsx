"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const sinSuscripcion = () => () => {};

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  // En el servidor no existe "navigator": se asume que no, y el navegador
  // muestra el botón Compartir solo si el teléfono/computador lo permite.
  const puedeCompartir = useSyncExternalStore(
    sinSuscripcion,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Si el navegador no deja copiar, la persona puede seleccionar el texto.
    }
  }

  async function compartir() {
    try {
      await navigator.share({
        title: "Únete a ATOM",
        text: "Regístrate en ATOM con mi link de referido:",
        url,
      });
    } catch {
      // La persona canceló el menú de compartir.
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-full border bg-dark-gunmetal/60 px-4 py-2.5 text-sm text-sea-green select-all">
          {url}
        </code>
        <Button type="button" variant="outline" size="lg" onClick={copiar}>
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "¡Copiado!" : "Copiar"}
        </Button>
        {puedeCompartir && (
          <Button type="button" size="lg" onClick={compartir}>
            <Share2 aria-hidden />
            Compartir
          </Button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Link copiado" : ""}
      </span>
    </div>
  );
}
