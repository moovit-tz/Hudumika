import * as React from "react"
import { cn } from "@/lib/utils"
import { squirclePath } from "@/lib/squircle"

const SIZE_MAP = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-14 w-14",
} as const

const SIZE_PX = { sm: 32, md: 40, lg: 48, xl: 56 } as const
const SQUIRCLE_CLIPS = Object.fromEntries(
  Object.entries(SIZE_PX).map(([key, size]) => [key, `path('${squirclePath(size)}')`])
) as Record<keyof typeof SIZE_PX, string>

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
  /** `square` is retained as a compatibility alias for the platform squircle. */
  shape?: "circle" | "square" | "squircle"
  className?: string
  style?: React.CSSProperties
}

/**
 * Soft-tint icon badge — background tint + matching-hue icon, no fill.
 * The Untitled-UI-style pattern this app already reinvents ad-hoc in dozens of
 * places (empty states, document rows, notification lists, card headers).
 */
export function FeaturedIcon({ children, variant = "brand", size = "md", shape = "squircle", className, style }: FeaturedIconProps) {
  const isCircle = shape === "circle"
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        SIZE_MAP[size],
        isCircle ? "rounded-full" : "rounded-[33%]",
        VARIANT_MAP[variant],
        className
      )}
      style={{ ...style, clipPath: isCircle ? style?.clipPath : SQUIRCLE_CLIPS[size] }}
    >
      {children}
    </div>
  )
}
