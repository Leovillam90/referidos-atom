import Link from "next/link";

/**
 * Casilla obligatoria de autorización de tratamiento de datos
 * (Ley 1581 de 2012). Envía autoriza_datos = "on" cuando se marca.
 */
export function CasillaAutorizacion({ error, finalidad }: { error?: string; finalidad: string }) {
  return (
    <div className="grid gap-1.5">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="autoriza_datos"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "autoriza_datos-error" : undefined}
          required
        />
        <span className="text-muted-foreground">
          Autorizo a ATOM a tratar mis datos personales para {finalidad}, según la{" "}
          <Link
            href="/politica-datos"
            target="_blank"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            política de tratamiento de datos
          </Link>{" "}
          (Ley 1581 de 2012).
        </span>
      </label>
      {error && (
        <p id="autoriza_datos-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
