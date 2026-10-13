import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { MailProviderFields } from '../components/MailProviderFields.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading, ButtonSpinner } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';

const providers = [{ kind: 'cpanel', name: 'cPanel', help: 'Use an account API token with access to your hosted email domains.' },
  { kind: 'google', name: 'Google Workspace', help: 'Enable Directory API and authorize domain-wide delegation for admin.directory.user and admin.directory.domain.readonly. Activate Gmail and Workspace licensing in Google Admin.' },
  { kind: 'microsoft', name: 'Microsoft 365', help: 'Grant application permissions User.ReadWrite.All, LicenseAssignment.ReadWrite.All and Domain.Read.All, with administrator consent. Select a license SKU that includes Exchange Online.' }];

export function WorkspaceMailProviders() {
  const [saved, setSaved] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [domains, setDomains] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => setSaved((await apiFetch('/v1/settings/mail-providers')).map((row: { kind: string }) => row.kind));
  useEffect(() => { load().catch(err => setError(err.message)).finally(() => setLoading(false)); }, []);
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Provider operation failed'); }
    finally { setBusy(''); }
  };
  return <div className="space-y-6">
    <PageHeader crumbs={['Workspace', 'Settings', 'Email']} titlePlain="Mail" titleEm="providers" subtitle="Configure each provider once for this workspace. Its credentials are reused by all matching email domains." actions={<Button variant="outline" asChild><Link to="/onsite/emails">Manage email domains</Link></Button>} />
    {error && <Banner variant="error" title="Connection needs attention">{error}</Banner>}
    {notice && <Banner variant="success" title="Updated">{notice}</Banner>}
    {loading ? <SectionLoading /> : providers.map(provider => <section key={provider.kind} className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{provider.name}</h2><Badge variant={saved.includes(provider.kind) ? 'success' : 'gray'}>{saved.includes(provider.kind) ? 'Credentials saved' : 'Not configured'}</Badge></div>
      <p className="text-sm text-muted-foreground">{provider.help} Secrets are encrypted and never returned. Enter all fields when replacing a connection.</p>
      <MailProviderFields provider={provider.kind} values={values[provider.kind] ?? {}} onChange={next => setValues(current => ({ ...current, [provider.kind]: next }))} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => run(provider.kind, async () => {
          await apiFetch('/v1/settings/mail-providers', { method: 'PUT', body: JSON.stringify({ kind: provider.kind, ...values[provider.kind] }) });
          setValues(current => ({ ...current, [provider.kind]: {} })); await load(); setNotice(`${provider.name} credentials saved for this workspace.`);
        })}>{busy === provider.kind && <ButtonSpinner />} Save connection</Button>
        <Input className="max-w-xs" aria-label={`Test domain for ${provider.name}`} placeholder="Domain owned by this provider" value={domains[provider.kind] ?? ''} onChange={e => setDomains(current => ({ ...current, [provider.kind]: e.target.value }))} />
        <Button variant="outline" disabled={!!busy || !saved.includes(provider.kind)} onClick={() => run(`check-${provider.kind}`, async () => {
          await apiFetch(`/v1/settings/mail-providers/${provider.kind}/check`, { method: 'POST', body: JSON.stringify({ domain: domains[provider.kind] }) });
          setNotice(`${provider.name} administration access and domain verified.`);
        })}>{busy === `check-${provider.kind}` && <ButtonSpinner />} Test connection</Button>
      </div>
    </section>)}
    <section className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold">Historical delivery records</h2>
      <p className="text-sm text-muted-foreground">Reconcile existing communication logs against their stored outbox outcomes. This does not resend messages. Historical entries without provider evidence remain unverified.</p>
      <div className="flex flex-wrap gap-2">{[false, true].map(apply => <Button key={String(apply)} variant="outline" disabled={!!busy} onClick={() => run('history', async () => {
        const result = await apiFetch('/v1/comm/deliveries/reconcile', { method: 'POST', body: JSON.stringify({ apply }) });
        setNotice(`${apply ? 'Reconciled' : 'Preview'}: ${result.repaired} log changes; ${result.unverified} unverified; ${result.orphaned} without an outbox link.`);
      })}>{apply ? 'Reconcile history' : 'Preview reconciliation'}</Button>)}</div>
    </section>
  </div>;
}
