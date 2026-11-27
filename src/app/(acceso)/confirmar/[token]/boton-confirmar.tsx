"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmarRegistro, type EstadoConfirmacion } from "./acciones";

const inicial: EstadoConfirmacion = { ok: false };

export function BotonConfirmar({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(confirmarRegistro, inicial);

  if (estado.ok) {
    return (
      <p role="status" className="flex gap-3 rounded-2xl border border-sea-green/40 bg-sea-green/10 p-4 text-sm">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-sea-green" aria-hidden />
        {estado.mensaje}
      </p>
    );
  }

  return (
    <form action={accion} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? "Confirmando…" : "Sí, confirmo mi registro"}
      </Button>
      {estado.mensaje && (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
