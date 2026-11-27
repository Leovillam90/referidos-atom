"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarReglas, type EstadoEdicion } from "../acciones";

const inicial: EstadoEdicion = { ok: false };

type Valores = {
  dias_vigencia_registro: number;
  dias_permanencia_para_pagar: number;
  confirmacion_referido_por_correo: boolean;
  dominios_excluidos: string;
  max_registros_por_link_por_hora: number;
};

function CampoNumero({
  name,
  etiqueta,
  ayuda,
  valor,
  min,
  max,
  error,
}: {
  name: keyof Valores;
  etiqueta: string;
  ayuda: string;
  valor: number;
  min: number;
  max: number;
  error?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{etiqueta}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        defaultValue={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${name}-ayuda`}
        required
      />
      <p id={`${name}-ayuda`} className="text-xs text-muted-foreground">
        {ayuda}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormularioReglas({ valores }: { valores: Valores }) {
  const [estado, accion, guardando] = useActionState(guardarReglas, inicial);
  const e = estado.errores ?? {};

  return (
    <form action={accion} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <CampoNumero
          name="dias_vigencia_registro"
          etiqueta="Días de vigencia del registro"
          ayuda="Plazo para que el referido se active. Si vence, la persona queda libre. Aplica a los registros nuevos."
          valor={valores.dias_vigencia_registro}
          min={1}
          max={365}
          error={e.dias_vigencia_registro}
        />
        <CampoNumero
          name="dias_permanencia_para_pagar"
          etiqueta="Días de permanencia para pagar"
          ayuda="Días que el referido debe seguir activo para que el bono pase a «por pagar». 0 = apenas se activa."
          valor={valores.dias_permanencia_para_pagar}
          min={0}
          max={365}
          error={e.dias_permanencia_para_pagar}
        />
        <CampoNumero
          name="max_registros_por_link_por_hora"
          etiqueta="Máximo de registros por hora"
          ayuda="Por link y por conexión (IP). Frena registros masivos o falsos."
          valor={valores.max_registros_por_link_por_hora}
          min={1}
          max={1000}
          error={e.max_registros_por_link_por_hora}
        />
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">¿El referido debe confirmar por correo?</legend>
          <div className="flex gap-4 text-sm">
            {[
              { valor: "si", texto: "Sí" },
              { valor: "no", texto: "No" },
            ].map((o) => (
              <label key={o.valor} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="confirmacion_referido_por_correo"
                  value={o.valor}
                  defaultChecked={valores.confirmacion_referido_por_correo === (o.valor === "si")}
                  className="accent-primary"
                />
                {o.texto}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Si es «Sí», el referido recibe un correo para confirmar quién lo invitó. Sin confirmar, el registro no cuenta.
          </p>
        </fieldset>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="dominios_excluidos">Dominios excluidos (empleados)</Label>
        <Input
          id="dominios_excluidos"
          name="dominios_excluidos"
          defaultValue={valores.dominios_excluidos}
          placeholder="atomsolutionsdata.com,atomapp.com.co"
          aria-invalid={e.dominios_excluidos ? true : undefined}
          aria-describedby="dominios_excluidos-ayuda"
        />
        <p id="dominios_excluidos-ayuda" className="text-xs text-muted-foreground">
          Separados por coma. Los correos de estos dominios (y sus subdominios) no pueden registrarse como referentes.
        </p>
        {e.dominios_excluidos && <p className="text-xs text-destructive">{e.dominios_excluidos}</p>}
      </div>

      {estado.mensaje && (
        <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {estado.mensaje}
        </p>
      )}

      <Button type="submit" disabled={guardando} className="justify-self-start">
        {guardando ? "Guardando…" : "Guardar reglas"}
      </Button>
    </form>
  );
}
