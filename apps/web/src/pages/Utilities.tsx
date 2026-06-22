import React, { useState } from 'react';
import { apiFetch } from '../lib/api.js';

function ToolCard({ icon, title, desc, action }: { icon: string; title: string; desc: string; action: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
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
    } catch (err: any) { alert(err.message); } finally { setExporting(false); }
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
    } catch (err: any) { alert(err.message); } finally { setExporting(false); }
  };

  const checkHealth = async () => {
    try {
      const res = await apiFetch('/health');
      setHealthResult(`✓ API healthy · ${new Date(res.timestamp).toLocaleTimeString()}`);
    } catch { setHealthResult('✗ API unreachable'); }
  };

  const pingWs = () => {
    try {
      const ws = new WebSocket(`ws://localhost:3000/ws`);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>

          <ToolCard
            icon="📦"
            title="Export Shipments"
            desc="Download all active shipment cases as a CSV file including ref, type, stage, customer, BL, and ETA."
            action={<button type="button" className="btn btn-secondary btn-sm" onClick={exportShipments} disabled={exporting}>{exporting ? 'Exporting…' : 'Download CSV'}</button>}
          />

          <ToolCard
            icon="🏢"
            title="Export Customers"
            desc="Download the full customer directory as CSV including contact details and TIN numbers."
            action={<button type="button" className="btn btn-secondary btn-sm" onClick={exportCustomers} disabled={exporting}>{exporting ? 'Exporting…' : 'Download CSV'}</button>}
          />

          <ToolCard
            icon="❤"
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
            icon="🔌"
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
            icon="🗂"
            title="Clear Local Cache"
            desc="Clear browser localStorage data for this app. You will be signed out and need to log in again."
            action={
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { if (confirm('Clear cache and sign out?')) { localStorage.clear(); window.location.reload(); } }}>
                Clear Cache
              </button>
            }
          />

          <ToolCard
            icon="📋"
            title="System Information"
            desc="View browser and environment information for debugging purposes."
            action={
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8 }}>
                <div>Browser: {navigator.userAgent.split(' ').slice(-2).join(' ')}</div>
                <div>API: {window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin}</div>
                <div>Build: Moovit ClearOS v1.0</div>
              </div>
            }
          />

        </div>
      </div>
    </div>
  );
};
