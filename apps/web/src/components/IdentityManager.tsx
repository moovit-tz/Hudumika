import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';

export interface EmailSendIdentity {
  id: string;
  fromName: string;
  fromEmail: string;
  sendProtocol: 'smtp' | 'outlook' | 'gmail';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpEncryption: 'ssl' | 'tls' | 'none';
  isDefault: boolean;
  replyBehavior: 'same_as_received' | 'always_default';
}

const EMPTY_DRAFT = { fromName: '', fromEmail: '', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpEncryption: 'ssl' as const };

/**
 * "Send mail as" — additional named email aliases (email_send_identities,
 * migration 494) beyond the single identity already configurable just above
 * this in the Accounts tab. Lives in Settings ▸ Accounts; `onChange` reports
 * the latest list back up so Compose's "From" picker stays current.
 */
export function IdentityManager({ onChange }: { onChange?: (ids: EmailSendIdentity[]) => void }) {
  const [identities, setIdentities] = useState<EmailSendIdentity[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; error?: string } | null>(null);

  function load() {
    apiFetch('/v1/email/identities').then(res => {
      const rows = Array.isArray(res) ? res : [];
      setIdentities(rows);
      onChange?.(rows);
    }).catch(() => setIdentities([]));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDraft() {
    if (!draft.fromEmail.trim()) return showAlert('Enter the email address for this alias.');
    if (!draft.smtpHost.trim() || !draft.smtpUser.trim()) return showAlert('Enter SMTP host and username to send from this alias.');
    setSaving(true);
    try {
      await apiFetch('/v1/email/identities', { method: 'POST', body: JSON.stringify(draft) });
      setAdding(false);
      setDraft(EMPTY_DRAFT);
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to add address.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/v1/email/identities/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to remove address.');
    }
  }

  async function setDefault(id: string) {
    try {
      await apiFetch(`/v1/email/identities/${id}/set-default`, { method: 'POST' });
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to set default.');
    }
  }

  async function test(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await apiFetch(`/v1/email/identities/${id}/test`, { method: 'POST' });
      setTestResult({ id, ...res });
    } catch (e: any) {
      setTestResult({ id, success: false, error: e.message });
    } finally {
      setTesting(null);
    }
  }

  if (identities === null) return <p className="em-settings-hint">Loading…</p>;

  return (
    <div>
      <div className="em-label-manage-list">
        {identities.map(id => (
          <div key={id.id} className="em-label-manage-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{id.fromName || id.fromEmail} &lt;{id.fromEmail}&gt;</span>
              {id.isDefault && <Badge variant="brand">Default</Badge>}
              <div style={{ flex: 1 }} />
              <button type="button" className="em-text-btn" onClick={() => test(id.id)} disabled={testing === id.id}>
                {testing === id.id ? 'Testing…' : 'Test'}
              </button>
              <button type="button" className="em-attach-chip-remove" onClick={() => remove(id.id)}><Icon name="trash" size={13} /></button>
            </div>
            {testResult?.id === id.id && (
              <span className={testResult.success ? 'em-settings-success' : 'em-settings-error'}>
                {testResult.success ? 'Connected successfully.' : testResult.error}
              </span>
            )}
            {!id.isDefault && <button type="button" className="em-text-btn" onClick={() => setDefault(id.id)}>Make default</button>}
          </div>
        ))}
        {identities.length === 0 && !adding && <p className="em-settings-hint">No additional addresses yet — your workspace address above is used for everything.</p>}
      </div>

      {adding ? (
        <div className="em-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, marginTop: 10 }}>
          <div className="em-settings-row">
            <span className="em-compose-label">Name</span>
            <input className="em-compose-input em-settings-input" value={draft.fromName} placeholder="Display name" onChange={e => setDraft({ ...draft, fromName: e.target.value })} />
          </div>
          <div className="em-settings-row">
            <span className="em-compose-label">Address</span>
            <input className="em-compose-input em-settings-input" value={draft.fromEmail} placeholder="you@otherdomain.com" onChange={e => setDraft({ ...draft, fromEmail: e.target.value })} />
          </div>
          <div className="em-settings-row">
            <span className="em-compose-label">SMTP host</span>
            <input className="em-compose-input em-settings-input" value={draft.smtpHost} placeholder="smtp.example.com" onChange={e => setDraft({ ...draft, smtpHost: e.target.value })} />
          </div>
          <div className="em-settings-row">
            <span className="em-compose-label">Port</span>
            <input className="em-compose-input em-settings-input" type="number" value={draft.smtpPort} onChange={e => setDraft({ ...draft, smtpPort: parseInt(e.target.value, 10) || 587 })} />
            <Select value={draft.smtpEncryption} onValueChange={v => setDraft({ ...draft, smtpEncryption: v as any })}>
              <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ssl">SSL</SelectItem>
                <SelectItem value="tls">TLS</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="em-settings-row">
            <span className="em-compose-label">SMTP user</span>
            <input className="em-compose-input em-settings-input" value={draft.smtpUser} onChange={e => setDraft({ ...draft, smtpUser: e.target.value })} />
          </div>
          <div className="em-settings-row">
            <span className="em-compose-label">SMTP password</span>
            <input className="em-compose-input em-settings-input" type="password" value={draft.smtpPass} onChange={e => setDraft({ ...draft, smtpPass: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={saveDraft} disabled={saving}>{saving ? 'Saving…' : 'Add address'}</button>
            <button type="button" className="em-text-btn" onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="em-text-btn" onClick={() => setAdding(true)}>+ Add another email address</button>
      )}
    </div>
  );
}
