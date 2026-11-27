import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LogoEncabezado } from "@/components/marca";

/** Encabezado fijo y translúcido (efecto vidrio) de las páginas públicas. */
export function EncabezadoPublico() {
  return (
    <header className="vidrio sticky top-0 z-30 border-b border-white/8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-[clamp(1rem,4vw,2.5rem)] py-3">
        <LogoEncabezado href="/" />
        <nav aria-label="Acceso" className="flex items-center gap-2">
          <Link href="/ingresar" className={buttonVariants({ variant: "ghost", size: "sm", className: "h-10 px-4" })}>
            Entrar
          </Link>
          {/* En el celular, un botón corto; en pantallas más anchas, el texto completo */}
          <Link href="/registro" className={buttonVariants({ size: "sm", className: "h-10 px-4" })}>
            <span className="sm:hidden">Registrarme</span>
            <span className="hidden sm:inline">Quiero ser referente</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
