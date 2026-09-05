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
        <div style={{ padding: '16px 20px 4px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>All Connected Services</div>
        <div style={{ padding: '0 20px 14px', fontSize: 12, color: 'var(--ink3)' }}>
          Rollup across SMS gateways, accounting systems, calendar sync, and marketplace webhooks.
        </div>
        {rows === null && <div style={{ padding: '4px 20px 20px', fontSize: 13, color: 'var(--ink3)' }}>Loading connections…</div>}
        {rows?.length === 0 && (
          <div style={{ padding: '4px 20px 20px', fontSize: 13, color: 'var(--ink3)' }}>No external services connected.</div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="ondi-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Provider / Integration</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Management</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map(row => (
                <tr key={`${row.category}-${row.provider}`}>
                  <td><span className="ondi-perm-chip">{CATEGORY_LABEL[row.category]}</span></td>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{row.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {row.detail ?? (row.lastActivityAt ? `Last active ${fmtDate(row.lastActivityAt)}` : 'No activity yet')}
                      {row.lastError ? ` · ${row.lastError}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`ondi-status-pill ${row.status === 'connected' ? 'success' : row.status === 'error' ? 'error' : 'gray'}`}>
                      <span className="ondi-status-dot" />
                      {row.status === 'connected' ? 'Connected' : row.status === 'error' ? 'Error' : 'Disconnected'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={row.manageHref} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                      Configure →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

  const enabledAppsCount = apps ? apps.filter(a => a.events_enabled).length : 0;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Event"
        titleEm="integrations"
        subtitle="Manage live activity event webhook delivery permissions for installed workspace applications."
      />

      {/* KPI Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Installed Webhooks</span>
            <div className="ondi-kpi-icon-box"><Icon name="grid" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{apps ? apps.length : 0}</span>
            <span className="ondi-kpi-sub">apps installed</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Active Delivery</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}><Icon name="checkCircle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857' }}>{enabledAppsCount}</span>
            <span className="ondi-kpi-sub">receiving webhooks</span>
          </div>
        </div>
      </div>

      <AllConnectionsSection />

      <div style={{ padding: '4px 4px 10px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Event Webhooks Permissions</div>
      <SectionCard padded={false}>
        {apps === null && <div style={{ padding: 24, fontSize: 13, color: 'var(--ink3)' }}>Loading installed applications…</div>}
        {apps?.length === 0 && (
          <div style={{ padding: 36, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>
            No marketplace apps installed yet — browse the <Link to="/store" style={{ color: 'var(--teal)', fontWeight: 700 }}>Store</Link> to add integrations.
          </div>
        )}
        {apps?.map((app, i, arr) => (
          <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--teal-l, #ecfeff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
              {app.icon_url ? <img src={app.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="grid" size={20} color="var(--teal)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{app.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                {app.developer_name} · installed {fmtDate(app.installed_at)}
              </div>
            </div>

            {!app.webhook_capable ? (
              <span className="ondi-status-pill gray">No Webhooks</span>
            ) : app.events_enabled ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="ondi-status-pill success">
                  <span className="ondi-status-dot" />
                  Delivering
                </span>
                <button type="button" disabled={busy === app.id} onClick={() => toggle(app)}
                  style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                  Pause
                </button>
                <button type="button" disabled={busy === app.id} onClick={() => revoke(app)}
                  style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', background: '#fef2f2', border: '1px solid rgba(185,28,28,0.3)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                  Revoke
                </button>
              </div>
            ) : (
              <button type="button" disabled={busy === app.id} onClick={() => enable(app)}
                style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
                {busy === app.id ? 'Enabling…' : 'Enable Webhook Delivery'}
              </button>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default OndiIntegrations;
