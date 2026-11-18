import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../../lib/api.js';
import { showConfirm } from '../../lib/confirm.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Icon } from '../../components/Icon.js';
import './ApiKeysPage.css';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  read_only: boolean;
}

interface Usage {
  period_days: number;
  total_calls: number;
  error_calls: number;
  top_endpoints: { endpoint: string; count: number }[];
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [days, setDays] = useState('90');
  const [readOnly, setReadOnly] = useState(true);
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    setUsageUnavailable(false);
    const [list, options, stats] = await Promise.allSettled([
      apiFetch<{ keys: ApiKey[] }>('/v1/api-keys', { signal }),
      apiFetch<{ scopes: string[] }>('/v1/api-keys/scopes', { signal }),
      apiFetch<Usage>('/v1/api-keys/usage', { signal }),
    ]);
    if (signal?.aborted) return;
    if (list.status === 'fulfilled') setKeys(list.value.keys);
    else {
      setKeys(null);
      setLoadError(list.reason instanceof Error ? list.reason.message : 'Could not load API keys.');
    }
    if (options.status === 'fulfilled') setAvailableScopes(options.value.scopes);
    else if (list.status === 'fulfilled') {
      setAvailableScopes([]);
      setLoadError('Could not load the scopes available to this workspace.');
    }
    setUsage(stats.status === 'fulfilled' ? stats.value : null);
    setUsageUnavailable(stats.status === 'rejected');
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function toggleScope(scope: string) {
    setScopes(current => {
      if (current.includes(scope)) {
        return current.filter(item => item !== scope && (scope !== 'finops' || !item.startsWith('finance.')));
      }
      return [...new Set([...current, ...(scope.startsWith('finance.') ? ['finops'] : []), scope])];
    });
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !scopes.length || pending) return;
    setPending(true);
    setActionError('');
    try {
      const created = await apiFetch<ApiKey & { key: string }>('/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), scopes, expires_in_days: days ? Number(days) : null, read_only: readOnly }),
      });
      const { key, ...metadata } = created;
      setKeys(current => [{ ...metadata, revoked_at: null, last_used_at: null }, ...(current ?? [])]);
      setSecret(key);
      setCopied(false);
      setShowCreate(false);
      setName('');
      setScopes([]);
      setDays('90');
      setReadOnly(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create the key.');
    } finally {
      setPending(false);
    }
  }

  async function revokeKey(key: ApiKey) {
    setPending(true);
    setActionError('');
    try {
      const confirmed = await showConfirm(
        `Revoke “${key.name}”? Integrations using it will lose access immediately.`,
        { confirmLabel: 'Revoke' },
      );
      if (!confirmed) return;
      await apiFetch(`/v1/api-keys/${key.id}`, { method: 'DELETE' });
      setKeys(current => current?.map(item => item.id === key.id
        ? { ...item, revoked_at: new Date().toISOString() } : item) ?? null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not revoke the key.');
    } finally {
      setPending(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    setActionError('');
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setActionError('Could not copy automatically. Select the key and copy it manually.');
    }
  }


  function keyStatus(key: ApiKey) {
    if (key.revoked_at) return 'revoked';
    return key.expires_at && Date.parse(key.expires_at) <= Date.now() ? 'expired' : 'active';
  }

  const activeCount = keys?.filter(key => keyStatus(key) === 'active').length;
  const filteredKeys = keys?.filter(key =>
    (statusFilter === 'all' || keyStatus(key) === statusFilter) &&
    [key.name, key.key_prefix, ...key.scopes].join(' ').toLowerCase().includes(search.trim().toLowerCase()),
  );
  const canCreate = !!keys && !loading && !pending && !showCreate && !secret && availableScopes.length > 0;

  return (
    <div className="developer-keys">
      <div className="developer-keys-summary">
        <Card><CardContent className="developer-keys-stat">
          <span className="developer-keys-stat-icon"><Icon name="key" size={20} /></span>
          <div><span className="developer-keys-caption">Active keys</span><strong>{activeCount ?? '—'}</strong></div>
        </CardContent></Card>
        <Card><CardContent className="developer-keys-stat">
          <span className="developer-keys-stat-icon"><Icon name="activity" size={20} /></span>
          <div><span className="developer-keys-caption">Requests · last 30 days</span><strong>{usage?.total_calls.toLocaleString() ?? '—'}</strong></div>
        </CardContent></Card>
        <Card><CardContent className="developer-keys-stat">
          <span className="developer-keys-stat-icon"><Icon name="alertCircle" size={20} /></span>
          <div><span className="developer-keys-caption">Request errors · last 30 days</span><strong>{usage?.error_calls.toLocaleString() ?? '—'}</strong></div>
        </CardContent></Card>
      </div>

      {loadError && <div className="developer-keys-notice" role="alert">
        <Icon name="alertCircle" size={18} /><span>{loadError}</span>
        <Button type="button" size="sm" variant="outline" disabled={loading || pending} onClick={() => void load()}>Retry</Button>
      </div>}
      {actionError && <div className="developer-keys-notice" role="alert"><Icon name="alertCircle" size={18} /><span>{actionError}</span></div>}

      {secret && <Card className="developer-keys-secret">
        <CardHeader><CardTitle>Your key is ready</CardTitle>
          <CardDescription>Copy it to your secret manager now. The full key is shown only once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input aria-label="New API key value" value={secret} readOnly autoComplete="off" spellCheck={false} className="font-mono" />
          <div className="developer-keys-actions">
            <Button type="button" size="sm" onClick={copySecret}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy key'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setSecret(null); setActionError(''); }}>Done</Button>
          </div>
        </CardContent>
      </Card>}

      {showCreate && <Card>
        <CardHeader><CardTitle>Create an API key</CardTitle>
          <CardDescription>Choose the services this integration needs and how long it can access them.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createKey} className="developer-keys-form">
            <div className="developer-keys-form-fields">
              <label className="developer-keys-field"><span>Key name</span>
                <Input autoFocus placeholder="e.g. Warehouse integration" value={name} onChange={event => setName(event.target.value)} required maxLength={120} disabled={pending} />
              </label>
              <label className="developer-keys-field"><span>Expiry in days</span>
                <Input type="number" min={1} max={3650} step={1} value={days} onChange={event => setDays(event.target.value)} disabled={pending} />
                <small>Leave blank for a key with no expiry.</small>
              </label>
              <label className="developer-keys-access">
                <Checkbox checked={readOnly} disabled={pending} onCheckedChange={checked => setReadOnly(checked === true)} />
                <span><strong>Read-only access</strong><small>Allow this integration to retrieve data. Clear to permit writes.</small></span>
              </label>
            </div>
            <fieldset disabled={pending} className="developer-keys-scope-fieldset">
              <legend>App permissions <span className="developer-keys-caption">({scopes.length} selected)</span></legend>
              <p className="developer-keys-caption">Available scopes follow your workspace entitlements.</p>
              <div className="developer-keys-scopes">
                {availableScopes.map(scope => <label key={scope} className="developer-keys-scope" data-selected={scopes.includes(scope)}>
                  <Checkbox checked={scopes.includes(scope)} onCheckedChange={() => toggleScope(scope)} /><span>{scope}</span>
                </label>)}
              </div>
            </fieldset>
            <div className="developer-keys-form-footer">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { setShowCreate(false); setActionError(''); }}>Cancel</Button>
              <Button type="submit" size="sm" loading={pending} disabled={!name.trim() || !scopes.length}>Create key</Button>
            </div>
          </form>
        </CardContent>
      </Card>}

      <div className="developer-keys-layout">
        <Card className="developer-keys-list">
          <CardHeader className="developer-keys-list-header">
            <div><CardTitle>Workspace keys</CardTitle><CardDescription>Manage credentials for your applications and integrations.</CardDescription></div>
            <Button type="button" size="sm" disabled={!canCreate} onClick={() => { setActionError(''); setShowCreate(true); }}>
              <Icon name="plus" size={16} />Create API key
            </Button>
          </CardHeader>
          <CardContent>
            <div className="developer-keys-toolbar">
              <div className="developer-keys-search"><Icon name="search" size={16} />
                <Input aria-label="Search API keys" placeholder="Search names, prefixes or scopes…" value={search} onChange={event => setSearch(event.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="developer-keys-filter" aria-label="Filter keys by status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem><SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {keys === null && loading && <div className="developer-keys-empty"><SectionLoading /></div>}
            {keys && keys.length === 0 && <div className="developer-keys-empty">
              <span className="developer-keys-empty-icon"><Icon name="key" size={28} /></span>
              <h3>Connect your first integration</h3>
              <p>Create a scoped key to give your application access to Hudumika.</p>
              {!loading && !loadError && availableScopes.length === 0 && <p>No scopes are available for this workspace.</p>}
            </div>}
            {!!keys?.length && <Table aria-label="Workspace API keys">
              <TableHeader><TableRow>
                {['Name & key', 'Permissions', 'Activity', 'Status', ''].map((label, index) => <TableHead key={index}>{label || <span className="sr-only">Actions</span>}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {filteredKeys?.map(key => {
                  const status = keyStatus(key);
                  return <TableRow key={key.id}>
                    <TableCell><div className="developer-keys-identity">
                      <span className="developer-keys-key-icon"><Icon name="key" size={16} /></span>
                      <div><strong>{key.name}</strong><code>{key.key_prefix}…</code></div>
                    </div></TableCell>
                    <TableCell><div className="developer-keys-permissions">
                      <span>{key.read_only ? 'Read-only' : 'Read & write'}</span>
                      <div>{key.scopes.map(scope => <Badge variant="outline" key={scope}>{scope}</Badge>)}</div>
                    </div></TableCell>
                    <TableCell><div className="developer-keys-dates">
                      <span>{key.last_used_at ? 'Used ' + new Date(key.last_used_at).toLocaleDateString() : 'Never used'}</span>
                      <small>{key.expires_at ? 'Expires ' + new Date(key.expires_at).toLocaleDateString() : 'No expiry'}</small>
                    </div></TableCell>
                    <TableCell><Badge variant="outline" className={'developer-keys-status developer-keys-status-' + status}><span aria-hidden="true" />{status[0].toUpperCase() + status.slice(1)}</Badge></TableCell>
                    <TableCell>{!key.revoked_at && <Button type="button" size="sm" variant="ghost" disabled={loading || pending || !!secret}
                      onClick={() => void revokeKey(key)} aria-label={'Revoke ' + key.name}>Revoke</Button>}</TableCell>
                  </TableRow>;
                })}
                {filteredKeys?.length === 0 && <TableRow><TableCell colSpan={5}>
                  <div className="developer-keys-empty"><h3>No matching keys</h3><p>Try another name, scope or status.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>
                  </div>
                </TableCell></TableRow>}
              </TableBody>
            </Table>}
            {keys && keys.length > 0 && <p className="developer-keys-table-caption">{filteredKeys?.length} of {keys.length} keys · Full keys are visible only when created.</p>}
          </CardContent>
        </Card>

        <aside className="developer-keys-sidebar">
          <Card><CardHeader><CardTitle>Using your key</CardTitle><CardDescription>Include this header in your server requests.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <pre className="developer-keys-code"><code>{'x-api-key: YOUR_API_KEY'}</code></pre>
              <div className="developer-keys-guidance"><Icon name="shield" size={18} /><p>Keep keys on your server or in a secret manager. Revoke credentials when an integration no longer needs access.</p></div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Last 30 days across workspace keys and sessions. Limited to 2,000 recent requests.</CardDescription></CardHeader>
            <CardContent>
              {loading && !usage && <SectionLoading />}
              {usageUnavailable && <div className="space-y-2"><p>Activity is temporarily unavailable.</p><Button type="button" variant="outline" size="sm" disabled={pending || showCreate || loading} onClick={() => void load()}>Retry</Button></div>}
              {usage && (usage.top_endpoints.length ? <ul className="developer-keys-endpoints">
                {usage.top_endpoints.map(item => <li key={item.endpoint}><code>{item.endpoint}</code><span>{item.count.toLocaleString()}</span></li>)}
              </ul> : <p className="developer-keys-caption">No requests recorded in this period.</p>)}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
