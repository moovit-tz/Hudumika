import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';

interface Gateway {
  id: string; provider: string; label: string; sender_id: string | null;
  priority: number; active: boolean; last_used_at: string | null; last_error: string | null; created_at: string;
}
interface SenderId { id: string; sender_id: string; label: string | null; is_default: boolean; }

const PROVIDER_LABELS: Record<string, string> = { africas_talking: "Africa's Talking", twilio: 'Twilio', nexmo: 'Vonage (Nexmo)', bongolive: 'BongoLive' };
const PROVIDER_FIELDS: Record<string, { key: string; label: string; secret?: boolean }[]> = {
  africas_talking: [{ key: 'atUser', label: 'Username' }, { key: 'atKey', label: 'API key', secret: true }],
  twilio: [{ key: 'twilioSid', label: 'Account SID' }, { key: 'twilioToken', label: 'Auth token', secret: true }],
  nexmo: [{ key: 'apiKey', label: 'API key' }, { key: 'apiSecret', label: 'API secret', secret: true }],
  bongolive: [{ key: 'username', label: 'Username' }, { key: 'password', label: 'Password', secret: true }],
};

export function SmsGateways() {
  usePageSEO('SMS Gateways', "Configure Africa's Talking, Twilio and other SMS gateways, sender IDs, and send priority.");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState('africas_talking');
  const [label, setLabel] = useState('');
  const [senderId, setSenderId] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [senderIds, setSenderIds] = useState<Record<string, SenderId[]>>({});
  const [newSenderId, setNewSenderId] = useState('');
  const [testNumber, setTestNumber] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/gateways').then(res => setGateways(res.data || [])).catch(() => setGateways([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  function startCreate() {
    setProvider('africas_talking'); setLabel(''); setSenderId(''); setCreds({}); setError(null); setShowForm(true);
  }

  async function save() {
    if (!label.trim()) { setError('Give this gateway a name.'); return; }
    const fields = PROVIDER_FIELDS[provider];
    if (fields.some(f => !creds[f.key]?.trim())) { setError('All credential fields are required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/sms/gateways', { method: 'POST', body: JSON.stringify({ provider, label: label.trim(), credentials: creds, senderId: senderId.trim() || undefined }) });
      setShowForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to save gateway'); }
    finally { setSaving(false); }
  }

  async function toggleActive(g: Gateway) {
    setGateways(prev => prev.map(x => x.id === g.id ? { ...x, active: !x.active } : x));
    await apiFetch(`/v1/sms/gateways/${g.id}`, { method: 'PATCH', body: JSON.stringify({ active: !g.active }) }).catch(load);
  }

  async function remove(id: string, label: string) {
    if (!await showConfirm(`"${label}" will be permanently removed.`, { title: 'Delete gateway?', variant: 'danger', confirmLabel: 'Delete' })) return;
    setGateways(prev => prev.filter(g => g.id !== id));
    await apiFetch(`/v1/sms/gateways/${id}`, { method: 'DELETE' }).catch(load);
  }

  function loadSenderIds(gatewayId: string) {
    apiFetch(`/v1/sms/gateways/${gatewayId}/sender-ids`).then(res => setSenderIds(prev => ({ ...prev, [gatewayId]: res.data || [] }))).catch(() => {});
  }
  function toggleExpand(g: Gateway) {
    const next = expanded === g.id ? null : g.id;
    setExpanded(next);
    if (next) loadSenderIds(g.id);
  }
  async function addSenderId(gatewayId: string) {
    if (!newSenderId.trim()) return;
    await apiFetch(`/v1/sms/gateways/${gatewayId}/sender-ids`, { method: 'POST', body: JSON.stringify({ senderId: newSenderId.trim(), isDefault: !(senderIds[gatewayId]?.length) }) })
      .catch(err => showAlert(err.message || 'Could not add sender ID.'));
    setNewSenderId('');
    loadSenderIds(gatewayId);
    load();
  }
  async function setDefaultSenderId(gatewayId: string, senderIdRowId: string) {
    await apiFetch(`/v1/sms/gateways/${gatewayId}/sender-ids/${senderIdRowId}/default`, { method: 'POST' }).catch(() => {});
    loadSenderIds(gatewayId);
    load();
  }
  async function removeSenderId(gatewayId: string, senderIdRowId: string) {
    await apiFetch(`/v1/sms/gateways/${gatewayId}/sender-ids/${senderIdRowId}`, { method: 'DELETE' }).catch(() => {});
    loadSenderIds(gatewayId);
  }

  async function testSend(gatewayId: string) {
    const to = testNumber[gatewayId]?.trim();
    if (!to) { showAlert('Enter a phone number to send the test to.'); return; }
    setTesting(gatewayId);
    try {
      const res = await apiFetch(`/v1/sms/gateways/${gatewayId}/test`, { method: 'POST', body: JSON.stringify({ to }) });
      showAlert(res.data?.success ? 'Test message sent — check the recipient\'s phone.' : `Test failed: ${res.data?.error}`);
      load();
    } catch (err: any) { showAlert(err.message || 'Test failed.'); }
    finally { setTesting(null); }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Gateways']}
        titlePlain="SMS"
        titleEm="gateways"
        subtitle="Multiple providers, tried in priority order — a failed send falls through to the next active gateway automatically."
        actions={<Button onClick={startCreate}><Icon name="plus" size={14} /> New gateway</Button>}
      />

      {showForm && (
        <SectionCard title="New gateway" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Provider</label>
              <Select value={provider} onValueChange={v => { setProvider(v); setCreds({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Primary AT account" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            {PROVIDER_FIELDS[provider].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>{f.label} *</label>
                <Input type={f.secret ? 'password' : 'text'} value={creds[f.key] || ''} onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 14, maxWidth: 280 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Default sender ID (optional)</label>
            <Input value={senderId} onChange={e => setSenderId(e.target.value)} placeholder="Short code, name, or number" />
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Add gateway'}</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Gateways" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : gateways.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No gateways configured — SMS sends will fail until one is added.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {gateways.map((g, i) => (
              <div key={g.id} style={{ borderBottom: i < gateways.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', width: 20 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {g.label}
                      <Badge variant="gray">{PROVIDER_LABELS[g.provider] || g.provider}</Badge>
                      {!g.active && <Badge variant="gray">Disabled</Badge>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {g.sender_id ? `Sender: ${g.sender_id}` : 'No default sender ID'}
                      {g.last_used_at && ` · Last used ${new Date(g.last_used_at).toLocaleString()}`}
                    </div>
                    {g.last_error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 2 }}>{g.last_error}</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(g)}>{g.active ? 'Disable' : 'Enable'}</Button>
                  <Button size="sm" variant="outline" onClick={() => toggleExpand(g)}>{expanded === g.id ? 'Hide' : 'Manage'} <Icon name={expanded === g.id ? 'chevronUp' : 'chevronDown'} size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(g.id, g.label)}><Icon name="trash" size={13} color="var(--red)" /></Button>
                </div>

                {expanded === g.id && (
                  <div style={{ padding: '0 16px 16px 50px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Sender IDs</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {(senderIds[g.id] || []).map(sid => (
                          <div key={sid.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{sid.sender_id}</span>
                            {sid.is_default && <Badge variant="brand">Default</Badge>}
                            {!sid.is_default && <button type="button" onClick={() => setDefaultSenderId(g.id, sid.id)} style={{ fontSize: 11.5, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>Make default</button>}
                            <button type="button" onClick={() => removeSenderId(g.id, sid.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex' }}><Icon name="x" size={12} /></button>
                          </div>
                        ))}
                        {(senderIds[g.id] || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No named sender IDs — using the gateway's default above.</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Input value={newSenderId} onChange={e => setNewSenderId(e.target.value)} placeholder="Add a sender ID…" style={{ maxWidth: 240 }} />
                        <Button size="sm" variant="outline" onClick={() => addSenderId(g.id)}>Add</Button>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Test this gateway</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Input value={testNumber[g.id] || ''} onChange={e => setTestNumber(p => ({ ...p, [g.id]: e.target.value }))} placeholder="+255700000000" style={{ maxWidth: 240 }} />
                        <Button size="sm" disabled={testing === g.id} onClick={() => testSend(g.id)}>{testing === g.id ? 'Sending…' : 'Send test'}</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
