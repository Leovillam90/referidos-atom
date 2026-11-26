import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Política de tratamiento de datos · Referidos ATOM" };

/*
 * IMPORTANTE: este texto es una base. Antes de publicar, complétalo con los
 * datos reales de la empresa (razón social, NIT, dirección, correo de
 * contacto) y haz que lo revise quien lleve los temas legales.
 * Si cambias el texto, cambia también POLITICA_DATOS_VERSION en .env.local
 * y en Vercel, para saber qué versión aceptó cada referido.
 */
const RESPONSABLE = {
  nombre: "ATOM",
  correo: "[correo de contacto para datos personales]",
};

export default function PaginaPolitica() {
  const version = process.env.POLITICA_DATOS_VERSION ?? "—";

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Política de tratamiento de datos personales</CardTitle>
        <CardDescription>Programa de referidos ATOM · Versión {version}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm leading-relaxed text-muted-foreground [&_h2]:font-medium [&_h2]:text-foreground">
        <section className="grid gap-1">
          <h2>1. Responsable</h2>
          <p>
            {RESPONSABLE.nombre} es responsable del tratamiento de los datos personales recogidos en este
            formulario, de acuerdo con la Ley 1581 de 2012 y el Decreto 1074 de 2015.
          </p>
        </section>
        <section className="grid gap-1">
          <h2>2. Datos que recogemos</h2>
          <p>Nombre, correo electrónico, teléfono, cuenta de Dropi, si eres proveedor o marca y el plan que te interesa.</p>
        </section>
        <section className="grid gap-1">
          <h2>3. Para qué los usamos</h2>
          <ul className="list-disc pl-5">
            <li>Contactarte para presentarte los servicios de ATOM.</li>
            <li>Verificar si te afiliaste a ATOM y con qué plan.</li>
            <li>Calcular y pagar el bono a la persona que te refirió.</li>
          </ul>
          <p>
            La persona que te refirió podrá ver tu nombre, tus datos de contacto, el plan que te interesa,
            el plan que tomaste y si estás activo en ATOM. También le avisaremos por correo que te registraste.
          </p>
        </section>
        <section className="grid gap-1">
          <h2>4. Tus derechos</h2>
          <p>
            Puedes conocer, actualizar y corregir tus datos, pedir prueba de esta autorización,
            revocarla o pedir que borremos tus datos cuando no exista un deber legal de conservarlos,
            y presentar quejas ante la Superintendencia de Industria y Comercio.
          </p>
        </section>
        <section className="grid gap-1">
          <h2>5. Cómo ejercerlos</h2>
          <p>Escríbenos a {RESPONSABLE.correo}. Responderemos en los plazos que fija la ley.</p>
        </section>
        <section className="grid gap-1">
          <h2>6. Registro de tu autorización</h2>
          <p>
            Al enviar el formulario guardamos la fecha, la versión de esta política, tu dirección IP y
            el navegador que usaste, como prueba de que nos diste tu autorización.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
