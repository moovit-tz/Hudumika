"use client"

import * as React from "react"
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const triggerClass = cn(
  "flex min-h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-[var(--ds-input-py,8px)] text-left text-sm font-medium shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
    if (d) setOpen(false)
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
              onClick={(e) => { e.stopPropagation(); handleSelect(undefined) }}
              className="rounded-full p-0.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-auto p-2", className)}>
        {name && <input type="hidden" name={name} value={toDateOnlyString(date)} />}
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
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
  numberOfMonths?: number
}

const PRESETS: Array<{ label: string; getRange: () => DateRange | undefined }> = [
  { label: "All time", getRange: () => undefined },
  { label: "Today", getRange: () => ({ from: new Date(), to: new Date() }) },
  { label: "Yesterday", getRange: () => { const d = subDays(new Date(), 1); return { from: d, to: d }; } },
  { label: "This Week", getRange: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: "This Month", getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Last 30 Days", getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "This Year", getRange: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
]

/** Range picker — compact trigger pill, preset shortcuts column + compact calendar. */
export function DateRangePicker({
  range,
  onChange,
  placeholder = "Pick a date range",
  disabled,
  className,
  triggerClassName,
  numberOfMonths = 1,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const label = range?.from
    ? range.to
      ? `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`
      : format(range.from, "d MMM yyyy")
    : placeholder

  function selectPreset(preset: typeof PRESETS[number]) {
    onChange(preset.getRange())
    setOpen(false)
  }

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
      <PopoverContent align="start" className={cn("w-auto p-0 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border shadow-xl rounded-xl overflow-hidden", className)}>
        {/* Preset shortcuts column */}
        <div className="flex flex-col gap-0.5 p-2 bg-muted/30 min-w-[120px] text-xs">
          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Presets</div>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => selectPreset(p)}
              className="px-2.5 py-1.5 rounded-md text-left font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Compact Calendar */}
        <div className="p-1.5">
          <Calendar
            mode="range"
            selected={range}
            onSelect={onChange}
            numberOfMonths={numberOfMonths}
            autoFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
