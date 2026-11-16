import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"
import { Icon } from "../Icon.js"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "ds-tooltip-content z-3000 overflow-hidden bg-[var(--white)] px-3 py-2 font-medium leading-5 text-[var(--ink)] shadow-[var(--elev-lg)] border border-solid border-[var(--border)] ring-1 ring-black/5 dark:ring-white/10 max-w-xs pointer-events-none backdrop-blur-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)",
        className
      )}
      style={{
        borderRadius: 'var(--r-sm, 8px)',
        borderWidth: 'var(--border-width, 1px)',
        fontSize: 'var(--text-xs, 12px)',
        fontFamily: 'var(--font)',
        ...style,
      }}
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
export function Tip({ label, children, side = 'top', delayDuration = 200, className, sideOffset = 4 }: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
  className?: string;
  sideOffset?: number;
}) {
  // A hover tooltip is not an accessible name until its content is mounted.
  // An icon-only control inside a Tip takes the tip's text as its accessible
  // name — otherwise a screen reader announces just "button". Native buttons
  // and links, and component controls (Button, DropdownMenuTrigger, …) which
  // forward aria-label to their element. Plain containers (<span>, <div>) are
  // left alone: a name on a non-interactive element means nothing.
  // A bare <Icon> is decoration, not a control. As a tooltip trigger it would
  // receive the trigger's click handler, and Icon renders anything clickable
  // as role="button" — a nameless, unfocusable fake button (found on Bliss).
  // Give it a focusable wrapper instead, described as an image named by the
  // tip, so keyboard and screen-reader users reach the same information.
  if (React.isValidElement(children) && children.type === Icon) {
    return (
      <TooltipProvider delayDuration={delayDuration}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} role="img" aria-label={typeof label === 'string' ? label : undefined} data-ui-focus="" className="inline-flex items-center">
              {children}
            </span>
          </TooltipTrigger>
          <TooltipContent side={side} sideOffset={sideOffset} className={className}>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const nameable = React.isValidElement(children)
    && (typeof children.type === 'string' ? children.type === 'button' || children.type === 'a' : true);
  const trigger = React.isValidElement<React.HTMLAttributes<HTMLButtonElement>>(children)
    && nameable
    && typeof label === 'string'
    && !children.props['aria-label']
    && !children.props['aria-labelledby']
    && !React.Children.toArray(children.props.children).some(child => typeof child === 'string' || typeof child === 'number')
      ? React.cloneElement(children, { 'aria-label': label })
      : children;
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={sideOffset} className={className}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
