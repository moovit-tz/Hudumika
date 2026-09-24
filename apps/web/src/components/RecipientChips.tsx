import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PersonAvatar } from './PersonAvatar.js';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import './RecipientChips.css';

export interface RecipientChip {
  email: string;
  name?: string;
}

export function parseAddressList(value: string): RecipientChip[] {
  return value.split(',').map(parseAddress).filter((c): c is RecipientChip => !!c);
}
export function formatAddressList(chips: RecipientChip[]): string {
  return chips.map(c => (c.name ? `${c.name} <${c.email}>` : c.email)).join(', ');
}

function parseAddress(raw: string): RecipientChip | null {
  const value = raw.trim().replace(/,$/, '').trim();
  if (!value) return null;
  const angled = value.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"|"$/g, '');
    const email = angled[2].trim();
    return email ? { email, name: name || undefined } : null;
  }
  return value.includes('@') ? { email: value } : null;
}

export function RecipientChips({ label, value, onChange, placeholder }: {
  label: string;
  value: RecipientChip[];
  onChange: (next: RecipientChip[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<RecipientChip[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced AJAX search — contacts + workspace staff, merged, deduped
  useEffect(() => {
    const q = draft.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const t = setTimeout(() => {
      Promise.all([
        apiFetch(`/v1/contacts?q=${encodeURIComponent(q)}&status=ACTIVE`, { signal: controller.signal }).catch(() => []),
        apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`, { signal: controller.signal }).catch(() => []),
      ]).then(([contacts, staff]: [any[], any[]]) => {
        if (controller.signal.aborted) return;
        const added = new Set(value.map(c => c.email.toLowerCase()));
        const merged: RecipientChip[] = [];

        for (const c of (contacts ?? [])) {
          const email = c.email || (c.emails?.[0]?.email ?? '');
          if (!email || added.has(email.toLowerCase())) continue;
          added.add(email.toLowerCase());
          merged.push({ email, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || undefined });
        }
        for (const s of (staff ?? [])) {
          if (!s.email || added.has(s.email.toLowerCase())) continue;
          added.add(s.email.toLowerCase());
          merged.push({ email: s.email, name: s.name || undefined });
        }

        setSuggestions(merged.slice(0, 8));
        if (merged.length > 0 && wrapRef.current) {
          const rect = wrapRef.current.getBoundingClientRect();
          setDropdownStyle({
            position: 'fixed',
            top: rect.bottom + 2,
            left: rect.left,
            width: rect.width,
            zIndex: 2000,
          });
          setSuggestionsOpen(true);
        } else {
          setSuggestionsOpen(false);
        }
        setHighlightIdx(-1);
      }).catch(() => {});
    }, 200);

    return () => { clearTimeout(t); controller.abort(); };
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitDraft() {
    const parsed = draft.split(',').map(parseAddress).filter((c): c is RecipientChip => !!c);
    if (parsed.length === 0) { setDraft(''); return; }
    const existing = new Set(value.map(c => c.email.toLowerCase()));
    onChange([...value, ...parsed.filter(c => !existing.has(c.email.toLowerCase()))]);
    setDraft('');
    setSuggestionsOpen(false);
  }

  function selectSuggestion(chip: RecipientChip) {
    const existing = new Set(value.map(c => c.email.toLowerCase()));
    if (!existing.has(chip.email.toLowerCase())) onChange([...value, chip]);
    setDraft('');
    setSuggestions([]);
    setSuggestionsOpen(false);
    setHighlightIdx(-1);
  }

  function removeChip(email: string) {
    onChange(value.filter(c => c.email !== email));
  }

  return (
    <div className="rcp-wrap" ref={wrapRef}>
      <div className="rcp-row">
        <span className="rcp-label">{label}</span>
        <div className="rcp-field">
          {value.map(c => (
            <span key={c.email} className="rcp-chip">
              <PersonAvatar name={c.name || c.email} size={18} hideStatus />
              <span className="rcp-chip-text">{c.name || c.email}</span>
              <button type="button" className="rcp-chip-remove" onClick={() => removeChip(c.email)} aria-label={`Remove ${c.name || c.email}`}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
          <input
            className="rcp-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (suggestionsOpen && suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightIdx(i => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Enter' && highlightIdx >= 0) {
                  e.preventDefault();
                  selectSuggestion(suggestions[highlightIdx]);
                  return;
                }
                if (e.key === 'Escape') {
                  setSuggestionsOpen(false);
                  return;
                }
              }
              if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                if (draft.trim()) { e.preventDefault(); commitDraft(); }
              } else if (e.key === 'Backspace' && !draft && value.length > 0) {
                removeChip(value[value.length - 1].email);
              }
            }}
            onBlur={() => {
              // Delay to let mousedown on a suggestion fire first
              setTimeout(() => {
                setSuggestionsOpen(false);
                if (draft.trim()) commitDraft();
              }, 150);
            }}
            onFocus={() => { if (suggestions.length > 0) setSuggestionsOpen(true); }}
            onPaste={e => {
              const text = e.clipboardData.getData('text');
              if (text.includes(',')) {
                e.preventDefault();
                const parsed = text.split(',').map(parseAddress).filter((c): c is RecipientChip => !!c);
                if (parsed.length) {
                  const existing = new Set(value.map(c => c.email.toLowerCase()));
                  onChange([...value, ...parsed.filter(c => !existing.has(c.email.toLowerCase()))]);
                }
              }
            }}
            placeholder={value.length === 0 ? placeholder : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {suggestionsOpen && suggestions.length > 0 && (
        <div className="rcp-dropdown" role="listbox" style={dropdownStyle}>
          {suggestions.map((s, idx) => (
            <div
              key={s.email}
              className={`rcp-suggestion${idx === highlightIdx ? ' rcp-suggestion--highlight' : ''}`}
              role="option"
              aria-selected={idx === highlightIdx}
              // mousedown fires before blur so the click registers before the input closes
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >
              <PersonAvatar name={s.name || s.email} size={28} hideStatus />
              <div className="rcp-suggestion-info">
                {s.name && <span className="rcp-suggestion-name">{s.name}</span>}
                <span className="rcp-suggestion-email">{s.email}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
