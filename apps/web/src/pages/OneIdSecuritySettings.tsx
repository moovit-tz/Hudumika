// ─── OneIdSecuritySettings.tsx — Ondi Personal · Security Settings ───
// Its own sidebar page rather than a tab, so it's directly linkable — the
// content itself (password/email/2FA/passkeys/sessions/KYC/trust score)
// is all real, already built this session's Ondi program: AccountSecurityPanel.
//
// Recovery Contacts below is new (Ondi feature-gap pass, M4) — a real,
// mutual-consent alternative to password-reset-by-email for when email
// access is lost too. Kept out of the shared AccountSecurityPanel (also
// rendered on /profile and Subscription's billing screen) since it's a
// genuinely Ondi-specific concept, not a general account-security control.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { AccountSecurityPanel } from '../components/AccountSecurityPanel.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface RecoveryContact { id: string; status: 'pending' | 'accepted' | 'declined'; created_at: string; contact_name?: string; contact_email?: string; owner_name?: string; owner_email?: string }
interface RecoveryRequest { id: string; status: string; requested_at: string; cooldown_ends_at: string | null; requester_name: string; requester_email: string }

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function RecoveryContactsSection() {
  const [myContacts, setMyContacts] = useState<RecoveryContact[] | null>(null);
  const [vouchingFor, setVouchingFor] = useState<RecoveryContact[] | null>(null);
  const [requests, setRequests] = useState<RecoveryRequest[] | null>(null);
  const [picked, setPicked] = useState<PickerItem | null>(null);
  const [adding, setAdding] = useState(false);
  const staffCache = useRef<PickerItem[] | null>(null);

  const searchStaff = useCallback(async (query: string): Promise<PickerItem[]> => {
    if (!staffCache.current) {
      const users = await apiFetch('/v1/oneid/users').catch(() => []);
      staffCache.current = users.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
    }
    const q = query.trim().toLowerCase();
    const all = staffCache.current ?? [];
    return q ? all.filter(u => u.label.toLowerCase().includes(q) || u.sublabel?.toLowerCase().includes(q)) : all;
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/security/recovery-contacts');
      setMyContacts(res.myContacts); setVouchingFor(res.vouchingFor);
    } catch { setMyContacts([]); setVouchingFor([]); }
    try { setRequests(await apiFetch('/v1/security/recovery-requests')); } catch { setRequests([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function addContact() {
    if (!picked) { showAlert('Pick a colleague first.'); return; }
    setAdding(true);
    try {
      await apiFetch('/v1/security/recovery-contacts', { method: 'POST', body: JSON.stringify({ contact_user_id: picked.id }) });
      setPicked(null);
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setAdding(false); }
  }

  async function removeContact(id: string) {
    if (!(await showConfirm('Remove this recovery contact?', { confirmLabel: 'Remove' }))) return;
    try { await apiFetch(`/v1/security/recovery-contacts/${id}`, { method: 'DELETE' }); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function respond(id: string, accept: boolean) {
    try { await apiFetch(`/v1/security/recovery-contacts/${id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function approveRequest(id: string) {
    if (!(await showConfirm("Vouch for this person? They'll regain access after a 24-hour cooldown — if this wasn't really them, they can cancel it just by logging in normally.", { confirmLabel: 'Approve' }))) return;
    try { await apiFetch(`/v1/security/recovery-requests/${id}/approve`, { method: 'POST' }); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function declineRequest(id: string) {
    try { await apiFetch(`/v1/security/recovery-requests/${id}/decline`, { method: 'POST' }); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  const pendingRequests = requests?.filter(r => r.status === 'pending') ?? [];
  const otherRequests = requests?.filter(r => r.status !== 'pending') ?? [];

  return (
    <div style={{ marginTop: 20 }}>
      <SectionCard title="Recovery contacts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: 0, lineHeight: 1.5 }}>
            If you ever lose access to your password and your email, a trusted colleague can vouch for you to regain access — mutual consent required, with a cooldown before it takes effect.
          </p>

          {pendingRequests.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Recovery requests waiting for your approval</div>
              {pendingRequests.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <Icon name="alertTriangle" size={15} color="var(--gold)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.requester_name} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· {r.requester_email}</span></div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Requested {fmtDateTime(r.requested_at)}</div>
                  </div>
                  <button type="button" onClick={() => approveRequest(r.id)}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    Approve
                  </button>
                  <button type="button" onClick={() => declineRequest(r.id)}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    Decline
                  </button>
                </div>
              ))}
            </div>
          )}

          {otherRequests.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Recent requests you've handled</div>
              {otherRequests.slice(0, 5).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{r.requester_name}</div>
                  <Badge variant={r.status === 'approved' ? 'success' : r.status === 'completed' ? 'success' : r.status === 'declined' ? 'error' : 'gray'}>
                    {r.status}{r.status === 'approved' && r.cooldown_ends_at ? ` · until ${fmtDateTime(r.cooldown_ends_at)}` : ''}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Your recovery contacts</div>
            {myContacts?.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>You haven't added any recovery contacts yet.</div>}
            {myContacts?.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{c.contact_name} <span style={{ color: 'var(--ink3)' }}>· {c.contact_email}</span></div>
                <Badge variant={c.status === 'accepted' ? 'success' : c.status === 'declined' ? 'error' : 'gray'}>{c.status}</Badge>
                <button type="button" onClick={() => removeContact(c.id)}
                  style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--red)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <EntityPicker value={picked} onChange={setPicked} search={searchStaff} placeholder="Search a colleague to add…" />
              </div>
              <button type="button" disabled={adding} onClick={addContact}
                style={{ padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 'var(--r-sm)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 12.5, fontFamily: 'var(--font)', cursor: 'pointer', opacity: adding ? 0.6 : 1, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                {adding ? 'Adding…' : 'Add contact'}
              </button>
            </div>
          </div>

          {vouchingFor && vouchingFor.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>People who've named you as their recovery contact</div>
              {vouchingFor.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{v.owner_name} <span style={{ color: 'var(--ink3)' }}>· {v.owner_email}</span></div>
                  {v.status === 'pending' ? (
                    <>
                      <button type="button" onClick={() => respond(v.id, true)}
                        style={{ fontSize: 11.5, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                        Accept
                      </button>
                      <button type="button" onClick={() => respond(v.id, false)}
                        style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                        Decline
                      </button>
                    </>
                  ) : (
                    <Badge variant={v.status === 'accepted' ? 'success' : 'error'}>{v.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export const OneIdSecuritySettings: React.FC = () => (
  <div>
    <PageHeader
      crumbs={['Ondi', 'Personal']}
      titlePlain="Security"
      titleEm="settings"
      subtitle="Password, email, two-factor authentication, passkeys, identity verification, and active sessions."
    />
    <AccountSecurityPanel />
    <RecoveryContactsSection />
  </div>
);

export default OneIdSecuritySettings;
