import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Términos del programa de referidos · Referidos ATOM" };

/*
 * Texto legal oficial: «Términos y Condiciones del Programa de Referidos ATOM»,
 * versión 1.0, vigente desde el 01/12/2026. Si cambias el texto, cambia
 * también TERMINOS_VERSION en .env.local y en Vercel, para saber qué versión
 * aceptó cada referente.
 *
 * Los plazos (30 días) y los valores de los bonos están escritos tal como los
 * fija el documento legal. Si cambias la tabla reglas_programa o planes,
 * actualiza también este texto (y su versión).
 */

const VERSION_DOCUMENTO = "1.0";
const VIGENTE_DESDE = "01/12/2026";

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary underline underline-offset-4">
      {children}
    </Link>
  );
}

function Correo() {
  return (
    <a href="mailto:info@atomsolutionsdata.com" className="text-primary underline underline-offset-4">
      info@atomsolutionsdata.com
    </a>
  );
}

export default function PaginaTerminos() {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-black">Términos y Condiciones del Programa de Referidos ATOM</CardTitle>
        <CardDescription>
          Versión {VERSION_DOCUMENTO} · Vigente desde: {VIGENTE_DESDE}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm leading-relaxed text-muted-foreground [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:text-foreground [&_strong]:text-foreground">
        <section className="grid gap-2">
          <h2>1. Definiciones</h2>
          <p>
            Para efectos de estos Términos y Condiciones, las siguientes expresiones tendrán el significado que se indica a
            continuación:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>ATOM u Organizador:</strong> ATOM SOLUTIONS DATA S.A.S., sociedad comercial constituida bajo las
              leyes de la República de Colombia, identificada con NIT 901.848.364-4, con domicilio principal en la ciudad
              de Cali, Valle del Cauca, titular de la marca ATOM Solutions Data.
            </li>
            <li>
              <strong>Programa:</strong> El Programa de Referidos ATOM, mediante el cual los Referentes invitan a terceros
              a vincularse a ATOM a cambio de un Bono de referimiento mercantil.
            </li>
            <li>
              <strong>Plataforma:</strong> El sitio web{" "}
              <Enlace href="/">https://referidos.atomsolutionsdata.com</Enlace>, incluyendo su interfaz privada o Panel.
            </li>
            <li>
              <strong>Referente:</strong> Persona natural o jurídica registrada en la Plataforma que invita a terceros
              mediante su Link.
            </li>
            <li>
              <strong>Referido:</strong> Proveedor, marca o empresa que se registra por primera vez en la Plataforma
              utilizando el Link de un Referente.
            </li>
            <li>
              <strong>Link:</strong> Enlace único, personal e intransferible asignado a cada Referente para el rastreo
              técnico (tracking) de invitaciones.
            </li>
            <li>
              <strong>Registro Vigente:</strong> Registro de un Referido que se encuentra dentro del plazo de vigencia de
              treinta (30) días calendario previsto en la Sección 6.
            </li>
            <li>
              <strong>Activación:</strong> Vinculación efectiva del Referido a un plan pago de ATOM, verificada cuando su
              estado en los registros internos de ATOM figura como «Activo» con pago efectivo recaudado.
            </li>
            <li>
              <strong>Bono:</strong> Incentivo económico único que ATOM reconoce al Referente por cada Referido que cumpla
              la totalidad de las condiciones establecidas en estos Términos.
            </li>
            <li>
              <strong>Panel:</strong> Sección privada de la Plataforma donde el Referente consulta sus Referidos, el estado
              de sus Bonos y los soportes de pago.
            </li>
          </ul>
        </section>

        <section className="grid gap-2">
          <h2>2. Aceptación y validez electrónica</h2>
          <p>
            Al registrarse como Referente y marcar la casilla de aceptación, el Referente declara haber leído, comprendido
            y aceptado íntegramente estos Términos y la Política de Tratamiento de Datos Personales disponible en{" "}
            <Enlace href="/politica-datos">https://referidos.atomsolutionsdata.com/politica-datos</Enlace>. La aceptación
            se realiza por medios electrónicos y constituye firma electrónica vinculante con plena validez probatoria
            conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012. La Plataforma conservará registro técnico (logs,
            dirección IP, fecha y hora) de la versión aceptada. Si el Referente no está de acuerdo con estos Términos,
            deberá abstenerse de registrarse y participar en el Programa.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>3. Naturaleza jurídica de la relación</h2>
          <p>
            La participación en el Programa es estrictamente voluntaria, gratuita y de naturaleza mercantil independiente.
            En ningún caso genera contrato de trabajo, relación laboral, subordinación, agencia comercial (Art. 1317 del
            Código de Comercio), mandato, representación legal, sociedad de hecho ni exclusividad entre ATOM y el
            Referente.
          </p>
          <p>
            El Referente actúa por su propia cuenta y riesgo, y carece de facultades para obligar a ATOM, ofrecer
            descuentos o condiciones comerciales distintas a las publicadas oficialmente, o presentarse como empleado,
            socio o representante de ATOM.
          </p>
          <p>
            El Programa no constituye un juego de suerte y azar ni un concurso promocional; el reconocimiento del Bono
            depende exclusivamente del cumplimiento objetivo de las condiciones aquí descritas. ATOM no garantiza al
            Referente ningún nivel mínimo de ingresos.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>4. Requisitos de participación e inhabilidades</h2>
          <p>
            Podrán participar personas naturales mayores de edad con plena capacidad legal, y personas jurídicas
            debidamente constituidas en Colombia, que se registren con datos reales, completos y propios, y que cuenten
            con una cuenta activa y verificada en la plataforma Dropi.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Cada persona natural o jurídica podrá mantener únicamente una (1) cuenta de Referente.</li>
            <li>
              No podrán participar como Referentes los empleados, contratistas directos o directivos de ATOM, ni sus
              cónyuges, compañeros permanentes o familiares hasta el segundo grado de consanguinidad o primero de
              afinidad.
            </li>
            <li>
              No podrán participar personas naturales o jurídicas que hayan sido suspendidas previamente del Programa por
              fraude o incumplimiento.
            </li>
          </ul>
        </section>

        <section className="grid gap-2">
          <h2>5. Registro y seguridad de la cuenta</h2>
          <p>
            El Referente deberá suministrar información veraz y mantenerla actualizada. ATOM podrá solicitar en cualquier
            momento documentos que acrediten su identidad, titularidad de cuenta Dropi y soportes tributarios para efectos
            de pago.
          </p>
          <p>
            El acceso al Panel se realiza mediante enlaces o códigos enviados al correo electrónico registrado. El
            Referente es el único responsable de la custodia y seguridad de su correo electrónico y credenciales. El Link
            es personal e intransferible; el Referente deberá notificar de inmediato a ATOM cualquier uso no autorizado de
            su cuenta.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>6. Funcionamiento del programa y reglas de atribución</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Invitación:</strong> El Referente comparte su Link con proveedores y marcas interesados en ATOM,
              limitándose a personas con quienes tenga relación previa o que hayan manifestado interés legítimo (ver
              Sección 9).
            </li>
            <li>
              <strong>Registro del Referido:</strong> El Referido debe registrarse directamente desde su propio
              dispositivo utilizando el Link del Referente. El Referente tiene estrictamente prohibido diligenciar
              formularios en nombre de terceros sin su autorización expresa.
            </li>
            <li>
              <strong>Identidad Única:</strong> Se entenderá que se trata de un mismo Referido cuando coincida cualquiera
              de los siguientes identificadores: correo electrónico, número de teléfono celular, NIT/Cédula o ID de cuenta
              Dropi.
            </li>
            <li>
              <strong>Registro Vigente Único (30 días):</strong> Cada Referido solo podrá tener un Registro Vigente
              asignado al primer Referente cuyo Link haya generado el registro efectivo en los servidores de ATOM. Dicho
              registro tendrá una vigencia de treinta (30) días calendario. Si vencido este plazo el Referido no concreta
              su Activación, el registro caducará y podrá ser referido nuevamente por el mismo u otro Referente.
            </li>
            <li>
              <strong>Exclusión de Clientes Existentes:</strong> No generarán Bono los registros de personas o empresas
              que ya sean clientes de ATOM, que hayan tenido suscripción previa o que ya figuren como prospectos activos
              en las bases de datos comerciales de ATOM.
            </li>
            <li>
              <strong>Prohibición de Autorreferidos:</strong> Un Referente no podrá referirse a sí mismo, directa o
              indirectamente, ni a sociedades donde tenga participación accionaria o administración, ni utilizar datos o
              dispositivos propios para registrar Referidos.
            </li>
            <li>
              <strong>Prevalencia de Registros Internos:</strong> La trazabilidad técnica (tracking) y los registros de
              base de datos de ATOM prevalecerán sobre cualquier captura de pantalla o declaración suministrada por el
              Referente. ATOM no responde por fallas de atribución derivadas del bloqueo de cookies, uso de navegadores
              privados o errores de navegación del Referido.
            </li>
          </ul>
        </section>

        <section className="grid gap-2">
          <h2>7. El bono: condiciones, valores y pago</h2>

          <h3>7.1 Condiciones acumulativas para generar el Bono</h3>
          <p>
            El Referente adquirirá el derecho al Bono únicamente cuando se cumplan de forma conjunta las siguientes
            condiciones:
          </p>
          <ol className="list-[lower-alpha] space-y-1 pl-5">
            <li>
              Que el Referido se haya registrado mediante el Link del Referente y su registro se encuentre vigente al
              momento de la Activación.
            </li>
            <li>
              Que la Activación y el pago efectivo del plan hayan ocurrido dentro del plazo de treinta (30) días calendario
              de vigencia del registro.
            </li>
            <li>Que el Referido no fuera cliente previo de ATOM.</li>
            <li>
              Que el Referido permanezca activo, al día en sus pagos y sin solicitudes de reembolso o contracargo durante
              un período de verificación de treinta (30) días calendario contados desde su Activación.
            </li>
            <li>Que no exista incumplimiento de estos Términos ni indicios de fraude o manipulación.</li>
          </ol>

          <h3>7.2 Valor del Bono</h3>
          <p>
            El Bono consiste en un pago único por Referido activado, según el plan inicial suscrito y pagado por el
            Referido:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Plan Escala: $20.000 COP</li>
            <li>Plan Experto: $80.000 COP</li>
            <li>Plan Control: $100.000 COP</li>
          </ul>
          <p>
            Los valores están expresados en pesos colombianos (COP) antes de impuestos o retenciones de ley. ATOM podrá
            actualizar estos valores conforme a la Sección 14; el valor aplicable será el vigente en la fecha exacta de
            Activación del Referido.
          </p>

          <h3>7.3 Bono único</h3>
          <p>
            Cada Referido genera Bono una sola vez durante toda la existencia del Programa. El valor del Bono no se
            reajustará si el Referido cambia posteriormente de plan (upsell o downsell), cancela su suscripción o vuelve a
            activarse en el futuro.
          </p>

          <h3>7.4 Estados del Bono</h3>
          <p>En el Panel se visualizarán los siguientes estados:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Estimado:</strong> Referido registrado, pendiente de pago y Activación (carácter meramente
              informativo, no constituye obligación de pago).
            </li>
            <li>
              <strong>En verificación:</strong> Referido activo, transcurriendo el período de permanencia de 30 días
              calendario.
            </li>
            <li>
              <strong>Por pagar:</strong> Bono confirmado tras superar el período de verificación.
            </li>
            <li>
              <strong>Pagado:</strong> Bono desembolsado con su respectivo soporte.
            </li>
            <li>
              <strong>Vencido:</strong> Registro expirado sin Activación dentro de los 30 días.
            </li>
            <li>
              <strong>No aplica:</strong> Registro invalidado por incumplimiento de requisitos.
            </li>
          </ul>

          <h3>7.5 Forma y plazo de pago (dispersión vía Wallet Dropi)</h3>
          <p>
            Los Bonos en estado «Por pagar» se liquidarán mensualmente y se desembolsarán dentro de los treinta (30) días
            hábiles siguientes a la confirmación del Bono, mediante transferencia o abono a la Wallet Dropi registrada por
            el Referente, autorizando expresamente dicho mecanismo de compensación y dispersión financiera. ATOM publicará
            el soporte de liquidación en el Panel.
          </p>

          <h3>7.6 Cumplimiento tributario y seguridad social (UGPP / DIAN)</h3>
          <p>
            El Referente es el único responsable del cumplimiento de sus obligaciones tributarias y previsionales. ATOM
            practicará las retenciones en la fuente a que haya lugar según la legislación colombiana vigente. De
            conformidad con el Estatuto Tributario y las normas de la UGPP, cuando los Bonos acumulados por un Referente
            persona natural en un mismo mes calendario igualen o superen un (1) Salario Mínimo Mensual Legal Vigente (1
            SMMLV), ATOM podrá condicionar el desembolso a la entrega previa del RUT actualizado, cuenta de cobro o factura
            electrónica (si aplica) y soporte de pago de aportes a la seguridad social (planilla PILA) como independiente.
          </p>

          <h3>7.7 Caducidad de reclamaciones</h3>
          <p>
            El Bono es personal, intransferible y no canjeable por bienes o servicios. Toda reclamación relacionada con el
            cálculo, estado o pago de un Bono deberá presentarse dentro de los noventa (90) días calendario siguientes a la
            fecha en que debió pagarse o figuró como «No aplica»; vencido dicho término, se entenderá aceptada la
            liquidación de forma definitiva.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>8. Obligaciones del referente</h2>
          <p>El Referente se obliga a:</p>
          <ol className="list-[lower-alpha] space-y-1 pl-5">
            <li>
              Promover el Programa de manera transparente, ética y veraz, sin realizar promesas falsas sobre ganancias
              garantizadas, resultados financieros o funcionalidades inexistentes de ATOM.
            </li>
            <li>Utilizar exclusivamente los materiales gráficos y piezas publicitarias oficiales suministrados por ATOM.</li>
            <li>
              Cumplir estrictamente la Ley 2300 de 2023 y las normas de protección de datos personales (Ley 1581 de 2012),
              absteniéndose de enviar comunicaciones comerciales sin autorización previa del destinatario o fuera de los
              horarios legales permitidos.
            </li>
            <li>Cumplir la legislación colombiana y las políticas internas de ATOM.</li>
          </ol>
        </section>

        <section className="grid gap-2">
          <h2>9. Conductas prohibidas</h2>
          <p>Queda estrictamente prohibido al Referente:</p>
          <ol className="list-[lower-alpha] space-y-1 pl-5">
            <li>
              Registrar datos falsos, inexistentes o de terceros sin su consentimiento previo, así como crear múltiples
              cuentas de Referente.
            </li>
            <li>
              Autorreferirse o registrar cuentas vinculadas a su mismo núcleo familiar, socios comerciales o empresas
              controladas con el fin de simular referencias.
            </li>
            <li>
              Realizar envío masivo de mensajes no solicitados (spam) por correo electrónico, WhatsApp, SMS o redes
              sociales.
            </li>
            <li>
              Pautar publicidad pagada (Google Ads, Meta Ads, TikTok Ads, etc.) utilizando las marcas, nombres comerciales o
              variaciones de «ATOM» o «ATOM Solutions Data», así como registrar dominios o perfiles en redes sociales que
              suplanten o generen confusión con los canales oficiales de ATOM.
            </li>
            <li>
              Ofrecer reembolsos en efectivo (cashback), divisiones del Bono, dinero o descuentos no autorizados por ATOM a
              cambio de registros.
            </li>
            <li>
              Emplear bots, scripts, granjas de clics o mecanismos automatizados para alterar el funcionamiento de la
              Plataforma.
            </li>
          </ol>
        </section>

        <section className="grid gap-2">
          <h2>10. Auditoría, suspensión y fraude</h2>
          <p>
            ATOM se reserva el derecho de auditar en cualquier momento la trazabilidad de Referentes y Referidos, pudiendo
            retener preventivamente el pago de cualquier Bono mientras culmina la verificación.
          </p>
          <p>
            En caso de detectar incumplimiento de estos Términos o indicios razonables de fraude, manipulación o colusión,
            ATOM podrá de manera unilateral e inmediata: (i) anular los Bonos pendientes de pago; (ii) suspender temporal o
            definitivamente la cuenta del Referente e inhabilitar su Link; y (iii) exigir la restitución de los Bonos
            pagados indebidamente o compensarlos contra saldos futuros, sin perjuicio de las acciones civiles y penales
            correspondientes.
          </p>
          <p>
            ATOM notificará la suspensión al correo electrónico registrado indicando las causas. El Referente dispondrá de
            diez (10) días hábiles para presentar sus descargos y pruebas, y ATOM emitirá una decisión definitiva dentro de
            los quince (15) días hábiles siguientes.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>11. Propiedad intelectual</h2>
          <p>
            Las marcas, logotipos, signos distintivos, software, diseños y contenidos de ATOM son propiedad exclusiva de
            ATOM SOLUTIONS DATA S.A.S. ATOM otorga al Referente una licencia limitada, gratuita, no exclusiva y revocable
            en cualquier momento para utilizar el Link y el material oficial únicamente para los fines previstos en estos
            Términos.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>12. Tratamiento de datos personales</h2>
          <p>
            ATOM SOLUTIONS DATA S.A.S., en calidad de Responsable del Tratamiento, tratará los datos personales de
            Referentes y Referidos conforme a la Ley 1581 de 2012, el Decreto 1074 de 2015 y su{" "}
            <Enlace href="/politica-datos">Política de Tratamiento de Datos Personales</Enlace>.
          </p>
          <p>
            Las finalidades del tratamiento incluyen: gestionar el Programa, validar registros y Activaciones, liquidar y
            dispersar Bonos (incluyendo el intercambio de información necesaria con Dropi para pagos vía Wallet), prevenir
            fraudes y atender PQR.
          </p>
          <p>
            Los titulares podrán ejercer sus derechos de acceso, actualización, rectificación y supresión escribiendo al
            correo electrónico <Correo />. El Referente no tendrá acceso a datos personales sensibles ni de contacto privado
            de sus Referidos, visualizando únicamente el identificador parcial y estado del Bono en su Panel.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>13. Comunicaciones operativas</h2>
          <p>
            Al aceptar estos Términos, el Referente autoriza a ATOM a remitir notificaciones operativas y transaccionales a
            su correo electrónico registrado (accesos al Panel, alertas de registro, confirmaciones de pago y
            actualizaciones del Programa). El Referente podrá darse de baja de comunicaciones promocionales o recordatorios
            en cualquier momento, manteniéndose activas únicamente las notificaciones esenciales de seguridad y
            liquidación.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>14. Modificación y terminación del programa</h2>
          <p>
            ATOM podrá modificar estos Términos, actualizar la tabla de valores de los Bonos o dar por terminado el
            Programa en cualquier momento, notificando a los Referentes con al menos quince (15) días calendario de
            antelación mediante publicación en la Plataforma y envío al correo registrado.
          </p>
          <p>
            Los cambios no afectarán los Bonos que ya se encuentren confirmados en estado «Por pagar» a la fecha de entrada
            en vigor de la modificación. Respecto de los Registros Vigentes y los Bonos que se encuentren en estado «En
            verificación» al momento del cambio o terminación, estos continuarán su trámite bajo las condiciones vigentes
            al momento de su Activación, siempre que cumplan el período de permanencia de 30 días en{" "}
            <a href="https://www.atomsolutionsdata.com" className="text-primary underline underline-offset-4">
              https://www.atomsolutionsdata.com
            </a>
            .
          </p>
          <p>
            Si el Referente continúa utilizando su Link tras la entrada en vigor de las modificaciones, se entenderá que
            las acepta plenamente. El Referente podrá retirarse del Programa en cualquier momento mediante solicitud
            escrita al canal oficial.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>15. Limitación de responsabilidad y prevención de LA/FT</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Disponibilidad Técnica:</strong> ATOM procurará mantener la operatividad continua de la Plataforma,
              pero no garantiza la ausencia de interrupciones técnicas, caídas de servidores o fallas en las APIs de
              terceros (incluyendo Dropi). En caso de detectarse un error técnico o aritmético en el cálculo de un Bono,
              ATOM procederá a su corrección e informará al Referente.
            </li>
            <li>
              <strong>Ausencia de Solidaridad y Tope Indemnizatorio:</strong> La decisión de contratar servicios de ATOM
              corresponde exclusivamente a cada Referido. ATOM no responde por expectativas de ingresos ni por lucro
              cesante del Referente. En cualquier evento en que se declare responsabilidad patrimonial de ATOM, esta
              quedará limitada como máximo al valor de los Bonos efectivamente confirmados y pendientes de pago a favor del
              Referente en los últimos tres (3) meses.
            </li>
            <li>
              <strong>Prevención de Lavado de Activos (LA/FT):</strong> El Referente declara bajo la gravedad del juramento
              que sus actividades comerciales y recursos provienen de fuentes lícitas, y que no utilizará el Programa ni la
              Wallet de pago para operaciones vinculadas al lavado de activos, financiación del terrorismo o fraude
              electrónico.
            </li>
          </ul>
        </section>

        <section className="grid gap-2">
          <h2>16. Peticiones, quejas y reclamos (PQR)</h2>
          <p>
            Las peticiones, quejas y reclamos relacionados con el Programa deberán radicarse a través del canal oficial de
            soporte en el correo electrónico <Correo /> o mediante el módulo de soporte en{" "}
            <Enlace href="/">https://referidos.atomsolutionsdata.com</Enlace>. ATOM dará respuesta de fondo dentro de los
            quince (15) días hábiles siguientes a su recepción, conforme a la Ley 1755 de 2015. Las solicitudes sobre
            habeas data se atenderán en los términos de la Ley 1581 de 2012.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>17. Ley aplicable y jurisdicción</h2>
          <p>
            Estos Términos se rigen íntegramente por las leyes de la República de Colombia. Ante cualquier controversia
            derivada de la interpretación o ejecución del Programa, las partes procurarán un arreglo directo dentro de los
            treinta (30) días calendario siguientes a la notificación escrita de la diferencia; vencido dicho plazo sin
            acuerdo, el conflicto se someterá a la jurisdicción ordinaria de los jueces competentes de la ciudad de Cali,
            Valle del Cauca.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>18. Disposiciones generales</h2>
          <p>
            La nulidad o invalidez de una cláusula no afectará la validez de las demás disposiciones. La tolerancia o no
            exigencia puntual de una obligación por parte de ATOM no constituye renuncia a su derecho de exigirla
            posteriormente. El Referente no podrá ceder su cuenta ni sus derechos económicos derivados del Programa sin
            autorización previa y escrita de ATOM. Estos Términos y la Política de Tratamiento de Datos Personales
            constituyen el acuerdo integral entre las partes.
          </p>
        </section>

        <section className="grid gap-2">
          <h2>19. Datos de contacto del organizador</h2>
          <ul className="space-y-1">
            <li>Programa de Referidos ATOM · ATOM SOLUTIONS DATA S.A.S. (NIT 901.848.364-4)</li>
            <li>Domicilio: Cali, Valle del Cauca, Colombia</li>
            <li>
              Correo oficial del Programa: <Correo />
            </li>
            <li>
              Sitio web oficial: <Enlace href="/">https://referidos.atomsolutionsdata.com</Enlace>
            </li>
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
