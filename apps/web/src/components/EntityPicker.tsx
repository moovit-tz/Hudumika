import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icon.js';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.js';
import { cn } from '../lib/utils.js';
import { Input } from './ui/input.js';
import { ButtonSpinner } from './ui/spinner.js';
import { PersonAvatar, CompanyAvatar } from './PersonAvatar.js';
import type { SubjectKind } from '../lib/identity.js';
import './ui/search-results.css';

export interface PickerItem {
  id: string;
  label: string;
  sublabel?: string;
  /** For people/customers: pass the user/record id so avatar fetches the real photo. */
  avatarUserId?: string;
  /** Which identity table to look up — defaults to 'people' or 'customers'. */
  avatarKind?: SubjectKind;
  /** A pre-resolved logo or avatar image URL. */
  avatarUrl?: string;
  /** 'person' (round, live presence) or 'company' (square logo). Defaults to 'person'. */
  avatarType?: 'person' | 'company';
  /** Optional metadata tag or badge text (e.g. status, category). */
  tag?: string;
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
  className?: string;
  /** Optional hint for the entity category if not explicitly tagged on items */
  entityType?: 'customer' | 'contact' | 'staff' | 'supplier' | 'lead' | 'company' | 'person';
}

const isUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function renderItemAvatar(item: PickerItem, size = 28, defaultType?: string) {
  const isCompany = item.avatarType === 'company' ||
    defaultType === 'company' || defaultType === 'customer' || defaultType === 'supplier' ||
    item.avatarKind === 'customers' || item.avatarKind === 'suppliers' || item.avatarKind === 'carriers';

  const avatarId = item.avatarUserId || (isUuid(item.id) ? item.id : undefined);
  const avatarKind = item.avatarKind || (isCompany ? 'customers' : (defaultType === 'contact' ? 'contacts' : 'people'));

  if (isCompany) {
    return <CompanyAvatar id={avatarId} kind={avatarKind} name={item.label} logoUrl={item.avatarUrl} size={size} shape="square" />;
  }
  return <PersonAvatar userId={avatarId} kind={avatarKind} name={item.label} src={item.avatarUrl} size={size} hideStatus />;
}

function hasItemAvatar(item: PickerItem | null, defaultType?: string): boolean {
  if (!item) return false;
  return Boolean(
    item.avatarUserId ||
    item.avatarUrl ||
    item.avatarKind ||
    item.avatarType ||
    defaultType ||
    isUuid(item.id)
  );
}

/**
 * Generic "search existing, or create new" combobox. Used anywhere a form
 * needs to link a real record (customer, supplier, shipment, colleague) instead of a
 * free-text field or a hardcoded dropdown.
 *
 * Popup dropdown width strictly pins to the search input field width.
 * Automatically resolves and displays real profile images / company logos
 * from the tenant identity API.
 */
