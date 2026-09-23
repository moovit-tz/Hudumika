import React, { useState } from 'react';
import { PersonAvatar } from './PersonAvatar.js';
import { Icon } from './Icon.js';
import './RecipientChips.css';

export interface RecipientChip {
  email: string;
  name?: string;
}

/** Parses a free-typed address into a chip. Accepts "Name <email>" or a bare
 *  email — the same two shapes every other address field in this app (From,
 *  compose's legacy comma-separated inputs) already tolerates. */
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

/** Turns a comma-separated address string (this app's existing wire format
 *  for To/Cc/Bcc — see email.routes.ts's sendSchema) into chips, and back.
 *  Lets RecipientChips drop into Compose's existing string-based state with
 *  no change to how a send request is built. */
export function parseAddressList(value: string): RecipientChip[] {
  return value.split(',').map(parseAddress).filter((c): c is RecipientChip => !!c);
}
export function formatAddressList(chips: RecipientChip[]): string {
  return chips.map(c => (c.name ? `${c.name} <${c.email}>` : c.email)).join(', ');
}

/**
 * A To/Cc/Bcc row of removable, avatar-fronted recipient chips plus a text
 * box to add more — the platform's answer to a plain comma-separated
 * address input. Every recipient here is address-only (no known account
 * lookup), so PersonAvatar's own deterministic-initials fallback is the
 * correct render, exactly per its own contract for "genuinely no account to
 * look up."
 */
export function RecipientChips({ label, value, onChange, placeholder }: {
  label: string;
  value: RecipientChip[];
  onChange: (next: RecipientChip[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function commitDraft() {
    const parsed = draft.split(',').map(parseAddress).filter((c): c is RecipientChip => !!c);
    if (parsed.length === 0) { setDraft(''); return; }
    const existing = new Set(value.map(c => c.email.toLowerCase()));
    const next = [...value, ...parsed.filter(c => !existing.has(c.email.toLowerCase()))];
    onChange(next);
    setDraft('');
  }

  function removeChip(email: string) {
    onChange(value.filter(c => c.email !== email));
  }

  return (
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
            if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              if (draft.trim()) { e.preventDefault(); commitDraft(); }
            } else if (e.key === 'Backspace' && !draft && value.length > 0) {
              removeChip(value[value.length - 1].email);
            }
          }}
          onBlur={() => { if (draft.trim()) commitDraft(); }}
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
        />
      </div>
    </div>
  );
}
