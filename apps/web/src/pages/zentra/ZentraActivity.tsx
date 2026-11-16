import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { Spinner } from '../../components/ui/spinner.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import type { ZentraAuditEvent } from '@hudumika/types';
import './Zentra.css';

export function ZentraActivity() {
  const lastQuery = useRef('');
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  const [events, setEvents] = useState<ZentraAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState<string>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [timePreset, setTimePreset] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [activeEvent, setActiveEvent] = useState<ZentraAuditEvent | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const limit = 25;

  async function loadEvents(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (search) params.append('search', search);
      if (selectedApp !== 'all') params.append('app_id', selectedApp);
      if (selectedOutcome !== 'all') params.append('outcome', selectedOutcome);

      // Time preset calculation
      if (timePreset === '24h') {
        params.append('start_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      } else if (timePreset === '7d') {
        params.append('start_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      } else if (timePreset === '30d') {
        params.append('start_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      }

      { const forExport = new URLSearchParams(params); forExport.delete('limit'); forExport.delete('offset'); lastQuery.current = forExport.toString(); }
      const res = await apiFetch(`/v1/zentra/activity?${params.toString()}`);
      setEvents(res.events || []);
      setTotal(res.total || 0);
      setCountdown(30);
    } catch {
      // handled by apiFetch
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, [page, selectedApp, selectedOutcome, timePreset]);

  // Auto-refresh countdown effect (30s)
  useEffect(() => {
    if (!autoRefresh) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadEvents(false);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [autoRefresh, page, selectedApp, selectedOutcome, timePreset, search]);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Quick forensic filter actions from drawer
  function filterByActor(actorId: string) {
    setSearch(actorId);
    setPage(1);
    setActiveEvent(null);
  }

  function filterByCorrelation(corrId: string) {
    setSearch(corrId);
    setPage(1);
    setActiveEvent(null);
  }

  // Export handlers
  function exportAuditData(format: 'json' | 'csv') {
    if (events.length === 0) return;
    const dateStr = new Date().toISOString().slice(0, 10);
    let blob: Blob;
    let filename = `zentra-audit-log-${dateStr}.${format}`;

    if (format === 'json') {
      blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    } else {
      const headers = ['Timestamp', 'Event', 'App', 'Actor', 'Role', 'Target Resource', 'Outcome', 'Summary'];
      const rows = events.map((ev) => [
        `"${new Date(ev.created_at).toISOString()}"`,
        `"${ev.event_name}"`,
        `"${ev.app_id}"`,
        `"${(ev.actor_name || ev.actor_id).replace(/"/g, '""')}"`,
        `"${ev.actor_role || ''}"`,
        `"${ev.resource_type}:${ev.resource_id}"`,
        `"${ev.outcome}"`,
        `"${(ev.safe_summary || '').replace(/"/g, '""')}"`,
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  // Calculate live breakdown metrics from current page
  const deniedCount = events.filter((e) => e.outcome === 'denied').length;
  const successCount = events.filter((e) => e.outcome === 'success').length;
  const failureCount = events.filter((e) => e.outcome === 'failure').length;
  const uniqueAppsCount = new Set(events.map((e) => e.app_id)).size;

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedApp !== 'all' ||
    selectedOutcome !== 'all' ||
    timePreset !== 'all';

  function resetFilters() {
    setSearch('');
    setSelectedApp('all');
    setSelectedOutcome('all');
    setTimePreset('all');
    setPage(1);
  }

  // Helper for event signature icon
  function getEventIcon(eventName: string, outcome: string) {
    if (outcome === 'denied') return 'shield';
    if (eventName.includes('login') || eventName.includes('role') || eventName.includes('permission')) return 'lock';
    if (eventName.includes('payment') || eventName.includes('invoice') || eventName.includes('price')) return 'activity';
    if (eventName.includes('shipment') || eventName.includes('customs')) return 'server';
    if (eventName.includes('export') || eventName.includes('read')) return 'fileText';
    return 'terminal';
  }

  return (
    <div className="zentra-overview-wrap space-y-6 pb-16">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Audit Activity' }]}
        titlePlain="Audit Activity"
        titleEm="Trail"
        subtitle="Every recorded action across your apps. Append-only, kept for your retention period."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Feed Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`zentra-sec-chip transition-all ${autoRefresh ? 'active' : ''}`}
              title="Toggle automatic audit feed polling"
            >
              <div className="zentra-pulse-wrap">
                <div className={`zentra-pulse-ring ${autoRefresh ? '' : 'warning'}`} />
                <div className={`zentra-pulse-dot ${autoRefresh ? '' : 'warning'}`} />
              </div>
              <span>Live Stream: {autoRefresh ? `${countdown}s` : 'Paused'}</span>
            </button>
            <Button variant="outline" size="sm" className="gap-1.5" loading={exporting}
              onClick={() => { setExporting(true); apiDownload(`/v1/zentra/activity/export.csv?${lastQuery.current}`, `zentra-audit-${new Date().toISOString().slice(0, 10)}.csv`).finally(() => setExporting(false)); }}>
              <Icon name="download" size={13} /> Export CSV
            </Button>

            {/* Export Dropdown / Buttons */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportAuditData('csv')}
                className="gap-1.5 text-xs h-8"
                title="Export visible records as CSV"
              >
                <Icon name="fileText" size={12} /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportAuditData('json')}
                className="gap-1.5 text-xs h-8"
                title="Export visible records as JSON"
              >
                <Icon name="terminal" size={12} /> JSON
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => loadEvents()}
              className="gap-1.5 text-xs h-8"
            >
              <Icon name="refresh" size={12} /> Refresh
            </Button>
          </div>
        }
      />

      {/* ── Top SOC Operational Stat Strip ───────────────────────────────────── */}
      <div className="zentra-stat-strip">
        {/* Stat 1: Total Indexed Events */}
        <div className="zentra-stat-box">
          <div className="space-y-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Indexed Events
            </span>
            <div className="text-xl font-bold tracking-tight text-foreground font-mono">
              {total.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {events.length} shown on current page
            </div>
          </div>
          <div className="zentra-kpi-icon-wrap bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
            <Icon name="activity" size={17} />
          </div>
        </div>

        {/* Stat 2: Denied / Policy Blocks */}
        <div className={`zentra-stat-box ${deniedCount > 0 ? 'alert' : ''}`}>
          <div className="space-y-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Policy Denials (Page)
            </span>
            <div className={`text-xl font-bold tracking-tight font-mono ${deniedCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
              {deniedCount}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {deniedCount > 0 ? 'Blocked tamper / unauthorized attempts' : 'Zero unauthorized attempts'}
            </div>
          </div>
          <div className={`zentra-kpi-icon-wrap ${deniedCount > 0 ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400' : 'bg-muted text-muted-foreground'}`}>
            <Icon name="shield" size={17} />
          </div>
        </div>

        {/* Stat 3: Outbox Ledger Guarantee */}
        <div className="zentra-stat-box">
          <div className="space-y-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Ledger Integrity
            </span>
            <div className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
              100% Synced
            </div>
            <div className="text-[10px] text-muted-foreground">
              Transactional Postgres Outbox
            </div>
          </div>
          <div className="zentra-kpi-icon-wrap bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Icon name="checkCircle" size={17} />
          </div>
        </div>

        {/* Stat 4: App Coverage */}
        <div className="zentra-stat-box">
          <div className="space-y-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              App Sources In View
            </span>
            <div className="text-xl font-bold tracking-tight text-foreground font-mono">
              {uniqueAppsCount} Apps
            </div>
            <div className="text-[10px] text-muted-foreground">
              Active streaming telemetry
            </div>
          </div>
          <div className="zentra-kpi-icon-wrap bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Icon name="server" size={17} />
          </div>
        </div>
      </div>

      {/* ── Advanced Search & Filter Console ─────────────────────────────────── */}
      <Card className="p-3.5 space-y-3">
        {/* Search input */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchToolbar
              search={search}
              onSearch={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search event signatures, actor names, target resource IDs, IP addresses, or correlation hashes…"
            />
          </div>

          {/* Quick Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* App Filter */}
            <select
              value={selectedApp}
              onChange={(e) => {
                setSelectedApp(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
            >
              <option value="all">All Applications</option>
              <option value="clearos">ClearOS (Customs)</option>
              <option value="finops">FinOps (Finance)</option>
              <option value="complyos">ComplyOS (Regulatory)</option>
              <option value="nexushr">Axis (People)</option>
              <option value="bliss">Bliss (Support &amp; Voice)</option>
              <option value="seal">SEAL (Warehouse)</option>
              <option value="auth">Auth &amp; IAM</option>
              <option value="studio">Workflow Studio</option>
              <option value="admin">Platform Admin</option>
            </select>

            {/* Time Presets */}
            <select
              value={timePreset}
              onChange={(e) => {
                setTimePreset(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground font-mono"
            >
              <option value="all">Time: All History</option>
              <option value="24h">Time: Past 24 Hours</option>
              <option value="7d">Time: Past 7 Days</option>
              <option value="30d">Time: Past 30 Days</option>
            </select>
          </div>
        </div>

        {/* Outcome Segmented Controls & Active Filter Summary */}
        <div className="flex flex-col gap-2 pt-1 border-t border-border sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
              Outcome:
            </span>
            <div className="zentra-segmented-bar">
              <button
                type="button"
                onClick={() => {
                  setSelectedOutcome('all');
                  setPage(1);
                }}
                className={`zentra-segmented-btn ${selectedOutcome === 'all' ? 'active' : ''}`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedOutcome('success');
                  setPage(1);
                }}
                className={`zentra-segmented-btn ${selectedOutcome === 'success' ? 'active' : ''}`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                Allowed ({successCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedOutcome('denied');
                  setPage(1);
                }}
                className={`zentra-segmented-btn ${selectedOutcome === 'denied' ? 'active-denied' : ''}`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
                Denied ({deniedCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedOutcome('failure');
                  setPage(1);
                }}
                className={`zentra-segmented-btn ${selectedOutcome === 'failure' ? 'active' : ''}`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                Error ({failureCount})
              </button>
            </div>
          </div>

          {/* Reset Filters Chip */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-[11px] text-muted-foreground">Filtered query active</span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-rose-600 hover:underline flex items-center gap-1"
              >
                <Icon name="x" size={12} /> Clear all filters
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Main SOC Audit Events Table ──────────────────────────────────────── */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Spinner />
            <span className="text-xs text-muted-foreground font-mono">
              Loading cryptographic audit ledger…
            </span>
          </div>
        ) : events.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Icon name="search" size={24} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              No Audit Records Found
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              No audit events matched your search query or filter criteria. Try adjusting your search keywords or resetting active filters.
            </p>
            {hasActiveFilters && (
              <div className="mt-4">
                <Button size="xs" variant="outline" onClick={resetFilters}>
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs zentra-data-table">
              <thead className="border-b border-border bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC/Local)</th>
                  <th className="py-2.5 px-3">Event Signature</th>
                  <th className="py-2.5 px-3">App</th>
                  <th className="py-2.5 px-3">Actor / Identity</th>
                  <th className="py-2.5 px-3">Target Resource</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Safe Change Summary</th>
                  <th className="py-2.5 px-3 text-right">Forensic Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((ev) => {
                  const initials = (ev.actor_name || ev.actor_id || 'SY')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  const appClass = ev.app_id.toLowerCase();

                  return (
                    <tr
                      key={ev.id}
                      onClick={() => setActiveEvent(ev)}
                      className="zentra-event-row cursor-pointer"
                    >
                      {/* Timestamp */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Icon name="lock" size={11} className="text-teal-600 shrink-0" />
                          <span>
                            {new Date(ev.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="text-[9.5px] text-muted-foreground/80 pl-4">
                          {new Date(ev.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </td>

                      {/* Event Signature */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            name={getEventIcon(ev.event_name, ev.outcome) as any}
                            size={12}
                            className={ev.outcome === 'denied' ? 'text-rose-600 shrink-0' : 'text-teal-600 shrink-0'}
                          />
                          <span className="font-mono font-semibold text-foreground">
                            {ev.event_name}
                          </span>
                        </div>
                      </td>

                      {/* App Tag */}
                      <td className="py-2.5 px-3">
                        <span className={`zentra-app-tag ${appClass}`}>
                          {ev.app_id}
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <PersonAvatar userId={ev.actor_id} name={ev.actor_name || ev.actor_id || 'System'} size={24} />
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {ev.actor_name || ev.actor_id}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {ev.actor_role || 'SERVICE'} {ev.actor_ip ? `• ${ev.actor_ip}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Target Resource */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-foreground">{ev.resource_type}:</span>
                          <span>{ev.resource_id.slice(0, 8)}…</span>
                        </div>
                      </td>

                      {/* Outcome */}
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={
                            ev.outcome === 'success'
                              ? 'success'
                              : ev.outcome === 'denied'
                              ? 'error'
                              : 'warning'
                          }
                          className="text-[10px] uppercase font-bold"
                        >
                          {ev.outcome === 'success' ? 'ALLOWED' : ev.outcome === 'denied' ? 'BLOCKED' : ev.outcome}
                        </Badge>
                      </td>

                      {/* Safe Summary */}
                      <td className="py-2.5 px-3 max-w-xs truncate text-muted-foreground">
                        {ev.safe_summary || 'Operational mutation recorded.'}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveEvent(ev);
                          }}
                          className="text-xs"
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination Footer ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-[11px]">
            Showing <strong className="text-foreground">{events.length}</strong> of{' '}
            <strong className="text-foreground">{total.toLocaleString()}</strong> events
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="gap-1 font-semibold"
            >
              <Icon name="chevronLeft" size={12} /> Previous
            </Button>

            <span className="px-2 font-mono font-semibold text-foreground text-[11px]">
              Page {page} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1 font-semibold"
            >
              Next <Icon name="chevronRight" size={12} />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Slide-Out Forensic Inspection Drawer ─────────────────────────────── */}
      {activeEvent && (
        <div
          className="zentra-drawer-backdrop"
          onClick={() => setActiveEvent(null)}
        >
          <div
            className="zentra-drawer-panel p-6 overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Top Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      activeEvent.outcome === 'success'
                        ? 'success'
                        : activeEvent.outcome === 'denied'
                        ? 'error'
                        : 'warning'
                    }
                    className="font-bold text-[10px] uppercase"
                  >
                    {activeEvent.outcome === 'success' ? 'ALLOWED' : activeEvent.outcome === 'denied' ? 'BLOCKED' : activeEvent.outcome}
                  </Badge>
                  <span className={`zentra-app-tag ${activeEvent.app_id.toLowerCase()}`}>
                    {activeEvent.app_id}
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-bold text-foreground font-mono">
                  {activeEvent.event_name}
                </h3>
              </div>

              <Button
                variant="ghost"
                size="xs"
                onClick={() => setActiveEvent(null)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>

            {/* Cryptographic Ledger Certificate Card */}
            <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 p-3.5 text-xs text-teal-900 dark:text-teal-200">
              <div className="flex items-center gap-2 font-semibold">
                <Icon name="checkCircle" size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Verified Non-Repudiable Audit Row</span>
              </div>
              <p className="mt-1 text-[11px] opacity-90 leading-relaxed">
                Synchronously written via Postgres Transactional Outbox. Partitioned and isolated to tenant session context with strict RLS enforcement.
              </p>
            </div>

            {/* Event Hashes & Identifiers */}
            <div className="space-y-3.5 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Event Record Hash (ID)
                </div>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px]">
                  <span>{activeEvent.id}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activeEvent.id, 'event_id')}
                    className="text-xs text-teal-600 hover:underline font-semibold"
                  >
                    {copiedId === 'event_id' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {activeEvent.correlation_id && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Correlation / Trace ID
                    </span>
                    <button
                      type="button"
                      onClick={() => filterByCorrelation(activeEvent.correlation_id!)}
                      className="text-[10.5px] text-teal-600 hover:underline font-semibold"
                    >
                      Filter by this correlation ID →
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px]">
                    <span>{activeEvent.correlation_id}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeEvent.correlation_id!, 'corr_id')}
                      className="text-xs text-teal-600 hover:underline font-semibold"
                    >
                      {copiedId === 'corr_id' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Actor Dossier */}
              <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Actor Identity &amp; Origin
                  </span>
                  <button
                    type="button"
                    onClick={() => filterByActor(activeEvent.actor_id)}
                    className="text-[10.5px] text-teal-600 hover:underline font-semibold"
                  >
                    Filter by actor →
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10.5px] text-muted-foreground">Name:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <PersonAvatar userId={activeEvent.actor_id} name={activeEvent.actor_name || activeEvent.actor_id || 'System'} size={26} />
                      <div>
                        <div className="font-semibold text-foreground">
                          {activeEvent.actor_name || 'System Actor'}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {activeEvent.actor_id}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10.5px] text-muted-foreground">Role &amp; IP:</span>
                    <div className="font-semibold text-foreground font-mono">
                      {activeEvent.actor_role || 'SERVICE'}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      IP: {activeEvent.actor_ip || 'Internal Socket'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Target Resource & Action */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Target Resource
                  </span>
                  <div className="font-mono font-semibold text-foreground mt-0.5">
                    {activeEvent.resource_type}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground truncate">
                    ID: {activeEvent.resource_id}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Action Executed
                  </span>
                  <div className="font-mono font-semibold text-foreground mt-0.5">
                    {activeEvent.action}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    Schema: v{activeEvent.schema_version}
                  </div>
                </div>
              </div>

              {/* Safe Change Summary */}
              {activeEvent.safe_summary && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Safe Change Summary
                  </div>
                  <div className="mt-1 rounded-lg border border-border bg-muted/20 p-3 text-foreground leading-relaxed text-xs">
                    {activeEvent.safe_summary}
                  </div>
                </div>
              )}

              {/* Raw JSON viewer */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sanitized Payload Metadata
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(activeEvent.safe_metadata, null, 2),
                        'meta_json'
                      )
                    }
                    className="text-xs text-teal-600 hover:underline font-semibold"
                  >
                    {copiedId === 'meta_json' ? 'Copied!' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[10.5px] text-foreground leading-relaxed">
                  {JSON.stringify(activeEvent.safe_metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-border flex items-center justify-between gap-2">
              <Link to={`/zentra/cases/new?evidence_id=${activeEvent.id}`}>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                >
                  <Icon name="alertTriangle" size={12} /> Open Investigation Case
                </Button>
              </Link>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveEvent(null)}
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
