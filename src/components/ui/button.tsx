import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * Botones tipo píldora (marca ATOM).
 * - default: principal, fondo verde #0DE8C0 con texto #1D2935 (9.4:1).
 * - outline: secundario, borde azul #6884C5 con texto blanco.
 */
const variantesBase = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-sea-green text-dark-gunmetal shadow-[0_0_0_0_rgb(13_232_192/0)] hover:bg-[#3ff0d0] hover:shadow-[0_6px_24px_-6px_rgb(13_232_192/0.55)]",
        outline:
          "border-silver-lake-blue bg-transparent text-white hover:bg-silver-lake-blue/15 aria-expanded:bg-silver-lake-blue/15",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[#3d5269] aria-expanded:bg-secondary",
        ghost:
          "text-white hover:bg-white/8 aria-expanded:bg-white/8",
        destructive:
          "bg-destructive/15 text-destructive hover:bg-destructive/25 focus-visible:ring-destructive/30",
        link: "text-sea-green underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-7 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-base",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Igual que la versión de cva, pero resolviendo choques de clases (ej.
 * border-transparent vs border-silver-lake-blue), porque también se usa
 * directamente en enlaces <Link className={buttonVariants(...)}>.
 */
function buttonVariants(props?: Parameters<typeof variantesBase>[0]) {
  return cn(variantesBase(props))
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof variantesBase>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
