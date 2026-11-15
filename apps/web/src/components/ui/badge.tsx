import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 border font-semibold transition-colors focus:outline-none",
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

/** Consecutive text/number children in one span, so a right-to-left page
 *  orders "-52.8% YTD" as one run (index.css applies unicode-bidi: plaintext
 *  to spans, not to the badge's own div). Elements such as icons pass through
 *  untouched, keeping the badge's flex gap between icon and text. */
function groupText(children: React.ReactNode): React.ReactNode {
  const out: React.ReactNode[] = []
  let run: Array<string | number> = []
  const flush = () => { if (run.length) { out.push(<span key={`t${out.length}`}>{run.join('')}</span>); run = [] } }
  React.Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') run.push(child)
    else { flush(); if (child != null && child !== false) out.push(child) }
  })
  flush()
  return out
}

function Badge({ className, variant, style, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} style={{
      borderRadius: 'var(--badge-radius)', minHeight: 'var(--badge-min-h)',
      paddingBlock: 'var(--badge-py)', paddingInline: 'var(--badge-px)',
      fontSize: 'var(--badge-fs)', ...style,
    }} {...props}>{groupText(children)}</div>
  )
}

export { Badge, badgeVariants }
