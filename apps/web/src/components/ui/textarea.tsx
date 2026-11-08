import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, style, ...props }, ref) => {
  return (
    <textarea
      data-ui-field="textarea"
    data-field-appearance={/\bborder-(?:0|none)\b/.test(className ?? '') ? 'bare' : undefined}
      className={cn(
        "flex min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors hover:border-primary/40 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      style={{ borderWidth: 'var(--border-width, 1px)', ...style }}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
