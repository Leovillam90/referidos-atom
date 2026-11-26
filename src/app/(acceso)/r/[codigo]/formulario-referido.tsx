"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/campo";
import { cn } from "@/lib/utils";
import type { PlanBasico } from "@/lib/estados";
import type { EstadoFormulario } from "../../acciones";
import { registrarReferido } from "./acciones";

const inicial: EstadoFormulario = { ok: false };

const TIPOS = [
  { valor: "proveedor", titulo: "Proveedor", detalle: "Tengo productos para vender en Dropi" },
  { valor: "marca", titulo: "Marca", detalle: "Tengo una marca propia" },
] as const;

export function FormularioReferido({ codigo, planes }: { codigo: string; planes: PlanBasico[] }) {
  const [estado, accion, enviando] = useActionState(registrarReferido, inicial);

  const e = estado.errores ?? {};
  const v = estado.valores ?? {};

  return (
    <form action={accion} className="grid gap-4" noValidate>
      <input type="hidden" name="codigo" value={codigo} />

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

      <fieldset className="grid gap-2" aria-describedby={e.tipo ? "tipo-error" : undefined}>
        <legend className="mb-1.5 text-sm font-medium">¿Qué eres?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS.map((t) => (
            <label
              key={t.valor}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors",
                "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
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
                <span className="font-medium">{t.titulo}</span>
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
        <legend className="mb-1.5 text-sm font-medium">¿Qué plan te interesa?</legend>
        <div className="grid gap-2">
          {planes.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors",
                "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
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
              <span className="font-medium">{p.nombre}</span>
            </label>
          ))}
        </div>
        {e.plan_solicitado && (
          <p id="plan-error" className="text-xs text-destructive">
            {e.plan_solicitado}
          </p>
        )}
      </fieldset>

      <div className="grid gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="autoriza_datos"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            aria-invalid={e.autoriza_datos ? true : undefined}
            aria-describedby={e.autoriza_datos ? "autoriza_datos-error" : undefined}
            required
          />
          <span className="text-muted-foreground">
            Autorizo a ATOM a tratar mis datos personales para contactarme y gestionar el programa de
            referidos, según la{" "}
            <Link
              href="/politica-datos"
              target="_blank"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              política de tratamiento de datos
            </Link>{" "}
            (Ley 1581 de 2012).
          </span>
        </label>
        {e.autoriza_datos && (
          <p id="autoriza_datos-error" className="text-xs text-destructive">
            {e.autoriza_datos}
          </p>
        )}
      </div>

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
        {enviando ? "Enviando…" : "Enviar mis datos"}
      </Button>
    </form>
  );
}
