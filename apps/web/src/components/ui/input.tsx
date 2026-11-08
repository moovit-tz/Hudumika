import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        data-ui-field={['checkbox', 'radio', 'range', 'file', 'color', 'hidden'].includes(type ?? '') ? undefined : 'input'}
        data-field-appearance={/\bborder-(?:0|none)\b/.test(className ?? '') ? 'bare' : undefined}
        type={type}
        className={cn(
          "flex min-h-(--ctl-h) w-full rounded-(--radius) border border-input bg-transparent px-3 py-[var(--ds-input-py,8px)] text-base shadow-sm transition-colors hover:border-primary/40 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        style={{ paddingBlock: 'var(--ds-input-py)', borderWidth: 'var(--border-width, 1px)', ...style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
