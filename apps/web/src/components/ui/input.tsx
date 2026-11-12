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
          // Focus is drawn by control-contract.css ([data-ui-field]), not here:
          // this used to ring with var(--brand), a variable defined nowhere,
          // so the declaration was dropped and the ring never painted. A bare
          // field (inside an already-focus-styled search/editor shell) keeps
          // outline-none so it does not double up on its container's ring.
          "flex min-h-(--ctl-h) w-full rounded-(--radius) border border-(--border) bg-(--bg) px-2 py-1 text-sm placeholder:text-(--ink3) focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
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
