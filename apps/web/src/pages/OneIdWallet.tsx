// ─── OneIdWallet.tsx — Ondi Personal · Wallet ─────────────────────
// A small credential vault for the user's own third-party logins — secrets
// are encrypted at rest server-side (AES-256-GCM, onsite-secrets.service.ts)
// and never sent to the browser except when explicitly revealed. Not the
// "E2E-encrypted vault" ondi-mvp originally envisioned — that stays
// deferred; this is real server-side encryption with a modest threat
// model, honestly labeled as such below.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface WalletItem { id: string; label: string; username: string | null; url: string | null; created_at: string; updated_at: string }

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function EditableFields({ label, setLabel, username, setUsername, url, setUrl, secret, setSecret, secretRequired }: {
  label: string; setLabel: (v: string) => void;
  username: string; setUsername: (v: string) => void;
  url: string; setUrl: (v: string) => void;
  secret: string; setSecret: (v: string) => void;
  secretRequired: boolean;
}) {
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Label</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Personal Gmail" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Username (optional)</label>
          <input value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Website (optional)</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
          {secretRequired ? 'Password / secret' : 'New password / secret (leave blank to keep the current one)'}
        </label>
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)} style={inputStyle} />
      </div>
    </div>
  );
}

export const OneIdWallet: React.FC = () => {
  const [items, setItems] = useState<WalletItem[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setItems(await apiFetch('/v1/security/wallet')); } catch { setItems([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  function resetForm() { setLabel(''); setUsername(''); setUrl(''); setSecret(''); }

  async function createItem() {
    if (!label.trim() || !secret) { showAlert('A label and a secret are both required.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/security/wallet', { method: 'POST', body: JSON.stringify({ label: label.trim(), username: username.trim() || undefined, url: url.trim() || undefined, secret }) });
      resetForm(); setShowNew(false);
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  function startEdit(item: WalletItem) {
    setEditingId(item.id); setLabel(item.label); setUsername(item.username || ''); setUrl(item.url || ''); setSecret('');
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { label: label.trim(), username: username.trim() || null, url: url.trim() || null };
      if (secret) body.secret = secret;
      await apiFetch(`/v1/security/wallet/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditingId(null); resetForm();
      setRevealed(prev => { const next = { ...prev }; delete next[id]; return next; });
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function remove(item: WalletItem) {
    if (!(await showConfirm(`Delete "${item.label}"? This can't be undone.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/security/wallet/${item.id}`, { method: 'DELETE' });
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  async function reveal(item: WalletItem) {
    if (revealed[item.id] !== undefined) {
      setRevealed(prev => { const next = { ...prev }; delete next[item.id]; return next; });
      return;
    }
    setRevealing(item.id);
    try {
      const res = await apiFetch(`/v1/security/wallet/${item.id}/reveal`);
      setRevealed(prev => ({ ...prev, [item.id]: res.secret }));
    } catch (err: any) { showAlert(err.message); } finally { setRevealing(null); }
  }

  async function copySecret(item: WalletItem) {
    let value = revealed[item.id];
    if (value === undefined) {
      try { value = (await apiFetch(`/v1/security/wallet/${item.id}/reveal`)).secret; }
      catch (err: any) { showAlert(err.message); return; }
    }
    try { await navigator.clipboard.writeText(value); showAlert('Copied to clipboard.', { variant: 'success', title: 'Copied' }); }
    catch { showAlert('Could not copy — your browser blocked clipboard access.'); }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Your"
        titleEm="wallet"
        subtitle="Your own logins and secrets — encrypted at rest, never shown until you ask."
        actions={!showNew ? (
          <button type="button" onClick={() => { setShowNew(true); setEditingId(null); resetForm(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            <Icon name="plus" size={15} /> Add item
          </button>
        ) : undefined}
      />

      {showNew && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="New item">
            <EditableFields label={label} setLabel={setLabel} username={username} setUsername={setUsername} url={url} setUrl={setUrl} secret={secret} setSecret={setSecret} secretRequired />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" disabled={saving} onClick={createItem}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
                {saving ? 'Saving…' : 'Save item'}
              </button>
              <button type="button" onClick={() => { setShowNew(false); resetForm(); }}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
                Cancel
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard padded={false}>
        {items === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {items?.length === 0 && !showNew && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Nothing saved yet — add your first item above.</div>}
        {items?.map((item, i, arr) => (
          <div key={item.id} style={{ padding: '15px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {editingId === item.id ? (
              <>
                <EditableFields label={label} setLabel={setLabel} username={username} setUsername={setUsername} url={url} setUrl={setUrl} secret={secret} setSecret={setSecret} secretRequired={false} />
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button type="button" disabled={saving} onClick={() => saveEdit(item.id)}
                    style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 12.5, fontFamily: 'var(--font)', cursor: 'pointer', opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box' }}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" onClick={() => { setEditingId(null); resetForm(); }}
                    style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 12.5, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box' }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="key" size={17} color="var(--teal)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                    {item.username || '—'}{item.url ? ` · ${item.url}` : ''}
                  </div>
                  <div style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink)', marginTop: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', display: 'inline-block', minWidth: 140 }}>
                    {revealed[item.id] !== undefined ? revealed[item.id] : '••••••••••••'}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 4 }}>Updated {fmtDate(item.updated_at)}</div>
                </div>
                <button type="button" title={revealed[item.id] !== undefined ? 'Hide' : 'Reveal'} disabled={revealing === item.id} onClick={() => reveal(item)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
                  <Icon name={revealed[item.id] !== undefined ? 'eyeOff' : 'eye'} size={16} />
                </button>
                <button type="button" title="Copy" onClick={() => copySecret(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
                  <Icon name="copy" size={16} />
                </button>
                <button type="button" title="Edit" onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" title="Delete" onClick={() => remove(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}>
                  <Icon name="trash2" size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default OneIdWallet;
