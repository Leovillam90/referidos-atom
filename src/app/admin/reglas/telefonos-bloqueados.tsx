"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAISES, PAIS_POR_DEFECTO, ejemploCelular, esPaisPermitido, formatoTelefono, type CodigoPais } from "@/lib/telefono";
import { agregarTelefonoBloqueado, quitarTelefonoBloqueado, type EstadoEdicion } from "../acciones";

const inicial: EstadoEdicion = { ok: false };

export type TelefonoBloqueado = { telefono: string; nota: string | null; created_at: string };

/** Lista de números bloqueados: agregar y quitar (solo super_admin). */
export function TelefonosBloqueados({ lista }: { lista: TelefonoBloqueado[] }) {
  const [estado, accion, guardando] = useActionState(agregarTelefonoBloqueado, inicial);
  const [pais, setPais] = useState<CodigoPais>(PAIS_POR_DEFECTO);
  const e = estado.errores ?? {};

  return (
    <div className="grid gap-5">
      <form action={accion} className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="bloqueo-pais">País</Label>
          <select
            id="bloqueo-pais"
            name="telefono_pais"
            value={pais}
            onChange={(ev) => esPaisPermitido(ev.target.value) && setPais(ev.target.value)}
            className="h-11 rounded-xl border border-input bg-dark-gunmetal/60 px-3 text-sm"
          >
            {PAISES.map((p) => (
              <option key={p.iso} value={p.iso}>
                {p.nombre} (+{p.indicativo})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bloqueo-telefono">Número</Label>
          <Input
            id="bloqueo-telefono"
            name="telefono"
            type="tel"
            inputMode="tel"
            placeholder={ejemploCelular(pais)}
            aria-invalid={e.telefono ? true : undefined}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bloqueo-nota">Nota (opcional)</Label>
          <Input id="bloqueo-nota" name="nota" maxLength={200} placeholder="Ej. usado en registros falsos" />
        </div>
        <Button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Bloquear"}
        </Button>
      </form>
      {(e.telefono || estado.mensaje) && (
        <p
          role={estado.ok ? "status" : "alert"}
          className={estado.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
        >
          {e.telefono ?? estado.mensaje}
        </p>
      )}

      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay números bloqueados.</p>
      ) : (
        <ul className="grid gap-2">
          {lista.map((t) => (
            <li
              key={t.telefono}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-dark-gunmetal/40 px-3.5 py-2.5 text-sm"
            >
              <span>
                <span className="font-bold tabular-nums">{formatoTelefono(t.telefono)}</span>
                {t.nota && <span className="text-muted-foreground"> · {t.nota}</span>}
              </span>
              <form action={quitarTelefonoBloqueado}>
                <input type="hidden" name="telefono" value={t.telefono} />
                <Button type="submit" variant="ghost" size="sm">
                  Quitar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
