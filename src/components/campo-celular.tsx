"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  AR, BO, BR, CL, CO, CR, CU, DO, EC, ES, GT, HN, MX, NI, PA, PE, PR, PY, SV, US, UY, VE,
} from "country-flag-icons/react/3x2";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PAISES,
  PAIS_POR_DEFECTO,
  datosPais,
  detectarPais,
  ejemploCelular,
  emojiBandera,
  esPaisPermitido,
  validarCelular,
  type CodigoPais,
} from "@/lib/telefono";

// Banderas en SVG: se ven igual en Windows, Mac, Android y iPhone
const BANDERAS: Record<CodigoPais, typeof CO> = {
  AR, BO, BR, CL, CO, CR, CU, DO, EC, ES, GT, HN, MX, NI, PA, PE, PR, PY, SV, US, UY, VE,
};

type Props = {
  /** Valor que la persona había escrito (si el servidor devolvió el formulario) */
  defaultValue?: string;
  defaultPais?: string;
  /** Error que devolvió el servidor */
  error?: string;
  /** Cambia en cada respuesta del servidor (el estado del formulario) */
  reinicio?: unknown;
};

/**
 * Celular con selector de país (Colombia por defecto). Envía "telefono"
 * tal como lo escribió la persona y "telefono_pais" (CO, MX…): el
 * servidor y la base de datos lo validan otra vez y lo guardan en el
 * formato estándar. Aquí se valida al salir del campo, para avisar rápido.
 */
export function CampoCelular({ defaultValue = "", defaultPais, error, reinicio }: Props) {
  const [pais, setPais] = useState<CodigoPais>(esPaisPermitido(defaultPais) ? defaultPais : PAIS_POR_DEFECTO);
  const [valor, setValor] = useState(defaultValue);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  // El error del servidor se muestra hasta que la persona cambia algo
  const [mostrarErrorServidor, setMostrarErrorServidor] = useState(true);
  const [respuesta, setRespuesta] = useState(reinicio);
  if (respuesta !== reinicio) {
    // Nueva respuesta del servidor: se muestra su error
    setRespuesta(reinicio);
    setMostrarErrorServidor(true);
    setErrorLocal(null);
  }

  const revisar = (texto: string, p: CodigoPais) => {
    if (!texto.trim()) return setErrorLocal(null);
    const r = validarCelular(texto, p);
    setErrorLocal(r.ok ? null : r.mensaje);
  };

  const cambiarValor = (texto: string) => {
    setValor(texto);
    setMostrarErrorServidor(false);
    // Si pega "+56 9…" con Colombia elegido, el selector pasa a Chile
    const detectado = detectarPais(texto);
    if (detectado && detectado !== pais) setPais(detectado);
    if (errorLocal) revisar(texto, detectado ?? pais);
  };

  const cambiarPais = (p: CodigoPais) => {
    setPais(p);
    setMostrarErrorServidor(false);
    if (valor.trim()) revisar(valor, p);
  };

  const mensaje = errorLocal ?? (mostrarErrorServidor ? error : undefined);
  const Bandera = BANDERAS[pais];
  const datos = datosPais(pais);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="telefono">Celular</Label>
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="flex h-11 items-center gap-2 rounded-xl border border-input bg-dark-gunmetal/60 px-3 text-sm"
          >
            <Bandera className="h-3.5 w-auto rounded-[2px]" />
            <span className="tabular-nums">+{datos.indicativo}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </div>
          <select
            name="telefono_pais"
            aria-label="País del celular"
            value={pais}
            onChange={(e) => esPaisPermitido(e.target.value) && cambiarPais(e.target.value)}
            className="peer absolute inset-0 cursor-pointer rounded-xl opacity-0 focus-visible:opacity-0"
          >
            {PAISES.map((p) => (
              <option key={p.iso} value={p.iso}>
                {emojiBandera(p.iso)} {p.nombre} (+{p.indicativo})
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50" />
        </div>
        <Input
          id="telefono"
          name="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={ejemploCelular(pais)}
          value={valor}
          onChange={(e) => cambiarValor(e.target.value)}
          onBlur={() => revisar(valor, pais)}
          aria-invalid={mensaje ? true : undefined}
          aria-describedby={mensaje ? "telefono-error" : undefined}
          required
        />
      </div>
      {mensaje && (
        <p id="telefono-error" className="text-xs text-destructive" role="alert">
          {mensaje}
        </p>
      )}
    </div>
  );
}
