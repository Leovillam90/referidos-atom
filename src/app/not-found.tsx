import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConMascota, MarcoAcceso } from "@/components/marco-acceso";

export const metadata: Metadata = { title: "Página no encontrada · Referidos ATOM" };

export default function NoEncontrada() {
  return (
    <MarcoAcceso>
      <ConMascota movimiento="flotar" expresion="confundida">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-bold tracking-[0.2em] text-sea-green uppercase">Error 404</p>
          <CardTitle className="text-2xl font-black">¡Ups! Esta página no existe</CardTitle>
          <CardDescription>
            No te preocupes: puede que el link esté incompleto o que la página ya no exista. Te llevamos de vuelta al inicio.
          </CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          <Link href="/" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
            Ir al inicio
          </Link>
        </CardFooter>
      </Card>
      </ConMascota>
    </MarcoAcceso>
  );
}
