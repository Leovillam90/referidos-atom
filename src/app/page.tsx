import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Inicio() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Referidos ATOM</CardTitle>
          <CardDescription>
            Refiere proveedores y marcas a ATOM y sigue el estado de tus referidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link href="/registro" className={buttonVariants({ size: "lg" })}>
            Quiero ser referente
          </Link>
          <Link href="/ingresar" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Ya tengo cuenta
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
