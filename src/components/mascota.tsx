import Image from "next/image";
import { ParallaxMouse } from "@/components/parallax-mouse";
import { cn } from "@/lib/utils";

/*
 * Mascota de ATOM (public/brand/mascota.webp, 965×1200, con mascota.png de
 * respaldo). Nunca se deforma ni se recolorea: el tamaño se controla con el
 * ancho del contenedor y la imagen conserva su proporción.
 *
 * Capas (cada una con su propia animación, para que no choquen):
 *   halo (respira) · parallax (mouse, solo PC) · entrada (rebote) ·
 *   flotación o salto · saludo (al pasar por el botón principal)
 */
export const MASCOTA = { src: "/brand/mascota.webp", ancho: 965, alto: 1200 } as const;

export function Mascota({
  className,
  sizes,
  prioridad = false,
  movimiento = "flotar",
  parallax = false,
  halo = true,
  haloEnMovil = true,
  alt = "Mascota de ATOM",
}: {
  /** Ancho de la mascota (ej. "w-64 lg:w-[30rem]"). */
  className?: string;
  /** Ancho real en pantalla, para que el celular descargue una imagen pequeña. */
  sizes: string;
  prioridad?: boolean;
  movimiento?: "flotar" | "saltar" | "quieta";
  parallax?: boolean;
  halo?: boolean;
  /** false: el halo solo se ve en PC (si el contenedor recorta la mascota en el celular). */
  haloEnMovil?: boolean;
  alt?: string;
}) {
  const imagen = (
    <div className="anim-entrada">
      <div className={cn(movimiento === "flotar" && "anim-flotar", movimiento === "saltar" && "anim-salto")}>
        <div className={cn(movimiento !== "quieta" && "anim-vida")}>
          <div className="anim-saludo">
            <Image
              src={MASCOTA.src}
              width={MASCOTA.ancho}
              height={MASCOTA.alto}
              sizes={sizes}
              alt={alt}
              priority={prioridad}
              fetchPriority={prioridad ? "high" : undefined}
              className="h-auto w-full select-none"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("mascota relative isolate", className)}>
      {halo && (
        <div
          aria-hidden
          className={cn("anim-halo absolute -inset-[6%] -z-10 bg-[radial-gradient(closest-side_at_35%_55%,rgb(200_31_218/0.55),transparent_70%),radial-gradient(closest-side_at_50%_40%,rgb(104_132_197/0.45),transparent_75%),radial-gradient(closest-side_at_68%_50%,rgb(13_232_192/0.45),transparent_70%)]", !haloEnMovil && "hidden lg:block")}
        />
      )}
      {/* Sombra bajo los pies (degradado, sin filtros: más liviano que drop-shadow) */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-[18%] bottom-[-2%] -z-10 h-[6%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.55),transparent)]",
          movimiento === "flotar" && "anim-sombra",
          movimiento === "saltar" && "anim-sombra-salto",
        )}
      />
      {parallax ? <ParallaxMouse>{imagen}</ParallaxMouse> : imagen}
    </div>
  );
}