export function EntityPicker({
  value, onChange, search, onCreate, createLabel, placeholder, disabled, label, hint, className, entityType,
}: EntityPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = React.useId();

  useEffect(() => { setActiveIndex(-1); }, [items, open]);
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchVersion = useRef(0);

  useEffect(() => () => {
    searchVersion.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const runSearch = useCallback((q: string) => {
    const version = ++searchVersion.current;
    setLoading(true);
    setItems([]);
    setError(null);
    search(q)
      .then((results) => { if (version === searchVersion.current) setItems(results); })
      .catch(() => { if (version === searchVersion.current) setError('Search failed'); })
      .finally(() => { if (version === searchVersion.current) setLoading(false); });
  }, [search]);

  function handleFocus() {
    if (disabled || open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(true);
    setQuery('');
    runSearch('');
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function handleInput(v: string) {
    searchVersion.current += 1;
    setQuery(v);
    setOpen(true);
    setLoading(true);
    setError(null);
    setItems([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 200);
  }

  function selectItem(item: PickerItem) {
    searchVersion.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(false);
    onChange(item);
    setQuery('');
    setOpen(false);
  }

  function clearSelection(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
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
    !loading && !error && !items.some((i) => i.label.toLowerCase() === query.trim().toLowerCase());

  const showAvatarInTrigger = Boolean(value && !open && hasItemAvatar(value, entityType));

  return (
    <div className={cn("w-full min-w-0", className)}>
      {label && (
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          searchVersion.current += 1;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          setLoading(false);
          setQuery('');
        }
      }}>
        <PopoverAnchor asChild>
          <div className="relative w-full" style={{ width: '100%' }}>
            {showAvatarInTrigger && (
              <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1, display: 'flex', alignItems: 'center' }}>
                {renderItemAvatar(value!, 22, entityType)}
              </div>
            )}
            <Input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={open ? query : (value?.label ?? '')}
              onFocus={handleFocus}
              onClick={handleFocus}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (!open) handleFocus();
                  else if (items.length) setActiveIndex(i => e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1));
                } else if (e.key === 'Enter' && open && activeIndex >= 0 && items[activeIndex]) {
                  e.preventDefault();
                  selectItem(items[activeIndex]);
                } else if (e.key === 'Escape' && open) {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              role="combobox"
              aria-controls={open ? listId : undefined}
              aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
              aria-label={label || placeholder || 'Search records'}
              aria-expanded={open}
              aria-autocomplete="list"
              onChange={(e) => handleInput(e.target.value)}
              placeholder={placeholder || 'Search or type to create…'}
              className="input-field"
              style={{
                width: '100%',
                paddingLeft: showAvatarInTrigger ? 38 : 12,
                paddingRight: 32,
                background: disabled ? 'var(--bg)' : undefined,
                boxSizing: 'border-box' as const,
              }}
            />
            {value && !open ? (
              <button
                type="button"
                onClick={clearSelection}
                disabled={disabled}
                title="Clear selection"
                aria-label="Clear selection"
                style={{
                  position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex',
                }}
                data-ui-native-button=""
              >
                <Icon name="x" size={13} color="var(--ink3)" />
              </button>
            ) : loading ? (
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                <ButtonSpinner />
              </div>
            ) : (
              <Icon
                name="search"
                size={13}
                color="var(--ink3)"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="search-results-panel w-(--radix-popover-trigger-width)"
          style={{
            width: 'var(--radix-popover-trigger-width, var(--radix-popper-anchor-width))',
            minWidth: 'var(--radix-popover-trigger-width, var(--radix-popper-anchor-width))',
            maxWidth: 'var(--radix-popover-trigger-width, var(--radix-popper-anchor-width))',
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault();
          }}
        >
          <div className="search-results-help">
            <div className="flex items-center gap-1.5">
              {loading ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)] animate-pulse" />
                  <span>Searching records…</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
                  <span className="font-semibold text-[var(--ink)]">{items.length}</span>
                  <span>{items.length === 1 ? 'result' : 'results'}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] opacity-75">
              <kbd>↑</kbd><kbd>↓</kbd>
              <span>Navigate</span>
              <span className="mx-0.5">·</span>
              <kbd>↵</kbd>
              <span>Select</span>
            </div>
          </div>

          {loading && items.length === 0 && (
            <div role="status" className="flex items-center justify-center gap-2 py-6 text-xs font-medium text-[var(--ink3)]">
              <ButtonSpinner /> Searching…
            </div>
          )}

          {!loading && !error && items.length === 0 && !showCreate && (
            <div className="flex flex-col items-center justify-center py-6 px-3 text-center text-[var(--ink3)]">
              <Icon name="search" size={18} color="var(--ink3)" style={{ opacity: 0.35, marginBottom: 4 }} />
              <span className="text-xs font-medium">No matching records found</span>
            </div>
          )}

          <div id={listId} role="listbox" aria-label="Search results" aria-busy={loading} className="search-results-list">
            {!loading && items.map((item, index) => {
              const hasAvatar = hasItemAvatar(item, entityType);
              const isSelected = value?.id === item.id;
              const isActive = activeIndex === index;

              return (
                <button
                  key={item.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isActive || isSelected}
                  data-search-result=""
                  type="button"
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn("search-result-row", isSelected && "is-selected")}
                  data-ui-native-button=""
                >
                  {hasAvatar && (
                    <div className="shrink-0 flex items-center justify-center">
                      {renderItemAvatar(item, 28, entityType)}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-[var(--ink)] leading-snug">
                        {item.label}
                      </span>
                      {item.tag && (
                        <span className="shrink-0 rounded px-1.5 py-0.2 text-[10px] font-medium bg-[var(--border)] text-[var(--ink3)]">
                          {item.tag}
                        </span>
                      )}
                    </div>
                    {item.sublabel && (
                      <span className="truncate text-[11.5px] text-[var(--ink3)] leading-tight mt-0.5">
                        {item.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="shrink-0 text-[var(--teal)] flex items-center justify-center pl-1 ml-auto">
                      <Icon name="check" size={13} color="var(--teal)" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {showCreate && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="search-results-create-btn"
              data-ui-native-button=""
            >
              <Icon name="plusCircle" size={14} color="var(--teal)" />
              <span className="truncate">
                {creating ? 'Creating…' : (createLabel ? createLabel(query.trim()) : `Create new "${query.trim()}"`)}
              </span>
            </button>
          )}

          {error && <div className="px-3 py-2 text-xs text-destructive border-t border-border">{error}</div>}
        </PopoverContent>
      </Popover>

      {hint && !open && <p style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
