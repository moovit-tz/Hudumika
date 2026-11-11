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
          "flex min-h-[var(--ctl-h)] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm placeholder:text-[var(--ink3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
