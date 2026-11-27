import Link from "next/link";
import { Logo, PieMarca } from "@/components/marca";
import { cn } from "@/lib/utils";

/**
 * Marco de las páginas públicas (inicio, registro, ingreso, formulario del
 * referido, gracias, errores): fondo de marca, logo vertical y pie.
 * Pensado primero para celular: los referidos llegan por WhatsApp.
 */
export function MarcoAcceso({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      {/* Brillos de color de la marca, solo decorativos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[28rem] bg-[radial-gradient(40%_60%_at_20%_30%,rgb(200_31_218/0.22),transparent),radial-gradient(40%_60%_at_80%_20%,rgb(13_232_192/0.16),transparent)] blur-2xl"
      />
      <main className={cn("flex flex-1 flex-col items-center gap-6 px-4 pt-8 pb-6 sm:justify-center sm:gap-8 sm:pt-12", className)}>
        <Link
          href="/"
          className="rounded-2xl p-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo tipo="vertical" className="h-20 sm:h-24" prioridad />
        </Link>
        {children}
      </main>
      <PieMarca />
    </div>
  );
}
