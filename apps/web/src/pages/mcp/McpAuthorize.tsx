import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { CompanyAvatar, PersonAvatar } from '../../components/PersonAvatar.js';
import { Button } from '../../components/ui/button.js';
import { Switch } from '../../components/ui/switch.js';
import { Badge } from '../../components/ui/badge.js';
import { Spinner } from '../../components/ui/spinner.js';
import { useAuth } from '../../hooks/useAuth.js';

interface AuthorizeInfo {
  client: { client_id: string; name: string; verified: boolean; redirect_host: string };
  workspace: { id: string; name: string };
  account: { name: string; email: string; actor_type: 'staff' | 'customer'; role: string };
  requested_scopes: string[];
  tools_in_catalog: number;
}

/**
 * MCP account linking consent — the `authorization_endpoint` the MCP gateway
 * advertises (/.well-known/oauth-authorization-server). An AI client (ChatGPT,
 * Claude, an IDE) sends the browser here with an OAuth request; approving
 * creates a connection bound to this person, this client and the workspace
 * they are signed in to. A signed-out browser goes through sign-in first and
 * returns here (App.tsx's returnTo).
 *
 * Shown inside the staff app and the customer portal alike; the server decides
 * what the account may connect (workspace policy, customer link, role).
 */
export const McpAuthorize: React.FC = () => {
  const [params] = useSearchParams();
  const { user, logout } = useAuth();
  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const [info, setInfo] = useState<AuthorizeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowWrite, setAllowWrite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    if (!query.client_id || !query.redirect_uri) { setError('This connection link is missing required parameters.'); return; }
    apiFetch<AuthorizeInfo>(`/v1/mcp/oauth/authorize/info?${new URLSearchParams(query)}`)
      .then(r => { if (live) setInfo(r); })
      .catch(e => { if (live) setError(e?.message || 'This connection request could not be started.'); });
    return () => { live = false; };
  }, [query]);

  const wantsWrite = !!info?.requested_scopes.includes('mcp:write');

  async function approve() {
    setBusy(true);
    try {
      const r = await apiFetch<{ redirect_url: string }>('/v1/mcp/oauth/authorize/approve', {
        method: 'POST', body: JSON.stringify({ ...query, allow_write: wantsWrite ? allowWrite : false }),
      });
      setDone(true);
      window.location.href = r.redirect_url;
    } catch (e: any) {
      setError(e?.message || 'Could not connect.');
      setBusy(false);
    }
  }

  function deny() {
    try {
      const url = new URL(query.redirect_uri);
      url.searchParams.set('error', 'access_denied');
      if (query.state) url.searchParams.set('state', query.state);
      window.location.href = url.toString();
    } catch { setError('Request cancelled.'); }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(16px, 4vh) 16px', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', boxShadow: 'var(--elev-lg)', width: 440, maxWidth: '100%', padding: 28, boxSizing: 'border-box' }}>
        {error && (
          <div role="alert" style={{ textAlign: 'center' }}>
            <Icon name="alertCircle" size={28} style={{ color: 'var(--red)', marginBottom: 12 } as React.CSSProperties} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Can’t connect</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5 }}>{error}</div>
          </div>
        )}

        {!error && !info && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>}

        {!error && info && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <CompanyAvatar name={info.client.name} size={44} shape="square" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {info.client.name}
                  {info.client.verified ? <Badge variant="success">Registered by an admin</Badge> : <Badge variant="warning">Self-registered app</Badge>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>wants to connect to Hudumika · returns to <strong style={{ color: 'var(--ink2)' }}>{info.client.redirect_host}</strong></div>
              </div>
            </div>

            <div style={{ background: 'var(--card-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', marginBottom: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PersonAvatar userId={user?.id} name={info.account.name} size={28} />
                <div style={{ minWidth: 0, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{info.account.name}</div>
                  <div style={{ color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.account.email} · {info.account.actor_type === 'customer' ? 'Customer account' : info.account.role.replace('_', ' ').toLowerCase()}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                Workspace: <strong>{info.workspace.name}</strong>
                <button type="button" onClick={logout} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 12.5, padding: 0, fontFamily: 'var(--font)' }}>
                  Use a different workspace
                </button>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <Icon name="check" size={14} strokeWidth={2.5} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 3 } as React.CSSProperties} />
                <span>Read the records this account can already see in the apps your workspace uses. Nothing more than you could open yourself.</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Icon name="shield" size={14} style={{ color: 'var(--ink3)', flexShrink: 0, marginTop: 3 } as React.CSSProperties} />
                <span>Your admin chooses which tools are on, and you can disconnect at any time from {info.account.actor_type === 'customer' ? 'Connected apps' : 'Developer ▸ MCP'}.</span>
              </div>
            </div>

            {wantsWrite && (
              <label style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 18, cursor: 'pointer' }}>
                <span style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--ink)' }}>Allow changes</strong><br />
                  Create tasks, notes or support tickets. Each change is shown to you for confirmation first.
                </span>
                <Switch checked={allowWrite} onCheckedChange={setAllowWrite} aria-label="Allow changes" />
              </label>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="button" variant="outline" onClick={deny} disabled={busy} style={{ flex: 1 }}>Cancel</Button>
              <Button type="button" onClick={approve} disabled={busy || done} style={{ flex: 1 }}>{busy ? 'Connecting…' : 'Connect'}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default McpAuthorize;
