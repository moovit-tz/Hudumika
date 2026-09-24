import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon.js';
import { Spinner } from './ui/spinner.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from './ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

type PrincipalType = 'USER' | 'TEAM' | 'DEPARTMENT';
type Permission = 'VIEW' | 'EDIT' | 'MANAGE';
interface Share { principal_type: PrincipalType; principal_id: string; permission: Permission }
interface Principals { users: { id: string; name: string; email: string }[]; teams: { id: string; name: string }[]; departments: { id: string; name: string }[] }

const TYPE_LABEL: Record<PrincipalType, string> = { USER: 'Person', TEAM: 'Team', DEPARTMENT: 'Department' };

/**
 * Who a contact/party is shared with — people, teams or departments, each with
 * View / Edit / Manage. Reads and writes the real /v1/parties/:id/shares API,
 * which only the owner, creator or a manager may use (anyone else sees a
 * plain explanation, not a broken form).
 */
export function PartyShareDialog({ open, onOpenChange, partyId, name }: {
  open: boolean; onOpenChange: (open: boolean) => void; partyId: string; name: string;
}) {
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [visibility, setVisibility] = useState<string>('TENANT');
  const [shares, setShares] = useState<Share[]>([]);
  const [known, setKnown] = useState<Principals>({ users: [], teams: [], departments: [] });
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Principals | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true); setDenied(false); setQ(''); setFound(null);
    Promise.all([
      apiFetch(`/v1/parties/${partyId}`),
      apiFetch(`/v1/parties/${partyId}/shares`).catch((err: any) => { if (/only the owner|NOT_OWNER/i.test(err?.message ?? '') || err?.status === 403) return null; throw err; }),
      apiFetch('/v1/parties/principals'),
    ]).then(([party, res, principals]) => {
      if (!live) return;
      setVisibility(party?.visibility ?? 'TENANT');
      if (res === null) setDenied(true); else setShares(res.data ?? []);
      setKnown(principals);
    }).catch((err: any) => { if (live) showAlert(err.message || 'Could not load sharing.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, partyId]);

  useEffect(() => {
    if (!open || !q.trim()) { setFound(null); return; }
    const t = setTimeout(() => {
      apiFetch(`/v1/parties/principals?q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => setFound(null));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of known.users) m.set(`USER:${u.id}`, u.name || u.email);
    for (const t of known.teams) m.set(`TEAM:${t.id}`, t.name);
    for (const d of known.departments) m.set(`DEPARTMENT:${d.id}`, d.name);
    return (s: Share) => m.get(`${s.principal_type}:${s.principal_id}`) ?? TYPE_LABEL[s.principal_type];
  }, [known]);

  const add = (principal_type: PrincipalType, principal_id: string, label: string) => {
    if (shares.some(s => s.principal_type === principal_type && s.principal_id === principal_id)) return;
    setKnown(k => ({ users: k.users, teams: k.teams, departments: k.departments, [principal_type === 'USER' ? 'users' : principal_type === 'TEAM' ? 'teams' : 'departments']: [...(k as any)[principal_type === 'USER' ? 'users' : principal_type === 'TEAM' ? 'teams' : 'departments'], principal_type === 'USER' ? { id: principal_id, name: label, email: '' } : { id: principal_id, name: label }] } as Principals));
    setShares(s => [...s, { principal_type, principal_id, permission: 'VIEW' }]);
    setQ('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/v1/parties/${partyId}/shares`, { method: 'PUT', body: JSON.stringify({ shares }) });
      showAlert('Sharing updated.', { variant: 'success' });
      onOpenChange(false);
    } catch (err: any) {
      showAlert(err.message || 'Could not update sharing.');
    } finally { setSaving(false); }
  };

  const results: { type: PrincipalType; id: string; label: string; sub?: string }[] = found ? [
    ...found.users.map(u => ({ type: 'USER' as const, id: u.id, label: u.name || u.email, sub: u.email })),
    ...found.teams.map(t => ({ type: 'TEAM' as const, id: t.id, label: t.name })),
    ...found.departments.map(d => ({ type: 'DEPARTMENT' as const, id: d.id, label: d.name })),
  ].filter(r => !shares.some(s => s.principal_type === r.type && s.principal_id === r.id)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Access to {name}</DialogTitle>
          <DialogDescription>Choose who else can see or change this contact.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {loading ? <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>
            : denied ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ink2)' }}><Icon name="lock" size={14} /> Only the owner or a manager can change who this contact is shared with.</div>
            : (<>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
                Currently visible to: <Badge variant="gray">{({ TENANT: 'Everyone in the workspace', TEAM: 'Owner’s team', DEPARTMENT: 'Owner’s department', PRIVATE: 'Only the owner', EXPLICIT_SHARE: 'Specific people' } as Record<string, string>)[visibility] ?? visibility}</Badge>
                {visibility === 'TENANT' && ' — sharing below only matters once you restrict the contact (edit it and change “Who can see this contact”).'}
              </div>
              <input
                value={q} onChange={e => setQ(e.target.value)} placeholder="Add a person, team or department…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              {q.trim() && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {results.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: 'var(--ink3)' }}>No matches.</div> : results.map(r => (
                    <button key={`${r.type}:${r.id}`} type="button" onClick={() => add(r.type, r.id, r.label)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <Badge variant="gray">{TYPE_LABEL[r.type]}</Badge>
                      <span style={{ flex: 1, fontSize: 13 }}>{r.label}</span>
                      {r.sub && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{r.sub}</span>}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                {shares.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Not shared with anyone yet.</div> : shares.map((s, i) => (
                  <div key={`${s.principal_type}:${s.principal_id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <Badge variant="gray">{TYPE_LABEL[s.principal_type]}</Badge>
                    <span style={{ flex: 1, fontSize: 13 }}>{nameOf(s)}</span>
                    <div style={{ width: 120 }}>
                      <Select value={s.permission} onValueChange={v => setShares(list => list.map((x, j) => j === i ? { ...x, permission: v as Permission } : x))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VIEW">Can view</SelectItem>
                          <SelectItem value="EDIT">Can edit</SelectItem>
                          <SelectItem value="MANAGE">Can manage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="xs" variant="ghost" onClick={() => setShares(list => list.filter((_, j) => j !== i))} aria-label="Remove">
                      <Icon name="x" size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </>)}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{denied ? 'Close' : 'Cancel'}</Button>
          {!denied && <Button onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save sharing'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
