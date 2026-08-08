import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { TAX_CODE_KIND_VARIANT, TAX_CODE_KIND_LABEL, type TaxCodeKind } from '../data/taxCodeData.js';

/**
 * The VAT return.
 *
 * What this replaces read a single GL account (2200), kept only its credits,
 * and recovered a "taxable base" by dividing the tax by a hardcoded 18% — wrong
 * for any tenant on another rate and meaningless on a mixed-rate invoice. It had
 * no purchase side at all, so it could not state what the return exists to
 * state: what is owed, or owed back.
 *
 * Every figure here comes from the documents, so it has a source. Where a
 * figure cannot be produced honestly — an unclassified line, a bill in a
 * currency with no rate — it is reported as a gap rather than folded into a
 * total.
 */

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year'];

function iso(d: Date) { return d.toISOString().split('T')[0]; }
function periodRange(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  switch (key) {
    case 'Last Month': {
      return { from: iso(new Date(y, now.getMonth() - 1, 1)), to: iso(new Date(y, now.getMonth(), 0)) };
    }
    case 'This Quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { from: iso(new Date(y, q, 1)), to: iso(now) };
    }
    case 'Last Year':
      return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    case 'This Year':
      return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    default:
      return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(now) };
  }
}

interface Bucket { kind: TaxCodeKind | 'UNCLASSIFIED'; code: string | null; name: string; net: number; tax: number; lines: number }
interface VatReturn {
  from: string; to: string; currency: string;
  outputs: Bucket[]; outputTax: number;
  inputs: Bucket[]; inputTax: number; inputTaxClaimable: number; inputTaxBlocked: number;
  taxableSupplies: number; exemptSupplies: number; recoveryRatePct: number;
  inputTaxRecoverable: number; inputTaxRestricted: number;
  netPayable: number;
  unclassified: { salesLines: number; salesNet: number; salesTax: number; purchaseLines: number; purchaseNet: number; purchaseTax: number };
  fxSkipped: { invoices: number; bills: number };
  ledger: { outputTax: number; inputTax: number; netPerLedger: number; difference: number };
  registration: {
    state: 'registered' | 'not_registered' | 'pending' | 'deregistered' | 'unknown';
    jurisdiction: string; registrationNumber: string | null; registrationLabel: string | null;
    mayChargeVat: boolean; advisory: string | null;
  };
}

const card: React.CSSProperties = {
  background: 'var(--white)', borderRadius: 'var(--r)',
  border: '1px solid var(--border)', overflow: 'hidden',
};
const th: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' };
const num: React.CSSProperties = { ...td, fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--ink)' };

