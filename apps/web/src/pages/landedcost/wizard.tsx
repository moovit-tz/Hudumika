import React from 'react';
import { Icon } from '../../components/Icon.js';
import type { MultiItemResult } from './shared.js';
export type WizardStep = 1 | 2 | 3 | 4;

export const STEP_ITEMS = [
  { step: 1, label: 'Your Details', shortLabel: 'Details', desc: 'Customer, contact & destination', icon: 'user' },
  { step: 2, label: 'Shipment Mode', shortLabel: 'Shipment', desc: 'Mode, containers, CBM & weight', icon: 'truck' },
  { step: 3, label: 'Cargo Items', shortLabel: 'Cargo', desc: 'HS codes, quantities & FOB values', icon: 'box' },
  { step: 4, label: 'Review & Results', shortLabel: 'Results', desc: 'Duties, taxes & landed cost', icon: 'calculator' },
];

export function VerticalStepBar({ current, setStep }: { current: number; setStep: (s: WizardStep) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {STEP_ITEMS.map((item, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <div key={i} style={{ display: 'flex', gap: 14, cursor: isDone ? 'pointer' : 'default' }} onClick={() => isDone && setStep((i + 1) as any)}
            role={isDone ? 'button' : undefined} tabIndex={isDone ? 0 : undefined}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && isDone) { e.preventDefault(); setStep((i + 1) as any); } }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                background: isActive ? 'hsl(var(--primary))' : isDone ? 'var(--teal-l)' : 'var(--card-sunken)',
                border: `1.5px solid ${isActive || isDone ? 'hsl(var(--primary))' : 'var(--border)'}`,
                color: isActive ? 'hsl(var(--primary-foreground))' : isDone ? 'var(--teal)' : 'var(--ink3)',
                boxShadow: isActive ? '0 0 14px var(--teal-m)' : 'none',
                transition: 'all 0.2s ease'
              }}>
                {isDone ? <Icon name="check" size={15} color="var(--teal)" strokeWidth={3} /> : i + 1}
              </div>
              {i < STEP_ITEMS.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 28, background: isDone ? 'var(--teal)' : 'var(--border)', margin: '6px 0', borderRadius: 'var(--r-sm)'}} />
              )}
            </div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--ink)' : isDone ? 'var(--teal)' : 'var(--ink3)', transition: 'color 0.2s' }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                {item.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact horizontal progress bar for narrow screens — same step state, laid out for a small viewport. */
