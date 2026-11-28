import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { plazosPublicos } from "@/lib/reglas";

export const metadata: Metadata = { title: "Términos del programa de referidos · Referidos ATOM" };

/*
 * IMPORTANTE: este texto es una BASE para el equipo legal. Las partes
 * marcadas [POR REVISAR] deben completarse o confirmarse antes de publicar.
 * Si cambias el texto, cambia también TERMINOS_VERSION en .env.local y en
 * Vercel, para saber qué versión aceptó cada referente.
 *
 * Los plazos (días de vigencia y de permanencia) se leen de la tabla
 * reglas_programa, así que el texto siempre muestra los valores vigentes.
 */

function PorRevisar({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-steel-pink/20 px-1 text-[#f0a8f7]">[POR REVISAR] {children}</mark>;
}

export default async function PaginaTerminos() {
  const version = process.env.TERMINOS_VERSION ?? "—";
  const plazos = await plazosPublicos();
  const vigencia = plazos ? `${plazos.dias_vigencia_registro} días` : "el plazo definido por ATOM";
  const permanencia = plazos
    ? plazos.dias_permanencia_para_pagar === 0
      ? "en cuanto el referido se activa"
      : `cuando el referido completa ${plazos.dias_permanencia_para_pagar} días activo en ATOM`
    : "cuando el referido completa el tiempo de permanencia definido por ATOM";

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-black">Términos del programa de referidos</CardTitle>
        <CardDescription>Programa de referidos ATOM · Versión {version}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm leading-relaxed text-muted-foreground [&_h2]:font-bold [&_h2]:text-foreground">
        <section className="grid gap-1">
          <h2>1. Quién organiza el programa</h2>
          <p>
            El programa lo organiza <PorRevisar>razón social, NIT y domicilio de ATOM</PorRevisar>. Al registrarte
            como referente aceptas estos términos y la{" "}
            <Link href="/politica-datos" className="text-primary underline underline-offset-4">
              política de tratamiento de datos
            </Link>
            .
          </p>
        </section>

        <section className="grid gap-1">
          <h2>2. Quién puede participar</h2>
          <ul className="list-disc pl-5">
            <li>Personas mayores de edad que se registren con datos reales. <PorRevisar>requisitos adicionales</PorRevisar></li>
            <li>No pueden participar como referentes los empleados de ATOM ni de sus empresas relacionadas.</li>
            <li>No puedes referirte a ti mismo (con tu correo, teléfono o cuenta Dropi).</li>
          </ul>
        </section>

        <section className="grid gap-1">
          <h2>3. Cómo funciona</h2>
          <ul className="list-disc pl-5">
            <li>Recibes un link personal para invitar a proveedores y marcas.</li>
            <li>
              Cada persona solo puede tener un registro vigente en todo el programa. Se considera la misma persona si
              coincide el correo, el teléfono o la cuenta Dropi.
            </li>
            <li>
              El registro de un referido es tuyo durante {vigencia}. Si en ese plazo no se activa en ATOM, el registro
              vence y otra persona (o tú mismo) puede volver a registrarlo.
            </li>
            <li>Si quien se registra ya era cliente de ATOM, el registro no genera bono.</li>
          </ul>
        </section>

        <section className="grid gap-1">
          <h2>4. Bono</h2>
          <ul className="list-disc pl-5">
            <li>
              El bono se gana solo si el referido se activa en ATOM después de registrarse con tu link y dentro del plazo.
            </li>
            <li>
              Es un pago único por referido, calculado con el plan que tenga al activarse. No cambia si después cambia de
              plan, cancela o se vuelve a activar.
            </li>
            <li>El bono pasa a «por pagar» {permanencia}.</li>
            <li>
              Forma y plazo de pago: <PorRevisar>medio de pago, plazo, retenciones e impuestos aplicables</PorRevisar>
            </li>
          </ul>
        </section>

        <section className="grid gap-1">
          <h2>5. Uso indebido y suspensión</h2>
          <p>
            ATOM puede suspender a un referente que incumpla estos términos (por ejemplo, registros falsos, datos de
            terceros sin autorización o spam). Mientras esté suspendido no puede entrar a su panel ni recibir referidos
            nuevos, y sus bonos no pagados quedan sin efecto. <PorRevisar>procedimiento de reclamo</PorRevisar>
          </p>
        </section>

        <section className="grid gap-1">
          <h2>6. Cambios y vigencia del programa</h2>
          <p>
            ATOM puede modificar o terminar el programa avisando con anticipación. <PorRevisar>plazo de aviso y
            tratamiento de los bonos en curso</PorRevisar>
          </p>
        </section>

        <section className="grid gap-1">
          <h2>7. Contacto</h2>
          <p>
            <PorRevisar>correo o canal oficial de contacto del programa</PorRevisar>
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
