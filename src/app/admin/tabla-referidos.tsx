import Link from "next/link";
import { Activo, EstadoBonoEtiqueta } from "@/components/estado-bono";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReferidoAdmin } from "@/lib/datos-admin";
import { nombrePlan, type PlanBasico } from "@/lib/estados";
import { formatoFecha, formatoPesos } from "@/lib/formato";

export function TablaReferidos({
  referidos,
  planes,
  mostrarReferente = true,
}: {
  referidos: ReferidoAdmin[];
  planes: PlanBasico[];
  mostrarReferente?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Referido</TableHead>
          {mostrarReferente && <TableHead>Referente</TableHead>}
          <TableHead>Plan solicitado</TableHead>
          <TableHead>Plan afiliado</TableHead>
          <TableHead>Activo</TableHead>
          <TableHead className="text-right">Bono</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {referidos.map((r) => (
          <TableRow key={r.id}>
            <TableCell data-label="Referido">
              <Link href={`/admin/referidos/${r.id}`} className="grid hover:underline">
                <span className="font-medium">{r.nombre ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {r.correo} · {formatoFecha(r.created_at)}
                </span>
              </Link>
            </TableCell>
            {mostrarReferente && (
              <TableCell data-label="Referente">
                <Link href={`/admin/referentes/${r.referente_id}`} className="grid hover:underline">
                  <span>{r.referente?.nombre ?? "—"}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.referente?.codigo}</span>
                </Link>
              </TableCell>
            )}
            <TableCell data-label="Plan solicitado">{nombrePlan(planes, r.plan_solicitado) ?? "—"}</TableCell>
            <TableCell data-label="Plan afiliado">
              {nombrePlan(planes, r.plan_afiliado_id) ??
                (r.plan_hoja ? <span className="text-destructive">{r.plan_hoja} (sin coincidencia)</span> : "—")}
            </TableCell>
            <TableCell data-label="Activo">
              <Activo valor={r.afiliado_atom} />
              {r.editado_manual && <span className="ml-1 text-xs text-muted-foreground">(manual)</span>}
            </TableCell>
            <TableCell data-label="Bono" className="text-right tabular-nums">
              {r.estado_bono === "no_aplica" ? "—" : formatoPesos(r.bono)}
            </TableCell>
            <TableCell data-label="Estado">
              <EstadoBonoEtiqueta estado={r.estado_bono} pago={r.pago} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
