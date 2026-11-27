/** Mensaje de error general de un formulario, con un link opcional (ej. WhatsApp). */
export function MensajeError({ mensaje, enlace }: { mensaje?: string; enlace?: { texto: string; url: string } }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {mensaje}
      {enlace && (
        <>
          {" "}
          <a
            href={enlace.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline underline-offset-4"
          >
            {enlace.texto}
          </a>
        </>
      )}
    </p>
  );
}
