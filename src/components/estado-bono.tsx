import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { tituloEstado, type EstadoBono } from "@/lib/estados";
import { formatoFecha } from "@/lib/formato";

/** Etiqueta del estado del bono. Si está pagado, muestra la fecha y el botón del soporte. */
export function EstadoBonoEtiqueta({
  estado,
  pago,
}: {
  estado: EstadoBono;
  pago?: { id: string; fecha_pago: string } | null;
}) {
  if (estado === "pagado") {
    return (
      <div className="grid justify-items-start gap-1">
        <Badge variant="pagado">Pagado ✓</Badge>
        {pago && (
          <>
            <span className="text-xs text-muted-foreground">{formatoFecha(`${pago.fecha_pago}T12:00:00`)}</span>
            <Link
              href={`/soporte/${pago.id}`}
              target="_blank"
              prefetch={false}
              className="text-xs font-bold text-sea-green underline-offset-4 hover:underline"
            >
              Ver soporte
            </Link>
          </>
        )}
      </div>
    );
  }
  if (estado === "por_pagar") return <Badge variant="por_pagar">Por pagar</Badge>;
  if (estado === "no_aplica") return <Badge variant="no_aplica">No aplica</Badge>;
  return <Badge variant="estimado">{tituloEstado(estado)}</Badge>;
}

export function Activo({ valor }: { valor: boolean | null }) {
  if (valor === true) return <span className="font-bold text-sea-green">Sí</span>;
  if (valor === false) return <span className="text-muted-foreground">No</span>;
  return <span className="text-muted-foreground">Pendiente</span>;
}
