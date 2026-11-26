import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cerrarSesion } from "../panel/acciones";

/** Barra superior y contenedor común de las páginas de administración. */
export function EncabezadoAdmin({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="font-semibold tracking-tight">
            Referidos ATOM · Super admin
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/admin/estado" prefetch={false} className={buttonVariants({ variant: "ghost" })}>
              Estado
            </Link>
            <Link href="/panel" className={buttonVariants({ variant: "ghost" })}>
              Mi panel
            </Link>
            <form action={cerrarSesion}>
              <Button type="submit" variant="ghost">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8">{children}</main>
    </div>
  );
}
