import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * Etiquetas tipo píldora. Las variantes de estado del bono usan los colores
 * de marca con contraste AA:
 *   estimado  → azul #6884C5 con texto negro (5.7:1)
 *   por_pagar → rosa #C81FDA con texto blanco en negrita (4.5:1)
 *   pagado    → verde #0DE8C0 con texto #1D2935 (9.4:1)
 *   no_aplica → gris, solo borde (texto 6:1)
 *   pendiente_confirmacion → borde azul, texto #B9C7EA sobre el fondo oscuro (9:1)
 *   en_verificacion → borde rosa, texto #F0A8F7 (8:1)
 *   vencido   → gris con borde punteado (texto 6:1)
 *   ya_cliente → borde verde, texto verde #0DE8C0 (9:1)
 *   posible_auto_referido / afiliado_duplicado → en revisión: borde y texto
 *     del color de error (mismo contraste que los mensajes de error)
 */
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 text-xs font-bold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/15 text-destructive focus-visible:ring-destructive/30 [a]:hover:bg-destructive/25",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        estimado: "bg-silver-lake-blue text-black",
        por_pagar: "bg-steel-pink text-white",
        pagado: "bg-sea-green text-dark-gunmetal",
        no_aplica: "border-[#7a8899] bg-transparent text-muted-foreground",
        pendiente_confirmacion: "border-silver-lake-blue bg-transparent text-[#b9c7ea]",
        en_verificacion: "border-steel-pink bg-steel-pink/10 text-[#f0a8f7]",
        vencido: "border-dashed border-[#7a8899] bg-transparent text-muted-foreground",
        ya_cliente: "border-sea-green/70 bg-transparent text-sea-green",
        posible_auto_referido: "border-destructive bg-destructive/10 text-destructive",
        afiliado_duplicado: "border-dashed border-destructive bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
