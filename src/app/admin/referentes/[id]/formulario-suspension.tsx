"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Motivo } from "@/components/campo-motivo";
import { cambiarSuspension, type EstadoEdicion } from "../../acciones";

const inicial: EstadoEdicion = { ok: false };

export function FormularioSuspension({ id, suspendido }: { id: string; suspendido: boolean }) {
  const [estado, accion, enviando] = useActionState(cambiarSuspension, inicial);

  return (
    <form action={accion} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="accion" value={suspendido ? "reactivar" : "suspender"} />
      <Motivo
        error={estado.errores?.motivo}
        ayuda={suspendido ? "Ej. Se revisó el caso y todo está en orden." : "Ej. Registros falsos de personas que no conoce."}
      />
      {estado.mensaje && (
        <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {estado.mensaje}
        </p>
      )}
      <Button
        type="submit"
        variant={suspendido ? "default" : "destructive"}
        disabled={enviando}
        className="justify-self-start"
      >
        {enviando ? "Guardando…" : suspendido ? "Reactivar referente" : "Suspender referente"}
      </Button>
    </form>
  );
}
