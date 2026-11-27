import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Color de cada estado del bono (igual que sus etiquetas). */
const COLOR: Record<string, string> = {
  Estimado: "bg-silver-lake-blue",
  "Por pagar": "bg-steel-pink",
  Pagado: "bg-sea-green",
};

/** Tarjeta con un total. Las de estado del bono llevan su color arriba. */
export function TarjetaResumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  const color = COLOR[titulo];
  return (
    <Card size="sm" className="relative">
      <div aria-hidden className={cn("absolute inset-x-0 top-0 h-1", color ?? "linea-degradado rounded-none")} />
      <CardHeader>
        <CardDescription className="flex items-center gap-2 font-medium">
          {color && <span aria-hidden className={cn("size-2 rounded-full", color)} />}
          {titulo}
        </CardDescription>
        <CardTitle className="text-2xl font-black tabular-nums sm:text-3xl">{valor}</CardTitle>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardHeader>
    </Card>
  );
}
