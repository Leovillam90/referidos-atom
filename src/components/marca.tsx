import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * Logos oficiales de ATOM Solutions Data (public/brand/).
 * Reglas del manual: no deformar, recolorear ni rotar; respetar el espacio
 * de protección (el padding alrededor del logo). La app es oscura, por eso
 * se usan las versiones con texto blanco.
 */
const LOGOS = {
  horizontal: { src: "/brand/logo-horizontal-texto-blanco.png", ancho: 900, alto: 201, sizes: "160px" },
  vertical: { src: "/brand/logo-vertical-texto-blanco.png", ancho: 760, alto: 600, sizes: "128px" },
} as const;

export function Logo({
  tipo,
  className,
  prioridad = false,
}: {
  tipo: keyof typeof LOGOS;
  /** Controla el tamaño con la altura (h-*) para no deformarlo. */
  className?: string;
  prioridad?: boolean;
}) {
  const logo = LOGOS[tipo];
  return (
    <Image
      src={logo.src}
      width={logo.ancho}
      height={logo.alto}
      sizes={logo.sizes}
      alt="ATOM Solutions Data"
      priority={prioridad}
      className={cn("w-auto select-none", className)}
    />
  );
}

/** Logo horizontal enlazado, para los encabezados. */
export function LogoEncabezado({ href = "/", etiqueta }: { href?: string; etiqueta?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-3 rounded-lg p-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <Logo tipo="horizontal" className="h-7 sm:h-8" prioridad />
      {etiqueta && (
        <span className="hidden border-l border-white/15 pl-3 text-sm font-medium text-muted-foreground sm:inline">
          {etiqueta}
        </span>
      )}
    </Link>
  );
}

/** Valores de la marca, en una línea. */
export const VALORES = ["Confianza", "Seguridad", "Calidad", "Rapidez", "Acompañamiento"] as const;

export function LineaValores({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Nuestros valores"
      className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground sm:text-sm", className)}
    >
      {VALORES.map((v, i) => (
        <li key={v} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="size-1 rounded-full bg-sea-green" />}
          {v}
        </li>
      ))}
    </ul>
  );
}

/** Pie de página común. */
export function PieMarca() {
  return (
    <footer className="px-4 pt-2 pb-6 text-center text-xs text-muted-foreground">
      ATOM Solutions Data · Programa de referidos
    </footer>
  );
}
