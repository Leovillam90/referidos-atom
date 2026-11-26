import { MailCheck } from "lucide-react";

export function AvisoEnviado({ mensaje }: { mensaje: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
      <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="grid gap-1">
        <p className="font-medium">Revisa tu correo</p>
        <p className="text-muted-foreground">{mensaje}</p>
        <p className="text-muted-foreground">El link vence en 1 hora y solo sirve una vez.</p>
      </div>
    </div>
  );
}
