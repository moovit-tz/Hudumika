import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { useEntitlements, resetEntitlementsCache } from '../hooks/useEntitlements.js';
import { Switch } from '../components/ui/switch.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, type IconName } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

export const APP_META: Record<string, { name: string; desc: string; icon: IconName }> = {
  // Added with migration 213. These had no feature key, so they never appeared
  // here and were permanently on for every tenant regardless of plan.
  onsite:       { name: 'Onsite',        desc: 'Domains, DNS, hosting, deployments and cloud infrastructure.', icon: 'terminal' },
  seal:         { name: 'SEAL',          desc: 'Bonded warehousing, lots, examinations and stock accounts.',   icon: 'box3' },
  inventory:    { name: 'Inventory',     desc: 'Stock control, counts and catalog.',                            icon: 'layers' },
  studio:       { name: 'Studio',        desc: 'Workflow builder and automation.',                              icon: 'gitBranch' },
  crm:          { name: 'CRM',           desc: 'Customers, leads, partners and the sales pipeline.',            icon: 'users' },
  bliss:        { name: 'Bliss',         desc: 'Customer helpdesk and ticketing.',                               icon: 'chatBubble' },
  calendar:     { name: 'Calendar',      desc: 'Shared scheduling across the workspace.',                        icon: 'calendar' },
  tasks:        { name: 'Tasks',         desc: 'Assignments and to-dos across apps.',                            icon: 'checkCircle' },
  store:        { name: 'Store',         desc: 'B2B procurement and equipment marketplace.',                     icon: 'shoppingCart' },
  onesite:      { name: 'oneSite',       desc: 'Content management and company intranet.',                       icon: 'globe' },
  clearos:      { name: 'ClearOS',       desc: 'Customs clearance, declarations, shipment tracking.', icon: 'package' },
  finops:       { name: 'FinOps',        desc: 'Invoicing, bills, ledgers and financial reports.',     icon: 'dollarSign' },
  contacts:     { name: 'Contacts',      desc: 'Shared customer, vendor and partner contact directory.', icon: 'users' },
  cloud:        { name: 'Cloud',         desc: 'File manager and cloud storage integrations.',         icon: 'folder' },
  complyos:     { name: 'ComplyOS',      desc: 'Compliance applications and legal document tracking.', icon: 'clipboardList' },
  email:        { name: 'Email',         desc: 'Team inbox and email workspace.',                       icon: 'mail' },
  ai:           { name: 'AI',            desc: 'AI automations and document extraction.',               icon: 'sparkle' },
  oneid:        { name: 'OneID',         desc: 'Single sign-on and identity management.',               icon: 'key' },
  nexushr:        { name: 'OnePi',         desc: 'Platform integrations hub.',                            icon: 'link' },
  tracking:     { name: 'HuduFreight',   desc: 'Fleet, vehicle and driver tracking.',                   icon: 'truck' },
  demurrage:    { name: 'Demurrage',     desc: 'Container dwell time and demurrage cost tracking.',     icon: 'timer' },
  cargotracker: { name: 'CargoTracker',  desc: 'Cargo manifest and load tracking.',                     icon: 'ship' },
};

function ToolCard({ icon, title, desc, action }: { icon: IconName; title: string; desc: string; action: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ marginBottom: 10 }}><Icon name={icon} size={26} color="var(--teal)" strokeWidth={1.5} /></div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14, lineHeight: 1.5 }}>{desc}</div>
      {action}
    </div>
  );
}

