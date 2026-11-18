import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useAuth } from '../../hooks/useAuth.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Switch } from '../../components/ui/switch.js';
import { Input } from '../../components/ui/input.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.js';
import { McpConnectionsList, fmtWhen, type McpConnection } from '../mcp/McpConnectionsList.js';

interface CatalogTool {
  id: string; mcp_name: string; app: string; title: string; description: string; access: 'read' | 'write';
  actors: ('staff' | 'customer')[]; roles: string[] | null; routes: string[]; enabled: boolean; overridden: boolean;
  destructive?: boolean; open_world?: boolean;
}
interface CatalogApp {
  app: string; status: 'implemented' | 'blocked' | 'platform_only' | 'internal'; note: string | null;
  entitlement: { entitled: boolean; reason: string | null } | null; tools: CatalogTool[];
}
interface Catalog { mcp_url: string; policy?: { staff_enabled: boolean; customers_enabled: boolean }; apps: CatalogApp[] }
interface CallRow {
  id: string; created_at: string; user_id: string | null; user_name: string | null; user_avatar_url: string | null;
  actor_type: string; client_id: string; tool_id: string; app_id: string; outcome: string; error_code: string | null; duration_ms: number | null;
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
const APP_NAME: Record<string, string> = { ...Object.fromEntries(LAUNCHER_APPS.map(a => [a.id, a.name])), admin: 'SuperAdmin console', pulse: 'Pulse', zentra: 'Zentra', travel: 'Travel', workspace: 'Admin & workspace' };
const appName = (id: string) => APP_NAME[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
const ROLE_LABEL = (r: string) => r.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
const OUTCOME_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray' | 'info'> = {
  ok: 'success', replayed: 'info', confirmation_required: 'info', denied: 'warning', invalid: 'gray', error: 'error',
};

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <code aria-label={label} style={{ flex: '1 1 260px', minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap', padding: '8px 10px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5 }}>{value}</code>
      <Button type="button" variant="outline" size="sm" onClick={() => {
        navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => showAlert('Copy failed — select the address and copy it.', { variant: 'warning' }));
      }}>{copied ? 'Copied' : 'Copy'}</Button>
    </div>
  );
}

