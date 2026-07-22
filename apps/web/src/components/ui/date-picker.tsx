"use client"

import * as React from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const triggerClass = cn(
  "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm font-medium shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
)

/** Parse a plain "YYYY-MM-DD" string (as produced by <input type="date">) into a local Date, avoiding UTC-parse day-shift. */
export function parseDateOnly(s: string | null | undefined): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

/** Inverse of parseDateOnly — formats a Date back to "YYYY-MM-DD" in local time. */
export function toDateOnlyString(d: Date | null | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : ""
}

export interface DatePickerProps {
  date?: Date
  defaultDate?: Date
  onChange?: (date: Date | undefined) => void
  /** Renders a hidden native input so this participates in `new FormData(form)` on uncontrolled forms — same idea as Radix Select's `name` prop. */
  name?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
}

/** Single-date picker — trigger pill + polished calendar popover. Supports both controlled (date/onChange) and uncontrolled (defaultDate/name, for FormData-based forms) usage. */
export function DatePicker({ date: controlledDate, defaultDate, onChange, name, placeholder = "Pick a date", disabled, className, triggerClassName }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(defaultDate)
  const isControlled = controlledDate !== undefined
  const date = isControlled ? controlledDate : internalDate

  function handleSelect(d: Date | undefined) {
    if (!isControlled) setInternalDate(d)
    onChange?.(d)
    setOpen(false)
  }
  function handleClear(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    if (!isControlled) setInternalDate(undefined)
    onChange?.(undefined)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={cn(triggerClass, !date && "text-muted-foreground", triggerClassName)}>
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">{date ? format(date, "d MMM yyyy") : placeholder}</span>
          {date && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClear(e) }}
              className="rounded-full p-0.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-auto p-2", className)}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
      {name && <input type="hidden" name={name} value={toDateOnlyString(date)} />}
    </Popover>
  )
}

export interface DateRangePickerProps {
  range?: DateRange
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
}

/** Range picker — "Jan 4 – Jan 12" trigger, two-month calendar popover. */
export function DateRangePicker({ range, onChange, placeholder = "Pick a date range", disabled, className, triggerClassName }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const label = range?.from
    ? range.to
      ? `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`
      : format(range.from, "d MMM yyyy")
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={cn(triggerClass, !range?.from && "text-muted-foreground", triggerClassName)}>
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">{label}</span>
          {range?.from && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
              className="rounded-full p-0.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-auto p-2", className)}>
        <Calendar
          mode="range"
          selected={range}
          onSelect={onChange}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
