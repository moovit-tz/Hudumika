// ─── OneIdApps.tsx — Ondi Personal · Apps ─────────────────────────
// Every app this user has granted OAuth access to, backed by the real
// consent rows the working M6 OAuth provider already writes
// (ondi_oauth_consents) — see GET/DELETE /v1/ondi/oauth/consents
// (ondi-oauth.routes.ts). No mock catalog of "available apps to connect" —
// this only lists what the user has actually authorized, since that's the
// one thing OAuth consent already gives us for free.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';

interface Consent {
  id: string; client_id: string; client_name: string; logo_url: string | null;
  first_party: boolean; scopes: string[]; granted_at: string;
}

const SCOPE_LABEL: Record<string, string> = {
  openid: 'Confirm your identity', profile: 'View your name', email: 'View your email address',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OneIdApps: React.FC = () => {
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setConsents(await apiFetch('/v1/ondi/oauth/consents')); } catch { setConsents([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function revoke(c: Consent) {
    if (!(await showConfirm(`Revoke ${c.client_name}'s access to your account? You can re-authorize it later by signing in there again.`, { variant: 'warning', confirmLabel: 'Revoke Access' }))) return;
    setRevoking(c.id);
    try {
      await apiFetch(`/v1/ondi/oauth/consents/${c.id}`, { method: 'DELETE' });
      await reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Authorized"
        titleEm="apps"
        subtitle="Apps you've signed into with your Ondi identity, and what each can see."
      />

      <SectionCard padded={false}>
        {consents === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {consents?.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>You haven't authorized any apps yet.</div>}
        {consents?.map((c, i, arr) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="grid" size={18} color="var(--teal)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {c.client_name}
                {c.first_party && <span style={{ padding: '1px 8px', borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink3)', fontSize: 10, fontWeight: 700 }}>Hudumika app</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>
                {c.scopes.map(s => SCOPE_LABEL[s] || s).join(' · ')} — authorized {fmtDate(c.granted_at)}
              </div>
            </div>
            <button type="button" disabled={revoking === c.id} onClick={() => revoke(c)}
              style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: revoking === c.id ? 'default' : 'pointer', opacity: revoking === c.id ? 0.6 : 1, flexShrink: 0 }}>
              {revoking === c.id ? 'Revoking…' : 'Revoke Access'}
            </button>
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default OneIdApps;
