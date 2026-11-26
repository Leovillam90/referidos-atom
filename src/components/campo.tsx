import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = React.ComponentProps<typeof Input> & {
  name: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
};

/** Un campo de formulario con su etiqueta, ayuda y mensaje de error. */
export function Campo({ name, etiqueta, error, ayuda, ...props }: Props) {
  const idAyuda = ayuda ? `${name}-ayuda` : undefined;
  const idError = error ? `${name}-error` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{etiqueta}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {ayuda && !error && (
        <p id={idAyuda} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
