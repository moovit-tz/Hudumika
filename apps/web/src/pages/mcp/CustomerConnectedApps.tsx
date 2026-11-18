import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { McpConnectionsList, type McpConnection } from './McpConnectionsList.js';

/** Customer portal ▸ Connected apps — review and revoke your own AI client connections. */
export const CustomerConnectedApps: React.FC = () => {
  const [rows, setRows] = useState<McpConnection[] | null>(null);
  const [url, setUrl] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<{ data: McpConnection[]; mcp_url: string }>('/v1/mcp/me/connections')
      .then(r => { setRows(r.data); setUrl(r.mcp_url); })
      .catch(e => setError(e?.message || 'Could not load your connected apps.'));
  }, []);
  useEffect(load, [load]);

  async function revoke(c: McpConnection) {
    if (!(await showConfirm(`${c.client_name} will lose access to your account immediately.`, { title: 'Disconnect app', confirmLabel: 'Disconnect', variant: 'danger' }))) return;
    setBusyId(c.id);
    try { await apiFetch(`/v1/mcp/me/connections/${c.id}/revoke`, { method: 'POST', body: '{}' }); load(); }
    catch (e: any) { showAlert(e?.message || 'Could not disconnect.', { variant: 'error' }); }
    finally { setBusyId(null); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <PageHeader crumbs={['Account', 'Connected apps']} titlePlain="Connected" titleEm="apps"
        subtitle="AI assistants you have connected to your account. They see only your own shipments, quotations, tickets and notifications." />
      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--red)' }}>{error}</div>}
      {!rows && !error && <SectionLoading />}
      {rows && (
        <SectionCard title="Your connections" padded={false} collapsible={false}>
          <McpConnectionsList rows={rows} onRevoke={revoke} busyId={busyId}
            empty={<>No apps connected. To connect ChatGPT or another assistant, add <code style={{ wordBreak: 'break-all' }}>{url}</code> as an MCP connector and sign in.</>} />
        </SectionCard>
      )}
    </div>
  );
};

export default CustomerConnectedApps;
