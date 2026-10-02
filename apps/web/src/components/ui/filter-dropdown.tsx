"use client"

import * as React from "react"
import { Check, ChevronDown, Maximize2, Search, SlidersHorizontal, X } from "lucide-react"
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
  //
  // h-[var(--ctl-h-sm)], not min-h: padding alone leaves the rendered
  // height at the mercy of font-size/line-height/border like every other
  // un-floored control CLAUDE.md warns about, and even a min-height floor
  // only wins when the pill's own content is shorter than it — this pill's
  // padding+border already exceeds --ctl-h-sm on its own, so a floor alone
  // still rendered it a few px taller than a neighboring toggle button. A
  // stated height (content vertically centered by items-center) is what
  // actually guarantees every control in the same toolbar row lines up.
  "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 h-[var(--ctl-h-sm,32px)] box-border text-sm font-semibold text-foreground/80 shadow-sm transition-colors hover:border-primary/40 hover:text-foreground data-[active=true]:border-primary/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
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

export interface QuickFilterConfig {
  label?: string
  allLabel?: string
  value: string | null
  options: FilterOption[]
  onChange: (value: string | null) => void
  icon?: React.ReactNode
  /** Render options in N columns instead of one vertical list (2 is common for 4+ items) */
  columns?: number
}

/* ── SearchToolbar ──────────────────────────────────────────────────────────
 * Unified toolbar with search input + inline dropdown filters + Filters button + optional action slots.
 *
 * Usage:
 *   <SearchToolbar
 *     search={q} onSearch={setQ}
 *     placeholder="Search products, SKU, or category..."
 *     quickFilter={{
 *       value: status, onChange: setStatus, allLabel: "All Status",
 *       options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]
 *     }}
 *     activeFilterCount={activeFilters}
 *     filterContent={(close) => <MyFiltersPanel close={close} />}
 *   />
 *
 * CSS lives in index.css under "SEARCH TOOLBAR (.stb-*)".
 */