export function HorizontalStepBar({ current, setStep }: { current: number; setStep: (s: WizardStep) => void }) {
  return (
    <div className="lcp-card lcp-step-mobile">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {STEP_ITEMS.map((item, i) => {
          const isDone = i < current;
          const isActive = i === current;
          return (
            <React.Fragment key={i}>
              <div
                onClick={() => isDone && setStep((i + 1) as any)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: isDone ? 'pointer' : 'default', flexShrink: 0 }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  background: isActive ? 'var(--teal)' : isDone ? 'var(--teal-l)' : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${isActive || isDone ? 'var(--teal)' : 'var(--border)'}`,
                  color: isActive ? '#fff' : isDone ? 'var(--teal)' : 'var(--ink3)',
                }}>
                  {isDone ? <Icon name="check" size={13} color="var(--teal)" strokeWidth={3} /> : i + 1}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--teal)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {item.shortLabel}
                </div>
              </div>
              {i < STEP_ITEMS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: isDone ? 'var(--teal)' : 'var(--border)', margin: '0 6px 16px', borderRadius: 'var(--r-sm)'}} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** "Step X of 3 — Label" caption shown at the top of every step's card, so the current
 *  position in the flow is always unambiguous regardless of viewport or stepper style. */
/** Labelled form field wrapper — matches the uppercase-label + optional
 *  helper-line convention the rest of this page's inputs already use. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {hint && <div className="lcp-hint" style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      className="input-field"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', boxSizing: 'border-box', height: 44, fontSize: 14 }}
    />
  );
}

/** One Advanced Settings row. Renders amber when filled in, so an overridden
 *  rate is visually distinct from an inherited one at a glance. */
export function OverrideField({ label, suffix, value, onChange, placeholder, hint }: {
  label: string; suffix: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  const active = value.trim() !== '';
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--gold)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 5 }}>
        {label}{active && ' · override'}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="input-field"
          type="number"
          min="0"
          step="any"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box', height: 40, fontSize: 13.5,
            borderColor: active ? 'var(--gold)' : undefined,
          }}
        />
        <span style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{suffix}</span>
        {active && (
          <button type="button" onClick={() => onChange('')} title="Clear override"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, flexShrink: 0 }}>
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function StepCaption({ index }: { index: number }) {
  const item = STEP_ITEMS[index];
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
      Step {index + 1} of {STEP_ITEMS.length} · {item.label}
    </div>
  );
}

// ── Draft persistence ─────────────────────────────────────────────────────────

/**
 * The wizard held everything in component state alone, so a refresh — or a
 * misclick on a browser Back button — threw away a 206-line invoice, its
 * accepted HS codes and the result. Rebuilding that is twenty minutes of work,
 * and nothing warned it was about to happen.
 *
 * The draft is keyed by user id: a shared workstation must not hand the next
 * person the previous one's cargo. It is cleared by New Calculation, and the
 * version suffix retires drafts written by an older shape of this page rather
 * than restoring fields that no longer mean the same thing.
 */
export const DRAFT_VERSION = 'v1';
export function draftKey(): string {
  let uid = 'anon';
  try { uid = JSON.parse(localStorage.getItem('hudumika_user') || '{}')?.id || 'anon'; } catch { /* unparseable = anon */ }
  return `clearos.landedcost.${uid}.${DRAFT_VERSION}`;
}
export function readDraft(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' ? d : null;
  } catch { return null; }
}
export function writeDraft(d: Record<string, any>) {
  try {
    localStorage.setItem(draftKey(), JSON.stringify(d));
  } catch {
    // Quota. A big consignment's stored *result* is far larger than its
    // inputs, and the inputs are the part that cannot be recomputed — so drop
    // the result and keep the work. If even that will not fit, leave whatever
    // was last stored alone rather than clearing it.
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ ...d, result: null, multiResult: null, calcSig: '' }));
    } catch { /* keep the previous draft */ }
  }
}
export function clearDraft() {
  try { localStorage.removeItem(draftKey()); } catch { /* nothing to clear */ }
}
/** The stored value if the draft carries one, otherwise the default. Typed by
 *  the default, so restoring a field cannot quietly widen that state to `any`
 *  and take its compile-time checks with it. */
export function fromDraft<T>(d: Record<string, any> | null, key: string, fallback: T): T {
  const v = d?.[key];
  return v === undefined || v === null ? fallback : (v as T);
}

/** The calculator's own cards, named for a reader. Shared with the ledger
 *  and the variance panel so an estimate and an actual are comparable
 *  without a mapping table. */
export const CHARGE_HEAD_LABEL: Record<string, string> = {
  DUTY_TAXES: 'Duties & taxes (TRA)',
  FREIGHT: 'Freight',
  INSURANCE: 'Insurance',
  TPA: 'Port & handling (TPA)',
  ICD: 'ICD / destination',
  TBS: 'TBS',
  SHIPPING_LINE: 'Shipping line',
  CLEARANCE_AGENCY: 'Clearance & agency',
  TRANSPORT: 'Transport',
  OTHER: 'Other',
};

/** This estimate's figure per charge head, so a learned median can be shown
 *  against the number it is being compared with. Returns an empty map when
 *  there is no result yet — the panel then shows the medians alone rather
 *  than inventing something to compare them to. */
export function ESTIMATE_BY_HEAD(r: MultiItemResult | null): Record<string, number> {
  const t = r?.totals;
  if (!t) return {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const out: Record<string, number> = {
    DUTY_TAXES: n(t.duty) + n(t.excise) + n(t.rdl) + n(t.cpf) + n(t.vat),
    TPA: n(t.wharfage) + n(t.pid) + n(t.green_port_initiative),
    ICD: n(t.destination),
    TBS: n(t.tbs_charge),
    SHIPPING_LINE: n(t.shipping_line_charge),
    FREIGHT: n(t.freight_tzs),
    INSURANCE: n(t.insurance_tzs),
  };
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
// ── Main Component ────────────────────────────────────────────────────────────
