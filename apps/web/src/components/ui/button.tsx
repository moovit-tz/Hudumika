import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm,6px)] text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
      // Toolbar and icon controls follow input density; primary actions stay roomy.
      size: {
        xs: "min-h-[var(--ctl-h-xs)] py-[var(--ds-btn-py-xs,3px)] px-2.5 text-xs",
        default: "min-h-[var(--action-h)] py-[var(--action-py)] px-8",
        sm: "min-h-[var(--ctl-h)] py-0 px-6 text-[13px]",
        lg: "min-h-[var(--action-h)] py-[var(--action-py)] px-8 text-[15px]",
        icon: "min-h-[var(--ctl-h)] aspect-square py-0 px-0",
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
    const padBlock = size === 'xs' ? 'var(--ds-btn-py-xs, 3px)' : size === 'sm' || size === 'icon' ? '0' : 'var(--action-py)'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ paddingBlock: padBlock, borderWidth: 'var(--border-width, 1px)', ...style }}
        data-ui-button=""
        data-size={size ?? "default"}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
