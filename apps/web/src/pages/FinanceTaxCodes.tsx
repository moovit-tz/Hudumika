import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { FormPage, FormPageActions } from '../components/FormPage.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';
import { apiFetch } from '../lib/api.js';
import {
  useTaxCodes, refreshTaxCodes, toApiPayload,
  TaxCode, TaxCodeKind, TaxCodeScope, TAX_CODE_KINDS, ZERO_RATE_KINDS,
  TAX_CODE_KIND_LABEL, TAX_CODE_KIND_HINT, TAX_CODE_KIND_VARIANT,
} from '../data/taxCodeData.js';

/**
 * Tax treatments for the workspace.
 *
 * The platform used to carry tax as a bare percentage in three places, each
 * with its own hardcoded list of allowed rates. A percentage cannot say whether
 * a 0% line is zero-rated, exempt, reverse-charge or out of scope — and those
 * four are not interchangeable on a return. This page is where the distinction
 * is set, and where the gap in the historical data stays visible.
 */

const EMPTY: TaxCode = {
  id: '', code: '', name: '', kind: 'STANDARD', rate: 18, jurisdiction: 'TZ',
  inputTaxRecoverable: true, appliesTo: 'BOTH', traTaxCode: null, traVatRate: null, guidance: null,
  isDefault: false, status: 'active',
  effectiveFrom: null, effectiveTo: null,
};

interface Usage {
  invoice_lines: { total: number; unclassified: number };
  products: { total: number; unclassified: number };
  bill_lines: { total: number; unclassified: number };
}

