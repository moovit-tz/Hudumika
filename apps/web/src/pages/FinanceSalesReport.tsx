import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { mapApiInvoice, invoiceTotals, STATUS_STYLE } from './Billing.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import './FinanceSalesReport.css';

const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;

function SalesTrendChart({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 760;
  const height = 220;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (value / max) * 170 - 20;
    return { x, y, value };
  });
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const area = points.length ? `0,${height} ${line} ${width},${height}` : '';
  return (
    <div className="fsr-trend" aria-label="Monthly sales trend">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {[45, 90, 135, 180].map(y => <line key={y} x1="0" x2={width} y1={y} y2={y} className="fsr-chart-grid" />)}
        <polygon points={area} className="fsr-chart-area" />
        <polyline points={line} className="fsr-chart-line" />
        {points.map((point, index) => (
          <g key={labels[index]}>
            <circle cx={point.x} cy={point.y} r="4" className="fsr-chart-point" />
            {point.value > 0 && <text x={point.x} y={Math.max(12, point.y - 10)} textAnchor="middle" className="fsr-chart-value">{fmtM(point.value)}</text>}
          </g>
        ))}
      </svg>
      <div className="fsr-chart-labels">
        {labels.map(label => <span key={label}>{label}</span>)}
      </div>
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

  const { invoices, monthLabels, monthlyTotals, totalSales, paid, unpaid, overdue, paidCount, topClients } = useMemo(() => {
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
    const paidCount = invoices.filter(i => i.mapped.status === 'Paid').length;
    const clientTotals = new Map<string, { total: number; invoices: number }>();
    invoices.forEach(invoice => {
      const name = invoice.mapped.client || 'Unassigned customer';
      const current = clientTotals.get(name) || { total: 0, invoices: 0 };
      clientTotals.set(name, { total: current.total + invoice.total, invoices: current.invoices + 1 });
    });
    const topClients = [...clientTotals.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { invoices, monthLabels, monthlyTotals, totalSales, paid, unpaid, overdue, paidCount, topClients };
  }, [rawInvoices, period]);

  const collectionRate = totalSales > 0 ? (paid / totalSales) * 100 : 0;
  const averageInvoice = invoices.length ? totalSales / invoices.length : 0;
  const outstanding = unpaid + overdue;

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
    <div className="finance-sales-report">
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
            <Button type="button" onClick={exportCsv} variant="outline" size="sm"><Icon name="download" size={14} /> Export report</Button>
          </div>
        }
      />

      <div className="fsr-body">

        <section className="fsr-kpis" aria-label="Sales summary">
          {[
            { label: 'Gross sales', value: fmtM(totalSales), icon: 'trendingUp', variant: 'brand' as const, detail: `${invoices.length} invoices` },
            { label: 'Collected', value: fmtM(paid), icon: 'checkCircle', variant: 'success' as const, detail: `${collectionRate.toFixed(1)}% collection rate` },
            { label: 'Outstanding', value: fmtM(outstanding), icon: 'clock', variant: 'warning' as const, detail: `${invoices.length - paidCount} open invoices` },
            { label: 'Overdue', value: fmtM(overdue), icon: 'alertTriangle', variant: 'error' as const, detail: overdue > 0 ? 'Requires follow-up' : 'No overdue balance' },
          ].map(s => (
            <article key={s.label} className="fsr-kpi">
              <FeaturedIcon variant={s.variant} size="md"><Icon name={s.icon as IconName} size={18} /></FeaturedIcon>
              <div className="fsr-kpi-copy">
                <span>{s.label}</span>
                <strong>{s.value}</strong>
                <small>{s.detail}</small>
              </div>
            </article>
          ))}
        </section>

        <div className="fsr-insights-grid">
          <SectionCard title="Revenue trend" collapsible={false} action={<Badge variant="brand">{period}</Badge>}>
            <div className="fsr-chart-summary">
              <div><span>Period revenue</span><strong>{fmtFull(totalSales)}</strong></div>
              <div><span>Average invoice</span><strong>{fmtFull(averageInvoice)}</strong></div>
            </div>
            <SalesTrendChart labels={monthLabels} values={monthlyTotals} />
          </SectionCard>

          <SectionCard title="Collection health" collapsible={false}>
            <div className="fsr-collection">
              <div className="fsr-donut" style={{ '--collection': `${Math.min(100, collectionRate)}%` } as React.CSSProperties}>
                <div><strong>{collectionRate.toFixed(0)}%</strong><span>collected</span></div>
              </div>
              <div className="fsr-collection-list">
                <div><span><i className="is-paid" />Paid</span><strong>{fmtM(paid)}</strong></div>
                <div><span><i className="is-open" />Unpaid</span><strong>{fmtM(unpaid)}</strong></div>
                <div><span><i className="is-overdue" />Overdue</span><strong>{fmtM(overdue)}</strong></div>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Top customers by invoiced revenue" collapsible={false}>
          <div className="fsr-clients">
            {topClients.length === 0 ? <div className="fsr-empty">No customer revenue in this period.</div> : topClients.map((client, index) => (
              <div className="fsr-client" key={client.name}>
                <span className="fsr-client-rank">{index + 1}</span>
                <div className="fsr-client-name"><strong>{client.name}</strong><span>{client.invoices} invoice{client.invoices === 1 ? '' : 's'}</span></div>
                <div className="fsr-client-bar"><span style={{ width: `${topClients[0].total ? (client.total / topClients[0].total) * 100 : 0}%` }} /></div>
                <strong className="fsr-client-total">{fmtM(client.total)}</strong>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Table */}
        <SectionCard padded={false} collapsible={false} title={`Invoice ledger (${invoices.length})`}>
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
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--font)', fontSize: 11 }}>{i.mapped.id}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{i.mapped.client}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{i.mapped.billDate || '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{i.mapped.dueDate || '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>{fmtFull(i.total)}</td>
                    <td style={{ padding: '10px 16px', color: i.dueAmt > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: i.dueAmt > 0 ? 600 : 400, fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>{fmtFull(i.dueAmt)}</td>
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
