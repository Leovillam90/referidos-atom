"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actualizarCruce, type EstadoCruce } from "./acciones";

const inicial: EstadoCruce = { ok: false };

export function BotonCruce() {
  const [estado, accion, cruzando] = useActionState(actualizarCruce, inicial);

  return (
    <form action={accion} className="grid gap-2">
      <Button type="submit" disabled={cruzando} className="justify-self-start">
        <RefreshCw className={cruzando ? "animate-spin" : undefined} aria-hidden />
        {cruzando ? "Cruzando con la hoja…" : "Actualizar cruce con la hoja"}
      </Button>
      {estado.mensaje && (
        <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
