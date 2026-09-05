import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { mapApiInvoice, invoiceTotals, STATUS_STYLE } from './Billing.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;

function BarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, paddingTop: 20 }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 9, color: 'var(--ink3)', marginBottom: 4, whiteSpace: 'nowrap' }}>{fmtM(v)}</div>
          <div style={{ width: '65%', height: `${Math.max(4, (v / max) * 140)}px`, background: color, borderRadius: '4px 4px 0 0' }} />
          <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 6 }}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year'] as const;
type Period = typeof PERIODS[number];

const PAGE_SIZE = 15;

const pagerBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: 'var(--ds-btn-py-sm) 12px',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25,
  border: '1px solid var(--border)', borderRadius: 'var(--r)',
  background: 'var(--white)', color: 'var(--ink2)',
  fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.45 : 1,
});

function periodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (period) {
    case 'This Month': return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case 'Last Month': return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
    case 'This Quarter': { const qStart = m - (m % 3); return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 1) }; }
    case 'This Year': return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
    case 'Last Year': return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) };
  }
}

export const FinanceSalesReport: React.FC = () => {
  const [period, setPeriod] = useState<Period>('This Year');
  const [rawInvoices, setRawInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    apiFetch('/v1/invoices')
      .then((d: any) => setRawInvoices(Array.isArray(d) ? d : []))
      .catch((err: any) => setLoadError(err.message || 'Failed to load sales data'))
      .finally(() => setLoading(false));
  }, []);

  const { invoices, monthLabels, monthlyTotals, totalSales, paid, unpaid, overdue } = useMemo(() => {
    const { from, to } = periodRange(period);
    const all = rawInvoices.map(d => {
      const mapped = mapApiInvoice(d);
      const total = invoiceTotals(mapped).grandTotalTZS;
      const date = d.bill_date ? new Date(d.bill_date) : null;
      return { mapped, total, date, dueAmt: Math.max(0, total - mapped.received) };
    });
    const invoices = all.filter(i => i.date && i.date >= from && i.date < to)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const monthCount = period === 'This Quarter' ? 3 : (period === 'This Month' || period === 'Last Month') ? 1 : 12;
    const monthLabels: string[] = [];
    const monthlyTotals: number[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      monthLabels.push(d.toLocaleDateString('en-GB', { month: 'short' }));
      const bucketEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      monthlyTotals.push(invoices.filter(i => i.date && i.date >= d && i.date < bucketEnd).reduce((s, i) => s + i.total, 0));
    }

    const totalSales = invoices.reduce((s, i) => s + i.total, 0);
    const paid = invoices.filter(i => i.mapped.status === 'Paid').reduce((s, i) => s + i.total, 0);
    const unpaid = invoices.filter(i => i.mapped.status === 'Unpaid').reduce((s, i) => s + i.dueAmt, 0);
    const overdue = invoices.filter(i => i.mapped.status === 'Overdue').reduce((s, i) => s + i.dueAmt, 0);

    return { invoices, monthLabels, monthlyTotals, totalSales, paid, unpaid, overdue };
  }, [rawInvoices, period]);

  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [period]);

  const pageCount = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const pagedInvoices = invoices.slice(offset, offset + PAGE_SIZE);

  function exportCsv() {
    const rows = [
      ['Invoice #', 'Client', 'Date', 'Due Date', 'Total', 'Amount Due', 'Status'],
      ...invoices.map(i => [
        i.mapped.id, i.mapped.client, i.mapped.billDate, i.mapped.dueDate || '',
        String(Math.round(i.total)), String(Math.round(i.dueAmt)), i.mapped.status,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sales-report-${period.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Sales"
        titleEm="report"
        subtitle="Invoice income and payment status."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={period} onValueChange={v => setPeriod(v as Period)}>
              <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Sales',   value: fmtM(totalSales), icon: 'trendingUp',    color: 'var(--teal)',   bg: 'var(--teal-l)' },
            { label: 'Total Paid',    value: fmtM(paid),       icon: 'checkCircle',   color: 'var(--green)', bg: 'var(--green-l)'       },
            { label: 'Total Unpaid',  value: fmtM(unpaid),     icon: 'clock',         color: 'var(--gold)',      bg: 'var(--gold-l)'       },
            { label: 'Total Overdue', value: fmtM(overdue),    icon: 'alertTriangle', color: 'var(--red)',   bg: 'var(--red-l)'       },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 'var(--r)', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon as IconName} size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <SectionCard title="Monthly Sales Income">
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 16 }}>{period}</div>
          <BarChart labels={monthLabels} values={monthlyTotals} color="var(--teal)" />
        </SectionCard>

        {/* Table */}
        <SectionCard padded={false} title={`Invoice Details (${invoices.length})`}>
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Invoice #', 'Client', 'Date', 'Due Date', 'Total', 'Amount Due', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '32px' }}><SectionLoading style={{ padding: 0 }} /></td></tr>
              ) : loadError ? (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--red)' }}>{loadError}</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>No invoices in this period.</td></tr>
              ) : pagedInvoices.map((i, idx) => {
                const sc = STATUS_STYLE[i.mapped.status] || STATUS_STYLE.Draft;
                return (
                  <tr key={i.mapped.id + idx} style={{ borderBottom: idx < pagedInvoices.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 11 }}>{i.mapped.id}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{i.mapped.client}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{i.mapped.billDate || '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{i.mapped.dueDate || '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(i.total)}</td>
                    <td style={{ padding: '10px 16px', color: i.dueAmt > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: i.dueAmt > 0 ? 600 : 400, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(i.dueAmt)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, borderRadius: 'var(--r-sm)', padding: '2px 8px' }}>{sc.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>

          {/* Pagination Controls */}
          {invoices.length > PAGE_SIZE && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'var(--white)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                Showing <strong>{offset + 1}–{Math.min(offset + PAGE_SIZE, invoices.length)}</strong> of <strong>{invoices.length}</strong> invoices
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={pagerBtn(currentPage <= 1)}
                >
                  <Icon name="chevronLeft" size={13} /> Previous
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, padding: '0 6px' }}>
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  style={pagerBtn(currentPage >= pageCount)}
                >
                  Next <Icon name="chevronRight" size={13} />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
