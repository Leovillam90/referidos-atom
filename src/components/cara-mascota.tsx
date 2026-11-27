"use client";

import { useEffect, useId, useRef } from "react";

/*
 * Cara animable de la mascota, dibujada en SVG encima del visor del PNG.
 *
 * Las coordenadas están en píxeles de public/brand/mascota.png (965×1200):
 * los trazos calcan los ojos ^ ^ y la sonrisa originales. Debajo va un
 * "parche" del mismo negro del visor que tapa los originales, para que al
 * parpadear o cambiar de expresión no se vean los de la imagen.
 *
 * Capas: parche (fijo) · brillo (copia desenfocada que pulsa con opacity,
 * barato para la GPU) · trazo nítido. El parpadeo, la mirada y la expresión
 * se controlan con atributos/variables CSS en el contenedor (.cara).
 */

export type Expresion = "normal" | "feliz" | "triste" | "confundida";

/** Recorte del PNG que ocupa la cara (x, y, ancho, alto). */
const VISTA = { x: 400, y: 190, ancho: 380, alto: 190 } as const;
const IMG = { ancho: 965, alto: 1200 } as const;

const OJO_IZQ = "M452 318 C460 247 543 235 553 298";
const OJO_DER = "M653 288 C658 227 728 227 733 288";
const BOCA = "M571 309 Q605 306 639 302 C641 330 626 344 605 343 C584 342 569 330 571 309Z";

const COLOR_VISOR = "#010309";
const COLOR_TRAZO = "#a6fbfc";
const COLOR_BRILLO = "#14d9ec";

function Rasgos({ color, grosor }: { color: string; grosor: number }) {
  return (
    <g className="cara-mirada" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <g className="cara-ojo cara-ojo-i">
        <g className="cara-parpado">
          <path d={OJO_IZQ} fill="none" strokeWidth={grosor} />
        </g>
      </g>
      <g className="cara-ojo cara-ojo-d">
        <g className="cara-parpado">
          <path d={OJO_DER} fill="none" strokeWidth={grosor} />
        </g>
      </g>
      <g className="cara-boca">
        <path d={BOCA} fill={color} strokeWidth={3} />
      </g>
    </g>
  );
}

function Lienzo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox={`${VISTA.x} ${VISTA.y} ${VISTA.ancho} ${VISTA.alto}`}
      className={className ? `absolute inset-0 size-full overflow-visible ${className}` : "absolute inset-0 size-full overflow-visible"}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CaraMascota({ expresion = "normal", celebrar = false }: { expresion?: Expresion; celebrar?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Ids únicos para los filtros (puede haber dos mascotas en la misma página)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const difuso = `cara-difuso-${id}`;
  const brillo = `cara-brillo-${id}`;

  // Parpadeo natural: cada 3–6 s (aleatorio), a veces doble.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)");
    let temporizador = 0;
    let limpiar = 0;

    function programar() {
      temporizador = window.setTimeout(parpadear, 3000 + Math.random() * 3000);
    }
    function parpadear() {
      if (!quieto.matches && !document.hidden) {
        const doble = Math.random() < 0.25;
        el!.dataset.parpadeo = doble ? "2" : "1";
        limpiar = window.setTimeout(() => delete el!.dataset.parpadeo, doble ? 520 : 240);
      }
      programar();
    }
    programar();
    return () => {
      clearTimeout(temporizador);
      clearTimeout(limpiar);
    };
  }, []);

  // En PC: los ojos miran levemente hacia el mouse.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apto = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let cuadro = 0;

    function mover(e: PointerEvent) {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        const r = el!.getBoundingClientRect();
        if (r.width === 0) return;
        const dx = (e.clientX - (r.left + r.width / 2)) / 450;
        const dy = (e.clientY - (r.top + r.height / 2)) / 350;
        const x = Math.max(-1, Math.min(1, dx)) * 9;
        const y = Math.max(-1, Math.min(1, dy)) * 6;
        el!.style.setProperty("--ox", `${x.toFixed(1)}px`);
        el!.style.setProperty("--oy", `${y.toFixed(1)}px`);
      });
    }
    function activar() {
      if (apto.matches) window.addEventListener("pointermove", mover, { passive: true });
      else {
        window.removeEventListener("pointermove", mover);
        el!.style.removeProperty("--ox");
        el!.style.removeProperty("--oy");
      }
    }
    activar();
    apto.addEventListener("change", activar);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("pointermove", mover);
      apto.removeEventListener("change", activar);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      data-expresion={expresion}
      data-celebrar={celebrar ? "" : undefined}
      className="cara pointer-events-none absolute"
      style={{
        left: `${(VISTA.x / IMG.ancho) * 100}%`,
        top: `${(VISTA.y / IMG.alto) * 100}%`,
        width: `${(VISTA.ancho / IMG.ancho) * 100}%`,
        height: `${(VISTA.alto / IMG.alto) * 100}%`,
      }}
    >
      {/* Parche del visor: tapa los ojos y la boca del PNG */}
      <Lienzo>
        <defs>
          <filter id={difuso} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <g filter={`url(#${difuso})`} fill={COLOR_VISOR} stroke={COLOR_VISOR} strokeLinecap="round" strokeLinejoin="round">
          <path d={OJO_IZQ} strokeWidth={46} />
          <path d={OJO_DER} strokeWidth={46} />
          <path d={BOCA} strokeWidth={26} />
        </g>
      </Lienzo>
      {/* Brillo de pantalla encendida (pulsa solo con opacity) */}
      <div className="cara-brillo absolute inset-0">
        <Lienzo>
          <defs>
            <filter id={brillo} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>
          <g filter={`url(#${brillo})`}>
            <Rasgos color={COLOR_BRILLO} grosor={20} />
          </g>
        </Lienzo>
      </div>
      <Lienzo>
        <Rasgos color={COLOR_TRAZO} grosor={17} />
      </Lienzo>
    </div>
  );
}

/** Destellos alrededor de la cabeza (celebración en /gracias). */
export function Destellos() {
  const destellos = [
    { left: "18%", top: "6%", size: "9%", delay: "0s", color: "#0de8c0" },
    { left: "78%", top: "4%", size: "7%", delay: "0.5s", color: "#c81fda" },
    { left: "86%", top: "26%", size: "6%", delay: "1.1s", color: "#a6fbfc" },
    { left: "8%", top: "28%", size: "6%", delay: "1.6s", color: "#6884c5" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {destellos.map((d) => (
        <svg
          key={d.left}
          viewBox="0 0 24 24"
          className="cara-destello absolute"
          style={{ left: d.left, top: d.top, width: d.size, animationDelay: d.delay }}
        >
          <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill={d.color} />
        </svg>
      ))}
    </div>
  );
}
