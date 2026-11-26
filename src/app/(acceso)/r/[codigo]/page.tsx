import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buscarReferentePorCodigo, primerNombre } from "@/lib/referentes-publico";
import { planesParaFormulario } from "@/lib/planes";
import { FormularioReferido } from "./formulario-referido";

export const metadata: Metadata = {
  title: "Únete a ATOM · Referidos ATOM",
  // Los links personales no deben aparecer en buscadores
  robots: { index: false, follow: false },
};

export default function PaginaReferido({ params }: PageProps<"/r/[codigo]">) {
  return (
    <Card className="w-full max-w-md">
      {/* El código llega con la visita, por eso va dentro de Suspense */}
      <Suspense fallback={<Cargando />}>
        {params.then(({ codigo }) => (
          <Contenido codigo={codigo} />
        ))}
      </Suspense>
    </Card>
  );
}

function Cargando() {
  return (
    <CardContent className="grid gap-4 py-2" aria-busy="true" aria-label="Cargando">
      <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </CardContent>
  );
}

async function Contenido({ codigo }: { codigo: string }) {
  const [referente, planes] = await Promise.all([
    buscarReferentePorCodigo(decodeURIComponent(codigo)),
    planesParaFormulario(),
  ]);

  if (!referente) {
    return (
      <CardHeader>
        <CardTitle className="text-xl">Link no válido</CardTitle>
        <CardDescription>
          Este link de referido no existe o fue desactivado. Pídele a quien te lo envió que lo revise.
        </CardDescription>
      </CardHeader>
    );
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Únete a ATOM</CardTitle>
        <CardDescription>
          {primerNombre(referente.nombre)} te invitó a ATOM. Déjanos tus datos y nuestro equipo te
          contactará. No necesitas crear una cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioReferido codigo={codigo.toUpperCase()} planes={planes} />
      </CardContent>
    </>
  );
}
