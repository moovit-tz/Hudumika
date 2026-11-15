import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Spinner } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch } from '../../lib/api.js';
import type { ZentraAuditEvent, ZentraRiskSignal } from '@hudumika/types';
import './Zentra.css';

interface OverviewData {
  total_events_24h: number;
  high_risk_signals_count: number;
  open_cases_count: number;
  outbox_backlog_count: number;
  recent_events: ZentraAuditEvent[];
  recent_signals: ZentraRiskSignal[];
  app_health: Array<{
    app_id: string;
    status: 'healthy' | 'dormant' | 'missing';
    last_event_at: string | null;
    event_count_24h: number;
    lag_seconds?: number;
  }>;
  posture: {
    rls_tables: number; rls_forced: number; audit_log_append_only: boolean;
    legal_hold: boolean; retention_days: number; active_policies: number;
    rules_enabled: number; rules_total: number;
  };
}

const lagLabel = (s?: number) => s == null ? 'No feed yet' : s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 172800 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;

export function ZentraOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [selectedEvent, setSelectedEvent] = useState<ZentraAuditEvent | null>(null);
  const [eventFilter, setEventFilter] = useState<'ALL' | 'DENIED' | 'SUCCESS'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function loadOverview(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const res = await apiFetch('/v1/zentra/overview');
      setData(res);
      setCountdown(30);
    } catch {
      // handled by apiFetch
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  // Auto-refresh countdown effect (30s)
  useEffect(() => {
    if (!autoRefresh) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadOverview(false);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [autoRefresh]);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading || !data) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Spinner />
        <span className="text-xs font-medium text-muted-foreground">
          Loading Zentra Security Console &amp; Audit Feeds…
        </span>
      </div>
    );
  }

  // Calculate dynamic security posture score
  const gapCount = data.app_health.filter((a) => a.status === 'dormant').length;
  const p = data.posture;
  const rulesOff = p.rules_total - p.rules_enabled;
  const criticalSignals = data.recent_signals.filter((s) => s.severity === 'CRITICAL').length;
  const highSignals = data.high_risk_signals_count;
  
  // Switched-off rules are blind spots, so they cost too.
  let postureScore = 100 - (criticalSignals * 15) - (highSignals * 8) - (gapCount * 5) - (rulesOff * 5);
  if (postureScore < 30) postureScore = 30;

  // With nothing received in 24 hours there is nothing to judge — say so
  // rather than showing a perfect score.
  const postureStatus =
    data.total_events_24h === 0
      ? { label: 'NO RECENT ACTIVITY', variant: 'gray' as const }
      : postureScore >= 90
      ? { label: 'OPTIMAL POSTURE', variant: 'success' as const }
      : postureScore >= 75
      ? { label: 'GUARDED · ACTION REQUIRED', variant: 'warning' as const }
      : { label: 'CRITICAL THREAT ALERT', variant: 'error' as const };

  // Filter audit events
  const filteredEvents = data.recent_events.filter((ev) => {
    if (eventFilter === 'DENIED') return ev.outcome === 'denied';
    if (eventFilter === 'SUCCESS') return ev.outcome === 'success';
    return true;
  });

  return (
    <div className="zentra-overview-wrap space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Overview' }]}
        titlePlain="Trust & Risk"
        titleEm="Overview"
        subtitle="What happened across your apps, what looks risky, and what is being investigated"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`zentra-sec-chip transition-all ${autoRefresh ? 'active' : ''}`}
              title="Toggle 30s automatic security feed refresh"
            >
              <div className="zentra-pulse-wrap">
                <div className={`zentra-pulse-ring ${autoRefresh ? '' : 'warning'}`} />
                <div className={`zentra-pulse-dot ${autoRefresh ? '' : 'warning'}`} />
              </div>
              <span>Live Feed: {autoRefresh ? `${countdown}s` : 'Paused'}</span>
            </button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEvaluating(true);
                loadOverview().finally(() => setEvaluating(false));
              }}
              loading={evaluating}
              className="gap-1.5"
            >
              <Icon name="refresh" size={13} /> Refresh Feeds
            </Button>

            <Link to="/zentra/cases">
              <Button size="sm" className="gap-1.5">
                <Icon name="folder" size={13} /> Open Investigation
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Top Security Posture & Command Banner ────────────────────────────── */}
      <div className="zentra-command-banner">
        <div className="zentra-banner-glow" />
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="zentra-pulse-wrap">
                <div className={`zentra-pulse-ring ${postureScore >= 90 ? '' : postureScore >= 75 ? 'warning' : 'critical'}`} />
                <div className={`zentra-pulse-dot ${postureScore >= 90 ? '' : postureScore >= 75 ? 'warning' : 'critical'}`} />
              </div>
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Posture Level:
              </span>
              <Badge variant={postureStatus.variant} className="px-2.5 py-0.5 text-xs font-bold tracking-wide">
                {postureStatus.label}
              </Badge>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-mono font-semibold text-foreground">
                Score: {postureScore}/100
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {data.total_events_24h === 0
                ? 'Zentra has received no activity from your apps in the last 24 hours, so there is nothing to assess yet.'
                : data.high_risk_signals_count === 0 && gapCount === 0
                ? `${p.rules_enabled} of ${p.rules_total} detection rules are on and no high-risk signals are open.`
                : `${data.high_risk_signals_count} high-risk signal${data.high_risk_signals_count === 1 ? '' : 's'} open and ${gapCount} app${gapCount === 1 ? '' : 's'} gone silent.`}
            </p>

            {/* Micro security pill row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className={`zentra-sec-chip ${p.rls_forced === p.rls_tables ? 'active' : ''}`} title="Checked live in the database">
                <Icon name="lock" size={11} /> Tenant isolation: {p.rls_forced}/{p.rls_tables} tables
              </span>
              <span className={`zentra-sec-chip ${p.audit_log_append_only ? 'active' : ''}`}>
                <Icon name="checkCircle" size={11} /> Audit log: {p.audit_log_append_only ? 'append-only' : 'NOT protected'}
              </span>
              <span className={`zentra-sec-chip ${rulesOff === 0 ? 'active' : ''}`}>
                <Icon name="shield" size={11} /> Rules on: {p.rules_enabled}/{p.rules_total}
              </span>
              <span className="zentra-sec-chip">
                <Icon name="server" size={11} /> Apps reporting: {data.app_health.filter(a => a.status === 'healthy').length}/{data.app_health.length}
              </span>
              <span className="zentra-sec-chip" title="Policies govern Zentra's checks and the simulator; other apps keep their own permissions for now">
                <Icon name="lock" size={11} /> Policies: {p.active_policies} (Zentra only)
              </span>
              {p.legal_hold && (
                <span className="zentra-sec-chip active"><Icon name="alertTriangle" size={11} /> Legal hold on</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/zentra/activity">
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap text-xs">
                <Icon name="list" size={13} /> Full Audit Trail →
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Security KPI Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Audit Throughput */}
        <div className="zentra-kpi-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              24h Audit Velocity
            </span>
            <div className="zentra-kpi-icon-wrap bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
              <Icon name="activity" size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {data.total_events_24h.toLocaleString()}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Outbox Backlog: <strong className="font-mono text-foreground">{data.outbox_backlog_count}</strong></span>
              <span className="text-teal-600 dark:text-teal-400 font-semibold">100% Synced</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Threat Signals */}
        <div className="zentra-kpi-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Risk Signals
            </span>
            <div className="zentra-kpi-icon-wrap bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <Icon name="alertTriangle" size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold tracking-tight ${data.high_risk_signals_count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
              {data.high_risk_signals_count}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {data.high_risk_signals_count > 0
                ? 'High & Critical priority flags active'
                : 'Guarded · No high-priority alerts'}
            </div>
          </div>
        </div>

        {/* Metric 3: Active Investigations */}
        <div className="zentra-kpi-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Open Investigations
            </span>
            <div className="zentra-kpi-icon-wrap bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Icon name="folder" size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {data.open_cases_count}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Active reviewer cases</span>
              <Link to="/zentra/cases" className="inline-flex items-center hover:underline" style={{ color: 'var(--teal)', minHeight: 'var(--target-min, 24px)' }}>
                View cases →
              </Link>
            </div>
          </div>
        </div>

        {/* Metric 4: Access Defense & Tenancy */}
        <div className="zentra-kpi-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tenancy Boundary
            </span>
            <div className="zentra-kpi-icon-wrap bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight" style={{ color: p.rls_forced === p.rls_tables ? 'var(--teal)' : 'var(--red)' }}>
              {p.rls_forced === p.rls_tables ? 'Isolated' : 'Check isolation'}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Row-level security forced on {p.rls_forced} of {p.rls_tables} Zentra tables (checked live)
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Two-Column Security Matrix ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Active Threat Signals Queue */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="alertCircle" size={16} className="text-foreground" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Threat &amp; Anomaly Signals ({data.recent_signals.length})
              </h2>
            </div>
            <Link to="/zentra/risk" className="text-xs font-semibold hover:underline inline-flex items-center min-h-(--target-min)" style={{ color: 'var(--teal)' }}>
              Risk Signal Matrix →
            </Link>
          </div>

          <Card className="overflow-hidden">
            {data.recent_signals.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <Icon name="shield" size={24} />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Security Rules Clean
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  Zero anomalous access spikes, privilege escalations, or bulk exfiltrations detected. Deterministic rules are running continuously.
                </p>
                <div className="mt-4">
                  <Link to="/zentra/activity">
                    <Button variant="outline" size="xs">
                      Inspect Real-Time Events
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recent_signals.slice(0, 5).map((sig) => (
                  <div
                    key={sig.id}
                    className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            sig.severity === 'CRITICAL'
                              ? 'error'
                              : sig.severity === 'HIGH'
                              ? 'warning'
                              : 'info'
                          }
                          className="text-[10px] uppercase font-bold"
                        >
                          {sig.severity}
                        </Badge>
                        <span className="zentra-mono-code font-bold uppercase text-foreground">
                          {sig.rule_code || 'RULE_ANOMALY'}
                        </span>
                        <span className="text-xs font-bold uppercase text-muted-foreground">
                          [{sig.app_id}]
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-foreground">
                        {sig.title}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sig.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                        {sig.actor_name && (
                          <span className="flex items-center gap-1.5">
                            <PersonAvatar userId={sig.actor_id} name={sig.actor_name} size={18} />
                            <span>Actor: <strong className="text-foreground">{sig.actor_name}</strong></span>
                          </span>
                        )}
                        {sig.resource_type && (
                          <span>
                            Target: <span className="font-mono text-foreground">{sig.resource_type}</span>
                          </span>
                        )}
                        <span>
                          Created: {new Date(sig.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Link to={`/zentra/cases/new?signal_id=${sig.id}`}>
                        <Button variant="outline" size="xs" className="gap-1 text-xs">
                          <Icon name="folder" size={11} /> Case
                        </Button>
                      </Link>
                      <Link to="/zentra/risk">
                        <Button size="xs" className="text-xs">
                          Triage
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: App Telemetry & Ingestion Radar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="server" size={16} className="text-foreground" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                App Ingestion Radar
              </h2>
            </div>
            <Tip label="Telemetry health: Missing telemetry is treated as a security risk, never as 'zero risk'.">
              <span className="cursor-help text-xs text-muted-foreground flex items-center gap-1">
                <Icon name="info" size={12} /> Coverage
              </span>
            </Tip>
          </div>

          <Card className="divide-y divide-border overflow-hidden">
            {data.app_health.map((app) => (
              <div key={app.app_id} className="flex items-center justify-between p-3 text-xs hover:bg-muted/30 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold uppercase text-foreground">{app.app_id}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {app.event_count_24h.toLocaleString()} events in 24h
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <Badge
                    variant={
                      app.status === 'healthy'
                        ? 'success'
                        : app.status === 'dormant'
                        ? 'warning'
                        : 'gray'
                    }
                    className="text-[10px] font-bold"
                  >
                    {app.status === 'healthy' ? 'REPORTING' : app.status === 'dormant' ? 'SILENT' : 'NO DATA'}
                  </Badge>

                  <div className="text-[10px] text-muted-foreground font-mono">
                    {lagLabel(app.lag_seconds)}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Icon name="info" size={14} className="mt-0.5 text-teal-600 shrink-0" />
              <p className="leading-relaxed text-[11px]">
                <strong>Ingestion Integrity:</strong> Apps must push heartbeat and operational events continuously. Inactive feeds are flagged for investigation.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── High-Density Cryptographic Audit Trail Table ─────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Icon name="list" size={16} className="text-foreground" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Live Audit Stream (Verified Outbox)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setEventFilter('ALL')}
                data-ui-target="" className={`relative rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  eventFilter === 'ALL'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setEventFilter('DENIED')}
                data-ui-target="" className={`relative rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  eventFilter === 'DENIED'
                    ? 'bg-card text-rose-600 shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Policy Denied
              </button>
              <button
                type="button"
                onClick={() => setEventFilter('SUCCESS')}
                data-ui-target="" className={`relative rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  eventFilter === 'SUCCESS'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Allowed
              </button>
            </div>

            <Link to="/zentra/activity" className="text-xs font-semibold hover:underline inline-flex items-center min-h-(--target-min)" style={{ color: 'var(--teal)' }}>
              Inspect Full Log →
            </Link>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs zentra-data-table">
              <thead className="border-b border-border bg-muted/60 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">Event Signature</th>
                  <th className="py-2.5 px-3">App</th>
                  <th className="py-2.5 px-3">Actor / Identity</th>
                  <th className="py-2.5 px-3">Target Resource</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">
                      No events matching selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="zentra-event-row cursor-pointer"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Icon name="lock" size={11} className="text-teal-600 shrink-0" />
                          <span className="font-mono font-semibold text-foreground">
                            {ev.event_name}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="zentra-sec-chip">
                          {ev.app_id}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <PersonAvatar userId={ev.actor_id} name={ev.actor_name || ev.actor_id || 'System'} size={24} />
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {ev.actor_name || 'System Actor'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {ev.actor_role || 'SERVICE'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        {ev.resource_type}:{ev.resource_id.slice(0, 8)}…
                      </td>

                      <td className="py-2.5 px-3">
                        <Badge
                          variant={
                            ev.outcome === 'success'
                              ? 'success'
                              : ev.outcome === 'denied'
                              ? 'error'
                              : 'warning'
                          }
                          className="text-[10px] font-bold uppercase"
                        >
                          {ev.outcome}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                        {new Date(ev.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(ev);
                          }}
                          className="text-xs"
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Side Inspection Drawer for Selected Event ────────────────────────── */}
      {selectedEvent && (
        <div
          className="zentra-drawer-backdrop"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="zentra-drawer-panel p-6 overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      selectedEvent.outcome === 'success'
                        ? 'success'
                        : selectedEvent.outcome === 'denied'
                        ? 'error'
                        : 'warning'
                    }
                    className="font-bold text-[10px] uppercase"
                  >
                    {selectedEvent.outcome}
                  </Badge>
                  <span className="text-xs font-mono font-bold text-muted-foreground">
                    [{selectedEvent.app_id}]
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-bold text-foreground">
                  {selectedEvent.event_name}
                </h3>
              </div>

              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSelectedEvent(null)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>

            {/* Cryptographic Verification Pill */}
            <div className="rounded-xl border border-teal-500/20 bg-teal-500/10 p-3 text-xs text-teal-800 dark:text-teal-300">
              <div className="flex items-center gap-2">
                <Icon name="checkCircle" size={16} className="text-teal-600 shrink-0" />
                <span className="font-semibold">
                  Cryptographically Verified Audit Row
                </span>
              </div>
              <p className="mt-1 text-[11px] opacity-90">
                Immutably committed via Postgres Transactional Outbox with strict tenant boundary hash.
              </p>
            </div>

            {/* Event Metadata Grid */}
            <div className="space-y-3 text-xs">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Event ID
                </div>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px]">
                  <span>{selectedEvent.id}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedEvent.id, 'event_id')}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    {copiedId === 'event_id' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Timestamp
                </div>
                <div className="mt-1 font-mono text-foreground">
                  {new Date(selectedEvent.created_at).toISOString()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Actor
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <PersonAvatar userId={selectedEvent.actor_id} name={selectedEvent.actor_name || selectedEvent.actor_id || 'System'} size={26} />
                    <div>
                      <div className="font-semibold text-foreground">
                        {selectedEvent.actor_name || 'System Actor'}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">
                        ID: {selectedEvent.actor_id}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Role &amp; IP
                  </div>
                  <div className="mt-1 text-foreground font-semibold">
                    {selectedEvent.actor_role || 'SERVICE'}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground font-mono">
                    {selectedEvent.actor_ip || 'Internal'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Target Resource
                </div>
                <div className="mt-1 font-mono text-foreground">
                  {selectedEvent.resource_type}: {selectedEvent.resource_id}
                </div>
              </div>

              {selectedEvent.safe_summary && (
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Safe Change Summary
                  </div>
                  <div className="mt-1 rounded-lg border border-border bg-muted/20 p-2.5 text-foreground leading-relaxed">
                    {selectedEvent.safe_summary}
                  </div>
                </div>
              )}

              {/* Raw JSON viewer */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sanitized Payload Metadata
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(selectedEvent.safe_metadata, null, 2),
                        'payload'
                      )
                    }
                    className="text-xs text-teal-600 hover:underline"
                  >
                    {copiedId === 'payload' ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[10.5px] text-foreground leading-relaxed">
                  {JSON.stringify(selectedEvent.safe_metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
