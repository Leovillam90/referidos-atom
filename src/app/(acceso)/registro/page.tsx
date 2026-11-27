import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Registro de referentes · Referidos ATOM" };

export default function PaginaRegistro() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-black">Regístrate como referente</CardTitle>
        <CardDescription>
          Recibirás un link personal para invitar proveedores y marcas a ATOM.
          No necesitas contraseña: te enviaremos un link de acceso a tu correo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioRegistro />
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        ¿Ya estás registrado?&nbsp;
        <Link href="/ingresar" className="font-medium text-primary underline-offset-4 hover:underline">
          Entra aquí
        </Link>
      </CardFooter>
    </Card>
  );
}
