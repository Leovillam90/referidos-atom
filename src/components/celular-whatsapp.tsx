import { formatoTelefono, linkWhatsAppTelefono } from "@/lib/telefono";

/**
 * Celular legible (+57 310 482 7756) con link a WhatsApp (wa.me/ + formato
 * estándar). Si el número guardado no es válido, se muestra tal cual.
 */
export function CelularWhatsApp({ telefono }: { telefono: string }) {
  const link = linkWhatsAppTelefono(telefono);
  const texto = formatoTelefono(telefono);
  if (!link) return <span title="Celular no válido">{texto}</span>;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline" title="Abrir en WhatsApp">
      {texto}
    </a>
  );
}

/** Aviso para el super_admin: el mismo celular aparece en 3 o más registros. */
export function AvisoTelefonoSospechoso({ registros }: { registros: number }) {
  return (
    <p>
      <span className="font-bold">Teléfono sospechoso:</span> este celular aparece en {registros} registros (referentes y
      referidos, vigentes o vencidos). No se bloquea; revisa si es la misma persona. La lista completa está en el inicio
      de la administración.
    </p>
  );
}
