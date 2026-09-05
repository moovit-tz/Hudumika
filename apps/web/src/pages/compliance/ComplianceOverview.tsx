import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { useIsDarkMode } from '../../hooks/useIsDarkMode.js';
import { SectionCard } from '../../components/SectionCard.js';

interface CheckLogRow {
  id: string;
  hs_code: string;
  hs_description: string | null;
  origin_country: string;
  total_checks: number;
  required_count: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at: string;
}

interface WizardHistoryRow {
  id: string;
  created_at: string;
  procedure_id: string;
  procedure_name: string;
  procedure_kind: string;
}

type HistorySortKey = 'type' | 'query' | 'result' | 'time';

interface HistoryRow {
  id: string;
  type: 'Quick' | 'Advanced';
  query: string;
  detail: string;
  result: string;
  resultVariant: 'error' | 'warning' | 'success' | 'brand' | 'gray';
  created_at: string;
  openHref: string;
}

const riskBadge = (r: string): 'error' | 'warning' | 'success' => r === 'HIGH' ? 'error' : r === 'MEDIUM' ? 'warning' : 'success';

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isThisMonth = (iso: string) => {
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

const KIND_COLOR: Record<string, string> = {
  IMPORT: 'blue', EXPORT: 'green', TRANSIT: 'gold', REGISTRATION: 'teal',
};

export function ComplianceOverview() {
  const navigate = useNavigate();
  const isDark = useIsDarkMode();
  const [checkLog, setCheckLog] = useState<CheckLogRow[] | null>(null);
  const [wizardLog, setWizardLog] = useState<WizardHistoryRow[] | null>(null);
  const [wizardUsage, setWizardUsage] = useState<{ used: number; limit: number | null } | null>(null);

  useEffect(() => {
    apiFetch('/v1/customs/compliance-check/history').then(r => setCheckLog(Array.isArray(r) ? r : [])).catch(() => setCheckLog([]));
    apiFetch('/v1/customs/trade-wizard/history').then(r => setWizardLog(Array.isArray(r) ? r : [])).catch(() => setWizardLog([]));
    apiFetch('/v1/customs/trade-wizard/usage').then(setWizardUsage).catch(() => {});
  }, []);

  const loading = checkLog === null || wizardLog === null;

  // Theme-resolved chart colors (SVG fill/stroke need concrete hex, not var()).
  const C = useMemo(() => ({
    teal: isDark ? '#6c8ec4' : '#0b1e3a',
    gold: isDark ? '#c8920a' : '#9a6700',
    red:  isDark ? '#e84040' : '#cf222e',
    green: isDark ? '#10b981' : '#059669',
    blue: isDark ? '#4a9ef5' : '#0550ae',
    gridLine: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    axisText: isDark ? '#94a3b8' : '#94a3b8',
    tooltipBg: isDark ? '#151c26' : '#fff',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  }), [isDark]);

  const checksThisMonth = (checkLog ?? []).filter(c => isThisMonth(c.created_at));
  const highRiskThisMonth = checksThisMonth.filter(c => c.risk_level === 'HIGH');
  const wizardRunsThisMonth = (wizardLog ?? []).filter(w => isThisMonth(w.created_at));

  const metrics = [
    { label: 'Quick Checks This Month', value: checksThisMonth.length, icon: 'shield', variant: 'brand' as const },
    { label: 'High-Risk Results', value: highRiskThisMonth.length, icon: 'alertTriangle', variant: 'error' as const },
    { label: 'Wizard Runs This Month', value: wizardRunsThisMonth.length, icon: 'compass', variant: 'brand' as const },
    {
      label: 'Wizard Search Quota',
      value: wizardUsage ? (wizardUsage.limit === null ? '∞' : `${wizardUsage.used}/${wizardUsage.limit}`) : '—',
      icon: 'search', variant: 'info' as const,
    },
  ];

  // ── Activity trend: last 14 days, quick checks vs wizard runs ──
  const trend = useMemo(() => {
    const days: { key: string; label: string; checks: number; wizard: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), checks: 0, wizard: 0 });
    }
    const byKey = new Map(days.map(d => [d.key, d]));
    for (const c of checkLog ?? []) {
      const row = byKey.get(dayKey(c.created_at));
      if (row) row.checks += 1;
    }
    for (const w of wizardLog ?? []) {
      const row = byKey.get(dayKey(w.created_at));
      if (row) row.wizard += 1;
    }
    return days;
  }, [checkLog, wizardLog]);

  const hasTrendData = trend.some(d => d.checks > 0 || d.wizard > 0);

  // ── Risk level breakdown (all history, not just this month) ──
  const riskBreakdown = useMemo(() => {
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const c of checkLog ?? []) counts[c.risk_level] = (counts[c.risk_level] ?? 0) + 1;
    return [
      { name: 'Low', value: counts.LOW, color: C.green },
      { name: 'Medium', value: counts.MEDIUM, color: C.gold },
      { name: 'High', value: counts.HIGH, color: C.red },
    ];
  }, [checkLog, C]);
  const totalChecks = riskBreakdown.reduce((s, r) => s + r.value, 0);

  // ── Wizard runs by procedure kind ──
  const kindBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of wizardLog ?? []) counts.set(w.procedure_kind, (counts.get(w.procedure_kind) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([kind, value]) => ({ kind, value, color: C[KIND_COLOR[kind] as keyof typeof C] ?? C.teal }))
      .sort((a, b) => b.value - a.value);
  }, [wizardLog, C]);

  const quotaPct = wizardUsage && wizardUsage.limit ? Math.min(100, Math.round((wizardUsage.used / wizardUsage.limit) * 100)) : 0;

  // ── Unified, sortable, labeled history — Quick Checks + Wizard Runs together ──
  const [sortKey, setSortKey] = useState<HistorySortKey>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: HistorySortKey) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortDir('desc'); }
  }

  const historyRows = useMemo<HistoryRow[]>(() => {
    const quick: HistoryRow[] = (checkLog ?? []).map(c => ({
      id: `q-${c.id}`,
      type: 'Quick',
      query: `HS ${c.hs_code}`,
      detail: `from ${c.origin_country}`,
      result: c.risk_level,
      resultVariant: riskBadge(c.risk_level),
      created_at: c.created_at,
      openHref: `/clearos/compliance/quick?hs=${encodeURIComponent(c.hs_code)}&origin=${encodeURIComponent(c.origin_country)}`,
    }));
    const advanced: HistoryRow[] = (wizardLog ?? []).map(w => ({
      id: `w-${w.id}`,
      type: 'Advanced',
      query: w.procedure_name,
      detail: '',
      result: w.procedure_kind,
      resultVariant: 'brand',
      created_at: w.created_at,
      openHref: `/clearos/compliance/advanced?procedure=${w.procedure_id}`,
    }));
    const rows = [...quick, ...advanced];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'type':   return dir * a.type.localeCompare(b.type);
        case 'query':  return dir * a.query.localeCompare(b.query);
        case 'result': return dir * a.result.localeCompare(b.result);
        default:       return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
    return rows;
  }, [checkLog, wizardLog, sortKey, sortDir]);

  function SortHeader({ label, k, style }: { label: string; k: HistorySortKey; style?: React.CSSProperties }) {
    const active = sortKey === k;
    return (
      <div
        onClick={() => toggleSort(k)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', color: active ? 'var(--ink)' : 'var(--ink3)', fontWeight: active ? 700 : 600, ...style }}
      >
        {label}
        <Icon name={active && sortDir === 'asc' ? 'chevronUp' : 'chevronDown'} size={11} color={active ? 'var(--teal)' : 'var(--ink4)'} style={{ opacity: active ? 1 : 0.4 }} />
      </div>
    );
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14,
    boxShadow: 'var(--elev-lg)',
  };

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
            <FeaturedIcon variant={m.variant} size="md" shape="square"><Icon name={m.icon as IconName} size={18} /></FeaturedIcon>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{m.value}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigate('/clearos/compliance/quick')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Icon name="shield" size={14} color="currentColor" /> Run a Quick Check
        </button>
        <button type="button" onClick={() => navigate('/clearos/compliance/advanced')} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Icon name="compass" size={14} color="var(--teal)" /> Open Advanced Wizard
        </button>
      </div>

      {/* ── Charts row: activity trend (wide) + risk donut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
        <SectionCard title="Activity — last 14 days">
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>Quick checks vs. guided wizard runs, by day.</div>
          {loading ? (
            <SectionLoading />
          ) : !hasTrendData ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No activity in the last 14 days.</div>
          ) : (
            <div style={{ height: 220, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="checksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.teal} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="wizardGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.blue} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={C.gridLine} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} interval={2} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} allowDecimals={false} width={24} />
                  <RechartsTooltip
                    contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--ink)', fontWeight: 700, marginBottom: 2 }}
                  />
                  <Area type="monotone" dataKey="checks" name="Quick Checks" stroke={C.teal} strokeWidth={2} fillOpacity={1} fill="url(#checksGrad)" />
                  <Area type="monotone" dataKey="wizard" name="Wizard Runs" stroke={C.blue} strokeWidth={2} fillOpacity={1} fill="url(#wizardGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: C.teal, display: 'inline-block' }} /> Quick Checks
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue, display: 'inline-block' }} /> Wizard Runs
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Risk breakdown">
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>All quick-check results, by risk level.</div>
          {loading ? (
            <SectionLoading />
          ) : totalChecks === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12.5, minHeight: 160 }}>No checks run yet.</div>
          ) : (
            <>
              <div style={{ height: 150, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskBreakdown} innerRadius={44} outerRadius={68} paddingAngle={2} dataKey="value" stroke="none">
                      {riskBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{totalChecks}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)' }}>checks</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {riskBreakdown.map(r => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--ink2)' }}>{r.name}</span>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.value}</span>
                    <span style={{ color: 'var(--ink4)', width: 34, textAlign: 'right' }}>{totalChecks > 0 ? Math.round((r.value / totalChecks) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Second charts row: wizard runs by kind + quota gauge ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, marginBottom: 24 }}>
        <SectionCard title="Wizard runs by type">
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>What the team has been searching for.</div>
          {loading ? (
            <SectionLoading />
          ) : kindBreakdown.length === 0 ? (
            <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No wizard runs yet.</div>
          ) : (
            <div style={{ height: 150, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kindBreakdown} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={C.gridLine} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} allowDecimals={false} />
                  <YAxis type="category" dataKey="kind" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)', fontWeight: 600 }} width={100} />
                  <RechartsTooltip
                    contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: C.gridLine }}
                  />
                  <Bar dataKey="value" name="Runs" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {kindBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Wizard search quota">
          {wizardUsage?.limit === null ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 8 }}>Unlimited searches on your plan.</div>
          ) : wizardUsage ? (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '4px 0 14px' }}>Resets at the start of next month.</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{wizardUsage.used}</span>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>/ {wizardUsage.limit} used</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, width: `${quotaPct}%`,
                  background: quotaPct >= 90 ? C.red : quotaPct >= 70 ? C.gold : C.teal,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 6 }}>{quotaPct}% of monthly quota used</div>
            </>
          ) : (
            <SectionLoading />
          )}
        </SectionCard>
      </div>

      {/* Unified, sortable history — Quick Checks + Wizard Runs together, each labeled by type */}
      <SectionCard
        title="Recent activity"
        padded={false}
        action={<span style={{ fontSize: 11.5, color: 'var(--ink4)' }}>Click a row to reopen and customize it</span>}
      >
        {loading ? (
          <SectionLoading />
        ) : historyRows.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12.5, color: 'var(--ink3)' }}>No compliance activity yet — run a Quick Check or the Advanced Wizard.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11 }}><SortHeader label="Type" k="type" /></th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11 }}><SortHeader label="Query" k="query" /></th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11 }}><SortHeader label="Result" k="result" /></th>
                  <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 11 }}><SortHeader label="Time" k="time" style={{ justifyContent: 'flex-end' }} /></th>
                  <th style={{ padding: '10px 18px', width: 1 }} />
                </tr>
              </thead>
              <tbody>
                {historyRows.slice(0, 20).map(r => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(r.openHref)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '11px 18px' }}>
                      <Badge variant={r.type === 'Quick' ? 'info' : 'brand'}>{r.type}</Badge>
                    </td>
                    <td style={{ padding: '11px 12px', minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{r.query}</div>
                      {r.detail && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.detail}</div>}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <Badge variant={r.resultVariant}>{r.result}</Badge>
                    </td>
                    <td style={{ padding: '11px 18px', fontSize: 11, color: 'var(--ink4)', textAlign: 'right', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</td>
                    <td style={{ padding: '11px 18px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--teal)' }}>
                        Open <Icon name="chevronRight" size={13} color="var(--teal)" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
