import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConMascota } from "@/components/marco-acceso";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { huellaToken, TOKEN_VALIDO } from "@/lib/token";
import { BotonConfirmar } from "./boton-confirmar";

export const metadata: Metadata = {
  title: "Confirma tu registro · Referidos ATOM",
  robots: { index: false, follow: false },
};

export default function PaginaConfirmar({ params }: PageProps<"/confirmar/[token]">) {
  return (
    <ConMascota prioridad>
      <Card className="w-full max-w-xl">
        {/* El token llega con la visita, por eso va dentro de Suspense */}
        <Suspense fallback={<CardContent className="h-40 animate-pulse rounded-2xl bg-muted" aria-busy="true" />}>
          {params.then(({ token }) => (
            <Contenido token={decodeURIComponent(token)} />
          ))}
        </Suspense>
      </Card>
    </ConMascota>
  );
}

type Registro = {
  nombre: string | null;
  confirmado_en: string | null;
  estado_bono: string;
  referente: { nombre: string } | null;
};

async function Contenido({ token }: { token: string }) {
  await connection();
  let registro: Registro | null = null;
  if (TOKEN_VALIDO.test(token)) {
    const { data } = await crearClienteAdmin()
      .from("referidos")
      .select("nombre, confirmado_en, estado_bono, referente:referentes(nombre)")
      .eq("token_confirmacion_hash", huellaToken(token))
      .maybeSingle<Registro>();
    registro = data;
  }

  if (!registro) {
    return (
      <Aviso titulo="Link no válido" texto="Revisa que hayas abierto el link completo del correo que te enviamos." />
    );
  }
  if (registro.confirmado_en) {
    return <Aviso titulo="Registro confirmado" texto="Tu registro ya estaba confirmado. No tienes que hacer nada más." />;
  }
  if (registro.estado_bono === "vencido") {
    return (
      <Aviso
        titulo="Este link venció"
        texto="Si quieres participar, pide a quien te invitó que te envíe su link de nuevo."
      />
    );
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-2xl font-black">Confirma tu registro</CardTitle>
        <CardDescription>
          Hola{registro.nombre ? ` ${registro.nombre.split(" ")[0]}` : ""}, ¿te invitó{" "}
          <strong className="text-foreground">{registro.referente?.nombre ?? "un referente"}</strong> al programa de
          referidos de ATOM? Si no conoces a esta persona o no te registraste, no confirmes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BotonConfirmar token={token} />
      </CardContent>
    </>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <CardHeader>
      <CardTitle className="text-2xl font-black">{titulo}</CardTitle>
      <CardDescription>{texto}</CardDescription>
    </CardHeader>
  );
}
