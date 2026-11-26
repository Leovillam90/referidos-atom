"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/campo";
import { AvisoEnviado } from "@/components/aviso-enviado";
import { registrarReferente, type EstadoFormulario } from "../acciones";

const inicial: EstadoFormulario = { ok: false };

export function FormularioRegistro() {
  const [estado, accion, enviando] = useActionState(registrarReferente, inicial);

  if (estado.ok && estado.mensaje) return <AvisoEnviado mensaje={estado.mensaje} />;

  const e = estado.errores ?? {};
  const v = estado.valores ?? {};

  return (
    <form action={accion} className="grid gap-4" noValidate>
      <Campo name="nombre" etiqueta="Nombre completo" autoComplete="name" defaultValue={v.nombre} error={e.nombre} required />
      <Campo name="correo" etiqueta="Correo" type="email" autoComplete="email" inputMode="email" defaultValue={v.correo} error={e.correo} required />
      <Campo
        name="telefono"
        etiqueta="Teléfono"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="300 123 4567"
        defaultValue={v.telefono}
        error={e.telefono}
        required
      />
      <Campo
        name="cuenta_dropi"
        etiqueta="Cuenta Dropi"
        ayuda="El usuario o correo con el que entras a Dropi."
        defaultValue={v.cuenta_dropi}
        error={e.cuenta_dropi}
        required
      />

      {/* Campo trampa para robots: oculto para las personas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          No llenar
          <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {estado.mensaje && !estado.ok && (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? "Enviando…" : "Registrarme"}
      </Button>
    </form>
  );
}