export interface SearchToolbarProps {
  search?: string
  onSearch?: (value: string) => void
  placeholder?: string
  /** Inline quick dropdown filter (e.g. "All Status ▾" like in Dreams Core) */
  quickFilter?: QuickFilterConfig
  /** Multiple inline quick filters */
  quickFilters?: QuickFilterConfig[]
  /** Number of active filters. Renders Dreams Core green badge on the Filters button when > 0. */
  activeFilterCount?: number
  /** Called when the Filters button is clicked. Omit to hide it if filterContent is also omitted. */
  onFiltersClick?: () => void
  /** Whether the filter panel is currently open — highlights the button. */
  filtersOpen?: boolean
  /** Content to render inside the Filters popover automatically. */
  filterContent?: React.ReactNode | ((close: () => void) => React.ReactNode)
  /** Called when the expand button is clicked. Omit to hide it. */
  onExpand?: () => void
  /** Extra ReactNode rendered inside the right action area — e.g. a DropdownMenu. */
  actions?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

function InlineQuickFilter({ config }: { config: QuickFilterConfig }) {
  const [open, setOpen] = React.useState(false)
  const selected = config.options.find((o) => o.value === config.value)
  const displayLabel = selected?.label ?? config.allLabel ?? 'All'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-active={!!config.value}
          className="stb-dropdown-btn"
          aria-expanded={open}
        >
          {config.icon}
          <span>{config.label ? `${config.label}: ` : ''}{displayLabel}</span>
          <ChevronDown size={13} className="stb-chevron" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        style={config.columns && config.columns > 1 ? { width: `${config.columns * 130 + 24}px` } : undefined}
        className="p-1.5 shadow-xl border border-border bg-popover w-52"
      >
        <button
          type="button"
          onClick={() => { config.onChange(null); setOpen(false) }}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span>{config.allLabel ?? 'All'}</span>
          {!config.value && <Check className="h-3.5 w-3.5 text-primary" />}
        </button>
        <div style={config.columns && config.columns > 1 ? { display:'grid', gridTemplateColumns:`repeat(${config.columns}, 1fr)` } : undefined}>
          {config.options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { config.onChange(o.value); setOpen(false) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <span className="flex items-center gap-2">
                {o.icon}
                <span className={cn(o.value === config.value ? "font-semibold text-foreground" : "")}>{o.label}</span>
              </span>
              {o.value === config.value && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FiltersButton({
  filterActive,
  activeFilterCount,
  onFiltersClick,
  filterContent,
}: {
  filterActive: boolean
  activeFilterCount: number
  onFiltersClick?: () => void
  filterContent?: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const [open, setOpen] = React.useState(false)

  if (filterContent) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="stb-btn"
            data-active={String(filterActive || open)}
            aria-pressed={filterActive}
          >
            <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="stb-green-badge" aria-label={`${activeFilterCount} active filters`}>
                <span className="stb-green-dot" />
                <span>{activeFilterCount}</span>
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 sm:w-96 p-0 shadow-2xl rounded-xl border border-border bg-popover">
          {typeof filterContent === 'function' ? filterContent(() => setOpen(false)) : filterContent}
        </PopoverContent>
      </Popover>
    )
  }

  if (onFiltersClick) {
    return (
      <button
        type="button"
        className="stb-btn"
        data-active={String(filterActive)}
        onClick={onFiltersClick}
        aria-pressed={filterActive}
      >
        <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="stb-green-badge" aria-label={`${activeFilterCount} active filters`}>
            <span className="stb-green-dot" />
            <span>{activeFilterCount}</span>
          </span>
        )}
      </button>
    )
  }

  return null
}

export function SearchToolbar({
  search = '',
  onSearch,
  placeholder = 'Search…',
  quickFilter,
  quickFilters,
  activeFilterCount = 0,
  onFiltersClick,
  filtersOpen = false,
  filterContent,
  onExpand,
  actions,
  className,
  style,
}: SearchToolbarProps) {
  const allQuickFilters = React.useMemo(() => {
    const list: QuickFilterConfig[] = []
    if (quickFilter) list.push(quickFilter)
    if (quickFilters) list.push(...quickFilters)
    return list
  }, [quickFilter, quickFilters])

  const hasFilters = Boolean(onFiltersClick || filterContent)
  const filterActive = filtersOpen || activeFilterCount > 0

  return (
    <div className={cn('stb', className)} style={style}>
      <div className="stb-search">
        <Search className="stb-search-icon" size={15} strokeWidth={2} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={e => onSearch?.(e.target.value)}
          placeholder={placeholder}
          className="stb-input"
          aria-label={placeholder}
        />
        {search && (
          <button
            type="button"
            className="stb-icon-btn"
            style={{ width: 22, height: 22, minWidth: 22 }}
            onClick={() => onSearch?.('')}
            title="Clear"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {allQuickFilters.map((qf, i) => (
        <React.Fragment key={i}>
          <div className="stb-sep" aria-hidden />
          <InlineQuickFilter config={qf} />
        </React.Fragment>
      ))}

      {hasFilters && (
        <>
          <div className="stb-sep" aria-hidden />
          <div className="stb-actions">
            <FiltersButton
              filterActive={filterActive}
              activeFilterCount={activeFilterCount}
              onFiltersClick={onFiltersClick}
              filterContent={filterContent}
            />
          </div>
        </>
      )}

      {(onExpand || actions) && (
        <>
          {!hasFilters && <div className="stb-sep" aria-hidden />}
          <div className="stb-actions">
            {onExpand && (
              <button
                type="button"
                className="stb-icon-btn"
                onClick={onExpand}
                title="Expand"
                aria-label="Expand view"
              >
                <Maximize2 size={14} strokeWidth={2} aria-hidden />
              </button>
            )}
            {actions}
          </div>
        </>
      )}
    </div>
  )
}