export const FinanceTaxReport: React.FC = () => {
  const co = useCompany();
  const [period, setPeriod] = useState('This Year');
  const [data, setData] = useState<VatReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = periodRange(period);
  const cur = data?.currency ?? co.currency ?? 'TZS';
  // `|| 0` normalises negative zero: a subtraction row of nothing rendered as
  // "TZS -0", which reads like a real negative.
  const fmt = (n: number) => `${cur} ${(Math.round(n) || 0).toLocaleString()}`;

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    apiFetch(`/v1/finance/vat-return?from=${range.from}&to=${range.to}`)
      .then((r: VatReturn) => { if (alive) setData(r); })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Failed to load the return'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to]);

  async function downloadSubmission() {
    const res = await fetch(
      `${BASE_URL}/v1/finance/vat-return/export?from=${range.from}&to=${range.to}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('hudumika_token') ?? ''}` } },
    );
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not build the file'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vat-return-${data?.registration.jurisdiction ?? ''}-${range.from}-to-${range.to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      ['Section', 'Treatment', 'Code', 'Net', 'Tax', 'Lines'],
      ...data.outputs.map(b => ['Sales', b.name, b.code ?? '', b.net, b.tax, b.lines]),
      ...data.inputs.map(b => ['Purchases', b.name, b.code ?? '', b.net, b.tax, b.lines]),
      [],
      ['Output tax', '', '', '', data.outputTax, ''],
      ['Input tax charged', '', '', '', data.inputTax, ''],
      ['  of which blocked', '', '', '', data.inputTaxBlocked, ''],
      ['  of which claimable', '', '', '', data.inputTaxClaimable, ''],
      ['Recovery rate %', '', '', '', data.recoveryRatePct, ''],
      ['Restricted by partial exemption', '', '', '', data.inputTaxRestricted, ''],
      ['Input tax recoverable', '', '', '', data.inputTaxRecoverable, ''],
      ['NET PAYABLE', '', '', '', data.netPayable, ''],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `vat-return-${data.from}-to-${data.to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const payable = (data?.netPayable ?? 0) >= 0;

  function BucketTable({ title, buckets, taxLabel }: { title: string; buckets: Bucket[]; taxLabel: string }) {
    const net = buckets.reduce((s, b) => s + b.net, 0);
    const tax = buckets.reduce((s, b) => s + b.tax, 0);
    return (
      <div style={card}>
        <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
        </div>
        {buckets.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Nothing in this period.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                {['Treatment', 'Code', 'Net', taxLabel, 'Lines'].map(h => (
                  <th key={h} style={{ ...th, textAlign: h === 'Net' || h === taxLabel || h === 'Lines' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {buckets.map(b => (
                  <tr key={`${b.kind}-${b.code}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      {b.kind === 'UNCLASSIFIED'
                        ? <Badge variant="warning">No treatment recorded</Badge>
                        : <Badge variant={TAX_CODE_KIND_VARIANT[b.kind]}>{TAX_CODE_KIND_LABEL[b.kind]}</Badge>}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{b.code ?? '—'}</td>
                    <td style={num}>{fmt(b.net)}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{fmt(b.tax)}</td>
                    <td style={{ ...num, color: 'var(--ink3)' }}>{b.lines}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={2} style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>Total</td>
                  <td style={{ ...num, fontWeight: 800 }}>{fmt(net)}</td>
                  <td style={{ ...num, fontWeight: 800 }}>{fmt(tax)}</td>
                  <td style={num} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Tax']}
        titlePlain="VAT"
        titleEm="return"
        subtitle="Output tax, input tax, and what is actually recoverable — computed from the documents."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger aria-label="Period" style={{ width: 'auto', minHeight: 'var(--ctl-h-sm)', padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <button type="button" onClick={exportCsv} disabled={!data} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Icon name="download" size={13} /> Export
            </button>
            {/* The full working, for transcribing onto the local form. Built
                server-side so the file carries the registration and the
                exclusions, not just the figures on screen. */}
            <button type="button" disabled={!data} className="btn btn-primary btn-sm" style={{ gap: 6 }}
              onClick={() => downloadSubmission()}>
              <Icon name="fileText" size={13} color="#fff" /> Download for submission
            </button>
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Computing the return…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : !data ? null : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* The prior question. An unregistered business must not charge VAT,
              so its "output tax" is not a return figure — it is a problem, and
              showing a tidy net payable above it would be actively misleading. */}
          {data.registration.advisory && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px',
              background: data.registration.state === 'unknown' ? 'var(--gold-l)' : 'var(--red-l)',
              border: `1px solid ${data.registration.state === 'unknown' ? 'var(--gold)' : 'var(--red)'}`,
              borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55,
            }}>
              <Icon name="alertTriangle" size={16}
                color={data.registration.state === 'unknown' ? 'var(--gold)' : 'var(--red)'} />
              <div>
                <strong style={{ color: 'var(--ink)' }}>
                  {data.registration.state === 'unknown'
                    ? 'It is not recorded whether this workspace is VAT-registered.'
                    : 'This workspace should not be charging VAT.'}
                </strong>{' '}
                {data.registration.advisory}
                {data.outputTax > 0 && (
                  <> There is {fmt(data.outputTax)} of output tax on this period's sales, which
                  only belongs on a return if the registration exists.</>
                )}
                <div style={{ marginTop: 8 }}>
                  <a href="/finance/tax-codes" className="btn btn-secondary btn-sm">
                    Record the registration
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* The one figure the return exists to produce. */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Output tax on sales', value: fmt(data.outputTax), color: 'var(--ink)' },
              { label: 'Input tax recoverable', value: fmt(data.inputTaxRecoverable), color: 'var(--ink)' },
              {
                label: payable ? 'Net payable to the authority' : 'Net repayable to you',
                value: fmt(Math.abs(data.netPayable)),
                color: payable ? 'var(--red)' : 'var(--green)',
                strong: true,
              },
            ].map(s => (
              <div key={s.label} style={{ ...card, flex: 1, minWidth: 200, padding: '16px 18px' }}>
                <div style={{ fontSize: s.strong ? 24 : 20, fontWeight: 800, color: s.color, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>{s.value}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Gaps, stated rather than absorbed into a total. */}
          {(data.unclassified.salesLines > 0 || data.unclassified.purchaseLines > 0 ||
            data.fxSkipped.invoices > 0 || data.fxSkipped.bills > 0) && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px',
              background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)',
              fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55,
            }}>
              <Icon name="alertTriangle" size={16} color="var(--gold)" />
              <div>
                <strong style={{ color: 'var(--ink)' }}>This return is incomplete.</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {data.unclassified.salesLines > 0 && (
                    <li>{data.unclassified.salesLines} sales line{data.unclassified.salesLines === 1 ? '' : 's'} carrying {fmt(data.unclassified.salesTax)} of tax {data.unclassified.salesLines === 1 ? 'has' : 'have'} no treatment recorded, so {data.unclassified.salesLines === 1 ? 'it cannot' : 'they cannot'} be placed in a box.</li>
                  )}
                  {data.unclassified.purchaseLines > 0 && (
                    <li>{data.unclassified.purchaseLines} purchase line{data.unclassified.purchaseLines === 1 ? '' : 's'} carrying {fmt(data.unclassified.purchaseTax)} of tax {data.unclassified.purchaseLines === 1 ? 'has' : 'have'} no treatment recorded. That tax is <strong>not</strong> being claimed — an unrecorded treatment is not a claim.</li>
                  )}
                  {(data.fxSkipped.invoices > 0 || data.fxSkipped.bills > 0) && (
                    <li>{data.fxSkipped.invoices + data.fxSkipped.bills} document line{data.fxSkipped.invoices + data.fxSkipped.bills === 1 ? '' : 's'} in another currency {data.fxSkipped.invoices + data.fxSkipped.bills === 1 ? 'was' : 'were'} excluded: no rate to {cur} is recorded, and a guessed rate on a tax claim is a wrong claim.</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <BucketTable title={`Sales — output tax (${data.from} to ${data.to})`} buckets={data.outputs} taxLabel="Output tax" />
          <BucketTable title="Purchases — input tax" buckets={data.inputs} taxLabel="Input tax" />

          {/* How input tax gets from "charged" to "claimable". */}
          <div style={card}>
            <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>How much input tax is claimable</span>
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <tbody>
                {[
                  { l: 'Input tax charged on purchases', v: data.inputTax },
                  { l: 'Less: blocked treatments, and purchases with no treatment recorded', v: -data.inputTaxBlocked, muted: true },
                  { l: 'Input tax on treatments that permit recovery', v: data.inputTaxClaimable, rule: true },
                  {
                    l: `Less: restricted by partial exemption — ${data.recoveryRatePct.toFixed(2)}% recovery ` +
                       `(taxable ${fmt(data.taxableSupplies)} ÷ total supplies ${fmt(data.taxableSupplies + data.exemptSupplies)})`,
                    v: -data.inputTaxRestricted, muted: true,
                  },
                  { l: 'Input tax recoverable', v: data.inputTaxRecoverable, rule: true, strong: true },
                ].map((r, i) => (
                  <tr key={i} style={{ borderTop: r.rule ? '2px solid var(--border)' : '1px solid var(--border)' }}>
                    <td style={{ ...td, whiteSpace: 'normal', color: r.muted ? 'var(--ink3)' : 'var(--ink)', fontWeight: r.strong ? 700 : 500 }}>{r.l}</td>
                    <td style={{ ...num, fontWeight: r.strong ? 800 : 600, color: r.muted ? 'var(--ink3)' : 'var(--ink)' }}>{fmt(r.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.5, borderTop: '1px solid var(--border)' }}>
              Recovery is apportioned by turnover (the standard method). Direct attribution would be
              more precise, but nothing in the data links a purchase to the supply it was made for,
              so attributing would mean inventing that link.
            </div>
          </div>

          {/* Books vs return. A difference here is information, not an error. */}
          <div style={card}>
            <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Against the ledger</span>
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <tbody>
                {[
                  { l: 'VAT Output (Payable) — account 2200', v: data.ledger.outputTax },
                  { l: 'VAT Input (Recoverable) — account 1150', v: -data.ledger.inputTax },
                  { l: 'Net per the ledger', v: data.ledger.netPerLedger, rule: true },
                  { l: 'Net per this return', v: data.netPayable },
                  { l: 'Difference', v: data.ledger.difference, rule: true, strong: true },
                ].map((r, i) => (
                  <tr key={i} style={{ borderTop: r.rule ? '2px solid var(--border)' : '1px solid var(--border)' }}>
                    <td style={{ ...td, whiteSpace: 'normal', fontWeight: r.strong ? 700 : 500 }}>{r.l}</td>
                    <td style={{ ...num, fontWeight: r.strong ? 800 : 600 }}>{fmt(r.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Math.abs(data.ledger.difference) > 0.5 && (
              <div style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.55, borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                A bill posts its whole recoverable tax to account 1150 when it is entered, but this
                return only allows {data.recoveryRatePct.toFixed(2)}% of it. The difference is a
                period-end adjustment still to be posted — debit the expense, credit 1150 with{' '}
                <strong>{fmt(Math.abs(data.ledger.difference))}</strong>. Nothing posts it for you.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
