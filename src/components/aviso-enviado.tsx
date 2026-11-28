"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Largo del código del correo. Supabase permite de 6 a 10 dígitos
 * (Authentication → Providers → Email → "Email OTP Length"); se aceptan
 * todos para que el código nunca quede recortado.
 */
const LARGO_MIN = 6;
const LARGO_MAX = 10;
/** Espera antes de ir al panel cuando la sesión se inició en otra pestaña. */
const ESPERA_REDIRECCION_MS = 2000;

type Fase = "esperando" | "verificando" | "listo" | "entrando";

/** /admin para el super_admin; /panel para los demás. */
async function destinoTrasIngreso() {
  const { data } = await crearClienteNavegador().rpc("es_super_admin");
  return data === true ? "/admin" : "/panel";
}

function mensajeErrorCodigo(error: { code?: string; status?: number; message?: string }) {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return "Hiciste varios intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
  }
  // Supabase responde igual (otp_expired) si el código está mal o si venció
  if (error.code === "otp_expired" || /expired|invalid/i.test(error.message ?? "")) {
    return "El código no es correcto o ya venció. Revisa que sea el del correo más reciente; si pasó más de 1 hora o ya usaste el link, pide uno nuevo.";
  }
  return "No pudimos revisar el código. Revisa tu conexión e intenta de nuevo.";
}

/**
 * Pantalla "Revisa tu correo" (después del registro y del ingreso).
 *  1. Si la persona abre el link en otra pestaña, Supabase avisa a esta
 *     (onAuthStateChange se sincroniza entre pestañas y vuelve a revisar
 *     las cookies cuando la pestaña queda visible): se muestra "¡Listo!"
 *     y en 2 segundos se va al panel.
 *  2. Como alternativa, puede escribir el código del correo
 *     (útil si el link se abre en el navegador de la app de Gmail, que no
 *     comparte la sesión con el navegador donde se pidió).
 */
export function AvisoEnviado({ mensaje, correo }: { mensaje: string; correo?: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("esperando");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const faseRef = useRef<Fase>("esperando");
  const campoRef = useRef<HTMLInputElement>(null);

  function cambiarFase(f: Fase) {
    faseRef.current = f;
    setFase(f);
  }

  // 1. Sesión iniciada en otra pestaña
  useEffect(() => {
    if (!correo) return;
    const supabase = crearClienteNavegador();
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento !== "SIGNED_IN" && evento !== "INITIAL_SESSION") return;
      // Solo la sesión de ESTE correo (no una sesión vieja de otra cuenta)
      if (sesion?.user.email?.toLowerCase() !== correo.toLowerCase()) return;
      // Con el código, esta misma pestaña ya se encarga de entrar
      if (faseRef.current !== "esperando") return;
      cambiarFase("listo");
      // Fuera del callback: Supabase recomienda no llamar a la API dentro de él
      temporizador = setTimeout(async () => {
        router.replace(await destinoTrasIngreso());
      }, ESPERA_REDIRECCION_MS);
    });

    return () => {
      data.subscription.unsubscribe();
      clearTimeout(temporizador);
    };
  }, [correo, router]);

  // 2. Código del correo
  async function verificar(valor: string) {
    if (!correo || faseRef.current !== "esperando") return;
    if (valor.length < LARGO_MIN) {
      setError(`Escribe el código completo (${LARGO_MIN} dígitos o más).`);
      return;
    }
    setError(null);
    cambiarFase("verificando");
    const { error: e } = await crearClienteNavegador().auth.verifyOtp({ email: correo, token: valor, type: "email" });
    if (e) {
      console.error("[codigo] verifyOtp:", e.status, e.code, e.message);
      setError(mensajeErrorCodigo(e));
      cambiarFase("esperando");
      setCodigo("");
      requestAnimationFrame(() => campoRef.current?.focus());
      return;
    }
    cambiarFase("entrando");
    router.replace(await destinoTrasIngreso());
  }

  function alEscribir(texto: string) {
    // Acepta el código pegado con espacios o guiones ("123 456", "123-456")
    const limpio = texto.replace(/\D/g, "").slice(0, LARGO_MAX);
    setCodigo(limpio);
    if (error) setError(null);
    // Pegado o autocompletado (llega todo de una vez): se envía solo.
    // Escrito a mano: con el botón, porque no sabemos cuántos dígitos trae.
    if (limpio.length >= LARGO_MIN && limpio.length - codigo.length > 1) void verificar(limpio);
  }

  if (fase === "listo" || fase === "entrando") {
    return (
      <div role="status" className="flex gap-3 rounded-2xl border border-sea-green/40 bg-sea-green/10 p-4 text-sm">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-sea-green" aria-hidden />
        <div className="grid gap-1">
          <p className="font-bold">¡Listo! Ya iniciaste sesión</p>
          <p className="text-muted-foreground">Te estamos llevando a tu panel…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div role="status" className="flex gap-3 rounded-2xl border border-sea-green/40 bg-sea-green/10 p-4 text-sm">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-sea-green" aria-hidden />
        <div className="grid gap-1">
          <p className="font-bold">Revisa tu correo</p>
          <p className="text-muted-foreground">{mensaje}</p>
          <p className="text-muted-foreground">El link y el código vencen en 1 hora y solo sirven una vez.</p>
        </div>
      </div>

      {correo && (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verificar(codigo);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="codigo-acceso">¿Prefieres usar un código?</Label>
            <p id="codigo-acceso-ayuda" className="text-xs text-muted-foreground">
              Escribe el código que te enviamos (el del correo más reciente).
            </p>
            <Input
              ref={campoRef}
              id="codigo-acceso"
              name="codigo"
              value={codigo}
              onChange={(e) => alEscribir(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              // Más largo que el código para poder pegarlo con espacios o guiones
              maxLength={LARGO_MAX + 6}
              placeholder={"0".repeat(LARGO_MIN)}
              disabled={fase === "verificando"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "codigo-acceso-ayuda codigo-acceso-error" : "codigo-acceso-ayuda"}
              className="h-12 text-center font-mono text-2xl tracking-[0.3em] md:text-2xl"
            />
            {error && (
              <p id="codigo-acceso-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" variant="outline" disabled={fase === "verificando"}>
            {fase === "verificando" ? "Revisando…" : "Entrar con el código"}
          </Button>
        </form>
      )}
    </div>
  );
}
