"use client"

import * as React from "react"
import { Checkbox } from "./checkbox"
import { Switch } from "./switch"
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
