// ─── OneIdIntegrations.tsx — Ondi Enterprise · Integrations ──────
// Not a second app browser — Store already owns discovery and installing
// (apps/web/src/pages/Store.tsx). This governs one narrower thing Store
// doesn't: whether an app this tenant already installed is actually
// allowed to receive live event webhooks. tenant_marketplace_installs
// (migration 156) and the dispatcher that reads it already existed —
// nothing ever wrote to it until GET/POST/PATCH/DELETE
// /v1/oneid/org/integrations (oneid.routes.ts).
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

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OneIdIntegrations: React.FC = () => {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setApps(await apiFetch('/v1/oneid/org/integrations')); } catch { setApps([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function enable(app: InstalledApp) {
    setBusy(app.id);
    try { await apiFetch(`/v1/oneid/org/integrations/${app.id}/enable`, { method: 'POST' }); await reload(); }
    catch (err: any) { showAlert(err.message); } finally { setBusy(null); }
  }

  async function toggle(app: InstalledApp) {
    setBusy(app.id);
    try { await apiFetch(`/v1/oneid/org/integrations/${app.id}`, { method: 'PATCH', body: JSON.stringify({ events_enabled: !app.events_enabled }) }); await reload(); }
    catch (err: any) { showAlert(err.message); } finally { setBusy(null); }
  }

  async function revoke(app: InstalledApp) {
    if (!(await showConfirm(`Stop ${app.name} from receiving your tenant's events?`, { variant: 'warning', confirmLabel: 'Revoke Access' }))) return;
    setBusy(app.id);
    try { await apiFetch(`/v1/oneid/org/integrations/${app.id}`, { method: 'DELETE' }); await reload(); }
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

export default OneIdIntegrations;
