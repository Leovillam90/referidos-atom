"use client";

import { useEffect, useRef } from "react";

/**
 * Inclina un poco su contenido siguiendo el mouse (máx. ~6°).
 * Solo en PC (≥1024 px con mouse) y si la persona no pidió menos movimiento.
 */
export function ParallaxMouse({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apto = window.matchMedia("(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let cuadro = 0;

    function mover(e: PointerEvent) {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el!.style.setProperty("--px", `${(x * 12).toFixed(2)}deg`);
        el!.style.setProperty("--py", `${(-y * 8).toFixed(2)}deg`);
      });
    }
    function activar() {
      if (apto.matches) window.addEventListener("pointermove", mover, { passive: true });
      else {
        window.removeEventListener("pointermove", mover);
        el!.style.removeProperty("--px");
        el!.style.removeProperty("--py");
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
    <div ref={ref} className={className ? `parallax-mouse ${className}` : "parallax-mouse"}>
      {children}
    </div>
  );
}
