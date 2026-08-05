import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { AgedReport, AgedRow } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';

export const FinanceAgedPayables: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtFull = (n: number) => n > 0 ? `${cur} ${n.toLocaleString()}` : '—';

  const [report, setReport] = useState<AgedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/finance/aged-payables')
      .then((res: AgedReport) => { if (alive) setReport(res); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load aged payables'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = report?.rows ?? [];
  const totals = report?.totals ?? { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0 };
  const overdue = totals.days_1_30 + totals.days_31_60 + totals.days_61_90 + totals.days_90_plus;
  const asOf = report?.as_of ?? '';

  function urgencyBadge(row: AgedRow) {
    if (row.days_90_plus > 0) return { label: 'Urgent',   color: 'var(--red)',   bg: '#fef2f2' };
    if (row.days_61_90 > 0)   return { label: 'Overdue',  color: 'var(--red)',   bg: '#fef2f2' };
    if (row.days_31_60 > 0)   return { label: 'Late',     color: '#f59e0b',      bg: '#fffbeb' };
    if (row.days_1_30 > 0)    return { label: 'Due Soon', color: '#f59e0b',      bg: '#fffbeb' };
    if (row.current > 0)      return { label: 'Current',  color: 'var(--green)', bg: '#ecfdf5' };
    return                           { label: 'Cleared', color: 'var(--ink3)', bg: 'var(--bg)' };
  }

  function exportCsv() {
    const cols = ['Supplier', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
    const csvRows = [cols, ...rows.map(c => [c.entity_name, String(c.current), String(c.days_1_30), String(c.days_31_60), String(c.days_61_90), String(c.days_90_plus), String(c.total)])];
    const csv = csvRows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aged-payables-${asOf}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['FinOps', 'Aged Payables']}
        titlePlain="Aged"
        titleEm="payables"
        subtitle="What is owed to suppliers, by how overdue."
      />

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Aged Payables</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Outstanding supplier balances by age — as of {asOf}</div>
        </div>
        <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="download" size={13} /> Export
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading aged payables…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Payable',     value: `${cur} ${(totals.total / 1_000_000).toFixed(1)}M`,       color: 'var(--blue)',  bg: '#eff6ff',       icon: 'dollarSign'   },
            { label: 'Current',           value: `${cur} ${(totals.current / 1_000_000).toFixed(1)}M`,     color: 'var(--green)', bg: '#ecfdf5',       icon: 'checkCircle'  },
            { label: 'Total Overdue',     value: `${cur} ${(overdue / 1_000_000).toFixed(1)}M`,            color: 'var(--red)',   bg: '#fef2f2',       icon: 'alertTriangle'},
            { label: '90+ Days',          value: `${cur} ${(totals.days_90_plus / 1_000_000).toFixed(1)}M`, color: '#7c3aed',      bg: '#f5f3ff',       icon: 'clock'        },
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

        {/* Aging distribution */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Aging Distribution</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Current',    value: totals.current,      color: 'var(--green)'  },
              { label: '1–30 Days',  value: totals.days_1_30,    color: '#f59e0b'       },
              { label: '31–60 Days', value: totals.days_31_60,   color: 'var(--red)'    },
              { label: '61–90 Days', value: totals.days_61_90,   color: 'var(--red)'    },
              { label: '90+ Days',   value: totals.days_90_plus, color: '#7c3aed'       },
            ].map(band => {
              const pct = totals.total > 0 ? Math.round((band.value / totals.total) * 100) : 0;
              return (
                <div key={band.label} style={{ flex: 1 }}>
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

        {/* Table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Supplier Aging Detail</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No outstanding supplier balances.</div>
          ) : (
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Supplier', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const badge = urgencyBadge(s);
                  return (
                    <tr key={s.entity_id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.entity_name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--green)',  fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.current)}</td>
                      <td style={{ padding: '10px 16px', color: '#f59e0b',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.days_1_30)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.days_31_60)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.days_61_90)}</td>
                      <td style={{ padding: '10px 16px', color: '#7c3aed',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.days_90_plus)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.total)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 5, padding: '2px 7px' }}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--bg)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total</td>
                  <td style={{ padding: '10px 16px', color: 'var(--green)',  fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.current)}</td>
                  <td style={{ padding: '10px 16px', color: '#f59e0b',       fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_1_30)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_31_60)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_61_90)}</td>
                  <td style={{ padding: '10px 16px', color: '#7c3aed',       fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.days_90_plus)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.total)}</td>
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