function SetupGuide({ url }: { url: string }) {
  const step = (n: number, body: React.ReactNode) => (
    <li style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55 }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ minWidth: 0 }}>{body}</span>
    </li>
  );
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard title="Server address" collapsible={false}>
        <div style={{ display: 'grid', gap: 10 }}>
          <CopyField value={url} label="MCP server URL" />
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
            Streamable HTTP with sessions and a notification stream · OAuth 2.1 with PKCE and dynamic client registration · scopes <code>mcp:read</code> and <code>mcp:write</code>.
            Each person connects their own account; nothing is shared between people.
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
            Offers tools, ready-made prompts (customer briefing, overdue invoices, shipment status, my day, ticket reply) and records as
            resources (<code>hudumika://shipment/&#123;id&#125;</code> and similar). <code>search</code> and <code>fetch</code> find and open
            shipments, invoices, customers, tickets and leads across apps, in the form ChatGPT deep research expects.
          </div>
        </div>
      </SectionCard>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <SectionCard title="ChatGPT" collapsible={false}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {step(1, <>In ChatGPT open <strong>Settings ▸ Apps &amp; Connectors ▸ Advanced</strong> and turn on developer mode (a workspace owner may need to allow custom connectors).</>)}
            {step(2, <>Choose <strong>Create</strong>, name it “Hudumika”, paste the server address above and pick <strong>OAuth</strong> authentication.</>)}
            {step(3, <>ChatGPT opens a Hudumika sign-in. Sign in to the workspace you want, review what it can do, then <strong>Connect</strong>.</>)}
            {step(4, <>Ask things like “Which of my shipments are waiting on customs?” — ChatGPT asks before running write tools.</>)}
            {step(5, <>ChatGPT can only reach a public <strong>https</strong> address. For a local test, run a tunnel (for example <code>cloudflared tunnel --url http://localhost:5173</code>) and start the API with <code>PUBLIC_APP_URL</code> set to the tunnel address, so sign-in and token addresses match.</>)}
          </ol>
        </SectionCard>
        <SectionCard title="Claude, IDEs and other MCP clients" collapsible={false}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {step(1, <>Add a <strong>remote / HTTP MCP server</strong> with the address above (for example Claude: Settings ▸ Connectors ▸ Add custom connector).</>)}
            {step(2, <>The client discovers sign-in from <code>/.well-known/oauth-protected-resource</code> and registers itself — no client ID to copy.</>)}
            {step(3, <>Approve the connection in the browser window that opens.</>)}
          </ol>
        </SectionCard>
      </div>
      <SectionCard title="How changes work" collapsible={false}>
        <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
          Write tools are off until an admin turns them on, and only run on connections that were allowed to make changes. Every change takes two steps:
          the first call returns a summary and a one-time confirmation token, the second carries it out. Retries with the same
          idempotency key return the first result instead of writing twice. Every call is recorded under Activity.
        </div>
      </SectionCard>
    </div>
  );
}

function CatalogView({ catalog, isAdmin, onToggleTool, onPolicy }: {
  catalog: Catalog; isAdmin: boolean;
  onToggleTool: (t: CatalogTool, enabled: boolean) => void;
  onPolicy: (patch: Partial<NonNullable<Catalog['policy']>>) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return catalog.apps;
    return catalog.apps.filter(a => appName(a.app).toLowerCase().includes(s) || a.tools.some(t => t.title.toLowerCase().includes(s) || t.id.includes(s)));
  }, [catalog.apps, q]);
  const totals = useMemo(() => {
    const tools = catalog.apps.flatMap(a => a.tools);
    return { apps: catalog.apps.filter(a => a.status === 'implemented').length, entitled: catalog.apps.filter(a => a.entitlement?.entitled).length, tools: tools.length, on: tools.filter(t => t.enabled).length };
  }, [catalog.apps]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {isAdmin && catalog.policy && (
        <SectionCard title="Who can connect" collapsible={false}>
          <div style={{ display: 'grid', gap: 12 }}>
            {([['staff_enabled', 'Staff', 'Members of this workspace can connect AI clients to their own account.'],
               ['customers_enabled', 'External customers', 'Customer-portal logins can connect, and see only their own shipments, quotations, tickets and notifications.']] as const).map(([key, label, help]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, cursor: 'pointer' }}>
                <span style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}><strong style={{ color: 'var(--ink)' }}>{label}</strong><br />{help}</span>
                <Switch checked={catalog.policy![key]} onCheckedChange={v => onPolicy({ [key]: v })} aria-label={`${label} can connect`} />
              </label>
            ))}
          </div>
        </SectionCard>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search apps and tools" aria-label="Search apps and tools" />
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
          {totals.apps} apps with tools · {totals.entitled} in your plan · {totals.on}/{totals.tools} tools on
        </div>
      </div>

      <SectionCard title="Apps" padded={false} collapsible={false}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filtered.map(a => {
            const isOpen = open.has(a.app);
            const statusBadge = a.status === 'implemented'
              ? (a.entitlement?.entitled ? <Badge variant="success">In your plan</Badge> : <Badge variant="gray" title={a.entitlement?.reason ?? ''}>Not in your plan</Badge>)
              : a.status === 'platform_only' ? <Badge variant="gray">Platform only</Badge>
              : a.status === 'internal' ? <Badge variant="gray">Internal</Badge> : <Badge variant="warning">No tools yet</Badge>;
            return (
              <li key={a.app} style={{ borderTop: '1px solid var(--border)' }}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(s => { const n = new Set(s); n.has(a.app) ? n.delete(a.app) : n.add(a.app); return n; })}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', flexWrap: 'wrap' }}>
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} color="var(--ink3)" />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', flex: '1 1 160px', minWidth: 0 }}>{appName(a.app)}</span>
                  {statusBadge}
                  <span style={{ fontSize: 12, color: 'var(--ink3)', minWidth: 90, textAlign: 'right' }}>{a.tools.length ? `${a.tools.filter(t => t.enabled).length}/${a.tools.length} tools on` : '—'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 18px 14px 41px', display: 'grid', gap: 10 }}>
                    {a.note && <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>{a.note}</div>}
                    {a.tools.map(t => (
                      <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--card-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            {t.title}
                            <Badge variant={t.access === 'write' ? 'warning' : 'info'}>{t.access === 'write' ? 'Makes changes' : 'Read only'}</Badge>
                            {t.actors.includes('customer') && <Badge variant="brand">Customers too</Badge>}
                            {t.open_world && <Badge variant="error" title="Sends email, SMS or WhatsApp to people outside Hudumika">Sends outside</Badge>}
                            {t.destructive && <Badge variant="warning" title="Moves items to the app's trash (restorable)">Moves to trash</Badge>}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.5 }}>{t.description}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.5 }}>
                            <code>{t.mcp_name}</code> · {t.roles ? `Roles: ${t.roles.filter(r => r !== 'SUPER_ADMIN').map(ROLE_LABEL).join(', ')}` : 'Any staff role the app allows'} · {t.routes.join(', ')}
                          </div>
                        </div>
                        {isAdmin
                          ? <Switch checked={t.enabled} onCheckedChange={v => onToggleTool(t, v)} aria-label={`${t.title} enabled`} />
                          : <Badge variant={t.enabled ? 'success' : 'gray'}>{t.enabled ? 'On' : 'Off'}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

function ActivityView({ rows }: { rows: CallRow[] }) {
  if (rows.length === 0) return <SectionCard title="Recent calls" collapsible={false}><div style={{ fontSize: 13, color: 'var(--ink3)' }}>No tool calls yet.</div></SectionCard>;
  return (
    <SectionCard title="Recent calls" padded={false} collapsible={false}>
      <div style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead><TableHead>Person</TableHead><TableHead>Tool</TableHead><TableHead>Outcome</TableHead><TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell style={{ whiteSpace: 'nowrap' }}>{fmtWhen(r.created_at)}</TableCell>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                    <PersonAvatar userId={r.user_id} name={r.user_name ?? 'Unknown'} src={r.user_avatar_url} size={24} />
                    <span>{r.user_name ?? 'Unknown'}{r.actor_type === 'customer' ? ' (customer)' : ''}</span>
                  </div>
                </TableCell>
                <TableCell><span style={{ fontWeight: 600 }}>{appName(r.app_id)}</span> · <code style={{ fontSize: 12 }}>{r.tool_id.split('.')[1]}</code></TableCell>
                <TableCell>
                  <Badge variant={OUTCOME_VARIANT[r.outcome] ?? 'gray'}>{r.outcome.replace('_', ' ')}</Badge>
                  {r.error_code && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ink3)' }}>{r.error_code}</span>}
                </TableCell>
                <TableCell style={{ whiteSpace: 'nowrap' }}>{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/**
 * Developer ▸ MCP — the MCP integration hub. Admins manage which apps' tools
 * are available, who may connect, every connection in the workspace and the
 * call history; every staff member can review the catalog, set up a client
 * and manage their own connections.
 */
export const McpHubPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') ?? 'catalog';
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [mine, setMine] = useState<McpConnection[] | null>(null);
  const [all, setAll] = useState<McpConnection[] | null>(null);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cat, me] = await Promise.all([
        apiFetch<Catalog>(isAdmin ? '/v1/mcp/admin/catalog' : '/v1/mcp/catalog'),
        apiFetch<{ data: McpConnection[] }>('/v1/mcp/me/connections'),
      ]);
      setCatalog(cat); setMine(me.data);
      if (isAdmin) {
        const [conns, log] = await Promise.all([
          apiFetch<{ data: McpConnection[] }>('/v1/mcp/admin/connections'),
          apiFetch<{ data: CallRow[] }>('/v1/mcp/admin/calls?limit=200'),
        ]);
        setAll(conns.data); setCalls(log.data);
      }
    } catch (e: any) { setError(e?.message || 'Could not load MCP settings.'); }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);

  async function toggleTool(t: CatalogTool, enabled: boolean) {
    if (enabled && t.access === 'write') {
      const extra = t.open_world ? ' Messages leave Hudumika and cannot be recalled.' : t.destructive ? ' Items go to the trash and can be restored.' : '';
      const ok = await showConfirm(`Turn on “${t.title}”? Connected AI clients that were allowed to make changes will be able to ${t.description.split('.')[0].toLowerCase()}, after the person confirms each change.${extra}`, { title: 'Enable a write tool', confirmLabel: 'Turn on', variant: 'warning' });
      if (!ok) return;
    }
    setCatalog(c => c && { ...c, apps: c.apps.map(a => ({ ...a, tools: a.tools.map(x => x.id === t.id ? { ...x, enabled, overridden: true } : x) })) });
    try { await apiFetch(`/v1/mcp/admin/tools/${encodeURIComponent(t.id)}`, { method: 'PUT', body: JSON.stringify({ enabled }) }); }
    catch (e: any) { showAlert(e?.message || 'Could not save.', { variant: 'error' }); load(); }
  }

  async function setPolicy(patch: Partial<NonNullable<Catalog['policy']>>) {
    if (patch.customers_enabled === true) {
      const ok = await showConfirm('Customer-portal logins will be able to connect AI clients. They only ever see their own records.', { title: 'Allow customers to connect', confirmLabel: 'Allow', variant: 'info' });
      if (!ok) return;
    }
    try {
      const policy = await apiFetch<NonNullable<Catalog['policy']>>('/v1/mcp/admin/policy', { method: 'PUT', body: JSON.stringify(patch) });
      setCatalog(c => c && { ...c, policy });
    } catch (e: any) { showAlert(e?.message || 'Could not save.', { variant: 'error' }); }
  }

  async function revoke(c: McpConnection, asAdmin: boolean) {
    const ok = await showConfirm(`${c.client_name} will lose access immediately${asAdmin && c.user_id !== user?.id ? ` for ${c.user_name ?? 'this person'}` : ''}. They can reconnect later if MCP is still allowed.`, { title: 'Revoke connection', confirmLabel: 'Revoke', variant: 'danger' });
    if (!ok) return;
    setBusyId(c.id);
    try {
      await apiFetch(asAdmin ? `/v1/mcp/admin/connections/${c.id}/revoke` : `/v1/mcp/me/connections/${c.id}/revoke`, { method: 'POST', body: '{}' });
      await load();
    } catch (e: any) { showAlert(e?.message || 'Could not revoke.', { variant: 'error' }); }
    finally { setBusyId(null); }
  }

  async function revokeAll() {
    const ok = await showConfirm('Every AI client connection in this workspace will stop working immediately.', { title: 'Revoke all connections', confirmLabel: 'Revoke all', variant: 'danger' });
    if (!ok) return;
    try { await apiFetch('/v1/mcp/admin/connections/revoke-all', { method: 'POST', body: '{}' }); await load(); }
    catch (e: any) { showAlert(e?.message || 'Could not revoke.', { variant: 'error' }); }
  }

  const activeAll = (all ?? []).filter(c => c.status === 'active').length;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <PageHeader crumbs={['Developer', 'MCP']} titlePlain="AI client" titleEm="connections"
        subtitle="Connect ChatGPT and other MCP clients to Hudumika. Each person signs in with their own account and sees only what they could open themselves." />

      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--red)' }}>{error}</div>}
      {!catalog && !error && <SectionLoading />}

      {catalog && (
        <Tabs value={tab} onValueChange={v => setParams(p => { const n = new URLSearchParams(p); n.set('view', v); return n; }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="catalog"><span className="ds-tabs-trigger-label">Apps &amp; tools</span></TabsTrigger>
            <TabsTrigger value="mine"><span className="ds-tabs-trigger-label">My connections</span></TabsTrigger>
            {isAdmin && <TabsTrigger value="all"><span className="ds-tabs-trigger-label">All connections</span>{activeAll > 0 && <span> {activeAll}</span>}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="activity"><span className="ds-tabs-trigger-label">Activity</span></TabsTrigger>}
            <TabsTrigger value="setup"><span className="ds-tabs-trigger-label">Connect a client</span></TabsTrigger>
          </TabsList>

          <TabsContent value="catalog"><CatalogView catalog={catalog} isAdmin={isAdmin} onToggleTool={toggleTool} onPolicy={setPolicy} /></TabsContent>
          <TabsContent value="mine">
            <SectionCard title="Your connected clients" padded={false} collapsible={false}>
              <McpConnectionsList rows={mine ?? []} onRevoke={c => revoke(c, false)} busyId={busyId}
                empty={<>You haven’t connected an AI client yet. See <strong>Connect a client</strong>.</>} />
            </SectionCard>
          </TabsContent>
          {isAdmin && (
            <TabsContent value="all">
              <SectionCard title="Connections in this workspace" padded={false} collapsible={false}
                action={activeAll > 0 ? <Button type="button" variant="outline" size="sm" onClick={revokeAll}>Revoke all</Button> : undefined}>
                <McpConnectionsList rows={all ?? []} showPerson onRevoke={c => revoke(c, true)} busyId={busyId} empty="No one has connected an AI client yet." />
              </SectionCard>
            </TabsContent>
          )}
          {isAdmin && <TabsContent value="activity"><ActivityView rows={calls ?? []} /></TabsContent>}
          <TabsContent value="setup"><SetupGuide url={catalog.mcp_url} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default McpHubPage;
