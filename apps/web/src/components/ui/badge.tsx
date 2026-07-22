import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        // Soft-tint semantic badges (background tint + matching-hue text, no fill) —
        // reuses the app's existing --green/--gold/--red/--blue/--teal light-tint pairs.
        brand:   "border-transparent bg-[var(--teal-l)] text-[var(--teal)]",
        success: "border-transparent bg-[var(--green-l)] text-[var(--green)]",
        warning: "border-transparent bg-[var(--gold-l)] text-[var(--gold)]",
        error:   "border-transparent bg-[var(--red-l)] text-[var(--red)]",
        info:    "border-transparent bg-[var(--blue-l)] text-[var(--blue)]",
        gray:    "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} style={{ borderRadius: 'var(--badge-radius)', ...style }} {...props} />
  )
}

export { Badge, badgeVariants }
