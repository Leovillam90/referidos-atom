/**
 * Campo trampa para robots (antispam): las personas no lo ven ni lo
 * recorren con el teclado, y los lectores de pantalla no lo anuncian.
 * Si llega con texto, el envío se descarta en silencio.
 */
export function CampoTrampa() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
      <label>
        No llenar
        <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      </label>
    </div>
  );
}
