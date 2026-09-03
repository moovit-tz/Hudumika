import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  /** "lg" is the feature-toggle-row size (FeatureToggleRow uses it internally) —
   *  plain settings switches elsewhere should stay on the default. */
  size?: "sm" | "lg"
  /** Renders a check glyph in the thumb once checked. Off by default so every
   *  existing plain switch in the app keeps its current look. */
  showCheckIcon?: boolean
}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ className, size = "sm", showCheckIcon = false, ...props }, ref) => (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        size === "lg" ? "h-[22px] w-[38px]" : "h-5 w-9",
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none flex items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform",
          size === "lg"
            ? "h-[18px] w-[18px] data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-0"
            : "h-4 w-4 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )}
      >
        {showCheckIcon && props.checked && (
          <Check className={cn("text-primary", size === "lg" ? "h-[11px] w-[11px]" : "h-2.5 w-2.5")} />
        )}
      </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
  )
)
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
