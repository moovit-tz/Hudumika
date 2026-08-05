import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // rounded-(--r), not rounded-lg: the legacy .btn family reads --r for its
  // corner, so a fixed 8px here put two different radii side by side and put
  // both out of reach of the SuperAdmin shape setting.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--r) text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Height comes from the SuperAdmin density setting (--ds-btn-py), not a
      // fixed Tailwind h-9. Without this, ui/ buttons sat at 36px while every
      // legacy .btn on the same screen — which does read the token — rendered
      // at 49px. Two control systems, 13px apart, side by side.
      //
      // min-h keeps a floor so a density of 0 cannot collapse the control, and
      // the icon variant stays square by tracking the same height.
      // Text sizes match the .btn family step for step (xs 12 / sm 13 /
      // default 14 / lg 15). `sm` was text-xs against .btn-sm's 13px, so the
      // two "small" buttons differed by a line-height even once their padding
      // agreed.
      // min-h comes from --ctl-h, the same floor the legacy .btn family uses,
      // rather than a fixed min-h-9. A stated height is what makes border
      // width, line-height and font-size stop changing how tall a button is.
      size: {
        xs: "min-h-[var(--ctl-h-xs)] py-[var(--ds-btn-py-xs,3px)] px-2.5 text-xs",
        default: "min-h-[var(--ctl-h)] py-[var(--ds-btn-py,7px)] px-4",
        sm: "min-h-[var(--ctl-h-sm)] py-[var(--ds-btn-py-sm,5px)] px-3 text-[13px]",
        lg: "min-h-[var(--ctl-h-lg)] py-[var(--ds-btn-py-lg,10px)] px-8 text-[15px]",
        icon: "min-h-[var(--ctl-h)] aspect-square py-[var(--ds-btn-py,7px)] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    // The vertical padding is set inline, which beats any class — so it has to
    // respect `size` itself. It read --ds-btn-py unconditionally, which made
    // every button the same height whatever size was asked for and silently
    // overrode the size variants' own py- classes. sm and lg looked broken and
    // the class was never the problem.
    const padBlock =
      size === 'xs' ? 'var(--ds-btn-py-xs, 3px)'
      : size === 'sm' ? 'var(--ds-btn-py-sm, 5px)'
      : size === 'lg' ? 'var(--ds-btn-py-lg, 10px)'
      : 'var(--ds-btn-py)'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ paddingBlock: padBlock, borderWidth: 'var(--border-width, 1px)', ...style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
