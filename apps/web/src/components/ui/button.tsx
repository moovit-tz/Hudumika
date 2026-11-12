import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm,6px)] text-[13px] font-semibold transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
  /**
   * Square icon-only control. Forces the `icon` size so the default `px-8`
   * can't win the class merge, and mirrors `aria-label` into `title` so the
   * action keeps a hover tooltip once its text label is gone.
   */
  iconOnly?: boolean
  /**
   * The action is in flight. Shows a spinner, sets `aria-busy`, and swallows
   * clicks (including a form's implicit submit) so it can't fire twice.
   *
   * Deliberately `aria-disabled`, not `disabled`: a natively disabled button
   * drops keyboard focus to <body> the moment a save starts, and the user has
   * to Tab back from the top of the page once it finishes.
   */
  loading?: boolean
  /** Label shown while `loading`; defaults to the button's own children. */
  loadingText?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, iconOnly = false, loading = false, loadingText, style, title, children, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const effectiveSize = iconOnly ? "icon" : size
    const padBlock = effectiveSize === 'xs' ? 'var(--ds-btn-py-xs, 3px)' : effectiveSize === 'sm' || effectiveSize === 'icon' ? '0' : 'var(--action-py)'
    // Slot needs exactly one child element, so an asChild button gets the
    // busy semantics and click guard but keeps its child untouched.
    const content = loading && !asChild ? (
      <>
        <span
          aria-hidden="true"
          className="ds-spinner size-3.5 shrink-0 rounded-full border-2 border-current/30 border-t-current"
        />
        {iconOnly ? null : (loadingText ?? children)}
      </>
    ) : children
    return (
      <Comp
        className={cn(buttonVariants({ variant, size: effectiveSize, className }))}
        style={{ paddingBlock: padBlock, borderWidth: 'var(--border-width, 1px)', ...style }}
        data-ui-button=""
        data-variant={variant ?? 'default'}
        data-size={effectiveSize ?? "default"}
        title={title ?? (iconOnly ? props["aria-label"] : undefined)}
        ref={ref}
        {...props}
        aria-busy={loading || undefined}
        aria-disabled={loading || props["aria-disabled"]}
        onClick={loading ? (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault() : onClick}
      >
        {content}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
