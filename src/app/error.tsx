"use client"; // Las páginas de error deben ser componentes del navegador

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConMascota, MarcoAcceso } from "@/components/marco-acceso";

export default function ErrorInesperado({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <MarcoAcceso>
      <ConMascota movimiento="quieta">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-bold tracking-[0.2em] text-destructive uppercase">Algo salió mal</p>
          <CardTitle className="text-2xl font-black">No pudimos cargar esta página</CardTitle>
          <CardDescription>
            Fue un error temporal de nuestro lado, no tuyo. Intenta de nuevo en un momento; si sigue pasando, escríbenos y te ayudamos.
          </CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button size="lg" onClick={() => retry()} className="w-full sm:w-auto">
            Intentar de nuevo
          </Button>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto" })}>
            Ir al inicio
          </Link>
        </CardFooter>
      </Card>
      </ConMascota>
    </MarcoAcceso>
  );
}
