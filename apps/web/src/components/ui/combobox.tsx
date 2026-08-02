"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "./popover"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "./command"
import { cn } from "@/lib/utils"

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string
}

/**
 * Substring ranking, replacing cmdk's default subsequence fuzz.
 *
 * Returning 0 hides the item, so anything that does not genuinely contain the
 * typed text disappears instead of being scattered through the results.
 */
function comboboxFilter(value: string, search: string): number {
  const v = value.toLowerCase()
  const q = search.trim().toLowerCase()
  if (!q) return 1
  if (v === q) return 1
  if (v.startsWith(q)) return 0.9
  // A match at a word boundary ("port klang" for "klang") beats one buried
  // mid-word, which is usually incidental.
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(v)) return 0.7
  if (v.includes(q)) return 0.4
  return 0
}

/**
 * Searchable single-select over a pre-loaded option list (vehicles, drivers,
 * staff, customers, ...). For an async/debounced "search as you type against
 * an API" picker with inline create, use EntityPicker instead — this assumes
 * the full option list is already in memory.
 */
export function Combobox({
  options, value, onChange, placeholder, emptyText, searchPlaceholder, disabled, className, triggerClassName,
}: {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Select's trigger carries data-slot="select-trigger", which is how
          // pages resize the control to their own scale. This one carried
          // nothing, so a page that sized its fields to 44px left every
          // Combobox at the library default of 36 — a Port of Loading box
          // visibly shorter than the Select next to it.
          data-slot="combobox-trigger"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.label : (placeholder || "Select…")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-(--radix-popover-trigger-width) p-0", className)}>
        {/* cmdk's default filter is a subsequence match, so typing "durb" in a
            port list returned "Jeddah Islamic Port, Saudi Arabia" alongside
            "Durban" — the letters appear in order, scattered. Over long
            labels that is noise, not help. This ranks real substring matches
            only: whole label, then word start, then anywhere. */}
        <Command filter={comboboxFilter}>
          <CommandInput placeholder={searchPlaceholder || "Search…"} />
          <CommandList>
            <CommandEmpty>{emptyText || "No results."}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => { onChange(o.value); setOpen(false) }}
                >
                  <Check className={cn("h-4 w-4", value === o.value ? "opacity-100 text-primary" : "opacity-0")} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.sublabel && <span className="truncate text-xs text-muted-foreground">{o.sublabel}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