/* ── Form ───────────────────────────────────────────────────────────────────── */
function TaxCodeForm({ code, onClose, onSaved }: {
  code: TaxCode | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<TaxCode>(code ?? { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set<K extends keyof TaxCode>(k: K, v: TaxCode[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  /** Changing the treatment can invalidate the rate beside it, so they move
   *  together. The API and the DB both reject the contradiction anyway; doing
   *  it here means the user never has to be told. */
  function setKind(kind: TaxCodeKind) {
    setForm(f => ({
      ...f,
      kind,
      rate: ZERO_RATE_KINDS.includes(kind) ? 0 : (f.rate > 0 ? f.rate : 18),
      inputTaxRecoverable: kind === 'EXEMPT' || kind === 'OUT_OF_SCOPE' ? false : f.inputTaxRecoverable,
    }));
  }

  async function save() {
    if (!form.code.trim()) { setErr('Code is required'); return; }
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true); setErr('');
    try {
      if (code?.id) {
        await apiFetch(`/v1/tax-codes/${code.id}`, {
          method: 'PATCH', body: JSON.stringify(toApiPayload(form)),
        });
      } else {
        await apiFetch('/v1/tax-codes', {
          method: 'POST', body: JSON.stringify(toApiPayload(form)),
        });
      }
      await refreshTaxCodes(true);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const F = ({ label, children, hint, col2 }: {
    label: string; children: React.ReactNode; hint?: string; col2?: boolean;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: col2 ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
  const inp: React.CSSProperties = {
    padding: 'var(--ds-input-py, 8px) 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box',
    fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)',
    background: 'var(--white)', outline: 'none', width: '100%',
  };

  const zeroKind = ZERO_RATE_KINDS.includes(form.kind);

  return (
    <FormPage
      title={code?.id ? `Edit ${code.code}` : 'New tax code'}
      subtitle="A treatment, and the rate it implies — not a rate on its own."
      onCancel={onClose}
      actions={<FormPageActions onCancel={onClose} onSave={save} saving={saving}
        saveLabel={code?.id ? 'Save changes' : 'Add tax code'} />}
    >
      <div className="card" style={{ maxWidth: 780, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {err && (
          <div style={{ gridColumn: '1 / -1', padding: '9px 12px', background: 'var(--red-l)',
                        border: '1px solid var(--red)', borderRadius: 'var(--r-sm)',
                        color: 'var(--red)', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
        )}

        <F label="Treatment *" col2 hint={TAX_CODE_KIND_HINT[form.kind]}>
          <Select value={form.kind} onValueChange={v => setKind(v as TaxCodeKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TAX_CODE_KINDS.map(k => (
                <SelectItem key={k} value={k}>{TAX_CODE_KIND_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>

        <F label="Code *" hint="Short handle shown on documents, e.g. STD.">
          <input style={inp} value={form.code}
            onChange={e => set('code', e.target.value.toUpperCase())} placeholder="STD" />
        </F>
        <F label="Name *">
          <input style={inp} value={form.name}
            onChange={e => set('name', e.target.value)} placeholder="Standard rate (18%)" />
        </F>

        <F label="Rate (%)"
           hint={zeroKind ? `${TAX_CODE_KIND_LABEL[form.kind]} always charges 0%.` : undefined}>
          <input style={{ ...inp, opacity: zeroKind ? 0.55 : 1 }} type="number" min={0} max={99} step="0.001"
            disabled={zeroKind} value={form.rate}
            onChange={e => set('rate', Number(e.target.value))} />
        </F>
        <F label="Jurisdiction" hint="ISO 3166-1 alpha-2, e.g. TZ, KE, GB.">
          <input style={inp} maxLength={2} value={form.jurisdiction}
            onChange={e => set('jurisdiction', e.target.value.toUpperCase())} placeholder="TZ" />
        </F>

        <F label="Used on"
           hint="A blocked-input-tax code is a purchase treatment and nonsense on a sale — the API refuses to attach one to an invoice.">
          <Select value={form.appliesTo} onValueChange={v => set('appliesTo', v as TaxCodeScope)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BOTH">Sales and purchases</SelectItem>
              <SelectItem value="SALES">Sales only</SelectItem>
              <SelectItem value="PURCHASE">Purchases only</SelectItem>
            </SelectContent>
          </Select>
        </F>

        <F label={form.appliesTo === 'PURCHASE' ? 'Input tax deductible' : 'Input tax recoverable'}
           hint={form.appliesTo === 'PURCHASE'
             ? 'Whether the tax charged on this purchase can be reclaimed. Blocked items cannot.'
             : 'Whether making this supply lets you recover tax on related purchases. This is the difference between zero-rated and exempt.'}>
          <Select value={form.inputTaxRecoverable ? 'yes' : 'no'}
                  onValueChange={v => set('inputTaxRecoverable', v === 'yes')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes — recoverable</SelectItem>
              <SelectItem value="no">No — not recoverable</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="TRA tax code"
           hint="EFDMS TAXCODE. Leave unset if TRA has no equivalent — an invoice using it then refuses to fiscalise rather than filing under the wrong one.">
          <Select value={form.traTaxCode === null ? '__none__' : String(form.traTaxCode)}
                  onValueChange={v => set('traTaxCode', v === '__none__' ? null : Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No TRA equivalent</SelectItem>
              {/* TRA's own wording, including the rate, so a 0%-only code is
                  never mistaken for a reduced rate. */}
              <SelectItem value="1">1 — Standard Rate (18%)</SelectItem>
              <SelectItem value="2">2 — Special Rate (0%)</SelectItem>
              <SelectItem value="3">3 — Zero rated (0%)</SelectItem>
              <SelectItem value="4">4 — Special Relief (0%)</SelectItem>
              <SelectItem value="5">5 — Exempt (0%)</SelectItem>
            </SelectContent>
          </Select>
        </F>

        <F label="TRA VATRATE letter"
           hint="The <VATTOTALS> grouping letter. It tracks the TRA tax code one for one — A standard 18%, B special 0%, C zero-rated 0%, D special relief 0%, E exempt 0% — and Automatic does exactly that. Only override it if TRA tells you otherwise.">
          <Select value={form.traVatRate ?? '__auto__'}
                  onValueChange={v => set('traVatRate', v === '__auto__' ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Automatic (matches the TRA tax code)</SelectItem>
              {['A', 'B', 'C', 'D', 'E'].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>

        <F label="Effective from" hint="Optional. Governs which codes are offered when drafting.">
          <input style={inp} type="date" value={form.effectiveFrom ?? ''}
            onChange={e => set('effectiveFrom', e.target.value || null)} />
        </F>
        <F label="Effective to">
          <input style={inp} type="date" value={form.effectiveTo ?? ''}
            onChange={e => set('effectiveTo', e.target.value || null)} />
        </F>

        {/* The reasoning, recorded once. Deciding a treatment means someone
            went and checked; without somewhere to write down what they found,
            the next person re-derives it or copies the neighbouring line. */}
        <F label="When to use this" col2
           hint="Which of your supplies belong here, and why. Shown to anyone choosing this treatment later.">
          <textarea
            value={form.guidance ?? ''}
            onChange={e => set('guidance', e.target.value || null)}
            placeholder="e.g. International freight where we hold the export documentation. Confirmed with our accountant, March 2026."
            style={{ ...inp, minHeight: 68, resize: 'vertical' } as React.CSSProperties} />
        </F>

        <F label="Default for new lines" col2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)' }}>
            <input type="checkbox" checked={form.isDefault}
              onChange={e => set('isDefault', e.target.checked)} />
            Pre-select this treatment on new products and invoice lines
          </label>
        </F>
      </div>
    </FormPage>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
export function FinanceTaxCodes() {
  const codes = useTaxCodes();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  // The app has no mounted toast system, so results are stated inline rather
  // than fired at one that would silently swallow them.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { refreshTaxCodes(true); }, []);
  useEffect(() => {
    apiFetch('/v1/tax-codes/usage').then(setUsage).catch(() => setUsage(null));
  }, [showForm]);

  const unclassified = useMemo(() => {
    if (!usage) return null;
    return usage.invoice_lines.unclassified + usage.products.unclassified + usage.bill_lines.unclassified;
  }, [usage]);

  async function remove(c: TaxCode) {
    const ok = await showConfirm(
      'If it is already used on a document it will be archived instead — removing it ' +
      'would blank the treatment on something already filed.',
      { title: `Delete ${c.code}?`, confirmLabel: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    try {
      const res: any = await apiFetch(`/v1/tax-codes/${c.id}`, { method: 'DELETE' });
      await refreshTaxCodes(true);
      setNotice({ kind: 'ok', text: res?.archived
        ? `${c.code} is in use on existing documents, so it was archived rather than deleted.`
        : `${c.code} deleted.` });
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Failed to delete' });
    }
  }

  if (showForm) {
    return <TaxCodeForm code={editing} onClose={() => setShowForm(false)}
      onSaved={() => { setShowForm(false); setNotice({ kind: 'ok', text: 'Tax code saved.' }); }} />;
  }

  const th: React.CSSProperties = {
    padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: '11px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' };

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['FinOps', 'Settings']}
        titlePlain="Tax"
        titleEm="codes"
        subtitle="How each supply is treated for tax — not just the rate it is charged at."
        actions={
          <button type="button" className="btn btn-primary"
            onClick={() => { setEditing(null); setShowForm(true); }}>
            <Icon name="plus" size={14} color="#fff" /> New tax code
          </button>
        }
      />

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px',
          background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600,
          color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{notice.text}</div>
      )}

      <MetricsRow cards={[
        { title: 'Tax codes', value: String(codes.length),
          sub1Label: 'Active', sub1Value: String(codes.filter(c => c.status === 'active').length) },
        { title: 'Zero-rate treatments', value: String(codes.filter(c => ZERO_RATE_KINDS.includes(c.kind)).length),
          sub1Label: 'All charge', sub1Value: '0%' },
        { title: 'Unclassified rows', value: unclassified === null ? '—' : String(unclassified),
          sub1Label: 'Invoice lines', sub1Value: usage ? String(usage.invoice_lines.unclassified) : '—',
          sub2Label: 'Bill lines', sub2Value: usage ? String(usage.bill_lines.unclassified) : '—' },
      ]} />

      {/* The honest gap, stated rather than papered over. Everything at 0%
          predating tax codes could not be backfilled: the four 0% treatments
          are indistinguishable in the old data, and guessing one would be
          worse than showing the gap. */}
      {unclassified !== null && unclassified > 0 && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '12px 14px', margin: '0 0 16px',
          background: 'var(--gold-l)', border: '1px solid var(--gold)',
          borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5,
        }}>
          <Icon name="alertTriangle" size={16} color="var(--gold)" />
          <div>
            <strong style={{ color: 'var(--ink)' }}>{unclassified} rows have no recorded treatment.</strong>{' '}
            They were written before tax codes existed, when tax was only a percentage.
            A 0% row could have been zero-rated, exempt, reverse-charge or out of scope,
            and only one of those lets you recover input tax — so nothing was guessed on
            your behalf. On the purchase side that means the tax is <strong>not</strong> being
            claimed: an unrecorded treatment is not a claim.
            <div style={{ marginTop: 10 }}>
              <a href="/finance/tax-codes/classify" className="btn btn-primary btn-sm">
                Work through them
              </a>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
              {['Code', 'Name', 'Treatment', 'Rate', 'Used on', 'Input tax', 'TRA', 'Jurisdiction', 'Status', ''].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
                No tax codes yet
              </td></tr>
            )}
            {codes.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  {c.code}
                  {c.isDefault && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--teal)' }}>DEFAULT</span>}
                </td>
                <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>{c.name}</td>
                <td style={td}>
                  <Badge variant={TAX_CODE_KIND_VARIANT[c.kind]}>{TAX_CODE_KIND_LABEL[c.kind]}</Badge>
                </td>
                <td style={{ ...td, fontFamily: 'var(--mono)' }}>{c.rate}%</td>
                <td style={td}>{c.appliesTo === 'BOTH' ? 'Sales & purchases' : c.appliesTo === 'SALES' ? 'Sales' : 'Purchases'}</td>
                <td style={td}>{c.inputTaxRecoverable ? 'Recoverable' : 'Not recoverable'}</td>
                <td style={td}>
                  {c.traTaxCode === null
                    ? <span style={{ color: 'var(--ink3)' }}>none</span>
                    : c.traTaxCode}
                </td>
                <td style={td}>{c.jurisdiction}</td>
                <td style={td}>
                  <Badge variant={c.status === 'active' ? 'success' : 'gray'}>{c.status}</Badge>
                </td>
                <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                  <button type="button" title="Edit" onClick={() => { setEditing(c); setShowForm(true); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button type="button" title="Delete" onClick={() => remove(c)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
