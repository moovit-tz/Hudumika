// ─── OndiWallet.tsx — Ondi Personal · Credentials ────────────────
// A small credential vault for the user's own third-party logins — secrets
// are encrypted at rest server-side (AES-256-GCM, onsite-secrets.service.ts)
// and never sent to the browser except when explicitly revealed. Not the
// "E2E-encrypted vault" ondi-mvp originally envisioned — that stays
// deferred; this is real server-side encryption with a modest threat
// model, honestly labeled as such below.
//
// Renamed from "Wallet" to "Credentials" (nav label in OndiShell.tsx, and
// the page title below) — a real feature-gap pass found this one word away
// from Petti's own "Wallets" (money/petty-cash) in the same app switcher,
// and "Credentials" is the more accurate name for what this page actually
// stores anyway.
//
// Sharing (view/edit tiers, revocable) and the reveal step-up prompt below
// are both part of the same feature-gap pass — security.routes.ts's wallet
// routes now back both.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';

interface WalletItem { id: string; label: string; username: string | null; url: string | null; created_at: string; updated_at: string }
interface SharedWalletItem extends WalletItem { permission: 'view' | 'edit'; owner_name: string }
interface ShareGrant { id: string; permission: 'view' | 'edit'; created_at: string; grantee_name: string; grantee_email: string }

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' };

