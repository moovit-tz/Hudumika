import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  /** "lg" kept for backward compat — labeled design ignores it (it has its own size). */
  size?: "sm" | "lg"
  /** @deprecated No longer rendered — the embedded label replaces the check icon. Kept for backward compat. */
  showCheckIcon?: boolean
  /**
   * Embeds an "On" / "Off" label inside the track — the platform's canonical
   * toggle style (matches the reference in the design system). Defaults to
   * true. Pass `labeled={false}` only where the 80px track is too wide (e.g.
   * a dense table column or a toolbar icon row).
   */
  labeled?: boolean
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, size = "sm", showCheckIcon: _showCheckIcon, labeled = true, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // ── shared ──────────────────────────────────────────────────────────
      "group/sw peer relative inline-flex shrink-0 cursor-pointer items-center",
      "rounded-full border-2 border-transparent shadow-sm",
      "transition-colors duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // ── labeled (canonical platform style, 56 × 22 px — 70% of original 80×32) ──
      labeled
        ? [
            "h-[22px] w-[56px]",
            "data-[state=unchecked]:bg-neutral-500",
            "data-[state=checked]:bg-primary",
          ]
        // ── compact (unlabeled, backward-compat) ────────────────────────
        : [
            size === "lg" ? "h-[22px] w-[38px]" : "h-5 w-9",
            "data-[state=unchecked]:bg-input",
            "data-[state=checked]:bg-primary",
          ],
      className,
    )}
    {...props}
    ref={ref}
  >
    {/* On / Off label — lives inside the track, opposite the thumb */}
    {labeled && (
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute select-none text-[8px] font-bold leading-none text-white",
          "transition-all duration-200",
          // OFF → right side of track
          "group-data-[state=unchecked]/sw:right-1.5 group-data-[state=unchecked]/sw:left-auto",
          // ON  → left side of track
          "group-data-[state=checked]/sw:left-1.5   group-data-[state=checked]/sw:right-auto",
        )}
      >
        <span
          className={cn(
            "block rounded-[3px] px-1 py-[2px]",
            // OFF: subtle dark pill so text reads on the gray track
            "group-data-[state=unchecked]/sw:bg-black/25",
            // ON:  light glow so text reads on the colored track
            "group-data-[state=checked]/sw:bg-white/15",
          )}
        >
          {props.checked ? "On" : "Off"}
        </span>
      </span>
    )}

    {/* Sliding thumb */}
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none flex items-center justify-center rounded-full bg-white shadow-lg ring-0",
        "transition-all duration-200 ease-in-out",
        labeled
          ? [
              "h-[17px] w-[17px]",
              // Inner area = 56px − 4px border = 52px; thumb 17px; 3px gaps on each side
              // unchecked: 3px from inner-left  → translate-x-[3px]
              // checked  : 52−17−3 = 32px       → translate-x-8 (32px)
              "data-[state=unchecked]:translate-x-[3px]",
              "data-[state=checked]:translate-x-8",
            ]
          : size === "lg"
          ? [
              "h-[18px] w-[18px]",
              "data-[state=unchecked]:translate-x-0",
              "data-[state=checked]:translate-x-[16px]",
            ]
          : [
              "h-4 w-4",
              "data-[state=unchecked]:translate-x-0",
              "data-[state=checked]:translate-x-4",
            ],
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
