import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { LedgerReport } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year'];

function iso(d: Date) { return d.toISOString().split('T')[0]; }
function periodRange(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  switch (key) {
    case 'Last Month': {
      const start = new Date(y, now.getMonth() - 1, 1);
      const end = new Date(y, now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case 'This Quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: iso(new Date(y, qStartMonth, 1)), to: iso(now) };
    }
    case 'Last Year':
      return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    case 'This Year':
      return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    case 'This Month':
    default:
      return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(now) };
  }
}

/** Tax accounts from the standard seeded chart of accounts (021_finance_gl.sql).
 *  Taxable base is derived (taxAmt / rate) since only the tax amount itself is
 *  posted to the GL — there's no separately stored taxable-base figure. */
const TAX_TYPES = [
  { code: '2200', label: 'Value Added Tax (VAT)', short: 'VAT', rate: 18, color: 'var(--blue)', bg: 'var(--blue-l)' },
  { code: '2300', label: 'Withholding Tax (WHT)',  short: 'WHT', rate: 5,  color: 'var(--gold)',     bg: 'var(--gold-l)' },
];

interface TaxTxn { ref: string; description: string; date: string; taxType: string; taxable: number; taxAmt: number; rate: number; color: string; bg: string }

export const FinanceTaxReport: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtFull = (n: number) => `${cur} ${n.toLocaleString()}`;

  const [period, setPeriod] = useState('This Year');
  const [ledgers, setLedgers] = useState<Record<string, LedgerReport | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = periodRange(period);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all(
      TAX_TYPES.map(t =>
        apiFetch(`/v1/finance/ledger?account=${t.code}&from=${range.from}&to=${range.to}`)
          .then((res: LedgerReport) => [t.code, res] as const)
          .catch(() => [t.code, null] as const)
      )
    )
      .then(pairs => { if (alive) setLedgers(Object.fromEntries(pairs)); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load tax report'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const { summary, transactions } = useMemo(() => {
    const summaryRows: { name: string; rate: number; taxableAmt: number; taxAmt: number; invoices: number; short: string; color: string; bg: string }[] = [];
    const txns: TaxTxn[] = [];

    TAX_TYPES.forEach(t => {
      const ledger = ledgers[t.code];
      if (!ledger) return;
      const accrued = ledger.entries.filter(e => e.credit > 0);
      const taxAmt = accrued.reduce((s, e) => s + e.credit, 0);
      if (taxAmt <= 0) return;
      summaryRows.push({
        name: t.label, rate: t.rate, taxAmt,
        taxableAmt: taxAmt / (t.rate / 100), invoices: accrued.length, short: t.short, color: t.color, bg: t.bg,
      });
      accrued.forEach(e => txns.push({
        ref: e.entry_number, description: e.description || '—', date: e.date,
        taxType: t.short, taxAmt: e.credit, taxable: e.credit / (t.rate / 100), rate: t.rate,
        color: t.color, bg: t.bg,
      }));
    });

    txns.sort((a, b) => b.date.localeCompare(a.date));
    return { summary: summaryRows, transactions: txns };
  }, [ledgers]);

  const totalTaxable = summary.reduce((a, b) => a + b.taxableAmt, 0);
  const totalTax = summary.reduce((a, b) => a + b.taxAmt, 0);
  const totalInv = summary.reduce((a, b) => a + b.invoices, 0);

  function exportCsv() {
    const rows = [
      ['Ref', 'Description', 'Date', 'Tax Type', 'Taxable Amount', 'Tax Amount', 'Rate'],
      ...transactions.map(t => [t.ref, t.description, t.date, t.taxType, String(t.taxable), String(t.taxAmt), `${t.rate}%`]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tax-report-${period.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['FinOps', 'Tax']}
        titlePlain="Tax"
        titleEm="report"
        subtitle="VAT and duty collected and payable."
      />

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Tax Report</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>VAT and withholding tax accrued to the general ledger</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 'auto', padding: '7px 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading tax report…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Taxable Base (est.)', value: fmtFull(totalTaxable), icon: 'dollarSign', color: 'var(--blue)',   bg: 'var(--blue-l)' },
            { label: 'Total Tax Accrued',         value: fmtFull(totalTax),     icon: 'percent',    color: 'var(--teal)',   bg: 'var(--teal-l)' },
            { label: 'Effective Tax Rate',         value: totalTaxable > 0 ? `${((totalTax / totalTaxable) * 100).toFixed(1)}%` : '—', icon: 'barChart2', color: 'var(--gold)', bg: 'var(--gold-l)' },
            { label: 'Taxable Transactions',       value: String(totalInv),      icon: 'file',       color: 'var(--purple)', bg: 'var(--purple-l)' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon as IconName} size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tax by type table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tax Summary by Type</span>
          </div>
          {summary.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No tax activity for this period.</div>
          ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Tax Name', 'Rate', 'Taxable Base (est.)', 'Tax Accrued', 'Entries', 'Share'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((row, i) => {
                const share = totalTax > 0 ? ((row.taxAmt / totalTax) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={row.name} style={{ borderBottom: i < summary.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{row.rate}%</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{fmtFull(row.taxableAmt)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmtFull(row.taxAmt)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', textAlign: 'center' }}>{row.invoices}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${share}%`, background: 'var(--teal)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--bg)' }}>
                <td colSpan={2} style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalTaxable)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalTax)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 800, textAlign: 'center', borderTop: '2px solid var(--border)' }}>{totalInv}</td>
                <td style={{ padding: '10px 16px', borderTop: '2px solid var(--border)' }} />
              </tr>
            </tbody>
          </table></div>
          )}
        </div>

        {/* Transaction detail table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Taxable Transactions</span>
          </div>
          {transactions.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No taxable transactions for this period.</div>
          ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Reference', 'Description', 'Date', 'Tax Type', 'Taxable Base (est.)', 'Tax Amount', 'Rate'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => (
                <tr key={`${tx.ref}-${i}`} style={{ borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 11 }}>{tx.ref}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{tx.description}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: tx.color, background: tx.bg, borderRadius: 5, padding: '2px 7px' }}>{tx.taxType}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(tx.taxable)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(tx.taxAmt)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{tx.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