export const Utilities: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);

  const { user } = useAuth();
  const canManageModules = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role);
  const entitlements = useEntitlements();
  const [overrides, setOverrides] = useState<Record<string, boolean> | null>(null);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);

  React.useEffect(() => {
    apiFetch('/v1/settings').then(res => setOverrides(res.settings?.['enabled-apps'] || {})).catch(() => setOverrides({}));
  }, []);

  const moduleKeys = entitlements ? Object.keys(entitlements.features).filter(k => k in APP_META) : [];

  async function toggleModule(key: string, enabled: boolean) {
    // The settings PATCH replaces the whole 'enabled-apps' object rather than deep-merging it,
    // so every save must include the full override map, not just the key that changed.
    const nextOverrides = { ...(overrides ?? {}), [key]: enabled };
    setOverrides(nextOverrides);
    setModuleSaving(key);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': nextOverrides }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(overrides);
      // The API now answers 403 naming the feature and the plan when a
      // module is not included, instead of scrubbing it to false behind a
      // 200. That sentence is the whole message.
      showAlert(err.message || 'That module could not be changed.', {
        title: /plan/i.test(err.message || '') ? 'Not in your plan' : 'Could not update module',
        variant: /plan/i.test(err.message || '') ? 'warning' : 'error',
      });
    } finally {
      setModuleSaving(null);
    }
  }

  const exportShipments = async () => {
    setExporting(true);
    try {
      const data = await apiFetch('/v1/shipments');
      const list = data.data ?? data ?? [];
      const csv = [
        ['Ref', 'Type', 'Stage', 'Customer', 'BL Number', 'ETA', 'Created'].join(','),
        ...list.map((s: any) => [
          s.ref_number, s.type, s.stage, s.customer_name ?? '', s.bl_number ?? '', s.eta?.slice(0,10) ?? '', s.created_at?.slice(0,10) ?? '',
        ].join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `clearos-shipments-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { showAlert(err.message); } finally { setExporting(false); }
  };

  const exportCustomers = async () => {
    setExporting(true);
    try {
      const data = await apiFetch('/v1/customers');
      const list = data.data ?? data ?? [];
      const csv = [
        ['Name', 'Email', 'Phone', 'TIN', 'Contact Person', 'Created'].join(','),
        ...list.map((c: any) => [c.name, c.email ?? '', c.phone_wa ?? '', c.tin_number ?? '', c.contact_person ?? '', c.created_at?.slice(0,10) ?? ''].join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `clearos-customers-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { showAlert(err.message); } finally { setExporting(false); }
  };

  const checkHealth = async () => {
    try {
      const res = await apiFetch('/health');
      setHealthResult(`✓ API healthy · ${new Date(res.timestamp).toLocaleTimeString()}`);
    } catch { setHealthResult('✗ API unreachable'); }
  };

  const pingWs = () => {
    try {
      const ws = new WebSocket(`${BASE_URL.replace(/^http/, 'ws')}/ws`);
      ws.onopen = () => { setPingResult('✓ WebSocket connected'); ws.close(); };
      ws.onerror = () => setPingResult('✗ WebSocket failed');
    } catch { setPingResult('✗ WebSocket failed'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Utilities</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Data tools, export, and system diagnostics</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* Modules moved to Settings.
            Three screens edited this one setting — here, in Settings and in
            Billing — each with its own local state, so changing it in one left
            the other two showing the old value until a reload. One control now,
            and two links to it. */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Modules</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
            Which apps this workspace uses is configured in Settings.
          </div>
          <Link to="/workspace/settings?s=modules" className="btn btn-secondary btn-sm">
            <Icon name="layers" size={14} /> Open module settings
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>

          <ToolCard
            icon="package"
            title="Export Shipments"
            desc="Download all active shipment cases as a CSV file including ref, type, stage, customer, BL, and ETA."
            action={<button type="button" className="btn btn-secondary btn-sm" onClick={exportShipments} disabled={exporting}>{exporting ? 'Exporting…' : 'Download CSV'}</button>}
          />

          <ToolCard
            icon="building"
            title="Export Customers"
            desc="Download the full customer directory as CSV including contact details and TIN numbers."
            action={<button type="button" className="btn btn-secondary btn-sm" onClick={exportCustomers} disabled={exporting}>{exporting ? 'Exporting…' : 'Download CSV'}</button>}
          />

          <ToolCard
            icon="activity"
            title="API Health Check"
            desc="Ping the backend API to verify it is reachable and responding correctly."
            action={
              <div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={checkHealth}>Check Health</button>
                {healthResult && <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'var(--mono)', color: healthResult.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{healthResult}</div>}
              </div>
            }
          />

          <ToolCard
            icon="link"
            title="WebSocket Diagnostics"
            desc="Test the real-time WebSocket connection used for live shipment updates and notifications."
            action={
              <div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={pingWs}>Test Connection</button>
                {pingResult && <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'var(--mono)', color: pingResult.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{pingResult}</div>}
              </div>
            }
          />

          <ToolCard
            icon="trash2"
            title="Clear Local Cache"
            desc="Clear browser localStorage data for this app. You will be signed out and need to log in again."
            action={
              <button type="button" className="btn btn-danger btn-sm" onClick={async () => { if ((await showConfirm('Clear cache and sign out?', { variant: 'warning', confirmLabel: 'Clear Cache' }))) { localStorage.clear(); window.location.reload(); } }}>
                Clear Cache
              </button>
            }
          />

          <ToolCard
            icon="info"
            title="System Information"
            desc="View browser and environment information for debugging purposes."
            action={
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8 }}>
                <div>Browser: {navigator.userAgent.split(' ').slice(-2).join(' ')}</div>
                <div>API: {BASE_URL}</div>
                <div>Build: Hudumika Workspaces v1.0</div>
              </div>
            }
          />

        </div>
      </div>
    </div>
  );
};
