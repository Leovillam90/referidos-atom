import { cn } from "@/lib/utils";

/* Posiciones fijas (sin aleatorio) para que el servidor y el navegador coincidan. */
const PARTICULAS = [
  { left: "8%", top: "22%", size: 4, delay: "0s", color: "bg-sea-green" },
  { left: "18%", top: "68%", size: 3, delay: "1.5s", color: "bg-steel-pink" },
  { left: "32%", top: "12%", size: 2, delay: "3s", color: "bg-silver-lake-blue" },
  { left: "47%", top: "82%", size: 3, delay: "2s", color: "bg-sea-green" },
  { left: "63%", top: "18%", size: 4, delay: "4s", color: "bg-steel-pink" },
  { left: "78%", top: "58%", size: 3, delay: "0.8s", color: "bg-silver-lake-blue" },
  { left: "90%", top: "30%", size: 2, delay: "2.6s", color: "bg-sea-green" },
  { left: "85%", top: "88%", size: 3, delay: "5s", color: "bg-steel-pink" },
];

const ATOMOS = [
  { left: "12%", top: "40%", size: 46, delay: "1s" },
  { left: "88%", top: "12%", size: 34, delay: "3.5s" },
  { left: "70%", top: "78%", size: 40, delay: "2.2s" },
];

/**
 * Fondo dinámico de la marca: degradados que se mueven lento, rejilla de
 * puntos y partículas/átomos muy tenues. Solo decorativo.
 */
export function FondoDigital({ className, particulas = true }: { className?: string; particulas?: boolean }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      <div className="anim-fondo-a absolute -top-1/4 -left-1/4 h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(200_31_218/0.20),transparent)]" />
      <div className="anim-fondo-b absolute -top-1/5 -right-1/4 h-[65vmax] w-[65vmax] rounded-full bg-[radial-gradient(closest-side,rgb(13_232_192/0.14),transparent)]" />
      <div className="anim-fondo-a absolute top-1/2 left-1/3 h-[55vmax] w-[55vmax] rounded-full bg-[radial-gradient(closest-side,rgb(104_132_197/0.14),transparent)] [animation-delay:-9s]" />
      <div className="fondo-puntos absolute inset-0" />
      {particulas && (
        <>
          {PARTICULAS.map((p, i) => (
            <span
              key={i}
              className={cn("anim-particula absolute rounded-full", p.color)}
              style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: p.delay }}
            />
          ))}
          {ATOMOS.map((a, i) => (
            <svg
              key={i}
              viewBox="0 0 48 48"
              className="anim-particula absolute hidden text-white/15 md:block"
              style={{ left: a.left, top: a.top, width: a.size, height: a.size, animationDelay: a.delay }}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <ellipse cx="24" cy="24" rx="20" ry="8" />
              <ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(60 24 24)" />
              <ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(120 24 24)" />
              <circle cx="24" cy="24" r="2.5" fill="currentColor" />
            </svg>
          ))}
        </>
      )}
    </div>
  );
}
