import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MailDnsRecord, OnsiteEmailMailbox } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import './Onsite.css';

export function OnsiteMailSetup() {
  const { id } = useParams();
  const base = `/v1/onsite/email-domains/${id}`;
  const [provider, setProvider] = useState('');
  const [connected, setConnected] = useState(false);
  const [records, setRecords] = useState<MailDnsRecord[]>([]);
  const [mailboxes, setMailboxes] = useState<OnsiteEmailMailbox[]>([]);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reload = async () => {
    const [setup, boxes] = await Promise.all([apiFetch(`${base}/setup`), apiFetch(`${base}/mailboxes`)]);
    setProvider(setup.provider === 'platform' ? 'cpanel' : setup.provider);
    setConnected(setup.connected); setRecords(setup.records); setMailboxes(boxes);
  };
  useEffect(() => { reload().catch(err => setError(err.message)).finally(() => setLoading(false)); }, [id]);
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Operation failed'); }
    finally { setBusy(''); }
  };
  const updateRecord = (index: number, patch: Partial<MailDnsRecord>) => setRecords(current => current.map((record, i) => i === index ? { ...record, ...patch } : record));
  return <div className="onsite-page">
    <PageHeader crumbs={['Onsite', 'Email', 'Setup']} titlePlain="Mail" titleEm="setup" subtitle="Connect the domain’s mail provider, verify its DNS records and provision mailboxes." actions={<Button variant="outline" asChild><Link to="/onsite/emails">Back to emails</Link></Button>} />
    {error && <Banner variant="error" title="Setup needs attention">{error}</Banner>}
    {notice && <Banner variant="success" title="Updated">{notice}</Banner>}
    {loading ? <SectionLoading /> : <div className="space-y-6">
      <section className="onsite-card space-y-4">
        <h2 className="onsite-card-title">Provider connection <Badge variant={connected ? 'success' : 'gray'}>{connected ? 'Credentials saved' : 'Not configured'}</Badge></h2>
        <p className="text-sm text-muted-foreground">{provider === 'google' ? 'Enable Directory API and grant domain-wide delegation for user administration and domain read access. Gmail service and licenses must be active in Google Admin.' : provider === 'microsoft' ? 'Grant application permissions for user creation, license assignment and domain read access. The selected SKU must include Exchange Online.' : provider === 'cpanel' ? 'Use a cPanel account token for this domain. Mail server addresses must come from the provider’s connection settings.' : 'Create mailboxes with your external provider and enter its issued DNS records below.'} Administration credentials are managed in Workspace Settings.</p>
        <Button variant="outline" asChild><Link to="/workspace/mail-providers">Configure workspace providers</Link></Button>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy} onClick={() => run('save', async () => {
            await apiFetch(`${base}/setup`, { method: 'PUT', body: JSON.stringify({ records }) });
            await reload(); setNotice('DNS values saved.');
          })}>{busy === 'save' && <ButtonSpinner />} Save DNS values</Button>
          <Button variant="outline" disabled={!!busy || !connected} onClick={() => run('check', async () => {
            const result = await apiFetch(`${base}/provider-check`, { method: 'POST' });
            if (result.discoveredRecords?.length) setRecords(current => [...current.filter(record => !['mx', 'spf'].includes(record.purpose)), ...result.discoveredRecords]);
            setNotice(result.discoveredRecords?.length ? 'Provider connected. Review the discovered MX/SPF records and save them.' : 'Provider administration connection verified.');
          })}>{busy === 'check' && <ButtonSpinner />} Check provider</Button>
        </div>
      </section>
      <section className="onsite-card space-y-4">
        <h2 className="onsite-card-title">Provider DNS records</h2>
        <p className="text-sm text-muted-foreground">Copy exact MX, SPF, DKIM and DMARC values from your mail provider. Publish them with your authoritative DNS provider, save these expected values here, then verify. DKIM may use TXT or CNAME records.</p>
        {records.map((record, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-3">
          <Select value={record.purpose} onValueChange={value => updateRecord(index, { purpose: value as MailDnsRecord['purpose'] })}><SelectTrigger aria-label="Record purpose"><SelectValue /></SelectTrigger><SelectContent>{['mx', 'spf', 'dkim', 'dmarc', 'verification'].map(value => <SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>)}</SelectContent></Select>
          <Select value={record.type} onValueChange={value => updateRecord(index, { type: value as MailDnsRecord['type'] })}><SelectTrigger aria-label="Record type"><SelectValue /></SelectTrigger><SelectContent>{['MX', 'TXT', 'CNAME'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Input aria-label="Record name" placeholder="Record name (@ for root)" value={record.name} onChange={e => updateRecord(index, { name: e.target.value })} />
          <Textarea className="md:col-span-3" aria-label="Provider-issued value" placeholder="Provider-issued value" value={record.value} onChange={e => updateRecord(index, { value: e.target.value })} />
          {record.type === 'MX' && <Input aria-label="MX priority" type="number" min={0} value={record.priority ?? 10} onChange={e => updateRecord(index, { priority: Number(e.target.value) })} />}
          <Button variant="ghost" onClick={() => setRecords(current => current.filter((_, i) => i !== index))}>Remove record</Button>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRecords(current => [...current, { name: '@', type: 'MX', value: '', priority: 10, ttl: 3600, purpose: 'mx' }])}>Add record</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => run('dns', async () => {
            const result = await apiFetch(`${base}/verify`, { method: 'POST' });
            const missing = ['mx', 'spf', 'dkim', 'dmarc'].filter(key => !result[key].found);
            setNotice(missing.length ? `Records still need attention: ${missing.join(', ')}. Save changes before verifying.` : 'All mail DNS values match.');
          })}>{busy === 'dns' && <ButtonSpinner />} Verify published DNS</Button>
        </div>
      </section>
      <section className="onsite-card space-y-4">
        <h2 className="onsite-card-title">Provision mailboxes</h2>
        <p className="text-sm text-muted-foreground">Create mailbox records on the Emails page first. Provisioning creates a real provider account; Google and Microsoft accounts may need license or service activation. Keep the initial password securely for onboarding.</p>
        {mailboxes.filter(box => box.type === 'mailbox').map(box => <div key={box.id} className="space-y-2 border-b py-3">
          <div className="flex flex-wrap items-center gap-2"><span>{box.full_address}</span><Badge variant={box.provision_status === 'ready' ? 'success' : 'gray'}>{box.provision_status}</Badge></div>
          {box.provision_error && <p className="text-sm text-muted-foreground">{box.provision_error}</p>}
          {box.provision_status !== 'unconfigured' && <Button variant="outline" disabled={!!busy || !connected} onClick={() => run(`check-${box.id}`, async () => {
            await apiFetch(`${base}/mailboxes/${box.id}/check`, { method: 'POST' });
            await reload(); setNotice('Provider account status refreshed.');
          })}>Check activation</Button>}
          {box.provision_status === 'unconfigured' && <div className="flex flex-wrap gap-2">
            <Input className="max-w-sm" type="password" autoComplete="new-password" aria-label={`Initial password for ${box.full_address}`} placeholder="Initial password (16+ characters)" value={passwords[box.id] ?? ''} onChange={e => setPasswords(current => ({ ...current, [box.id]: e.target.value }))} />
            <Button disabled={!!busy || !connected || (passwords[box.id]?.length ?? 0) < 16} onClick={() => run(box.id, async () => {
              await apiFetch(`${base}/mailboxes/${box.id}/provision`, { method: 'POST', body: JSON.stringify({ password: passwords[box.id] }) });
              setPasswords(current => ({ ...current, [box.id]: '' })); await reload(); setNotice('Provider account created. Review its activation status below.');
            })}>{busy === box.id && <ButtonSpinner />} Provision mailbox</Button>
          </div>}
        </div>)}
      </section>
    </div>}
  </div>;
}