function EditableFields({ label, setLabel, username, setUsername, url, setUrl, secret, setSecret, secretRequired }: {
  label: string; setLabel: (v: string) => void;
  username: string; setUsername: (v: string) => void;
  url: string; setUrl: (v: string) => void;
  secret: string; setSecret: (v: string) => void;
  secretRequired: boolean;
}) {
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

export const OndiWallet: React.FC = () => {
  const [owned, setOwned] = useState<WalletItem[] | null>(null);
  const [sharedWithMe, setSharedWithMe] = useState<SharedWalletItem[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  // Sharing panel state — which owned item currently has it expanded, its
  // loaded grants, and the add-grant mini-form.
  const [shareOpenFor, setShareOpenFor] = useState<string | null>(null);
  const [sharesByItem, setSharesByItem] = useState<Record<string, ShareGrant[]>>({});
  const [shareGrantee, setShareGrantee] = useState<PickerItem | null>(null);
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');
  const [sharing, setSharing] = useState(false);
  const staffCache = useRef<PickerItem[] | null>(null);

  const searchStaff = useCallback(async (query: string): Promise<PickerItem[]> => {
    if (!staffCache.current) {
      const users = await apiFetch('/v1/ondi/users').catch(() => []);
      staffCache.current = users.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
    }
    const q = query.trim().toLowerCase();
    const all = staffCache.current ?? [];
    return q ? all.filter(u => u.label.toLowerCase().includes(q) || u.sublabel?.toLowerCase().includes(q)) : all;
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/security/wallet');
      setOwned(res.owned);
      setSharedWithMe(res.sharedWithMe);
    } catch { setOwned([]); setSharedWithMe([]); }
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

  // Ondi feature-gap pass (M2): reveal is gated by the real authz-check
  // step-up policy (security.routes.ts) — a 2FA-enabled account gets a real
  // STEP_UP response here instead of the secret, answered by asking for the
  // current code and retrying once. An account with no 2FA configured
  // clears this immediately server-side (see authz-check.ts), so this
  // prompt only ever appears for accounts it can actually protect.
  async function revealSecret(itemId: string): Promise<string> {
    try {
      return (await apiFetch(`/v1/security/wallet/${itemId}/reveal`)).secret;
    } catch (err: any) {
      if (err.status === 403 && err.body?.error === 'step_up_required') {
        const code = await showPrompt('Enter your current 6-digit authentication code to view this secret.', {
          title: "Verify it's you", placeholder: '123456', required: true,
        });
        if (!code) throw new Error('Reveal cancelled.');
        return (await apiFetch(`/v1/security/wallet/${itemId}/reveal?totp=${encodeURIComponent(code)}`)).secret;
      }
      throw err;
    }
  }

  async function reveal(item: WalletItem) {
    if (revealed[item.id] !== undefined) {
      setRevealed(prev => { const next = { ...prev }; delete next[item.id]; return next; });
      return;
    }
    setRevealing(item.id);
    try {
      const s = await revealSecret(item.id);
      setRevealed(prev => ({ ...prev, [item.id]: s }));
    } catch (err: any) { showAlert(err.message); } finally { setRevealing(null); }
  }

  async function copySecret(item: WalletItem) {
    let value = revealed[item.id];
    if (value === undefined) {
      try { value = await revealSecret(item.id); }
      catch (err: any) { showAlert(err.message); return; }
    }
    try { await navigator.clipboard.writeText(value); showAlert('Copied to clipboard.', { variant: 'success', title: 'Copied' }); }
    catch { showAlert('Could not copy — your browser blocked clipboard access.'); }
  }

  async function toggleSharePanel(item: WalletItem) {
    if (shareOpenFor === item.id) { setShareOpenFor(null); return; }
    setShareOpenFor(item.id);
    setShareGrantee(null); setSharePermission('view');
    if (!sharesByItem[item.id]) {
      try {
        const grants = await apiFetch(`/v1/security/wallet/${item.id}/shares`);
        setSharesByItem(prev => ({ ...prev, [item.id]: grants }));
      } catch { setSharesByItem(prev => ({ ...prev, [item.id]: [] })); }
    }
  }

  async function addShare(itemId: string) {
    if (!shareGrantee) { showAlert('Pick who to share this with.'); return; }
    setSharing(true);
    try {
      await apiFetch(`/v1/security/wallet/${itemId}/share`, {
        method: 'POST',
        body: JSON.stringify({ grantee_user_id: shareGrantee.id, permission: sharePermission }),
      });
      const grants = await apiFetch(`/v1/security/wallet/${itemId}/shares`);
      setSharesByItem(prev => ({ ...prev, [itemId]: grants }));
      setShareGrantee(null); setSharePermission('view');
    } catch (err: any) {
      if (err.status === 403 && err.body?.error === 'step_up_required') {
        const code = await showPrompt('Enter your current 6-digit authentication code to share this item.', {
          title: "Verify it's you", placeholder: '123456', required: true,
        });
        if (!code) { setSharing(false); return; }
        try {
          await apiFetch(`/v1/security/wallet/${itemId}/share`, {
            method: 'POST',
            body: JSON.stringify({ grantee_user_id: shareGrantee.id, permission: sharePermission, freshAuthTotp: code }),
          });
          const grants = await apiFetch(`/v1/security/wallet/${itemId}/shares`);
          setSharesByItem(prev => ({ ...prev, [itemId]: grants }));
          setShareGrantee(null); setSharePermission('view');
        } catch (err2: any) { showAlert(err2.message); }
      } else { showAlert(err.message); }
    } finally { setSharing(false); }
  }

  async function revokeShare(itemId: string, shareId: string) {
    if (!(await showConfirm('Revoke this person\'s access to this item?', { variant: 'warning', confirmLabel: 'Revoke' }))) return;
    try {
      await apiFetch(`/v1/security/wallet/${itemId}/share/${shareId}`, { method: 'DELETE' });
      setSharesByItem(prev => ({ ...prev, [itemId]: (prev[itemId] || []).filter(g => g.id !== shareId) }));
    } catch (err: any) { showAlert(err.message); }
  }

  function renderItemRow(item: WalletItem, opts: { canEdit: boolean; canDelete: boolean; canShare: boolean; badge?: React.ReactNode }) {
    return (
      <div key={item.id} style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
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
            <div style={{ width: 38, height: 38, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="key" size={17} color="var(--teal)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.label} {opts.badge}
              </div>
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
            {opts.canShare && (
              <button type="button" title="Share" onClick={() => toggleSharePanel(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: shareOpenFor === item.id ? 'var(--teal)' : 'var(--ink3)', padding: 6 }}>
                <Icon name="userPlus" size={16} />
              </button>
            )}
            {opts.canEdit && (
              <button type="button" title="Edit" onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
                <Icon name="edit" size={16} />
              </button>
            )}
            {opts.canDelete && (
              <button type="button" title="Delete" onClick={() => remove(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}>
                <Icon name="trash2" size={16} />
              </button>
            )}
          </div>
        )}

        {opts.canShare && shareOpenFor === item.id && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Shared with</div>
            {(sharesByItem[item.id] || []).length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 10 }}>Not shared with anyone yet.</div>
            )}
            {(sharesByItem[item.id] || []).map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{g.grantee_name} <span style={{ color: 'var(--ink3)' }}>· {g.grantee_email}</span></div>
                <Badge variant={g.permission === 'edit' ? 'brand' : 'gray'}>{g.permission === 'edit' ? 'Can edit' : 'Can view'}</Badge>
                <button type="button" onClick={() => revokeShare(item.id, g.id)}
                  style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--red)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
                  Revoke
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <EntityPicker value={shareGrantee} onChange={setShareGrantee} search={searchStaff} placeholder="Search a colleague…" />
              </div>
              <Select value={sharePermission} onValueChange={v => setSharePermission(v as 'view' | 'edit')}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Can view</SelectItem>
                  <SelectItem value="edit">Can edit</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" disabled={sharing} onClick={() => addShare(item.id)}
                style={{ padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 'var(--r-sm)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 12.5, fontFamily: 'var(--font)', cursor: 'pointer', opacity: sharing ? 0.6 : 1, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                {sharing ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Your"
        titleEm="credentials"
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
        {owned === null && <SectionLoading />}
        {owned?.length === 0 && !showNew && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Nothing saved yet — add your first item above.</div>}
        {owned?.map(item => renderItemRow(item, { canEdit: true, canDelete: true, canShare: true }))}
      </SectionCard>

      {sharedWithMe !== null && sharedWithMe.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionCard padded={false} title="Shared with me">
            {sharedWithMe.map(item => renderItemRow(item, {
              canEdit: item.permission === 'edit', canDelete: false, canShare: false,
              badge: <Badge variant="gray">from {item.owner_name}</Badge>,
            }))}
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default OndiWallet;
