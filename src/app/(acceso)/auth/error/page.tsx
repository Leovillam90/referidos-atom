import Link from "next/link";
import { ConMascota } from "@/components/marco-acceso";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorDeLink() {
  return (
    <ConMascota expresion="triste">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-black">El link no funcionó</CardTitle>
        <CardDescription>
          Puede que ya lo hayas usado o que haya pasado más de una hora. Pide uno nuevo
          y ábrelo apenas te llegue.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link href="/ingresar" className={buttonVariants({ size: "lg" })}>
          Pedir un link nuevo
        </Link>
      </CardFooter>
    </Card>
    </ConMascota>
  );
}
