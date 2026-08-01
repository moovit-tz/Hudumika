import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icon.js';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.js';
import { cn } from '../lib/utils.js';

export interface PickerItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface EntityPickerProps {
  value: PickerItem | null;
  onChange: (item: PickerItem | null) => void;
  search: (query: string) => Promise<PickerItem[]>;
  onCreate?: (name: string) => Promise<PickerItem>;
  createLabel?: (query: string) => string;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

/**
 * Generic "search existing, or create new" combobox. Used anywhere a form
 * needs to link a real record (customer, supplier, shipment) instead of a
 * free-text field or a hardcoded dropdown.
 *
 * The input itself is the popover's anchor (not a separate trigger button) —
 * focusing it opens the results list, matching a typical async-search combobox.
 * Renders results as plain styled rows rather than cmdk's <Command> list: the
 * input lives outside the popover content (so it stays visible while closed,
 * showing the selected label), and cmdk's keyboard navigation doesn't bridge
 * across that boundary — so this uses Popover for positioning/portal/outside-
 * click only, styled to match the Command-based comboboxes elsewhere.
 */
export function EntityPicker({
  value, onChange, search, onCreate, createLabel, placeholder, disabled, label, hint,
}: EntityPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    search(q)
      .then((results) => setItems(results))
      .catch(() => setError('Search failed'))
      .finally(() => setLoading(false));
  }, [search]);

  function handleFocus() {
    setOpen(true);
    setQuery('');
    runSearch('');
    // Select all so the first keystroke replaces the shown value
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function handleInput(v: string) {
    setQuery(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 220);
  }

  function selectItem(item: PickerItem) {
    onChange(item);
    setQuery('');
    setOpen(false);
  }

  function clearSelection(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setQuery('');
    setOpen(true);
    runSearch('');
    inputRef.current?.focus();
  }

  async function handleCreate() {
    if (!onCreate || !query.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(query.trim());
      selectItem(created);
    } catch (err: any) {
      setError(err?.message || 'Could not create');
    } finally {
      setCreating(false);
    }
  }

  const showCreate = onCreate && query.trim().length > 0 &&
    !items.some((i) => i.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
        <PopoverAnchor asChild>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={open ? query : (value?.label ?? '')}
              onFocus={handleFocus}
              onChange={(e) => handleInput(e.target.value)}
              placeholder={placeholder || 'Search or type to create…'}
              className="input-field"
              /* Sizing, radius and type scale come from .input-field's design
                 tokens rather than being hardcoded here — otherwise this sits
                 at a different height to every other input on the same form.
                 Only the right padding is local, to clear the × button. */
              style={{
                paddingRight: 32,
                background: disabled ? 'var(--bg)' : undefined,
                boxSizing: 'border-box' as const,
              }}
            />
            {value && !open ? (
              <button type="button" onClick={clearSelection} title="Clear selection"
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <Icon name="x" size={13} color="var(--ink3)" />
              </button>
            ) : (
              <Icon name="search" size={13} color="var(--ink3)"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          // Pinned to the input's own width. Radix's popper wrapper carries an
          // inline `min-width: max-content`, so without an explicit width the
          // panel grows to its longest row — long tariff descriptions pushed it
          // well past the field and off the card.
          className="max-h-80 w-(--radix-popover-trigger-width) overflow-y-auto p-1.5"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {loading && <div className="px-3 py-2.5 text-sm font-medium text-muted-foreground">Searching…</div>}
          {!loading && items.length === 0 && !showCreate && (
            <div className="px-3 py-2.5 text-sm font-medium text-muted-foreground">No matches</div>
          )}
          {!loading && items.map((item) => (
            <button key={item.id} type="button" onClick={() => selectItem(item)}
              className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent">
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
            </button>
          ))}
          {showCreate && (
            <button type="button" onClick={handleCreate} disabled={creating}
              className={cn(
                "mt-0.5 flex w-full items-center gap-2 rounded-lg bg-accent px-3 py-2 text-left text-sm font-bold text-primary",
                creating ? "cursor-default" : "cursor-pointer"
              )}>
              <Icon name="plusCircle" size={13} color="var(--teal)" />
              {creating ? 'Creating…' : (createLabel ? createLabel(query.trim()) : `Create new "${query.trim()}"`)}
            </button>
          )}
          {error && <div className="px-2.5 py-1.5 text-xs text-destructive">{error}</div>}
        </PopoverContent>
      </Popover>

      {hint && !open && <p style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
