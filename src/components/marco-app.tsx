import { LogoEncabezado, PieMarca } from "@/components/marca";
import { cn } from "@/lib/utils";

/**
 * Marco de las páginas con sesión (panel y administración): encabezado fijo
 * con el logo horizontal, línea de degradado de marca y pie.
 */
export function MarcoApp({
  inicio,
  etiqueta,
  acciones,
  ancho = "max-w-6xl",
  children,
}: {
  /** A dónde lleva el logo. */
  inicio: string;
  /** Texto junto al logo (ej. "Referidos", "Super admin"). */
  etiqueta: string;
  /** Botones del encabezado. */
  acciones: React.ReactNode;
  ancho?: "max-w-6xl" | "max-w-7xl";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-dark-gunmetal/90 backdrop-blur supports-backdrop-filter:bg-dark-gunmetal/75">
        <div className={cn("mx-auto flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3", ancho)}>
          <LogoEncabezado href={inicio} etiqueta={etiqueta} />
          <div className="flex flex-wrap items-center gap-1">{acciones}</div>
        </div>
        <div aria-hidden className="linea-degradado h-0.5 rounded-none opacity-80" />
      </header>
      <main className={cn("mx-auto grid w-full gap-6 px-4 py-6 sm:py-8", ancho)}>{children}</main>
      <PieMarca />
    </div>
  );
}
