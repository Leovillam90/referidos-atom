"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoPesos } from "@/lib/formato";
import { MAX_SOPORTE_BYTES, TIPOS_SOPORTE } from "@/lib/validaciones";
import { prepararSoporte, registrarPago } from "../../acciones";

type PorPagar = { id: string; nombre: string; detalle: string; bono: number | null };

const TIPOS = Object.keys(TIPOS_SOPORTE);

/**
 * Registrar el pago de uno o varios referidos "por pagar" de un referente.
 * El soporte se sube directo del navegador al bucket privado con un
 * permiso de un solo uso que da el servidor; luego se registra el pago.
 */
export function FormularioPago({ referenteId, porPagar, hoy }: { referenteId: string; porPagar: PorPagar[]; hoy: string }) {
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(porPagar.map((r) => r.id)));
  const [valorManual, setValorManual] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);

  const sugerido = useMemo(
    () => porPagar.filter((r) => seleccion.has(r.id)).reduce((s, r) => s + (r.bono ?? 0), 0),
    [porPagar, seleccion],
  );
  const valor = valorManual ?? String(sugerido);

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const archivo = datos.get("soporte");
    const fecha = String(datos.get("fecha") ?? "");
    const nota = String(datos.get("nota") ?? "");

    const e: Record<string, string> = {};
    if (seleccion.size === 0) e.referidoIds = "Elige al menos un referido";
    if (!fecha) e.fecha = "Escribe la fecha de pago";
    if (!/\d/.test(valor)) e.valor = "Escribe el valor pagado";
    if (!(archivo instanceof File) || archivo.size === 0) e.soporte = "Adjunta el soporte del pago";
    else if (!TIPOS.includes(archivo.type)) e.soporte = "Debe ser una imagen (JPG, PNG o WEBP) o un PDF";
    else if (archivo.size > MAX_SOPORTE_BYTES) e.soporte = "El archivo no puede pesar más de 5 MB";
    setErrores(e);
    setMensaje(null);
    if (Object.keys(e).length > 0 || !(archivo instanceof File)) return;

    iniciar(async () => {
      // 1. Permiso de subida
      const permiso = await prepararSoporte({ referenteId, tipo: archivo.type, tamano: archivo.size });
      if (!permiso.ok) {
        setMensaje({ ok: false, texto: permiso.mensaje });
        return;
      }
      // 2. Subida directa al bucket privado
      const { error } = await crearClienteNavegador()
        .storage.from("soportes-pagos")
        .uploadToSignedUrl(permiso.path, permiso.token, archivo, { contentType: archivo.type });
      if (error) {
        setMensaje({ ok: false, texto: "No se pudo subir el soporte. Revisa tu conexión e intenta de nuevo." });
        return;
      }
      // 3. Registrar el pago
      const r = await registrarPago({
        referenteId,
        referidoIds: [...seleccion],
        fecha,
        valor,
        nota: nota || undefined,
        soportePath: permiso.path,
      });
      setErrores(r.errores ?? {});
      setMensaje({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        formulario.current?.reset();
        setValorManual(null);
        setSeleccion(new Set());
      }
    });
  }

  if (porPagar.length === 0) {
    return (
      <div className="grid gap-2">
        {mensaje && <p role="status" className="text-sm text-muted-foreground">{mensaje.texto}</p>}
        <p className="text-sm text-muted-foreground">Este referente no tiene referidos por pagar.</p>
      </div>
    );
  }

  return (
    <form ref={formulario} onSubmit={enviar} className="grid gap-5" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Referidos que cubre este pago</legend>
        {porPagar.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-dark-gunmetal/40 p-3.5 text-sm has-checked:border-sea-green has-checked:bg-sea-green/10">
            <input type="checkbox" checked={seleccion.has(r.id)} onChange={() => alternar(r.id)} className="size-4 accent-primary" />
            <span className="grid flex-1">
              <span className="font-medium">{r.nombre}</span>
              <span className="text-xs text-muted-foreground">{r.detalle}</span>
            </span>
            <span className="tabular-nums">{r.bono === null ? "Sin bono" : formatoPesos(r.bono)}</span>
          </label>
        ))}
        {errores.referidoIds && <p className="text-xs text-destructive">{errores.referidoIds}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fecha">Fecha de pago</Label>
          <Input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} aria-invalid={errores.fecha ? true : undefined} />
          {errores.fecha && <p className="text-xs text-destructive">{errores.fecha}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="valor">Valor pagado (COP)</Label>
          <Input
            id="valor"
            name="valor"
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValorManual(e.target.value)}
            aria-invalid={errores.valor ? true : undefined}
          />
          {errores.valor ? (
            <p className="text-xs text-destructive">{errores.valor}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Suma de los bonos elegidos: {formatoPesos(sugerido)}
              {valorManual !== null && (
                <>
                  {" · "}
                  <button type="button" className="underline" onClick={() => setValorManual(null)}>
                    usar la suma
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nota">Nota (opcional)</Label>
        <Input id="nota" name="nota" maxLength={500} placeholder="Ej. Transferencia Bancolombia" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="soporte">Soporte del pago</Label>
        <Input id="soporte" name="soporte" type="file" accept={TIPOS.join(",")} aria-invalid={errores.soporte ? true : undefined} />
        {errores.soporte ? (
          <p className="text-xs text-destructive">{errores.soporte}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Imagen o PDF de máximo 5 MB. Solo lo verán tú y este referente.</p>
        )}
      </div>

      {mensaje && (
        <p role={mensaje.ok ? "status" : "alert"} className={mensaje.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {mensaje.texto}
        </p>
      )}

      <Button type="submit" size="lg" disabled={enviando} className="justify-self-start">
        {enviando ? "Registrando pago…" : `Marcar ${seleccion.size} como pagado${seleccion.size === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}
