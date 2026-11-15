import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { apiError, fmtWhen, fmtNum } from './pulseShared.js';

interface Consent {
  id: string; channel: 'email' | 'sms' | 'whatsapp'; address: string;
  status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained'; source: string; evidence: any; updated_at: string;
}

const STATUS_BADGE = {
  subscribed: { label: 'Subscribed', variant: 'success' },
  unsubscribed: { label: 'Unsubscribed', variant: 'gray' },
  bounced: { label: 'Bounced', variant: 'error' },
  complained: { label: 'Marked as spam', variant: 'error' },
} as const;

const SOURCE_TEXT: Record<string, string> = {
  unsubscribe_link: 'Unsubscribe link', manual: 'Set by a colleague', bounce: 'Mail server rejected it', form: 'Website form', import: 'Import',
};

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

export function PulseConsents() {
  usePageSEO('Consent', 'Who has opted in or out of Pulse marketing, by channel.');
  const { user } = useAuth();
  const canEdit = PUBLISH_ROLES.includes(user?.role ?? '');
  const [rows, setRows] = useState<Consent[]>([]);
  const [total, setTotal] = useState(0);
  const [smsOptOuts, setSmsOptOuts] = useState(0);
  const [channel, setChannel] = useState('email');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ address: '', status: 'unsubscribed', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ channel, limit: '100' });
    if (status !== 'all') qs.set('status', status);
    if (q.trim()) qs.set('q', q.trim());
    apiFetch(`/v1/pulse/consents?${qs}`).then((r: any) => { setRows(r.data); setTotal(r.total); setSmsOptOuts(r.sms_opt_outs); })
      .catch((e) => showAlert(apiError(e), { variant: 'error' })).finally(() => setLoading(false));
  }, [channel, status, q]);
  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/pulse/consents', { method: 'POST', body: JSON.stringify({ channel, address: form.address, status: form.status, note: form.note || undefined }) });
      setForm({ address: '', status: 'unsubscribed', note: '' });
      load();
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
    finally { setSaving(false); }
  }

  const columns: TableColumn<Consent>[] = [
    { key: 'address', header: channel === 'email' ? 'Email' : 'Phone', render: (r) => <span className="pulse-strong">{channel === 'email' ? r.address : `…${r.address}`}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge> },
    { key: 'source', header: 'How', hideAt: 'sm', render: (r) => (
      <div><div>{SOURCE_TEXT[r.source] ?? r.source}</div>{r.evidence?.note && <div className="pulse-muted">{r.evidence.note}</div>}</div>
    ) },
    { key: 'updated_at', header: 'When', hideAt: 'md', render: (r) => fmtWhen(r.updated_at) },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Consent']} titlePlain="Marketing" titleEm="consent"
        subtitle="Pulse never sends marketing to anyone listed here as unsubscribed, bounced or marked as spam. Every email carries an unsubscribe link." />
      <div className="pulse-filters">
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger aria-label="Channel" className="pulse-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem></SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status" className="pulse-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {Object.entries(STATUS_BADGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input aria-label="Search addresses" className="pulse-search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {channel === 'sms' && (
        <p className="pulse-note">
          {fmtNum(smsOptOuts)} {smsOptOuts === 1 ? 'number has' : 'numbers have'} replied STOP or been opted out in the SMS app. Pulse honours that list too; manage it in SMS ▸ Opt-outs.
        </p>
      )}
      <div className="pulse-split">
        <SectionCard title={`${fmtNum(total)} ${total === 1 ? 'record' : 'records'}`} padded={false} collapsible={false}>
          <DataTable columns={columns} rows={rows} loading={loading}
            empty={!loading && rows.length === 0 && !q && status === 'all'} emptyIcon="checkCircle" emptyTitle="No recorded choices yet"
            emptyMessage="Unsubscribes, bounces and choices you record by hand appear here."
            filteredEmpty={!loading && rows.length === 0 && (!!q || status !== 'all')} />
        </SectionCard>
        {canEdit && (
          <SectionCard title="Record a choice" collapsible={false}>
            <div className="pulse-form">
              <div className="pulse-field">
                <Label htmlFor="consent-address">{channel === 'email' ? 'Email address' : 'Phone number'}</Label>
                <Input id="consent-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="pulse-field">
                <Label htmlFor="consent-status">Choice</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="consent-status"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="unsubscribed">Opt out</SelectItem><SelectItem value="subscribed">Opt in</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="pulse-field">
                <Label htmlFor="consent-note">How they asked</Label>
                <Textarea id="consent-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={form.status === 'subscribed' ? 'Required when adding back someone who opted out' : 'e.g. asked by phone on 3 March'} />
              </div>
              <Button onClick={save} disabled={saving || !form.address.trim()}><Icon name="checkCircle" size={14} /> {saving ? 'Saving…' : 'Save choice'}</Button>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
