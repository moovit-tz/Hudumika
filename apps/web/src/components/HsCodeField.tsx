import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';

interface HsSearchResult {
  code: string;
  description: string;
  import_duty_rate: number;
}

/** Search-as-you-type HS code field, backed by the real tariff database
 *  (GET /v1/customs/hs-search) — same lookup DutyCheckPage.tsx already uses.
 *  A plain text box gives no feedback about whether a typed code is real;
 *  this is what "the HS code field" means everywhere else in this app. */
export function HsCodeField({ value, onChange, onPick, placeholder, required }: {
  value: string;
  onChange: (code: string) => void;
  /** Fired when the user picks a real suggestion — lets the caller also
   *  auto-fill its own description field, if it has one. */
  onPick?: (result: HsSearchResult) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [results, setResults] = useState<HsSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<HsSearchResult | null>(null);
  const [focused, setFocused] = useState(false);
  const debounce = useRef<any>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    // A previously-picked code shouldn't immediately re-open the dropdown —
    // only actual further typing (which clears `selected` in onChangeText) does.
    if (!value || value.length < 2 || (selected && selected.code === value)) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await apiFetch(`/v1/customs/hs-search?q=${encodeURIComponent(value)}&limit=8`);
        setResults(Array.isArray(r) ? r : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function onChangeText(v: string) {
    onChange(v);
    if (selected && v !== selected.code) setSelected(null);
  }

  function pick(r: HsSearchResult) {
    setSelected(r);
    setResults([]);
    onChange(r.code);
    onPick?.(r);
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          className="input-field"
          value={value}
          onChange={e => onChangeText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)} // lets a click on a result register first
          placeholder={placeholder ?? 'e.g. 8471.30 or laptop'}
          required={required}
          style={{ width: '100%', boxSizing: 'border-box', height: 38, fontSize: 13, paddingLeft: 32 }}
        />
        <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
      </div>

      {loading && (
        <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, marginTop: 4 }}>Searching…</div>
      )}

      {focused && results.length > 0 && !(selected && selected.code === value) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 50, boxShadow: 'var(--elev-lg)', overflow: 'hidden', marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
          {results.map(r => (
            <div key={r.code} onMouseDown={() => pick(r)}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 12.5, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{r.code}</span>
              <span style={{ color: 'var(--ink2)' }}> — {r.description}</span>
              {r.import_duty_rate != null && <span style={{ color: 'var(--ink3)', float: 'right' }}>{r.import_duty_rate}%</span>}
            </div>
          ))}
        </div>
      )}

      {selected && selected.code === value && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="checkCircle" size={12} color="var(--teal)" /> {selected.description}
        </div>
      )}
    </div>
  );
}
