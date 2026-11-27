import Link from "next/link";
import { FondoDigital } from "@/components/fondo-digital";
import { Logo, PieMarca } from "@/components/marca";
import { Mascota } from "@/components/mascota";
import { cn } from "@/lib/utils";

/**
 * Marco de las páginas públicas (registro, ingreso, formulario del referido,
 * gracias, errores): fondo digital de marca, logo vertical y pie.
 * Pensado primero para celular: los referidos llegan por WhatsApp.
 */
export function MarcoAcceso({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative isolate flex flex-1 flex-col">
      <FondoDigital className="fixed" />
      <main
        className={cn(
          "flex flex-1 flex-col items-center gap-5 px-[clamp(1rem,4vw,2.5rem)] pt-6 pb-6 sm:gap-8 sm:pt-10 lg:justify-center",
          className,
        )}
      >
        <Link
          href="/"
          className="rounded-2xl p-1.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo tipo="vertical" className="h-14 sm:h-20" prioridad />
        </Link>
        {children}
      </main>
      <PieMarca />
    </div>
  );
}

/**
 * Contenido + mascota. En PC: contenido a la izquierda y mascota grande a la
 * derecha (su mano abierta "señala" el contenido). En celular: mascota
 * pequeña arriba (o se oculta con enMovil={false}).
 */
export function ConMascota({
  children,
  movimiento = "flotar",
  enMovil = true,
  prioridad = false,
}: {
  children: React.ReactNode;
  movimiento?: "flotar" | "saltar" | "quieta";
  enMovil?: boolean;
  prioridad?: boolean;
}) {
  return (
    <div className="grid w-full max-w-6xl items-center justify-items-center gap-4 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:gap-14">
      <div className={cn("w-28 sm:w-36 lg:order-last lg:w-full lg:max-w-[26rem]", !enMovil && "hidden lg:block")}>
        <Mascota
          sizes="(min-width: 1024px) 416px, (min-width: 640px) 144px, 112px"
          movimiento={movimiento}
          parallax
          prioridad={prioridad}
        />
      </div>
      <div className="flex w-full justify-center">{children}</div>
    </div>
  );
}
