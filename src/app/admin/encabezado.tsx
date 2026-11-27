import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { MarcoApp } from "@/components/marco-app";
import { cerrarSesion } from "../panel/acciones";

/** Barra superior y contenedor común de las páginas de administración. */
export function EncabezadoAdmin({ children }: { children: React.ReactNode }) {
  return (
    <MarcoApp
      inicio="/admin"
      etiqueta="Super admin"
      acciones={
        <>
          <Link href="/admin/estado" prefetch={false} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Estado
          </Link>
          <Link href="/panel" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Mi panel
          </Link>
          <form action={cerrarSesion}>
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </>
      }
    >
      {children}
    </MarcoApp>
  );
}
