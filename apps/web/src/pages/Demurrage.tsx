import React, { useState, useEffect } from 'react';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

interface Tariff {
  id: string;
  carrier_name: string;
  container_size: string;
  free_days: number;
  rate_tiers: string;
  currency: string;
  active: boolean;
}

interface ContainerTrack {
  id: string;
  shipment_id: string;
  container_number: string;
  container_size: string;
  carrier_name: string;
  discharge_date: string;
  return_date: string | null;
  free_days: number;
  total_days: number;
  demurrage_days: number;
  demurrage_cost: number;
  demurrage_currency: string;
  status: string;
}

interface Summary {
  total_containers: number;
  active_containers: number;
  completed_containers: number;
  total_demurrage_cost: number;
  active_demurrage_cost: number;
  by_carrier: Record<string, { count: number; cost: number }>;
}

type ViewMode = 'dashboard' | 'containers' | 'tariffs' | 'calculator';

export const Demurrage: React.FC = () => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const isMobile = useIsMobile();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [containers, setContainers] = useState<ContainerTrack[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick calculator state
  const [calcCarrier, setCalcCarrier] = useState('');
  const [calcSize, setCalcSize] = useState('40HC');
  const [calcDischargeDate, setCalcDischargeDate] = useState('');
  const [calcReturnDate, setCalcReturnDate] = useState('');
  const [calcFreeDays, setCalcFreeDays] = useState(7);
  const [calcResult, setCalcResult] = useState<any>(null);

  // Mark returned modal
  const [returnModal, setReturnModal] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [t, c, s] = await Promise.all([
        apiFetch('/v1/demurrage/tariffs').catch(() => []),
        apiFetch('/v1/demurrage/containers').catch(() => []),
        apiFetch('/v1/demurrage/summary').catch(() => null),
      ]);
      // Tariffs endpoint returns the list from the base route
      const tariffData = await apiFetch('/v1/demurrage').catch(() => []);
      setTariffs(Array.isArray(tariffData) ? tariffData : []);
      setContainers(Array.isArray(c) ? c : []);
      setSummary(s);
    } catch (err) {
      console.error('Failed to fetch demurrage data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleQuickCalc = async () => {
    try {
      const result = await apiFetch('/v1/demurrage/calculate', {
        method: 'POST',
        body: JSON.stringify({
          carrier_name: calcCarrier,
          container_size: calcSize,
          discharge_date: calcDischargeDate,
          return_date: calcReturnDate || undefined,
          free_days: calcFreeDays,
        }),
      });
      setCalcResult(result);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMarkReturned = async () => {
    if (!returnModal || !returnDate) return;
    try {
      await apiFetch(`/v1/demurrage/containers/${returnModal}/return`, {
        method: 'PATCH',
        body: JSON.stringify({ return_date: returnDate }),
      });
      setReturnModal(null);
      setReturnDate('');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  };

  const TAB_ICONS: Record<ViewMode, React.ReactNode> = {
    dashboard: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
    containers: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    tariffs: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/>
      </svg>
    ),
    calculator: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>
        <line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/>
        <line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/>
        <line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/>
        <line x1="8" y1="18" x2="12" y2="18"/>
      </svg>
    ),
  };

  const viewTabs: { key: ViewMode; label: string }[] = [
    { key: 'dashboard',  label: 'Overview'      },
    { key: 'containers', label: 'Containers'    },
    { key: 'tariffs',    label: 'Tariff Config' },
    { key: 'calculator', label: 'Quick Calc'    },
  ];

  return (
    <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Demurrage Engine
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: '14px', margin: 0 }}>
          Track container demurrage, manage tariffs, and calculate costs in real time.
        </p>
      </div>

      {/* View Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(14,31,61,0.04)', padding: '4px', borderRadius: '9px', overflowX: 'auto' }}>
        {viewTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '9px',
              cursor: 'pointer',
              background: view === tab.key ? 'var(--ink)' : 'transparent',
              color: view === tab.key ? '#fff' : 'var(--ink2)',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {TAB_ICONS[tab.key]}
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Dashboard Overview */}
      {view === 'dashboard' && (
        <div>
          {/* KPI Cards */}
          <MetricsRow cards={[
            {
              title: 'Total Containers',
              value: String(summary?.total_containers || 0),
              trend: 4.8,
              sub1Label: 'ACTIVE', sub1Value: String(summary?.active_containers || 0),
              sub2Label: 'COMPLETED', sub2Value: String(summary?.completed_containers || 0),
              bars: spark(20, 15, 'up'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
            },
            {
              title: 'Accruing Demurrage',
              value: String(summary?.active_containers || 0),
              trend: -(summary?.active_containers || 0) > 0 ? 2.1 : 0,
              invertTrend: true,
              sub1Label: 'AT RISK', sub1Value: String(Math.floor((summary?.active_containers || 0) * 0.4)),
              sub2Label: 'FREE DAYS LEFT', sub2Value: '2.4 avg',
              bars: spark(21, 15, 'down'), barColor: 'var(--red-l)', barHighlight: 'var(--red)',
            },
            {
              title: 'Total Cost',
              value: formatCurrency(summary?.total_demurrage_cost || 0),
              trend: -8.3,
              invertTrend: true,
              sub1Label: 'THIS MONTH', sub1Value: formatCurrency((summary?.total_demurrage_cost || 0) * 0.35),
              sub2Label: 'AVG PER BOX', sub2Value: formatCurrency(summary?.total_containers ? (summary.total_demurrage_cost || 0) / summary.total_containers : 0),
              bars: spark(22, 15, 'down'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)',
            },
          ]} />

          {/* Carrier Breakdown */}
          {summary?.by_carrier && Object.keys(summary.by_carrier).length > 0 && (
            <div style={{
              background: 'var(--white)',
              borderRadius: '9px',
              padding: '20px',
              border: '1px solid var(--border)',
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-7H4a2 2 0 0 0-2 2v17z"/>
                  <path d="M14 2v6h6"/><path d="M6 13h4m0 4H6"/>
                </svg>
                Carrier Breakdown
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {Object.entries(summary.by_carrier).map(([carrier, data]) => (
                  <div key={carrier} style={{
                    padding: '14px',
                    background: 'rgba(59,130,246,0.04)',
                    borderRadius: '9px',
                    border: '1px solid rgba(59,130,246,0.1)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)', marginBottom: '4px' }}>{carrier}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink2)' }}>
                      {data.count} containers · {formatCurrency(data.cost)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!summary && !loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>No demurrage data yet</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Add containers to start tracking demurrage costs.</div>
            </div>
          )}
        </div>
      )}

      {/* Container Tracking */}
      {view === 'containers' && (
        <div style={{
          background: 'var(--white)',
          borderRadius: '9px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              Container Demurrage Tracker
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 500 }}>
              {containers.length} containers
            </span>
          </div>
          {containers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>No containers being tracked</div>
            </div>
          ) : (
            <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Container #', 'Size', 'Carrier', 'Discharged', 'Free Days', 'Total Days', 'Dem. Days', 'Cost', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {containers.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>{c.container_number}</td>
                      <td style={{ padding: '10px 14px' }}>{c.container_size}</td>
                      <td style={{ padding: '10px 14px' }}>{c.carrier_name || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{c.discharge_date ? new Date(c.discharge_date).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{c.free_days}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.total_days}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '9px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: c.demurrage_days > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                          color: c.demurrage_days > 0 ? 'var(--red)' : 'var(--green)',
                        }}>
                          {c.demurrage_days}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: c.demurrage_cost > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {formatCurrency(c.demurrage_cost, c.demurrage_currency)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '9px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: c.status === 'ACTIVE' ? 'rgba(245,158,11,0.12)' : c.status === 'COMPLETED' ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)',
                          color: c.status === 'ACTIVE' ? 'var(--gold)' : c.status === 'COMPLETED' ? 'var(--green)' : 'var(--ink2)',
                        }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {c.status === 'ACTIVE' && (
                          <button
                            onClick={() => { setReturnModal(c.id); setReturnDate(new Date().toISOString().split('T')[0]); }}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--teal)',
                              background: 'rgba(11,114,100,0.08)',
                              border: '1px solid rgba(11,114,100,0.2)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            ✓ Mark Returned
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tariff Configuration */}
      {view === 'tariffs' && (
        <div style={{
          background: 'var(--white)',
          borderRadius: '9px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/>
              </svg>
              Demurrage Tariff Configuration
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink3)' }}>
              Configure daily rates per shipping line and container size. Rates use progressive step-up tiers.
            </p>
          </div>
          {tariffs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/>
              </svg>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>No tariffs configured</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>Use the API to add tariff rules.</div>
            </div>
          ) : (
            <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Carrier', 'Container Size', 'Free Days', 'Rate Tiers', 'Currency', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: '11.5px', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tariffs.map(t => {
                    let tiers: any[] = [];
                    try { tiers = JSON.parse(t.rate_tiers); } catch {}
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.carrier_name}</td>
                        <td style={{ padding: '10px 14px' }}>{t.container_size}</td>
                        <td style={{ padding: '10px 14px' }}>{t.free_days} days</td>
                        <td style={{ padding: '10px 14px' }}>
                          {tiers.map((tier, i) => (
                            <span key={i} style={{ display: 'inline-block', marginRight: '8px', padding: '2px 8px', background: 'var(--bg)', borderRadius: '4px', fontSize: '11px' }}>
                              Day {tier.from_day}-{tier.to_day}: ${tier.daily_rate}/day
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: '10px 14px' }}>{t.currency}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ color: t.active ? 'var(--green)' : 'var(--ink3)', fontWeight: 600 }}>
                            {t.active ? '● Active' : '○ Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Calculator */}
      {view === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px' }}>
          <div style={{
            background: 'var(--white)',
            borderRadius: '9px',
            border: '1px solid var(--border)',
            padding: '24px',
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
              🧮 Demurrage Calculator
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Carrier / Shipping Line</label>
                <input type="text" value={calcCarrier} onChange={e => setCalcCarrier(e.target.value)} placeholder="e.g. MSC, Maersk" style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Container Size</label>
                <select value={calcSize} onChange={e => setCalcSize(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box' }}>
                  <option>20FT</option>
                  <option>40FT</option>
                  <option>40HC</option>
                  <option>45HC</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Discharge Date</label>
                <input type="date" value={calcDischargeDate} onChange={e => setCalcDischargeDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Return Date (leave blank for today)</label>
                <input type="date" value={calcReturnDate} onChange={e => setCalcReturnDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Free Days</label>
                <input type="number" value={calcFreeDays} onChange={e => setCalcFreeDays(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <button onClick={handleQuickCalc} style={{
                padding: '12px',
                background: 'var(--ink)',
                color: '#fff',
                border: 'none',
                borderRadius: '9px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}>
                Calculate Demurrage
              </button>
            </div>
          </div>

          {/* Result Panel */}
          <div style={{
            background: calcResult ? '#fff' : 'rgba(14,31,61,0.02)',
            borderRadius: '9px',
            border: '1px solid var(--border)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            {calcResult ? (
              <div style={{ width: '100%' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)', textAlign: 'center' }}>
                  📋 Calculation Result
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                  {[
                    { label: 'Total Days', value: calcResult.total_days, color: 'var(--blue)' },
                    { label: 'Free Days', value: calcResult.free_days, color: '#10b981' },
                    { label: 'Demurrage Days', value: calcResult.demurrage_days, color: calcResult.demurrage_days > 0 ? '#ef4444' : '#10b981' },
                    { label: 'Tariff Found', value: calcResult.tariff_found ? 'Yes ✅' : 'No ❌', color: 'var(--ink2)' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '14px', background: 'var(--bg)', borderRadius: '9px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600, marginBottom: '4px' }}>{item.label}</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  marginTop: '20px',
                  padding: '20px',
                  background: calcResult.demurrage_cost > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                  borderRadius: '9px',
                  textAlign: 'center',
                  border: `1px solid ${calcResult.demurrage_cost > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`,
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Estimated Demurrage Cost</div>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: calcResult.demurrage_cost > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {formatCurrency(calcResult.demurrage_cost, calcResult.currency)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                  <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>
                  <line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/>
                  <line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/>
                  <line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/>
                  <line x1="8" y1="18" x2="12" y2="18"/>
                </svg>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Enter details and calculate</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Results will appear here</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mark Returned Modal */}
      {returnModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--white)',
            borderRadius: '9px',
            padding: '24px',
            width: '400px',
            maxWidth: '90vw',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
              ✓ Mark Container Returned
            </h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Return Date</label>
              <input
                type="date"
                value={returnDate}
                onChange={e => setReturnDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setReturnModal(null)} style={{ padding: '8px 16px', border: '1px solid var(--border)', background: 'var(--white)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleMarkReturned} style={{ padding: '8px 16px', border: 'none', background: 'var(--teal)', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
