"use client"

import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Checkbox } from "./checkbox"
import { cn } from "@/lib/utils"

export interface FilterOption {
  value: string
  label: string
  icon?: React.ReactNode
}

const triggerPillClass = cn(
  // py-[var(--ds-btn-py)], not py-2: a filter pill sits in the same toolbar
  // row as the page's action buttons, so it has to track the same density
  // token or it renders 2px short of everything beside it.
  "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-[var(--ds-btn-py,7px)] text-sm font-semibold text-foreground/80 shadow-sm transition-colors hover:border-primary/40 hover:text-foreground data-[active=true]:border-primary/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
)

function TriggerPill({
  icon, label, valueLabel, active, onClear,
}: { icon?: React.ReactNode; label: string; valueLabel?: string; active?: boolean; onClear?: () => void }) {
  return (
    <PopoverTrigger asChild>
      <button type="button" data-active={active} className={triggerPillClass}>
        {icon}
        <span>{label}{valueLabel ? <>: <span className="font-bold">{valueLabel}</span></> : null}</span>
        {active && onClear ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onClear(); } }}
            title="Remove this filter"
            className="ml-0.5 rounded-full p-0.5 text-foreground/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        )}
      </button>
    </PopoverTrigger>
  )
}

/** Single-select filter pill — "Status: Open ▾" pattern. */
export function SingleSelectFilter({
  label, icon, options, value, onChange, allLabel = "All",
}: {
  label: string
  icon?: React.ReactNode
  options: FilterOption[]
  value: string | null
  onChange: (value: string | null) => void
  allLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TriggerPill icon={icon} label={label} valueLabel={selected?.label ?? allLabel} active={!!value} onClear={value ? () => onChange(null) : undefined} />
      <PopoverContent align="start" className="w-56 p-1.5">
        <button
          type="button"
          onClick={() => { onChange(null); setOpen(false) }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {allLabel}
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { onChange(o.value); setOpen(false) }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {o.icon}
            <span className="flex-1">{o.label}</span>
            {o.value === value && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Multi-select filter pill with search — "Module Type: All Modules ▾" pattern. */
export function MultiSelectFilter({
  label, icon, options, values, onChange, searchable = true,
}: {
  label: string
  icon?: React.ReactNode
  options: FilterOption[]
  values: string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])
  }

  const valueLabel = values.length === 0
    ? undefined
    : values.length === 1
      ? options.find((o) => o.value === values[0])?.label
      : `${values.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TriggerPill icon={icon} label={label} valueLabel={valueLabel ?? "All"} active={values.length > 0} onClear={values.length > 0 ? () => onChange([]) : undefined} />
      <PopoverContent align="start" className="w-64 p-0">
        {searchable && (
          <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</div>
          )}
          {filtered.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Checkbox checked={values.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              {o.icon}
              <span className="flex-1">{o.label}</span>
            </label>
          ))}
        </div>
        {values.length > 0 && (
          <div className="border-t border-border/60 px-3.5 py-2">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Clear All
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
