import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "ds-tooltip-content z-3000 overflow-hidden rounded-xl bg-[var(--white)] px-3 py-2 text-[12px] font-medium leading-5 text-[var(--ink)] shadow-[var(--elev-lg)] border border-[var(--border)] ring-1 ring-black/5 dark:ring-white/10 max-w-xs pointer-events-none backdrop-blur-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)",
        className
      )}
      {...props}
    >
      {props.children}
      <TooltipPrimitive.Arrow className="ds-tooltip-arrow fill-[var(--white)]" width={10} height={5} />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

/**
 * The one tooltip for the whole platform. Wrap any control in <Tip label="…">
 * to give it the same tooltip the header uses (HeaderPill) — the design-system
 * TooltipContent above: rounded-xl, --white on --border, soft shadow, the Radix
 * fade/zoom. Use this instead of a native `title=` so every tooltip matches.
 * A single <TooltipProvider> up the tree (or the one this renders) supplies the
 * timing.
 */
export function Tip({ label, children, side = 'top', delayDuration = 200, className }: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={className}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
