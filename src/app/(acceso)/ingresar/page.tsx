import type { Metadata } from "next";
import Link from "next/link";
import { ConMascota } from "@/components/marco-acceso";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = { title: "Entrar · Referidos ATOM" };

export default function PaginaIngreso() {
  return (
    <ConMascota enMovil={false}>
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-black">Entra a tu panel</CardTitle>
        <CardDescription>Escribe tu correo y te enviaremos un link para entrar.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioIngreso />
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        ¿Aún no tienes cuenta?&nbsp;
        <Link href="/registro" className="font-medium text-primary underline-offset-4 hover:underline">
          Regístrate
        </Link>
      </CardFooter>
    </Card>
    </ConMascota>
  );
}
