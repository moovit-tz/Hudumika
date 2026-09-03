"use client"

import * as React from "react"
import { Checkbox } from "./checkbox"
import { Switch } from "./switch"
import { FeaturedIcon } from "./featured-icon"
import { cn } from "@/lib/utils"

interface RowProps {
  title: string
  description?: string
  disabled?: boolean
  className?: string
}

const rowClass = "flex items-start justify-between gap-4 border-b border-border/60 py-3.5 last:border-b-0"
const textClass = "min-w-0"
const titleClass = "text-sm font-semibold text-foreground"
const descClass = "mt-0.5 text-xs leading-relaxed text-muted-foreground"

/** "Checkbox & label" row — checkbox leading, bold title + helper text, matches the component-kit reference. */
export function CheckboxRow({
  title, description, checked, onCheckedChange, disabled, className,
}: RowProps & { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className={cn(rowClass, "cursor-pointer", disabled && "cursor-not-allowed opacity-50", className)}>
      <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} disabled={disabled} className="mt-0.5" />
      <div className={cn(textClass, "flex-1")}>
        <div className={titleClass}>{title}</div>
        {description && <div className={descClass}>{description}</div>}
      </div>
    </label>
  )
}

/** "Switch & label" row — bold title + helper text leading, switch trailing. */
export function SwitchRow({
  title, description, checked, onCheckedChange, disabled, className,
}: RowProps & { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className={cn(rowClass, className)}>
      <div className={textClass}>
        <div className={titleClass}>{title}</div>
        {description && <div className={descClass}>{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5 shrink-0" />
    </div>
  )
}

/**
 * Icon-leading feature kill-switch row — a soft-tint `FeaturedIcon`, title +
 * helper text, an explicit On/Off text label, and the larger check-glyph
 * `Switch`. For a *list* of remote toggles (mobile-app feature flags,
 * per-tenant module switches) where the icon is what makes each row
 * scannable — for a plain settings preference with no icon, use `SwitchRow`.
 */
export function FeatureToggleRow({
  title, description, icon, action, checked, onCheckedChange, disabled, className,
}: RowProps & { icon: React.ReactNode; action?: React.ReactNode; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  // Muted whenever the switch reads "Off" — not just when the row itself is
  // un-interactive — so a toggled-off row visually recedes (gray icon badge,
  // gray title/description) the same way the reference kill-switch list does,
  // while staying fully clickable to turn back on.
  const muted = disabled || !checked
  return (
    <div className={cn("flex items-center justify-between gap-4 py-4", className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        <FeaturedIcon variant={muted ? "gray" : "brand"} shape="circle">{icon}</FeaturedIcon>
        <div className={textClass}>
          <div className={cn(titleClass, muted && "text-muted-foreground")}>{title}</div>
          {description && <div className={cn(descClass, muted && "opacity-70")}>{description}</div>}
          {action && <div className="mt-1">{action}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className={cn("text-xs font-semibold", checked && !disabled ? "text-primary" : "text-muted-foreground")}>
          {checked ? "On" : "Off"}
        </span>
        <Switch size="lg" showCheckIcon checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </div>
  )
}
