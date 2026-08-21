import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
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
  // Same "missing from here means it can never be toggled off" gap as the
  // 213 batch above — petti/notes had real feature keys and grants but
  // weren't listed here either (see entitlements.ts's own comment).
  petti:        { name: 'Petti',         desc: 'Petty-cash wallets — deposit, request, approve and disburse.', icon: 'wallet' },
  notes:        { name: 'Notes',         desc: 'Shared team notes, checklists and sketches.',           icon: 'fileText' },
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
  const [exporting, setExporting] = useState<string | null>(null);
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

  /**
   * What this workspace can take with it.
   *
   * Two exporters were hardcoded here — shipments and customers — out of the
   * two dozen record types the platform holds, so "export my data" meant "some
   * of it". This is a table instead: each dataset names its endpoint and the
   * columns worth carrying, and adding one is a row.
   *
   * Only datasets whose list endpoint this workspace can actually reach appear;
   * an export that 403s is worse than one that is not offered.
   */
  const DATASETS: {
    id: string;
    label: string;
    desc: string;
    path: string;
    columns: [header: string, pick: (row: any) => unknown][];
  }[] = [
    {
      id: 'shipments', label: 'Shipments', path: '/v1/shipments',
      desc: 'Every clearance case with its stage, customer, bill of lading and ETA.',
      columns: [
        ['Ref', r => r.ref_number], ['Type', r => r.type], ['Stage', r => r.stage],
        ['Customer', r => r.customer_name], ['BL number', r => r.bl_number],
        ['ETA', r => r.eta?.slice(0, 10)], ['Created', r => r.created_at?.slice(0, 10)],
      ],
    },
    {
      id: 'customers', label: 'Customers', path: '/v1/customers',
      desc: 'The customer directory, with contacts and tax identifiers.',
      columns: [
        ['Name', r => r.name], ['Email', r => r.email], ['Phone', r => r.phone ?? r.phone_wa],
        ['TIN', r => r.tax_id ?? r.tin_number], ['Contact', r => r.contact_name ?? r.contact_person],
        ['Country', r => r.country], ['Created', r => r.created_at?.slice(0, 10)],
      ],
    },
    {
      id: 'invoices', label: 'Invoices', path: '/v1/invoices',
      desc: 'Issued invoices with their totals and status.',
      columns: [
        ['Number', r => r.invoice_number ?? r.number], ['Customer', r => r.customer_name],
        ['Currency', r => r.currency], ['Total', r => r.total ?? r.total_amount],
        ['Status', r => r.status], ['Issued', r => (r.issue_date ?? r.created_at)?.slice(0, 10)],
      ],
    },
    {
      id: 'declarations', label: 'Declarations', path: '/v1/declarations',
      desc: 'Customs declarations with their assessment and status.',
      columns: [
        ['Reference', r => r.reference ?? r.tansad_number], ['Status', r => r.status],
        ['Regime', r => r.regime], ['Customer', r => r.customer_name],
        ['Created', r => r.created_at?.slice(0, 10)],
      ],
    },
    {
      id: 'leads', label: 'Leads', path: '/v1/leads',
      desc: 'The sales pipeline, with stage and expected value.',
      columns: [
        ['Company', r => r.company], ['Contact', r => r.contact_name], ['Email', r => r.contact_email],
        ['Stage', r => r.stage], ['Value', r => r.value], ['Source', r => r.source],
      ],
    },
    {
      id: 'staff', label: 'People', path: '/v1/hr/staff',
      desc: 'Everyone with access to this workspace, and their role.',
      columns: [
        ['Name', r => r.name], ['Email', r => r.email], ['Role', r => r.role],
        ['Active', r => (r.active ? 'yes' : 'no')], ['Last signed in', r => r.last_login_at?.slice(0, 10)],
      ],
    },
  ];

  /** RFC 4180: quotes doubled, and any field holding a comma, quote or newline quoted. */
  const csvCell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const exportDataset = async (ds: typeof DATASETS[number]) => {
    setExporting(ds.id);
    try {
      const res = await apiFetch(ds.path);
      const rows: any[] = Array.isArray(res) ? res : (res?.data ?? []);
      if (rows.length === 0) {
        showAlert(`There are no ${ds.label.toLowerCase()} to export yet.`, { variant: 'info' });
        return;
      }
      const csv = [
        ds.columns.map(([h]) => csvCell(h)).join(','),
        ...rows.map(r => ds.columns.map(([, pick]) => csvCell(pick(r))).join(',')),
      ].join('\r\n');

      // A BOM, so Excel opens Kiswahili and accented names as UTF-8 rather than
      // mojibake — the usual fate of a plain CSV on a Windows desktop.
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ds.id}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showAlert(err.message || `${ds.label} could not be exported.`, { variant: 'error' });
    } finally {
      setExporting(null);
    }
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
      <PageHeader
        crumbs={['Workspace', 'Tools']}
        titlePlain="Data"
        titleEm="tools"
        subtitle="Export what this workspace holds, and check that the platform is reachable."
      />

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

          {DATASETS.map(ds => (
            <ToolCard
              key={ds.id}
              icon="download"
              title={`Export ${ds.label.toLowerCase()}`}
              desc={ds.desc}
              action={
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => exportDataset(ds)} disabled={exporting !== null}>
                  {exporting === ds.id ? 'Exporting…' : 'Download CSV'}
                </button>
              }
            />
          ))}

          {/* Import already exists for customers — the one bulk load people
              actually need — so this points at it rather than building a
              second, differently-behaved importer beside it. */}
          <ToolCard
            icon="upload"
            title="Import customers"
            desc="Bring a customer list in from a spreadsheet, with a template and a preview before anything is written."
            action={<Link to="/crm/customers/bulk-upload" className="btn btn-secondary btn-sm">Open importer</Link>}
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
