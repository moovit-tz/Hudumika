import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import '../pages/AI.css';
import { PageHeader } from '../components/PageHeader.js';

interface InsightsResponse {
  digest: string;
  signals: {
    at_risk_shipments: { ref_number: string; customer: string; stage: string; demurrage_risk: boolean; sla_breached: boolean }[];
    aged_receivables: { totals: { total: number }; top_debtors: { customer: string; total_owed: number; days_90_plus: number }[] };
    declarations_this_month: { total_this_month: number; pending: number };
  };
}

export const AIInsights: React.FC = () => {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch('/v1/ai/insights')
      .then(setData)
      .catch(err => setError(err?.message ?? 'Failed to generate insights'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <PageHeader
            crumbs={['AI', 'Daily Digest']}
            titlePlain="Daily"
            titleEm="digest"
            subtitle="Generated from live operational and financial data"
          />
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <Icon name="refresh" size={13} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Generating digest…</div>
      ) : error ? (
        <div style={{ padding: '20px', borderRadius: 9, background: 'var(--red-l)', color: '#ef4444', fontSize: 13 }}>{error}</div>
      ) : data ? (
        <>
          <div className="card" style={{ padding: '20px 22px', marginBottom: 20, borderLeft: '3px solid #6d28d9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="sparkle" size={15} color="#6d28d9" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today's Summary</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{data.digest}</div>
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
            <div className="card" style={{ flex: 1, padding: '16px 18px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{data.signals.at_risk_shipments.length}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>At-risk shipments</div>
            </div>
            <div className="card" style={{ flex: 1, padding: '16px 18px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{data.signals.aged_receivables.totals.total.toLocaleString()}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Total outstanding (AR)</div>
            </div>
            <div className="card" style={{ flex: 1, padding: '16px 18px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{data.signals.declarations_this_month.pending}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Declarations pending</div>
            </div>
          </div>

          {data.signals.at_risk_shipments.length > 0 && (
            <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>At-Risk Shipments</div>
              <div className="rtbl-wrap">
                <table className="rtbl">
                  <thead><tr><th>Reference</th><th>Customer</th><th className="col-hide-sm">Stage</th><th>Risk</th></tr></thead>
                  <tbody>
                    {data.signals.at_risk_shipments.map(s => (
                      <tr key={s.ref_number}>
                        <td style={{ fontFamily: 'var(--mono)' }}>{s.ref_number}</td>
                        <td>{s.customer}</td>
                        <td className="col-hide-sm">{s.stage}</td>
                        <td>
                          {s.sla_breached && <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'var(--red-l)', padding: '2px 7px', borderRadius: 5, marginRight: 4 }}>SLA</span>}
                          {s.demurrage_risk && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'var(--gold-l)', padding: '2px 7px', borderRadius: 5 }}>Demurrage</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.signals.aged_receivables.top_debtors.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Top Outstanding Balances</div>
              <div className="rtbl-wrap">
                <table className="rtbl">
                  <thead><tr><th>Customer</th><th style={{ textAlign: 'right' }}>Total Owed</th><th className="col-hide-sm" style={{ textAlign: 'right' }}>90+ Days</th></tr></thead>
                  <tbody>
                    {data.signals.aged_receivables.top_debtors.map(d => (
                      <tr key={d.customer}>
                        <td>{d.customer}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{d.total_owed.toLocaleString()}</td>
                        <td className="col-hide-sm" style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: d.days_90_plus > 0 ? '#ef4444' : 'var(--ink3)' }}>{d.days_90_plus.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
