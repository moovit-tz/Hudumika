"use client"

import * as React from "react"
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const triggerClass = cn(
  "flex min-h-(--ctl-h) w-full items-center gap-2 rounded-(--radius) border border-input bg-transparent px-3 py-[var(--ds-input-py,8px)] text-left text-sm font-medium shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
)

/** Radix focuses the first tabbable element on open, which in a calendar is
 *  the "previous month" arrow. Send keyboard focus to the day the grid marks as
 *  current (selected, else today) so arrow keys and Enter work straight away. */
function focusCurrentDay(event: Event) {
  const root = event.currentTarget as HTMLElement | null
  const day = root?.querySelector<HTMLElement>('button[data-day][tabindex="0"]') ?? root?.querySelector<HTMLElement>('button[data-day]')
  if (!day) return
  event.preventDefault()
  day.focus()
}

function ClearDateButton({ onClear, label, disabled }: { onClear: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onClear() }}
      data-ui-focus=""
      className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

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
  /**
   * The selected day. `undefined` leaves the picker uncontrolled; pass `null`
   * for "controlled, and empty" — otherwise a form that resets its state to
   * blank after saving would fall back to the picker's own last pick and keep
   * showing the old date.
   */
  date?: Date | null
  defaultDate?: Date
  onChange?: (date: Date | undefined) => void
  /** Renders a hidden native input so this participates in `new FormData(form)` on uncontrolled forms — same idea as Radix Select's `name` prop. */
  name?: string
  placeholder?: string
  disabled?: boolean
  /**
   * Blocks the surrounding form's submit while empty, with the browser's own
   * "fill out this field" message — the same behaviour the native date input
   * it replaces had.
   */
  required?: boolean
  /** Earliest selectable day; earlier days are disabled in the calendar. */
  min?: Date
  "aria-label"?: string
  className?: string
  triggerClassName?: string
}

/** Radix only runs its open-focus hook when the content mounts. Reopening
 *  during the close animation reuses the mounted content, so focus would stay
 *  on the trigger; this moves it to the current day on every open. */
function useFocusDayOnOpen(open: boolean) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const root = ref.current
      if (!root || root.querySelector("button[data-day]:focus")) return
      const day = root.querySelector<HTMLElement>('button[data-day][tabindex="0"]') ?? root.querySelector<HTMLElement>("button[data-day]")
      day?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])
  return ref
}

