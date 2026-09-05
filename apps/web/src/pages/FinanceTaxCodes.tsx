import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { SectionCard } from '../components/SectionCard.js';
import { FormPage, FormPageActions } from '../components/FormPage.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
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

interface Registration {
  status: {
    state: 'registered' | 'not_registered' | 'pending' | 'deregistered' | 'unknown';
    jurisdiction: string; registrationNumber: string | null; registrationLabel: string | null;
    mayChargeVat: boolean; advisory: string | null; notes: string | null;
  };
  jurisdictions?: { code: string; name: string; currency: string | null; standard_rate: string | null }[];
  reference: {
    name: string; currency: string | null; standard_rate: string | null;
    threshold_amount: string | null; threshold_window_months: number | null;
    registration_label: string | null; fiscalisation: string | null;
    as_of: string; source: string | null;
  } | null;
}

interface Usage {
  invoice_lines: { total: number; unclassified: number };
  products: { total: number; unclassified: number };
  bill_lines: { total: number; unclassified: number };
}

/* ── Form ───────────────────────────────────────────────────────────────────── */
interface Component {
  code: string; name: string; rate: number;
  basis: 'NET' | 'NET_PLUS_PRIOR'; recoverable: boolean;
}

/**
 * Tax codes that are really several taxes.
 *
 * Most jurisdictions need none of this — a code with no components is a single
 * tax at its own rate, which is every code in Tanzania. Ghana is the case that
 * needs it, and it is why the rate has to be *derived*: 6% of levies on net,
 * then 15% VAT on net-plus-levies, is 21.9%. Nobody should be typing 21.9,
 * because a typed rate is one that can stop agreeing with the breakdown meant
 * to explain it.
 */
