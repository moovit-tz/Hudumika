import React from 'react';
import { Input } from './ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import type { FormField } from '../lib/supportNetwork.js';

export type FormValues = Record<string, string | number | boolean | null | undefined>;

/**
 * The ticket form a product line defines (Bliss → Network → Products):
 * one input per field, in order. Used when raising a ticket and in the
 * ticket's details panel. `onCommit` fires when a field is finished (blur or
 * pick), for callers that save each answer as it is given.
 */
export function ProductFormFields({ fields, values, onChange, onCommit, disabled, compact }: {
  fields: FormField[];
  values: FormValues;
  onChange: (key: string, value: string) => void;
  onCommit?: (key: string, value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  if (!fields.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
      {fields.map(f => {
        const v = values[f.key];
        const str = v === undefined || v === null ? '' : String(v);
        const label = `${f.label}${f.required ? ' *' : ''}`;
        return (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, gridColumn: f.type === 'textarea' && !compact ? '1 / -1' : undefined }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
            {f.type === 'select' ? (
              <Select value={str || '__none__'} disabled={disabled}
                onValueChange={x => { const val = x === '__none__' ? '' : x; onChange(f.key, val); onCommit?.(f.key, val); }}>
                <SelectTrigger aria-label={f.label}><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {!f.required && <SelectItem value="__none__">—</SelectItem>}
                  {(f.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : f.type === 'textarea' ? (
              <textarea data-ui-field="textarea" rows={3} disabled={disabled} value={str} required={f.required && !onCommit}
                onChange={e => onChange(f.key, e.target.value)} onBlur={e => onCommit?.(f.key, e.target.value)}
                style={{ width: '100%', resize: 'vertical' }} />
            ) : (
              <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} disabled={disabled} value={str}
                required={f.required && !onCommit} aria-label={f.label}
                onChange={e => onChange(f.key, e.target.value)} onBlur={e => onCommit?.(f.key, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}
