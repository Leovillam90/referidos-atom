"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/campo";
import { AvisoEnviado } from "@/components/aviso-enviado";
import { enviarLinkIngreso, type EstadoFormulario } from "../acciones";

const inicial: EstadoFormulario = { ok: false };

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(enviarLinkIngreso, inicial);

  if (estado.ok && estado.mensaje) return <AvisoEnviado mensaje={estado.mensaje} correo={estado.correo} />;

  return (
    <form action={accion} className="grid gap-4" noValidate>
      <Campo
        name="correo"
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={estado.valores?.correo}
        error={estado.errores?.correo}
        required
      />
      {estado.mensaje && !estado.ok && (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviarme el link de acceso"}
      </Button>
    </form>
  );
}
