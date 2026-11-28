"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/campo";
import { CampoCelular } from "@/components/campo-celular";
import { CampoTrampa } from "@/components/campo-trampa";
import { CasillaAutorizacion } from "@/components/casilla-autorizacion";
import { MensajeError } from "@/components/mensaje-formulario";
import { Turnstile } from "@/components/turnstile";
import { AvisoEnviado } from "@/components/aviso-enviado";
import { registrarReferente, type EstadoFormulario } from "../acciones";

const inicial: EstadoFormulario = { ok: false };

export function FormularioRegistro({ claveTurnstile }: { claveTurnstile: string | null }) {
  const [estado, accion, enviando] = useActionState(registrarReferente, inicial);

  if (estado.ok && estado.mensaje) return <AvisoEnviado mensaje={estado.mensaje} correo={estado.correo} />;

  const e = estado.errores ?? {};
  const v = estado.valores ?? {};

  return (
    <form action={accion} className="grid gap-4" noValidate>
      <Campo name="nombre" etiqueta="Nombre completo" autoComplete="name" defaultValue={v.nombre} error={e.nombre} required />
      <Campo name="correo" etiqueta="Correo" type="email" autoComplete="email" inputMode="email" defaultValue={v.correo} error={e.correo} required />
      <CampoCelular defaultValue={v.telefono} defaultPais={v.telefono_pais} error={e.telefono} reinicio={estado} />
      <Campo
        name="cuenta_dropi"
        etiqueta="Cuenta Dropi"
        ayuda="El usuario o correo con el que entras a Dropi."
        defaultValue={v.cuenta_dropi}
        error={e.cuenta_dropi}
        required
      />

      <CasillaAutorizacion
        finalidad="gestionar mi participación como referente y el pago de mis bonos"
        error={e.autoriza_datos}
      />

      <div className="grid gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="acepta_terminos"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            aria-invalid={e.acepta_terminos ? true : undefined}
            aria-describedby={e.acepta_terminos ? "acepta_terminos-error" : undefined}
            required
          />
          <span className="text-muted-foreground">
            Acepto los{" "}
            <Link href="/terminos" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
              términos del programa de referidos
            </Link>
            .
          </span>
        </label>
        {e.acepta_terminos && (
          <p id="acepta_terminos-error" className="text-xs text-destructive">
            {e.acepta_terminos}
          </p>
        )}
      </div>

      <CampoTrampa />

      {claveTurnstile && <Turnstile claveSitio={claveTurnstile} reinicio={estado} />}

      {!estado.ok && <MensajeError mensaje={estado.mensaje} enlace={estado.enlace} />}

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? "Enviando…" : "Registrarme"}
      </Button>
    </form>
  );
}
