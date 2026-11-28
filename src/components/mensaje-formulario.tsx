/** Mensaje de error general de un formulario, con un link opcional (ej. WhatsApp). */
export function MensajeError({
  mensaje,
  enlace,
  codigo,
}: {
  mensaje?: string;
  enlace?: { texto: string; url: string };
  /** Código de un error inesperado (ej. R-4F2A) para rastrearlo en los logs */
  codigo?: string;
}) {
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
      {codigo && (
        <span className="mt-1 block text-xs text-muted-foreground">
          Código: <span className="font-mono font-bold select-all">{codigo}</span>
        </span>
      )}
    </p>
  );
}
