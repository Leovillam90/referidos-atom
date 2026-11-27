import { Label } from "@/components/ui/label";

/** Motivo obligatorio de una excepción o acción del super_admin (queda en el historial). */
export function Motivo({ error, ayuda, id = "motivo" }: { error?: string; ayuda: string; id?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Motivo (obligatorio)</Label>
      <textarea
        id={id}
        name="motivo"
        rows={2}
        required
        minLength={5}
        maxLength={500}
        placeholder={ayuda}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-xl border border-input bg-dark-gunmetal/60 px-3.5 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
