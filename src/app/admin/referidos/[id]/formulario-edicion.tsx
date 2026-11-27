"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Motivo } from "@/components/campo-motivo";
import { ESTADOS_BONO, ESTADOS_MANUALES, type EstadoBono, type Plan } from "@/lib/estados";
import { formatoPesos } from "@/lib/formato";
import { editarReferido, volverAUsarHoja, type EstadoEdicion } from "../../acciones";

const inicial: EstadoEdicion = { ok: false };
const selectClase =
  "h-11 w-full rounded-xl border border-input bg-dark-gunmetal/60 px-3.5 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Props = {
  id: string;
  planes: Plan[];
  valores: {
    plan_afiliado_id: string | null;
    afiliado_atom: boolean | null;
    bono: number | null;
    estado_bono: EstadoBono;
    vence_en: string | null;
  };
};

/** "2026-12-24T04:59:59Z" → "2026-12-23" (día en Colombia), para el campo de fecha. */
function diaColombia(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
}


export function FormularioEdicion({ id, planes, valores }: Props) {
  const [estado, accion, guardando] = useActionState(editarReferido, inicial);
  const [bono, setBono] = useState(valores.bono === null ? "" : String(valores.bono));
  const e = estado.errores ?? {};

  return (
    <form action={accion} className="grid gap-4">
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="plan_afiliado_id">Plan afiliado</Label>
          <select
            id="plan_afiliado_id"
            name="plan_afiliado_id"
            defaultValue={valores.plan_afiliado_id ?? ""}
            className={selectClase}
            onChange={(ev) => {
              // Sugerir el bono del plan elegido (se puede cambiar)
              const plan = planes.find((p) => p.id === ev.target.value);
              if (plan) setBono(String(plan.bono));
            }}
          >
            <option value="">Sin plan</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · bono {formatoPesos(p.bono)}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">¿Activo en ATOM?</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="afiliado_atom" value="si" defaultChecked={valores.afiliado_atom === true} className="accent-primary" />
              Sí
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="afiliado_atom" value="no" defaultChecked={valores.afiliado_atom !== true} className="accent-primary" />
              No
            </label>
          </div>
          {e.afiliado_atom && <p className="text-xs text-destructive">{e.afiliado_atom}</p>}
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="bono">Valor del bono (COP)</Label>
          <Input
            id="bono"
            name="bono"
            inputMode="numeric"
            value={bono}
            onChange={(ev) => setBono(ev.target.value)}
            placeholder="Ej. 80000"
            aria-invalid={e.bono ? true : undefined}
          />
          {e.bono && <p className="text-xs text-destructive">{e.bono}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="estado_bono">Estado del bono</Label>
          <select id="estado_bono" name="estado_bono" defaultValue={valores.estado_bono} className={selectClase}>
            {ESTADOS_BONO.filter((s) => (ESTADOS_MANUALES as readonly string[]).includes(s.id)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.titulo} — {s.detalle}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Para marcarlo como pagado, registra el pago desde la página del referente. «Vencido» deja a la persona libre
            para que otro referente la registre.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="vence_en">Vence el (opcional)</Label>
          <Input
            id="vence_en"
            name="vence_en"
            type="date"
            defaultValue={diaColombia(valores.vence_en)}
            aria-invalid={e.vence_en ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">Para ampliar o acortar el plazo de este registro.</p>
          {e.vence_en && <p className="text-xs text-destructive">{e.vence_en}</p>}
        </div>
      </div>

      <Motivo error={e.motivo} ayuda="Ej. Se activó dentro del plazo, pero la hoja se actualizó tarde." />

      {estado.mensaje && (
        <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {estado.mensaje}
        </p>
      )}

      <Button type="submit" disabled={guardando} className="justify-self-start">
        {guardando ? "Guardando…" : "Guardar excepción"}
      </Button>
    </form>
  );
}

export function BotonVolverAHoja({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(volverAUsarHoja, inicial);
  return (
    <form action={accion} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Motivo id="motivo-volver" error={estado.errores?.motivo} ayuda="Ej. La excepción ya no aplica." />
      <Button type="submit" variant="outline" disabled={enviando} className="justify-self-start">
        {enviando ? "Actualizando…" : "Volver a seguir las reglas"}
      </Button>
      {estado.mensaje && (
        <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
