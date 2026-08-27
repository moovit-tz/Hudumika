import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { AgedReport, AgedRow } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';

export const FinanceAgedReceivables: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtFull = (n: number) => n > 0 ? `${cur} ${n.toLocaleString()}` : '—';

  const [report, setReport] = useState<AgedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerIdByName, setCustomerIdByName] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/finance/aged-receivables')
      .then((res: AgedReport) => { if (alive) setReport(res); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load aged receivables'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Aged-receivables rows are grouped by the invoice's free-text client_name
  // (no customer_id on sales_invoices historically), so entity_id here is a
  // name, not a customer UUID. Resolve it against real customer records the
  // same way the invoice→customer backfill did: case-insensitive, trimmed
  // name match — so "View statement" only links when a profile truly exists.
  useEffect(() => {
    let alive = true;
    apiFetch('/v1/customers')
      .then((res: any) => {
        if (!alive) return;
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        const map: Record<string, string> = {};
        for (const c of list) {
          if (c?.name && c?.id) map[String(c.name).trim().toLowerCase()] = c.id;
        }
        setCustomerIdByName(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows = report?.rows ?? [];
  const totals = report?.totals ?? { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0 };
  const overdue = totals.days_1_30 + totals.days_31_60 + totals.days_61_90 + totals.days_90_plus;
  const asOf = report?.as_of ?? '';

  function riskBadge(row: AgedRow) {
    if (row.days_90_plus > 0) return { label: 'High Risk', color: 'var(--red)', bg: 'var(--red-l)' };
    if (row.days_61_90 > 0)   return { label: 'At Risk',   color: 'var(--gold)',    bg: 'var(--gold-l)' };
    if (row.days_31_60 > 0)   return { label: 'Overdue',   color: 'var(--red)', bg: 'var(--red-l)' };
    if (row.days_1_30 > 0)    return { label: 'Due',       color: 'var(--gold)',    bg: 'var(--gold-l)' };
    if (row.current > 0)      return { label: 'Current',   color: 'var(--green)', bg: 'var(--green-l)' };
    return                           { label: 'Cleared',  color: 'var(--ink3)', bg: 'var(--bg)' };
  }

  function exportCsv() {
    const cols = ['Customer', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
    const csvRows = [cols, ...rows.map(c => [c.entity_name, String(c.current), String(c.days_1_30), String(c.days_31_60), String(c.days_61_90), String(c.days_90_plus), String(c.total)])];
    const csv = csvRows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aged-receivables-${asOf}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Aged"
        titleEm="receivables"
        subtitle={`Outstanding customer balances by age${asOf ? ` — as of ${asOf}` : ''}`}
        actions={
          <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Icon name="download" size={13} /> Export
          </button>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading aged receivables…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <MetricsRow cards={[
          {
            title: 'Total Outstanding', value: fmtFull(totals.total), icon: 'dollarSign',
            sub1Label: 'CURRENT', sub1Value: fmtFull(totals.current),
            sub2Label: 'OVERDUE', sub2Value: fmtFull(overdue), barHighlight: 'var(--blue)',
          },
          {
            title: 'Current (not due)', value: fmtFull(totals.current), icon: 'checkCircle',
            sub1Label: 'CUSTOMERS', sub1Value: String(rows.length),
            sub2Label: 'OF TOTAL', sub2Value: totals.total ? `${Math.round((totals.current / totals.total) * 100)}%` : '0%', barHighlight: 'var(--green)',
          },
          {
            title: 'Total Overdue', value: fmtFull(overdue), icon: 'alertTriangle', invertTrend: true,
            sub1Label: '1–90 DAYS', sub1Value: fmtFull(totals.days_1_30 + totals.days_31_60 + totals.days_61_90),
            sub2Label: '90+ DAYS', sub2Value: fmtFull(totals.days_90_plus), barHighlight: 'var(--red)',
          },
          {
            title: '90+ Days Overdue', value: fmtFull(totals.days_90_plus), icon: 'clock', invertTrend: true,
            sub1Label: 'OF OVERDUE', sub1Value: overdue ? `${Math.round((totals.days_90_plus / overdue) * 100)}%` : '0%',
            sub2Label: 'OF TOTAL', sub2Value: totals.total ? `${Math.round((totals.days_90_plus / totals.total) * 100)}%` : '0%', barHighlight: 'var(--gold)',
          },
        ]} />

        {/* Aging bars summary */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Aging Distribution</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Current',   value: totals.current,      color: 'var(--green)'  },
              { label: '1–30 Days', value: totals.days_1_30,    color: 'var(--gold)'       },
              { label: '31–60 Days',value: totals.days_31_60,   color: 'var(--red)'    },
              { label: '61–90 Days',value: totals.days_61_90,   color: 'var(--red)'    },
              { label: '90+ Days',  value: totals.days_90_plus, color: '#7c3aed'       },
            ].map(band => {
              const pct = totals.total > 0 ? Math.round((band.value / totals.total) * 100) : 0;
              return (
                <div key={band.label} style={{ flex: 1, minWidth: 100 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>{band.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: band.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{fmtFull(band.value)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Aging table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Customer Aging Detail ({rows.length})</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No outstanding customer balances.</div>
          ) : (
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Customer', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const badge = riskBadge(c);
                  const customerId = customerIdByName[c.entity_name.trim().toLowerCase()];
                  return (
                    <tr key={c.entity_id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.entity_name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--green)',  fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.current)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--gold)',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.days_1_30)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.days_31_60)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.days_61_90)}</td>
                      <td style={{ padding: '10px 16px', color: '#7c3aed',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.days_90_plus)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.total)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 5, padding: '2px 7px' }}>{badge.label}</span>
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        {customerId && (
                          <Link
                            to={`/crm/customers?id=${encodeURIComponent(customerId)}&tab=finance&financeTab=statement`}
                            style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}
                          >
                            View statement
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--bg)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total</td>
                  <td style={{ padding: '10px 16px', color: 'var(--green)',  fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.current)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--gold)',       fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_1_30)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_31_60)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_61_90)}</td>
                  <td style={{ padding: '10px 16px', color: '#7c3aed',       fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_90_plus)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.total)}</td>
                  <td style={{ borderTop: '2px solid var(--border)' }} />
                  <td style={{ borderTop: '2px solid var(--border)' }} />
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
