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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <code className="min-w-0 basis-full truncate sm:basis-auto sm:flex-1 rounded-full border bg-dark-gunmetal/60 px-4 py-2.5 text-sm text-sea-green select-all">
          {url}
        </code>
        <Button type="button" variant="outline" size="lg" onClick={copiar} className="flex-1 sm:flex-none">
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "¡Copiado!" : "Copiar"}
        </Button>
        {puedeCompartir && (
          <Button type="button" size="lg" onClick={compartir} className="flex-1 sm:flex-none">
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
