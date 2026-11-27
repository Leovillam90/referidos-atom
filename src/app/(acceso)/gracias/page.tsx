import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleCheck, MessageCircle, PlayCircle, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  formatoWhatsApp,
  LINK_DROPI_ATOM,
  LINK_VIDEOS_ACTIVACION,
  linkWhatsApp,
  WHATSAPP_CAPACITACION,
} from "@/lib/config-programa";
import { buscarPlan } from "@/lib/planes";
import { ConMascota } from "@/components/marco-acceso";

export const metadata: Metadata = {
  title: "¡Gracias! · Referidos ATOM",
  robots: { index: false, follow: false },
};

export default function PaginaGracias({ searchParams }: PageProps<"/gracias">) {
  return (
    <ConMascota movimiento="saltar" expresion="feliz" celebrar prioridad>
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CircleCheck className="size-9 text-sea-green" aria-hidden />
        <CardTitle className="text-2xl font-black">¡Gracias por registrarte!</CardTitle>
        <CardDescription>Sigue estos 3 pasos para activarte en ATOM.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* El plan llega en la dirección, por eso va dentro de Suspense */}
        <Suspense fallback={<Pasos plan={null} />}>
          {searchParams.then(async ({ plan }) => {
            const id = Array.isArray(plan) ? plan[0] : plan;
            // Solo el nombre del plan: el referido no ve el valor del bono
            const encontrado = id ? await buscarPlan(id).catch(() => null) : null;
            return <Pasos plan={encontrado?.nombre ?? null} />;
          })}
        </Suspense>
      </CardContent>
    </Card>
    </ConMascota>
  );
}

function Pasos({ plan }: { plan: string | null }) {
  return (
    <ol className="grid gap-4">
      <Paso numero={1} icono={<UserPlus aria-hidden />} titulo="Regístrate en ATOM en Dropi">
        {LINK_DROPI_ATOM ? (
          <a href={LINK_DROPI_ATOM} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg", className: "w-full" })}>
            Registrarme en Dropi
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">Muy pronto te compartiremos el link de registro.</p>
        )}
      </Paso>

      <Paso numero={2} icono={<PlayCircle aria-hidden />} titulo="Mira los videos de activación">
        <a
          href={LINK_VIDEOS_ACTIVACION}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "lg", variant: "outline", className: "w-full" })}
        >
          Ver los videos
        </a>
      </Paso>

      <Paso numero={3} icono={<MessageCircle aria-hidden />} titulo="Solicita tu capacitación">
        {plan && <p className="text-sm text-muted-foreground">Cuéntanos que te interesa el {plan}.</p>}
        <div className="grid gap-2">
          {WHATSAPP_CAPACITACION.map((numero) => (
            <a
              key={numero}
              href={linkWhatsApp(numero, plan)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "lg", variant: "outline", className: "w-full" })}
            >
              WhatsApp {formatoWhatsApp(numero)}
            </a>
          ))}
        </div>
      </Paso>
    </ol>
  );
}

function Paso({
  numero,
  icono,
  titulo,
  children,
}: {
  numero: number;
  icono: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 rounded-2xl border bg-dark-gunmetal/40 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sea-green text-sm font-black text-dark-gunmetal">
          {numero}
        </span>
        <span className="flex items-center gap-2 font-bold [&_svg]:size-4 [&_svg]:text-sea-green">
          {icono}
          {titulo}
        </span>
      </div>
      {children}
    </li>
  );
}
