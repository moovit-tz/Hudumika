// ─── OndiIntegrations.tsx — Ondi Enterprise · Integrations ──────
// Not a second app browser — Store already owns discovery and installing
// (apps/web/src/pages/Store.tsx). This governs one narrower thing Store
// doesn't: whether an app this tenant already installed is actually
// allowed to receive live event webhooks. tenant_marketplace_installs
// (migration 156) and the dispatcher that reads it already existed —
// nothing ever wrote to it until GET/POST/PATCH/DELETE
// /v1/ondi/org/integrations (ondi.routes.ts).
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface InstalledApp {
  id: string; name: string; developer_name: string; category: string; icon_url: string | null;
  webhook_capable: boolean; events_enabled: boolean; granted_at: string | null; installed_at: string;
}

// GET /org/integrations/overview — a read-only rollup across the platform's
// five real, independent integration registries (SMS gateways, Accounting,
// Calendar sync, and the marketplace webhook grants below; Lens is
// deliberately excluded — internal, SUPER_ADMIN-only tooling with no
// tenant_id at all). Never edited from here: each row's own real management
// page (linked via manageHref) is still where a connection actually gets
// configured — this is only "what's connected, in one place."
interface ConnectionRow {
  category: 'sms' | 'accounting' | 'calendar' | 'marketplace';
  provider: string; label: string; status: 'connected' | 'disconnected' | 'error';
  detail?: string; lastActivityAt: string | null; lastError: string | null; manageHref: string;
}

const CATEGORY_LABEL: Record<ConnectionRow['category'], string> = {
  sms: 'SMS', accounting: 'Accounting', calendar: 'Calendar', marketplace: 'Marketplace',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function AllConnectionsSection() {
  const [rows, setRows] = useState<ConnectionRow[] | null>(null);

  useEffect(() => {
    apiFetch('/v1/ondi/org/integrations/overview').then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionCard padded={false}>
        <div style={{ padding: '14px 20px 4px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>All connections</div>
        <div style={{ padding: '0 20px 14px', fontSize: 11.5, color: 'var(--ink3)' }}>
          Everything actually connected across the platform — SMS, accounting, calendar sync and marketplace apps. Each still lives on and is managed by its own page; this is only where to see it all at once.
        </div>
        {rows === null && <div style={{ padding: '4px 20px 20px', fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {rows?.length === 0 && (
          <div style={{ padding: '4px 20px 20px', fontSize: 13, color: 'var(--ink3)' }}>Nothing connected yet.</div>
        )}
        {rows?.map((row, i, arr) => (
          <div key={`${row.category}-${row.provider}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderTop: '1px solid var(--border)', borderBottom: i === arr.length - 1 ? 'none' : undefined }}>
            <Badge variant="gray">{CATEGORY_LABEL[row.category]}</Badge>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{row.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                {row.detail ?? (row.lastActivityAt ? `Last active ${fmtDate(row.lastActivityAt)}` : 'No activity yet')}
                {row.lastError ? ` · ${row.lastError}` : ''}
              </div>
            </div>
            <Badge variant={row.status === 'connected' ? 'success' : row.status === 'error' ? 'error' : 'gray'}>
              {row.status === 'connected' ? 'Connected' : row.status === 'error' ? 'Error' : 'Disconnected'}
            </Badge>
            <Link to={row.manageHref} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', whiteSpace: 'nowrap' }}>Manage →</Link>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

export const OndiIntegrations: React.FC = () => {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setApps(await apiFetch('/v1/ondi/org/integrations')); } catch { setApps([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function enable(app: InstalledApp) {
    setBusy(app.id);
    try { await apiFetch(`/v1/ondi/org/integrations/${app.id}/enable`, { method: 'POST' }); await reload(); }
    catch (err: any) { showAlert(err.message); } finally { setBusy(null); }
  }

  async function toggle(app: InstalledApp) {
    setBusy(app.id);
    try { await apiFetch(`/v1/ondi/org/integrations/${app.id}`, { method: 'PATCH', body: JSON.stringify({ events_enabled: !app.events_enabled }) }); await reload(); }
    catch (err: any) { showAlert(err.message); } finally { setBusy(null); }
  }

  async function revoke(app: InstalledApp) {
    if (!(await showConfirm(`Stop ${app.name} from receiving your tenant's events?`, { variant: 'warning', confirmLabel: 'Revoke Access' }))) return;
    setBusy(app.id);
    try { await apiFetch(`/v1/ondi/org/integrations/${app.id}`, { method: 'DELETE' }); await reload(); }
    catch (err: any) { showAlert(err.message); } finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Event"
        titleEm="integrations"
        subtitle="Which of your installed apps can receive live activity from this workspace."
      />

      <AllConnectionsSection />

      <div style={{ padding: '2px 4px 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Event webhooks</div>
      <SectionCard padded={false}>
        {apps === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {apps?.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>
            You haven't installed any apps yet — browse the <Link to="/store" style={{ color: 'var(--teal)' }}>Store</Link> to add one.
          </div>
        )}
        {apps?.map((app, i, arr) => (
          <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {app.icon_url ? <img src={app.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="grid" size={18} color="var(--teal)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{app.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                {app.developer_name} · installed {fmtDate(app.installed_at)}
              </div>
            </div>

            {!app.webhook_capable ? (
              <Badge variant="gray">No live events available</Badge>
            ) : app.events_enabled ? (
              <>
                <Badge variant="success">Receiving events {app.granted_at ? `since ${fmtDate(app.granted_at)}` : ''}</Badge>
                <button type="button" disabled={busy === app.id} onClick={() => toggle(app)}
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                  Pause
                </button>
                <button type="button" disabled={busy === app.id} onClick={() => revoke(app)}
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                  Revoke
                </button>
              </>
            ) : (
              <button type="button" disabled={busy === app.id} onClick={() => enable(app)}
                style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                {busy === app.id ? 'Enabling…' : 'Enable event delivery'}
              </button>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default OndiIntegrations;
