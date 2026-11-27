import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buscarReferentePorCodigo, primerNombre } from "@/lib/referentes-publico";
import { planesParaFormulario } from "@/lib/planes";
import { FormularioReferido } from "./formulario-referido";
import { ConMascota } from "@/components/marco-acceso";

export const metadata: Metadata = {
  title: "Únete a ATOM · Referidos ATOM",
  // Los links personales no deben aparecer en buscadores
  robots: { index: false, follow: false },
};

export default function PaginaReferido({ params }: PageProps<"/r/[codigo]">) {
  return (
    <ConMascota prioridad>
    <Card className="w-full max-w-xl">
      {/* El código llega con la visita, por eso va dentro de Suspense */}
      <Suspense fallback={<Cargando />}>
        {params.then(({ codigo }) => (
          <Contenido codigo={codigo} />
        ))}
      </Suspense>
    </Card>
    </ConMascota>
  );
}

function Cargando() {
  return (
    <CardContent className="grid gap-4 py-2" aria-busy="true" aria-label="Cargando">
      <div className="h-6 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
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
        <CardTitle className="text-2xl font-black">Link no válido</CardTitle>
        <CardDescription>
          Este link de referido no existe o fue desactivado. Pídele a quien te lo envió que lo revise.
        </CardDescription>
      </CardHeader>
    );
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-2xl font-black">Únete a ATOM</CardTitle>
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
