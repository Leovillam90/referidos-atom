import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { diasHasta, tituloEstado, type EstadoBono } from "@/lib/estados";
import { formatoFecha } from "@/lib/formato";

export type DatosPlazo = {
  vence_en?: string | null;
  fecha_por_pagar?: string | null;
  bono_fijado_en?: string | null;
};

/** Texto corto con el plazo o la fecha que importa en cada estado. */
export function detalleEstado(estado: EstadoBono, d: DatosPlazo): string | null {
  if (estado === "pendiente_confirmacion") return "Esperando que confirme por correo";
  if (estado === "posible_auto_referido" || estado === "afiliado_duplicado") return "No genera bono hasta que ATOM lo revise";
  if (estado === "estimado") {
    if (d.bono_fijado_en) return "Dejó de estar activo en ATOM";
    const dias = diasHasta(d.vence_en);
    if (dias === null) return null;
    return dias === 0 ? "Vence hoy" : dias === 1 ? "Vence en 1 día" : `Vence en ${dias} días`;
  }
  if (estado === "en_verificacion" && d.fecha_por_pagar) {
    return `Pasa a por pagar el ${formatoFecha(d.fecha_por_pagar)}`;
  }
  return null;
}

/** Etiqueta del estado del bono. Si está pagado, muestra la fecha y el botón del soporte. */
export function EstadoBonoEtiqueta({
  estado,
  pago,
  plazo,
  paraReferente = false,
}: {
  estado: EstadoBono;
  pago?: { id: string; fecha_pago: string } | null;
  plazo?: DatosPlazo;
  /** En el panel del referente los estados de revisión se muestran como "En revisión" */
  paraReferente?: boolean;
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

  const detalle = plazo ? detalleEstado(estado, plazo) : null;
  return (
    <div className="grid justify-items-start gap-1">
      <Badge variant={estado}>{tituloEstado(estado, paraReferente)}</Badge>
      {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
    </div>
  );
}

export function Activo({ valor }: { valor: boolean | null }) {
  if (valor === true) return <span className="font-bold text-sea-green">Sí</span>;
  if (valor === false) return <span className="text-muted-foreground">No</span>;
  return <span className="text-muted-foreground">Pendiente</span>;
}
