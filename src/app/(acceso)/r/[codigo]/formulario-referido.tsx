"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/campo";
import { CampoCelular } from "@/components/campo-celular";
import { CampoTrampa } from "@/components/campo-trampa";
import { CasillaAutorizacion } from "@/components/casilla-autorizacion";
import { MensajeError } from "@/components/mensaje-formulario";
import { Turnstile } from "@/components/turnstile";
import { cn } from "@/lib/utils";
import type { PlanBasico } from "@/lib/estados";
import type { EstadoFormulario } from "../../acciones";
import { registrarReferido } from "./acciones";

const inicial: EstadoFormulario = { ok: false };

const TIPOS = [
  { valor: "proveedor", titulo: "Proveedor", detalle: "Tengo productos para vender en Dropi" },
  { valor: "marca", titulo: "Marca", detalle: "Tengo una marca propia" },
] as const;

export function FormularioReferido({
  codigo,
  planes,
  claveTurnstile,
}: {
  codigo: string;
  planes: PlanBasico[];
  claveTurnstile: string | null;
}) {
  const [estado, accion, enviando] = useActionState(registrarReferido, inicial);

  const e = estado.errores ?? {};
  const v = estado.valores ?? {};

  return (
    <form action={accion} className="grid gap-4" noValidate>
      <input type="hidden" name="codigo" value={codigo} />

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

      <fieldset className="grid gap-2" aria-describedby={e.tipo ? "tipo-error" : undefined}>
        <legend className="mb-1.5 text-sm font-bold">¿Qué eres?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS.map((t) => (
            <label
              key={t.valor}
              className={cn(
                "flex cursor-pointer gap-3 rounded-2xl border bg-dark-gunmetal/40 p-3.5 text-sm transition-colors",
                "has-checked:border-sea-green has-checked:bg-sea-green/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                e.tipo && "border-destructive",
              )}
            >
              <input
                type="radio"
                name="tipo"
                value={t.valor}
                defaultChecked={v.tipo === t.valor}
                className="mt-0.5 accent-primary"
                required
              />
              <span className="grid gap-0.5">
                <span className="font-bold">{t.titulo}</span>
                <span className="text-xs text-muted-foreground">{t.detalle}</span>
              </span>
            </label>
          ))}
        </div>
        {e.tipo && (
          <p id="tipo-error" className="text-xs text-destructive">
            {e.tipo}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-2" aria-describedby={e.plan_solicitado ? "plan-error" : undefined}>
        <legend className="mb-1.5 text-sm font-bold">¿Qué plan te interesa?</legend>
        <div className="grid gap-2">
          {planes.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border bg-dark-gunmetal/40 p-3.5 text-sm transition-colors",
                "has-checked:border-sea-green has-checked:bg-sea-green/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                e.plan_solicitado && "border-destructive",
              )}
            >
              <input
                type="radio"
                name="plan_solicitado"
                value={p.id}
                defaultChecked={v.plan_solicitado === p.id}
                className="accent-primary"
                required
              />
              <span className="font-bold">{p.nombre}</span>
            </label>
          ))}
        </div>
        {e.plan_solicitado && (
          <p id="plan-error" className="text-xs text-destructive">
            {e.plan_solicitado}
          </p>
        )}
      </fieldset>

      <CasillaAutorizacion
        finalidad="contactarme y gestionar el programa de referidos"
        error={e.autoriza_datos}
      />

      <CampoTrampa />

      {claveTurnstile && <Turnstile claveSitio={claveTurnstile} reinicio={estado} />}

      {!estado.ok && <MensajeError mensaje={estado.mensaje} enlace={estado.enlace} codigo={estado.codigo} />}

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar mis datos"}
      </Button>
    </form>
  );
}
