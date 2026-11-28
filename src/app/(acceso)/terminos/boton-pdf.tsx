"use client";

import { Button } from "@/components/ui/button";

/**
 * Abre el diálogo de impresión del navegador, donde se elige «Guardar como
 * PDF». La página tiene estilos de impresión (fondo blanco, sin logo ni pie).
 */
export function BotonPdf() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      Descargar PDF
    </Button>
  );
}
