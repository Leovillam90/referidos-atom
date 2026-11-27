"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opciones: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Casilla anti-robots de Cloudflare Turnstile. Agrega al formulario el
 * campo oculto "cf-turnstile-response", que el servidor verifica.
 * `reinicio` cambia en cada envío: el token sirve una sola vez, así que
 * después de un error se pide uno nuevo.
 */
export function Turnstile({ claveSitio, reinicio }: { claveSitio: string; reinicio?: unknown }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  const dibujar = () => {
    if (!window.turnstile || !contenedor.current || widget.current) return;
    widget.current = window.turnstile.render(contenedor.current, {
      sitekey: claveSitio,
      language: "es",
      theme: "dark",
      size: "flexible",
    });
  };

  useEffect(() => {
    dibujar();
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSitio]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [reinicio]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={dibujar} />
      <div ref={contenedor} className="min-h-[65px]" />
    </>
  );
}
