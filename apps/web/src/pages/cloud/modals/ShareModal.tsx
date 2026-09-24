import React, { useEffect, useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';
import { ButtonSpinner, SectionLoading } from '../../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../../../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../components/ui/select.js';
import { apiFetch, BASE_URL } from '../../../lib/api.js';
import { useCloud, CloudFile, SharedPerson } from '../../../shells/cloud-context.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

interface Candidates { users: { id: string; name: string; email: string }[]; customers: { id: string; name: string }[] }
interface InviteRow { id: string; email: string; expires_at: string; revoked_at: string | null; last_opened_at: string | null; open_count: number }

/** A link that works from anywhere: same origin in production, the API's own origin in dev. */
function absoluteUrl(publicUrl: string | null, token: string | null): string | null {
  if (publicUrl) return publicUrl;
  if (!token) return null;
  return new URL(`/v1/files-public/${token}/download`, BASE_URL || window.location.origin).toString();
}

/**
 * Two separate things, deliberately kept apart:
 *  1. PEOPLE — real workspace members / customers chosen from a list. Only they get authenticated access.
 *  2. PUBLIC LINK — an anonymous download URL anyone holding it can use. Created, rotated and revoked on its own.
 * Every action waits for the server and shows its own failure; nothing closes on a maybe.
 */
export function ShareModal({ item, onClose, onSave }: { item: CloudFile; onClose: () => void; onSave: (shared: SharedPerson[]) => void }) {
  const { shareItem, createPublicLink, revokePublicLink } = useCloud();
  const isFolder = item.type === 'folder';

  const initial = item.shared ?? [];
  const legacy = initial.filter(p => !p.principal_id);          // typed-name shares from before: they never granted access
  const [people, setPeople] = useState<SharedPerson[]>(initial.filter(p => p.principal_id));
  const [role, setRole] = useState<'Viewer' | 'Editor'>('Viewer');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Candidates | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(item.share_token);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<null | 'create' | 'rotate' | 'revoke' | 'copy'>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkUrl = absoluteUrl(publicUrl, token);

  // ── Email invitations: people with no account here ──
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadInvites = () => {
    apiFetch(`/v1/files/${item.id}/invites`).then((res: any) => setInvites(res.data ?? [])).catch(() => setInvites([]));
  };
  useEffect(() => { if (!isFolder) loadInvites(); }, [item.id, isFolder]);

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteBusy(true); setInviteError(null);
    try {
      await apiFetch(`/v1/files/${item.id}/invites`, { method: 'POST', body: JSON.stringify({ email }) });
      setInviteEmail('');
      loadInvites();
    } catch (err: any) {
      setInviteError(err?.message || 'Could not send the invitation.');
    } finally { setInviteBusy(false); }
  }

  async function revokeInvite(id: string) {
    setInviteBusy(true); setInviteError(null);
    try { await apiFetch(`/v1/files/${item.id}/invites/${id}`, { method: 'DELETE' }); loadInvites(); }
    catch (err: any) { setInviteError(err?.message || 'Could not revoke the invitation.'); }
    finally { setInviteBusy(false); }
  }

  useEffect(() => {
    const term = q.trim();
    if (!term) { setFound(null); return; }
    setSearching(true);
    let live = true;
    const t = setTimeout(() => {
      apiFetch(`/v1/files/share-people?q=${encodeURIComponent(term)}`)
        .then((res: Candidates) => { if (live) setFound(res); })
        .catch(() => { if (live) setFound({ users: [], customers: [] }); })
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const already = (type: string, id: string) => people.some(p => p.principal_type === type && p.principal_id === id);
  const add = (type: 'user' | 'customer', id: string, name: string) => {
    if (already(type, id)) return;
    setPeople(prev => [...prev, { name, role, principal_type: type, principal_id: id }]);
    setQ('');
  };

  async function savePeople() {
    setSaving(true); setPeopleError(null);
    try {
      const res = await shareItem(item.id, people);
      setToken(res.share_token);
      onSave(people);
      onClose();
    } catch (err: any) {
      setPeopleError(err?.message || 'Could not update sharing.');
    } finally { setSaving(false); }
  }

  async function linkAction(kind: 'create' | 'rotate' | 'revoke') {
    setLinkBusy(kind); setLinkError(null);
    try {
      if (kind === 'revoke') { await revokePublicLink(item.id); setToken(null); setPublicUrl(null); }
      else { const res = await createPublicLink(item.id, kind === 'rotate'); setToken(res.share_token); setPublicUrl(res.public_url); }
    } catch (err: any) {
      setLinkError(err?.message || 'Could not update the public link.');
    } finally { setLinkBusy(null); }
  }

  async function copy() {
    if (!linkUrl) return;
    setLinkBusy('copy'); setLinkError(null);
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { setLinkError('Could not copy automatically — select the link and copy it.'); }
    finally { setLinkBusy(null); }
  }

  const results = found ? [
    ...found.users.filter(u => !already('user', u.id)).map(u => ({ type: 'user' as const, id: u.id, label: u.name || u.email, sub: u.email, tag: 'Member' })),
    ...found.customers.filter(c => !already('customer', c.id)).map(c => ({ type: 'customer' as const, id: c.id, label: c.name, sub: '', tag: 'Customer' })),
  ] : [];

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Share “{item.name}”</DialogTitle>
          <DialogDescription>Give specific people access, or create a link anyone can download from.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* ── People ── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>People with access</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={q} onChange={e => setQ(e.target.value)} placeholder="Search colleagues or customers…" aria-label="Search people"
              className="input-field" style={{ flex: 1 }} disabled={saving}
            />
            <div style={{ width: 110 }}>
              <Select value={role} onValueChange={v => setRole(v as 'Viewer' | 'Editor')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Viewer">Viewer</SelectItem>
                  <SelectItem value="Editor">Editor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {q.trim() && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
              {searching ? <SectionLoading label="Searching…" size={16} />
                : results.length === 0 ? <div style={{ padding: 10, fontSize: 12.5, color: 'var(--ink3)' }}>No matching colleagues or customers. Only people in this workspace can be added.</div>
                : results.map(r => (
                  <button key={`${r.type}:${r.id}`} type="button" onClick={() => add(r.type, r.id, r.label)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                    <PersonAvatar name={r.label} size={24} />
                    <span style={{ flex: 1, fontSize: 13 }}>{r.label}</span>
                    {r.sub && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{r.sub}</span>}
                    <Badge variant="gray">{r.tag}</Badge>
                  </button>
                ))}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            {people.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '6px 0' }}>Not shared with anyone yet.</div>}
            {people.map((p, idx) => (
              <div key={`${p.principal_type}:${p.principal_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <PersonAvatar name={p.name} size={28} />
                <span style={{ fontSize: 13.5, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <div style={{ width: 100 }}>
                  <Select value={p.role} onValueChange={v => setPeople(prev => prev.map((x, i) => i === idx ? { ...x, role: v as 'Viewer' | 'Editor' } : x))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Viewer">Viewer</SelectItem><SelectItem value="Editor">Editor</SelectItem></SelectContent>
                  </Select>
                </div>
                <Button size="xs" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => setPeople(prev => prev.filter((_, i) => i !== idx))} disabled={saving}>
                  <Icon name="x" size={14} />
                </Button>
              </div>
            ))}
          </div>
          {legacy.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 8 }}>
              {legacy.length} older share{legacy.length === 1 ? '' : 's'} ({legacy.map(l => l.name).join(', ')}) only recorded a typed name and never gave anyone access. Saving removes {legacy.length === 1 ? 'it' : 'them'} — add the real people above.
            </div>
          )}
          {peopleError && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{peopleError}</div>}

          {/* ── Public link ── */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Public link</div>
            {isFolder ? (
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Folders can’t be shared with a public link. Share the files inside, or add people above.</div>
            ) : linkUrl ? (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Anyone with this link can download the file — no sign-in needed.</div>
                <input readOnly value={linkUrl} onFocus={e => e.currentTarget.select()} className="input-field" style={{ width: '100%', fontSize: 12.5 }} aria-label="Public link" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="secondary" onClick={copy} disabled={linkBusy !== null}>{copied ? 'Copied' : 'Copy link'}</Button>
                  <Button size="sm" variant="outline" onClick={() => linkAction('rotate')} disabled={linkBusy !== null}>{linkBusy === 'rotate' ? <><ButtonSpinner /> Replacing…</> : 'Replace link'}</Button>
                  <Button size="sm" variant="outline" onClick={() => linkAction('revoke')} disabled={linkBusy !== null}>{linkBusy === 'revoke' ? <><ButtonSpinner /> Turning off…</> : 'Turn off link'}</Button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Off. Turning it on lets anyone with the link download the file.</div>
                <Button size="sm" variant="secondary" onClick={() => linkAction('create')} disabled={linkBusy !== null}>{linkBusy === 'create' ? <><ButtonSpinner /> Creating…</> : 'Create public link'}</Button>
              </>
            )}
            {linkError && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{linkError}</div>}
          </div>

          {/* ── Invite by email ── */}
          {!isFolder && (
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Invite someone outside this workspace</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Sends a private, view-only link by email. It expires in 7 days and can be revoked any time.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@example.com" type="email"
                  onKeyDown={e => { if (e.key === 'Enter') void sendInvite(); }}
                  className="input-field" style={{ flex: 1 }} disabled={inviteBusy} aria-label="Email to invite"
                />
                <Button size="sm" onClick={sendInvite} disabled={!inviteEmail.trim() || inviteBusy}>{inviteBusy ? <ButtonSpinner /> : 'Send invite'}</Button>
              </div>
              {inviteError && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{inviteError}</div>}
              {invites === null ? null : invites.filter(i => !i.revoked_at).length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 10 }}>No active invitations.</div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  {invites.filter(i => !i.revoked_at).map(inv => {
                    const expired = new Date(inv.expires_at).getTime() < Date.now();
                    return (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{inv.email}</span>
                        <span style={{ fontSize: 11.5, color: expired ? 'var(--red)' : 'var(--ink3)' }}>
                          {expired ? 'Expired' : inv.open_count > 0 ? `Opened ${inv.open_count}×` : 'Not opened yet'}
                        </span>
                        <Button size="xs" variant="ghost" onClick={() => revokeInvite(inv.id)} disabled={inviteBusy}>Revoke</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
          <Button onClick={savePeople} disabled={saving}>{saving ? <><ButtonSpinner /> Saving…</> : 'Save people'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
