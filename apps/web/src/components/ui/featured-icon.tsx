import * as React from "react"
import { cn } from "@/lib/utils"

const SIZE_MAP = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-14 w-14",
} as const

const VARIANT_MAP = {
  brand:   "bg-[var(--teal-l)] text-[var(--teal)]",
  gray:    "bg-muted text-muted-foreground",
  success: "bg-[var(--green-l)] text-[var(--green)]",
  warning: "bg-[var(--gold-l)] text-[var(--gold)]",
  error:   "bg-[var(--red-l)] text-[var(--red)]",
  info:    "bg-[var(--blue-l)] text-[var(--blue)]",
} as const

export interface FeaturedIconProps {
  /** The icon element to render inside — e.g. `<Icon name="upload" size={18} />` or a lucide icon. */
  children: React.ReactNode
  variant?: keyof typeof VARIANT_MAP
  size?: keyof typeof SIZE_MAP
  shape?: "circle" | "square"
  className?: string
}

/**
 * Soft-tint icon badge — background tint + matching-hue icon, no fill.
 * The Untitled-UI-style pattern this app already reinvents ad-hoc in dozens of
 * places (empty states, document rows, notification lists, card headers).
 */
export function FeaturedIcon({ children, variant = "brand", size = "md", shape = "square", className }: FeaturedIconProps) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        SIZE_MAP[size],
        shape === "circle" ? "rounded-full" : "rounded-xl",
        VARIANT_MAP[variant],
        className
      )}
    >
      {children}
    </div>
  )
}
