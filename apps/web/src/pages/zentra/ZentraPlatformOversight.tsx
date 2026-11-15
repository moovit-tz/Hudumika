import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { Spinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { useAuth } from '../../hooks/useAuth.js';
import { apiFetch } from '../../lib/api.js';
import './Zentra.css';

// Field names as GET /v1/zentra/platform/overview returns them.
interface PlatformOverview {
  cross_tenant_events_24h: number;
  cross_tenant_high_risk_signals: number;
  cross_tenant_open_cases: number;
  tenants_with_active_anomalies: number;
  risk_queue: Array<{ id: string; tenant_id: string; tenant_name?: string; app_id: string; title: string; severity: string; created_at: string }>;
  telemetry_gaps: Array<{ app_id: string; name: string; status: string; event_count_24h: number; last_event_at: string | null; tenants_active: number; tenants_silent: number }>;
}

export function ZentraPlatformOversight() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // Drilldown state
  const [targetTenantId, setTargetTenantId] = useState('');
  const [drilldownReason, setDrilldownReason] = useState('');
  const [drilldownData, setDrilldownData] = useState<any | null>(null);
  const [drilling, setDrilling] = useState(false);

  // Reveal sensitive evidence modal
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealEventId, setRevealEventId] = useState('');
  const [revealReason, setRevealReason] = useState('');
  const [revealedPayload, setRevealedPayload] = useState<any | null>(null);
  const [revealing, setRevealing] = useState(false);

  async function loadPlatformOverview() {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/v1/zentra/platform/overview');
      setData(res);
    } catch {
      // handled by apiFetch
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlatformOverview();
  }, [isSuperAdmin]);

  async function handleDrilldown(e: React.FormEvent) {
    e.preventDefault();
    if (!targetTenantId.trim() || !drilldownReason.trim()) return;
    setDrilling(true);
    setDrilldownData(null);
    try {
      const res = await apiFetch(
        `/v1/zentra/platform/tenant/${encodeURIComponent(targetTenantId.trim())}?reason=${encodeURIComponent(drilldownReason.trim())}`
      );
      setDrilldownData(res);
    } finally {
      setDrilling(false);
    }
  }

  async function handleRevealEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!revealEventId || !revealReason.trim()) return;
    setRevealing(true);
    try {
      const res = await apiFetch('/v1/zentra/platform/reveal-evidence', {
        method: 'POST',
        body: JSON.stringify({
          // The tenant being drilled into owns the event.
          tenant_id: targetTenantId.trim(),
          event_id: revealEventId,
          reason: revealReason.trim(),
        }),
      });
      setRevealedPayload(res);
    } finally {
      setRevealing(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Platform Oversight' }]}
          titlePlain="Platform Oversight"
          titleEm="Restricted"
          subtitle="Cross-tenant oversight is restricted to authorized Hudumika Superadmins"
        />
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Icon name="lock" size={32} className="mx-auto mb-3 text-rose-500" />
          <h3 className="font-bold text-foreground">Access Prohibited</h3>
          <p className="mt-1 max-w-md mx-auto">
            You do not have the required platform authority to access cross-tenant audit records or platform telemetry.
          </p>
        </Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Platform Oversight' }]}
        titlePlain="Platform Oversight"
        titleEm="Boundary"
        subtitle="Audited platform-wide oversight across tenants, apps, and telemetry health with mandatory reason tracking"
      />

      {/* Cross-Tenant Metric Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tenants with open signals
          </span>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {data.tenants_with_active_anomalies ?? 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tenants with at least one unresolved risk signal
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Global 24h Events
          </span>
          <div className="mt-2 text-2xl font-bold" style={{ color: 'var(--teal)' }}>
            {(data.cross_tenant_events_24h ?? 0).toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Aggregated across all platform apps
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Global High-Risk Signals
          </span>
          <div className="mt-2 text-2xl font-bold" style={{ color: 'var(--red)' }}>
            {data.cross_tenant_high_risk_signals ?? 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Requiring superadmin or tenant attention
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Investigations
          </span>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {data.cross_tenant_open_cases ?? 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Platform-wide open cases
          </p>
        </Card>
      </div>

      {/* Telemetry per app, counted per tenant */}
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Telemetry by app</h2>
          <p className="text-xs text-muted-foreground">
            A tenant counts as silent when it used an app this week but Zentra has heard nothing from it for 48 hours.
          </p>
        </div>
        {!(data.telemetry_gaps ?? []).length ? (
          <p className="text-xs text-muted-foreground">No app activity in the last 7 days.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-xs zentra-data-table">
              <thead className="bg-muted/50 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr><th className="p-2.5">App</th><th className="p-2.5">Tenants using it (7d)</th><th className="p-2.5">Silent tenants</th><th className="p-2.5">Events (24h)</th><th className="p-2.5">Last event</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.telemetry_gaps.map(a => (
                  <tr key={a.app_id}>
                    <td className="p-2.5 font-semibold text-foreground">{a.name}</td>
                    <td className="p-2.5">{a.tenants_active}</td>
                    <td className="p-2.5">{a.tenants_silent ? <Badge variant="warning">{a.tenants_silent}</Badge> : <Badge variant="success">0</Badge>}</td>
                    <td className="p-2.5">{a.event_count_24h.toLocaleString()}</td>
                    <td className="p-2.5 text-muted-foreground">{a.last_event_at ? new Date(a.last_event_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Tenant Drill-down with Mandatory Justification */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            Tenant Audit Drill-down (Mandatory Reason Required)
          </h2>
          <p className="text-xs text-muted-foreground">
            Every cross-tenant search, drill-down, and evidence access is permanently recorded in the immutable platform audit log.
          </p>
        </div>

        <form onSubmit={handleDrilldown} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Tenant ID *
            </label>
            <input
              required
              type="text"
              value={targetTenantId}
              onChange={e => setTargetTenantId(e.target.value)}
              placeholder="e.g. tenant-uuid-here"
              className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground font-mono"
            />
          </div>

          <div className="flex-[2]">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Regulatory / Security Reason *
            </label>
            <input
              required
              type="text"
              value={drilldownReason}
              onChange={e => setDrilldownReason(e.target.value)}
              placeholder="e.g. Investigating reported cross-tenant authentication anomaly SEC-2026-08"
              className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
            />
          </div>

          <Button type="submit" size="sm" disabled={drilling || !targetTenantId.trim() || !drilldownReason.trim()}>
            {drilling ? 'Auditing & Loading…' : 'Access Tenant Audit Stream'}
          </Button>
        </form>

        {drilldownData && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-foreground">
                Audited Stream for Tenant: <span className="font-mono text-teal-600">{targetTenantId}</span>
              </h3>
              <Badge variant="outline">
                Justification Recorded
              </Badge>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs zentra-data-table">
                <thead className="bg-muted/50 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-2.5">Event</th>
                    <th className="p-2.5">App</th>
                    <th className="p-2.5">When</th>
                    <th className="p-2.5">Resource</th>
                    <th className="p-2.5">Outcome</th>
                    <th className="p-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(drilldownData.events || []).map((ev: any) => (
                    <tr key={ev.id} className="hover:bg-muted/20">
                      <td className="p-2.5 font-semibold text-foreground">{ev.event_name}</td>
                      <td className="p-2.5 uppercase font-bold text-muted-foreground">{ev.app_id}</td>
                      {/* Who did it and the details stay hidden until revealed with a recorded reason. */}
                      <td className="p-2.5 text-muted-foreground whitespace-nowrap">{new Date(ev.created_at).toLocaleString()}</td>
                      <td className="p-2.5 font-mono text-muted-foreground">{ev.resource_type} · {ev.action}</td>
                      <td className="p-2.5">
                        <Badge variant={ev.outcome === 'success' ? 'success' : 'error'}>
                          {ev.outcome}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setRevealEventId(ev.id);
                            setRevealReason('');
                            setRevealedPayload(null);
                            setRevealModalOpen(true);
                          }}
                        >
                          Reveal Evidence
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Reveal Sensitive Evidence Modal */}
      <Dialog open={revealModalOpen} onOpenChange={setRevealModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Explicit Sensitive Evidence Reveal</DialogTitle>
            <DialogDescription>
              Access to full event metadata requires an explicit recorded reason in the permanent platform audit trail.
            </DialogDescription>
          </DialogHeader>

          {!revealedPayload ? (
            <form onSubmit={handleRevealEvidence} className="space-y-3 py-2 text-xs">
              <div>
                <label className="block text-muted-foreground font-semibold mb-1">
                  Target Event ID
                </label>
                <div className="font-mono text-foreground font-semibold">{revealEventId}</div>
              </div>

              <div>
                <label className="block text-muted-foreground font-semibold mb-1">
                  Mandatory Legal or Security Justification *
                </label>
                <textarea
                  required
                  rows={3}
                  value={revealReason}
                  onChange={e => setRevealReason(e.target.value)}
                  placeholder="Record why this sensitive evidence must be decrypted/revealed…"
                  className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRevealModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={revealing || !revealReason.trim()}>
                  {revealing ? 'Recording & Revealing…' : 'Confirm & Reveal Evidence'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 py-2 text-xs">
              <Badge variant="success">Access Logged Permanently</Badge>
              <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11px] text-foreground">
                {JSON.stringify(revealedPayload, null, 2)}
              </pre>
              <div className="text-right">
                <Button size="sm" onClick={() => setRevealModalOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
