import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LineaValores } from "@/components/marca";
import { MarcoAcceso } from "@/components/marco-acceso";

export default function Inicio() {
  return (
    <MarcoAcceso>
      <Card className="relative w-full max-w-md">
        <div aria-hidden className="linea-degradado absolute inset-x-0 top-0 rounded-none" />
        <CardHeader className="gap-3 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-sea-green uppercase">Programa de referidos</p>
          <h1 className="text-3xl leading-tight font-black tracking-tight sm:text-4xl">
            Refiere a ATOM y <span className="subrayado-degradado">gana bonos</span>
          </h1>
          <p className="text-base text-muted-foreground">
            Invita proveedores y marcas a ATOM con tu link personal y sigue el estado de cada referido y
            de tus bonos.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Link href="/registro" className={buttonVariants({ size: "lg", className: "w-full" })}>
            Quiero ser referente
          </Link>
          <Link href="/ingresar" className={buttonVariants({ size: "lg", variant: "outline", className: "w-full" })}>
            Ya tengo cuenta
          </Link>
        </CardContent>
      </Card>
      <LineaValores className="max-w-md" />
    </MarcoAcceso>
  );
}