/** Single-date picker — trigger pill + polished calendar popover. Supports both controlled (date/onChange) and uncontrolled (defaultDate/name, for FormData-based forms) usage. */
export function DatePicker({ date: controlledDate, defaultDate, onChange, name, placeholder = "Pick a date", disabled, required, min, "aria-label": ariaLabel, className, triggerClassName }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const contentRef = useFocusDayOnOpen(open)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(defaultDate)
  const isControlled = controlledDate !== undefined
  const date = isControlled ? (controlledDate ?? undefined) : internalDate

  function handleSelect(d: Date | undefined) {
    if (!isControlled) setInternalDate(d)
    onChange?.(d)
    if (d) setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative w-full">
        {/* Radix unmounts PopoverContent's subtree the instant the popover
            closes — and handleSelect closes it immediately on pick — so a
            hidden input placed inside PopoverContent (as this used to be) is
            gone from the DOM before a caller's <form> ever submits, and
            `new FormData(form)` silently never sees the date at all. Kept
            here, a sibling of the popover content, so it survives close. */}
        {required ? (
          // type="hidden" is skipped by form validation, so a required picker
          // carries its value in a real, invisible input the browser can
          // validate and anchor its message to. It is out of the Tab order;
          // when validation focuses it, focus is handed to the trigger.
          <input
            tabIndex={-1}
            aria-hidden="true"
            required
            disabled={disabled}
            name={name}
            value={toDateOnlyString(date)}
            onChange={() => {}}
            onFocus={() => triggerRef.current?.focus()}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        ) : name ? <input type="hidden" name={name} value={toDateOnlyString(date)} /> : null}
        <PopoverTrigger asChild>
          <button ref={triggerRef} aria-label={ariaLabel} aria-required={required || undefined} data-ui-field="date" data-field-appearance={/date-picker-seamless|border-0/.test(triggerClassName ?? '') ? 'bare' : undefined} type="button" disabled={disabled} className={cn(triggerClass, date && "pr-9", !date && "text-muted-foreground", triggerClassName)}>
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
            <span className="flex-1 truncate">{date ? format(date, "d MMM yyyy") : placeholder}</span>
          </button>
        </PopoverTrigger>
        {date && <ClearDateButton label="Clear date" disabled={disabled} onClear={() => handleSelect(undefined)} />}
      </div>
      <PopoverContent ref={contentRef} align="start" className={cn("w-auto p-2", className)} onOpenAutoFocus={focusCurrentDay}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          defaultMonth={date ?? min}
          disabled={min ? { before: min } : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export interface DateTimePickerProps {
  date?: Date
  defaultDate?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
}

/** Same trigger+popover shape as DatePicker, with a time-of-day row under the
 *  calendar — the platform's one answer for "date and time", so a scheduling
 *  field reaches for this instead of a native `datetime-local` input or a
 *  one-off local component. Selecting a day does not close the popover (there
 *  is no single "final" click the way a date-only pick has); a Done button
 *  commits and closes explicitly. */
export function DateTimePicker({ date: controlledDate, defaultDate, onChange, placeholder = "Pick date & time", disabled, className, triggerClassName }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(defaultDate)
  const isControlled = controlledDate !== undefined
  const date = isControlled ? controlledDate : internalDate

  function commit(d: Date | undefined) {
    if (!isControlled) setInternalDate(d)
    onChange?.(d)
  }

  function handleDaySelect(d: Date | undefined) {
    if (!d) { commit(undefined); return }
    // Preserve the time-of-day already chosen (or default to 09:00 for a
    // fresh pick) rather than resetting it to midnight.
    const next = new Date(d)
    if (date) next.setHours(date.getHours(), date.getMinutes(), 0, 0)
    else next.setHours(9, 0, 0, 0)
    commit(next)
  }

  function handleTimeChange(value: string) {
    const [h, m] = value.split(":").map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const base = date ?? new Date()
    const next = new Date(base)
    next.setHours(h, m, 0, 0)
    commit(next)
  }

  const timeValue = date ? format(date, "HH:mm") : ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <button data-ui-field="date" data-field-appearance={/date-picker-seamless|border-0/.test(triggerClassName ?? '') ? 'bare' : undefined} type="button" disabled={disabled} className={cn(triggerClass, date && "pr-9", !date && "text-muted-foreground", triggerClassName)}>
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
            <span className="flex-1 truncate">{date ? format(date, "d MMM yyyy, HH:mm") : placeholder}</span>
          </button>
        </PopoverTrigger>
        {date && <ClearDateButton label="Clear date and time" disabled={disabled} onClear={() => commit(undefined)} />}
      </div>
      <PopoverContent align="start" className={cn("w-auto p-2", className)} onOpenAutoFocus={focusCurrentDay}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDaySelect}
          autoFocus
        />
        <div className="flex items-center gap-2 border-t border-border px-2 pt-2 mt-1">
          <span className="text-xs font-medium text-muted-foreground">Time</span>
          <input
            type="time"
            value={timeValue}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
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
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <button data-ui-field="date" data-field-appearance={/date-picker-seamless|border-0/.test(triggerClassName ?? '') ? 'bare' : undefined} type="button" disabled={disabled} className={cn(triggerClass, range?.from && "pr-9", !range?.from && "text-muted-foreground", triggerClassName)}>
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
            <span className="flex-1 truncate">{label}</span>
          </button>
        </PopoverTrigger>
        {range?.from && <ClearDateButton label="Clear date range" disabled={disabled} onClear={() => onChange(undefined)} />}
      </div>
      <PopoverContent align="start" className={cn("w-auto p-0 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border shadow-xl rounded-xl overflow-hidden", className)} onOpenAutoFocus={focusCurrentDay}>
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