function ComponentEditor({ taxCodeId, jurisdiction, zeroKind }: {
  taxCodeId: string; jurisdiction: string; zeroKind: boolean;
}) {
  const [rows, setRows] = useState<Component[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [got, tpl] = await Promise.all([
          apiFetch(`/v1/tax-codes/${taxCodeId}/components`),
          apiFetch(`/v1/tax-codes/component-templates?jurisdiction=${encodeURIComponent(jurisdiction || '')}`),
        ]);
        if (!alive) return;
        setRows(got?.components ?? []);
        setTemplates(tpl ?? []);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Could not load components.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [taxCodeId, jurisdiction]);

  /**
   * A preview, computed the same way the server does. The server stays
   * authoritative — this exists so the effective rate moves while you type
   * rather than only after saving, which is the whole reason the rate is
   * derived instead of typed.
   */
  const preview = useMemo(() => {
    let running = 0;
    const lines = rows.map(r => {
      const base = r.basis === 'NET_PLUS_PRIOR' ? 100 + running : 100;
      const amount = base * (Number(r.rate) || 0) / 100;
      running += amount;
      return { ...r, base, amount };
    });
    return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
  }, [rows]);

  const update = (i: number, patch: Partial<Component>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function persist() {
    setSaving(true); setErr(''); setSaved('');
    try {
      const res = await apiFetch(`/v1/tax-codes/${taxCodeId}/components`, {
        method: 'PUT', body: JSON.stringify({ components: rows }),
      });
      setRows(res?.components ?? []);
      setSaved(res?.derived
        ? `Saved. This code now charges ${Number(res.effective_rate).toFixed(2)}%.`
        : 'Saved. This code has no breakdown, so it charges its own rate.');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save the components.');
    } finally {
      setSaving(false);
    }
  }

  const cell: React.CSSProperties = {
    padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)',
    outline: 'none', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box',
  };

  if (zeroKind) {
    return (
      <div className="card" style={{ maxWidth: 780, marginTop: 16, fontSize: 12.5, color: 'var(--ink3)' }}>
        A zero-rated, exempt or out-of-scope treatment is 0% by definition, so it has no
        breakdown to build.
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 780, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Rate breakdown</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
          {rows.length === 0 ? 'Single tax at its own rate' : `Works out to ${preview.total.toFixed(2)}%`}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12, lineHeight: 1.5 }}>
        Only for a rate that is several taxes at once. Leave empty and this code charges the
        rate above. The order matters: “on net plus prior” charges on the line value plus
        everything already added.
      </div>

      {err && (
        <div style={{ marginBottom: 12 }}><Banner variant="error">{err}</Banner></div>
      )}
      {saved && !err && (
        <div style={{ marginBottom: 12 }}><Banner variant="success">{saved}</Banner></div>
      )}

      {loading ? (
        <SectionLoading />
      ) : (
        <>
          {rows.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Code', 'Name', 'Rate %', 'Charged on', 'Recoverable', 'On', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
                                           textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px 4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ width: 110 }}><input style={cell} value={r.code}
                        onChange={e => update(i, { code: e.target.value.toUpperCase() })} /></td>
                      <td><input style={cell} value={r.name} onChange={e => update(i, { name: e.target.value })} /></td>
                      <td style={{ width: 90 }}><input style={cell} type="number" step="0.01" min="0" max="100"
                        value={r.rate} onChange={e => update(i, { rate: Number(e.target.value) })} /></td>
                      <td style={{ width: 170 }}>
                        {/* The first component has nothing before it, so the
                            compounding option is not offered there at all. */}
                        <Select value={r.basis} onValueChange={v => update(i, { basis: v as Component['basis'] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NET">Net value</SelectItem>
                            {i > 0 && <SelectItem value="NET_PLUS_PRIOR">Net plus prior</SelectItem>}
                          </SelectContent>
                        </Select>
                      </td>
                      <td style={{ width: 90, textAlign: 'center' }}>
                        <input type="checkbox" checked={r.recoverable}
                          onChange={e => update(i, { recoverable: e.target.checked })} />
                      </td>
                      <td style={{ width: 90, fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                        {preview.lines[i]?.base.toFixed(2)}
                      </td>
                      <td style={{ width: 32 }}>
                        <button type="button" title="Remove" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                          <Icon name="x" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => setRows(rs => [...rs, { code: '', name: '', rate: 0, basis: 'NET', recoverable: true }])}>
              Add a component
            </button>
            {templates.map(t => (
              <button key={t.label} type="button" className="btn btn-secondary btn-sm"
                title={t.note}
                onClick={() => setRows(t.components.map((c: any) => ({ ...c })))}>
                Use {t.label}
              </button>
            ))}
            <button type="button" className="btn btn-primary btn-sm" disabled={saving}
              style={{ marginLeft: 'auto' }}
              onClick={persist}>
              {saving ? 'Saving…' : 'Save breakdown'}
            </button>
          </div>

          {rows.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>
              {preview.lines.map((l, i) => (
                <div key={i}>
                  {l.code || '—'} {Number(l.rate) || 0}% on {l.base.toFixed(2)} = {l.amount.toFixed(3)}
                </div>
              ))}
              <div style={{ marginTop: 4, color: 'var(--ink2)', fontWeight: 600 }}>
                Effective rate {preview.total.toFixed(2)}% — saved onto the code, not typed.
              </div>
              {/* Says it plainly, because the alternative assumption is costly. */}
              <div style={{ marginTop: 4 }}>Documents already issued keep the rate they were written with.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {err && (
          <div style={{ gridColumn: '1 / -1' }}><Banner variant="error">{err}</Banner></div>
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
          <DatePicker date={parseDateOnly(form.effectiveFrom)}
            onChange={d => set('effectiveFrom', toDateOnlyString(d) || null)} />
        </F>
        <F label="Effective to">
          <DatePicker date={parseDateOnly(form.effectiveTo)}
            onChange={d => set('effectiveTo', toDateOnlyString(d) || null)} />
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

      {/* Components hang off a saved code, so the breakdown appears once there
          is something to hang them on rather than as a disabled panel on a new
          code that has no id yet. */}
      {code?.id && (
        <ComponentEditor taxCodeId={code.id} jurisdiction={form.jurisdiction} zeroKind={zeroKind} />
      )}
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
  const [reg, setReg] = useState<Registration | null>(null);
  const [regNum, setRegNum] = useState('');
  const [regState, setRegState] = useState<string>('unknown');
  const [regBusy, setRegBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  /** Move the workspace to another country. Adds that country's codes; never
   *  re-rates or removes what is already there. */
  async function switchCountry(code: string) {
    if (!reg || code === reg.status.jurisdiction) return;
    setSwitching(true); setNotice(null);
    try {
      const r: any = await apiFetch('/v1/tax-codes/jurisdiction', {
        method: 'PUT', body: JSON.stringify({ jurisdiction: code }),
      });
      setNotice({ kind: 'ok', text: r.note });
      await refreshTaxCodes(true);
      const fresh: Registration = await apiFetch('/v1/tax-codes/registration');
      setReg(fresh);
      setRegNum(fresh.status.registrationNumber ?? '');
      setRegState(fresh.status.state === 'unknown' ? 'unknown' : fresh.status.state);
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not switch country' });
    } finally { setSwitching(false); }
  }

  useEffect(() => { refreshTaxCodes(true); }, []);
  useEffect(() => {
    apiFetch('/v1/tax-codes/usage').then(setUsage).catch(() => setUsage(null));
    apiFetch('/v1/tax-codes/registration')
      .then((r: Registration) => {
        setReg(r);
        setRegNum(r.status.registrationNumber ?? '');
        setRegState(r.status.state === 'unknown' ? 'unknown' : r.status.state);
      })
      .catch(() => setReg(null));
  }, [showForm]);

  async function saveRegistration() {
    if (!reg) return;
    setRegBusy(true); setNotice(null);
    try {
      const r = await apiFetch('/v1/tax-codes/registration', {
        method: 'PUT',
        body: JSON.stringify({
          jurisdiction: reg.status.jurisdiction,
          status: regState,
          registration_number: regNum.trim() || null,
        }),
      });
      setReg({ ...reg, status: r });
      setNotice({ kind: 'ok', text: 'VAT registration recorded.' });
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not save that' });
    } finally { setRegBusy(false); }
  }

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
        crumbs={['FINANCE', 'TAX CODES']}
        titlePlain="Tax "
        titleEm="rates"
        subtitle="How each supply is treated for tax — not just the rate it is charged at."
      />

      <MetricsRow cards={[
        {
          title: 'TOTAL TAX CODES', value: String(codes.length),
          sub1Label: 'ACTIVE', sub1Value: String(codes.filter(c => c.status === 'active').length),
          sub2Label: 'DEFAULT', sub2Value: String(codes.filter(c => c.isDefault).length), barHighlight: 'var(--teal)',
        },
        {
          title: 'STANDARD RATE', value: `${codes.find(c => c.kind === 'STANDARD')?.rate ?? 18}%`,
          sub1Label: 'JURISDICTION', sub1Value: reg?.status?.jurisdiction ?? 'TZ',
          sub2Label: 'VAT REG', sub2Value: reg?.status?.state === 'registered' ? 'YES' : 'NO', barHighlight: 'var(--blue)',
        },
        {
          title: 'ZERO / EXEMPT', value: String(codes.filter(c => ZERO_RATE_KINDS.includes(c.kind)).length),
          sub1Label: 'EXEMPT', sub1Value: String(codes.filter(c => c.kind === 'EXEMPT').length),
          sub2Label: 'ZERO-RATED', sub2Value: String(codes.filter(c => c.kind === 'ZERO_RATED').length), barHighlight: 'var(--gold)',
        },
        {
          title: 'UNCLASSIFIED LINES', value: String(unclassified ?? 0),
          sub1Label: 'INVOICES', sub1Value: String(usage?.invoice_lines?.unclassified ?? 0),
          sub2Label: 'PRODUCTS', sub2Value: String(usage?.products?.unclassified ?? 0), barHighlight: 'var(--red)',
        },
      ]} />

      <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => { setEditing(null); setShowForm(true); }}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Tax Code
        </button>
      </div>

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px',
          background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600,
          color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{notice.text}</div>
      )}

      {/* The prior question to every tax code below it. */}
      {reg && (
        <div style={{
          background: 'var(--white)', border: `1px solid ${reg.status.state === 'registered' ? 'var(--border)' : 'var(--gold)'}`,
          borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Country first — it decides the rate, the currency, the vocabulary
                and which fiscalisation applies. */}
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Country
              </label>
              <Select value={reg.status.jurisdiction} onValueChange={switchCountry} disabled={switching}>
                <SelectTrigger style={{ minWidth: 210 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(reg.jurisdictions ?? []).map(j => (
                    <SelectItem key={j.code} value={j.code}>
                      {j.name}{j.standard_rate ? ` — ${Number(j.standard_rate)}%` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {reg.status.jurisdiction} VAT status
              </label>
              <Select value={regState} onValueChange={setRegState}>
                <SelectTrigger style={{ minWidth: 200 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Not recorded</SelectItem>
                  <SelectItem value="registered">Registered</SelectItem>
                  <SelectItem value="not_registered">Not registered</SelectItem>
                  <SelectItem value="pending">Registration pending</SelectItem>
                  <SelectItem value="deregistered">Deregistered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {reg.status.registrationLabel ?? 'Registration number'}
              </label>
              <input value={regNum} onChange={e => setRegNum(e.target.value)}
                placeholder={reg.status.registrationLabel ?? 'Number'}
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                         minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
                         fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', minWidth: 200 }} />
            </div>
            <button type="button" className="btn btn-secondary btn-sm"
              disabled={regBusy || regState === 'unknown'} onClick={saveRegistration}>
              {regBusy ? 'Saving…' : 'Save'}
            </button>
          </div>

          {reg.status.advisory && (
            <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 10 }}>
              {reg.status.advisory}
            </div>
          )}

          {/* A seeded test registration says so here rather than passing as real. */}
          {reg.status.notes && (
            <Banner variant="warning" style={{ marginTop: 10 }}>
              {reg.status.notes}
            </Banner>
          )}

          {/* Local reference figures, clearly dated — these change every budget,
              so they prefill and sanity-check rather than decide anything. */}
          {reg.reference && (
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--ink2)' }}>{reg.reference.name}</strong> — standard rate{' '}
              {reg.reference.standard_rate ? `${Number(reg.reference.standard_rate)}%` : '—'}
              {reg.reference.threshold_amount && <>, registration required above{' '}
                {reg.reference.currency} {Number(reg.reference.threshold_amount).toLocaleString()} over{' '}
                {reg.reference.threshold_window_months} months</>}
              {reg.reference.fiscalisation && <>, fiscalised through {reg.reference.fiscalisation}</>}.
              {' '}<span style={{ opacity: 0.85 }}>Reference only, checked {String(reg.reference.as_of).slice(0, 10)} — thresholds move each budget, so confirm before relying on it.</span>
            </div>
          )}
        </div>
      )}

      {/* The honest gap, stated rather than papered over. Everything at 0%
          predating tax codes could not be backfilled: the four 0% treatments
          are indistinguishable in the old data, and guessing one would be
          worse than showing the gap. */}
      {unclassified !== null && unclassified > 0 && (
        <div style={{ margin: '0 0 16px' }}>
          <Banner variant="warning" title={`${unclassified} rows have no recorded treatment.`}>
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
          </Banner>
        </div>
      )}

      <SectionCard padded={false}>
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
      </SectionCard>
    </div>
  );
}
