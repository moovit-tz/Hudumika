/**
 * Ondi ▸ Support access — the workspace administrator's side of staff access
 * sessions (docs/STAFF_CONSOLE.md). Hudumika support staff ask for timed
 * access to this workspace; an administrator here approves, denies or ends it.
 * API: /v1/platform-support/access-requests (customerAccessApprovalRoutes).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading, ButtonSpinner } from '../components/ui/spinner.js';
import { APP_REGISTRY } from '../lib/appRegistry.js';

interface AccessRequest {
  id: string;
  status: 'pending_approval' | 'active' | 'ended' | 'revoked' | 'expired' | 'denied';
  purpose: string;
  actions: string[];
  app_id: string | null;
  requested_minutes: number;
  basis: 'customer_approval' | 'standing_authorization';
  starts_at: string | null;
  expires_at: string;
  created_at: string;
  staff_user_id: string;
  staff_name: string;
  staff_avatar_url: string | null;
}

const APP_NAMES = new Map(APP_REGISTRY.map(a => [a.id as string, a.name]));
const productOf = (id: string | null) => (id ? APP_NAMES.get(id) ?? id : 'All products');
const ACTION_LABEL: Record<string, string> = { read: 'View', configure: 'Change settings' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const duration = (m: number) => (m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

/** What the row means right now; a pending or active row past its time has lapsed even before a job marks it. */
function stateOf(r: AccessRequest): { label: string; variant: 'warning' | 'success' | 'gray' | 'error' } {
  const past = new Date(r.expires_at).getTime() <= Date.now();
  if (r.status === 'pending_approval') return past ? { label: 'Lapsed', variant: 'gray' } : { label: 'Waiting', variant: 'warning' };
  if (r.status === 'active') return past ? { label: 'Expired', variant: 'gray' } : { label: 'Active', variant: 'success' };
  if (r.status === 'denied') return { label: 'Denied', variant: 'error' };
  if (r.status === 'revoked') return { label: 'Ended early', variant: 'gray' };
  return { label: r.status === 'expired' ? 'Expired' : 'Ended', variant: 'gray' };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 2 }}>{children}</div>
    </div>
  );
}

function RequestRow({ r, first, busy, onDecide }: { r: AccessRequest; first: boolean; busy: string | null; onDecide: (r: AccessRequest, d: 'approve' | 'deny' | 'end') => void }) {
  const s = stateOf(r);
  const open = s.label === 'Waiting' || s.label === 'Active';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 24px', borderTop: first ? 'none' : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <PersonAvatar userId={r.staff_user_id} name={r.staff_name} src={r.staff_avatar_url} size={36} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.staff_name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Hudumika support · asked {when(r.created_at)}</div>
        </div>
        <Badge variant={s.variant}>{s.label}</Badge>
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{r.purpose}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <Detail label="Can">{r.actions.map(a => ACTION_LABEL[a] ?? a).join(' · ')}</Detail>
        <Detail label="Product">{productOf(r.app_id)}</Detail>
        <Detail label="For">{duration(r.requested_minutes)}</Detail>
        {s.label === 'Waiting' && <Detail label="Lapses">{when(r.expires_at)}</Detail>}
        {s.label === 'Active' && <Detail label="Ends">{when(r.expires_at)}</Detail>}
        {r.basis === 'standing_authorization' && <Detail label="Basis">Standing authorization</Detail>}
      </div>
      {open && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.label === 'Waiting' ? (
            <>
              <Button size="sm" disabled={!!busy} onClick={() => onDecide(r, 'approve')}>
                {busy === `${r.id}:approve` && <ButtonSpinner />} Approve for {duration(r.requested_minutes)}
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => onDecide(r, 'deny')}>
                {busy === `${r.id}:deny` && <ButtonSpinner />} Deny
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => onDecide(r, 'end')}>
              {busy === `${r.id}:end` && <ButtonSpinner />} End now
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export const OndiSupportAccess: React.FC = () => {
  const [rows, setRows] = useState<AccessRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await apiFetch('/v1/platform-support/access-requests')); setError(null); }
    catch (e: any) { setRows([]); setError(e?.message ?? 'Could not load support access.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(r: AccessRequest, d: 'approve' | 'deny' | 'end') {
    setBusy(`${r.id}:${d}`); setNotice(null); setError(null);
    try {
      await apiFetch(`/v1/platform-support/access-requests/${r.id}/${d}`, { method: 'POST', body: '{}' });
      setNotice(d === 'approve' ? `${r.staff_name} has access for ${duration(r.requested_minutes)}.` : d === 'deny' ? 'Request denied.' : 'Access ended.');
    } catch (e: any) {
      // 409: someone else in this workspace answered first, or it lapsed.
      setError(e?.message ?? 'That did not work.');
    } finally {
      setBusy(null);
      load();
    }
  }

  const open = (rows ?? []).filter(r => ['Waiting', 'Active'].includes(stateOf(r).label));
  const past = (rows ?? []).filter(r => !open.includes(r));

  return (
    <div className="ondi-page-container">
      <PageHeader crumbs={['Ondi', 'Support access']} titlePlain="Support" titleEm="access" subtitle="Approve or end Hudumika support access" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <Banner variant="error" onDismiss={() => setError(null)}>{error}</Banner>}
        {notice && <Banner variant="success" onDismiss={() => setNotice(null)}>{notice}</Banner>}
        {rows === null ? <SectionLoading /> : (
          <>
            <SectionCard title={`Open (${open.length})`} padded={false} collapsible={false}>
              {open.length === 0
                ? <div style={{ padding: '20px 24px', color: 'var(--ink3)', fontSize: 13.5 }}>No requests waiting.</div>
                : open.map((r, i) => <RequestRow key={r.id} r={r} first={i === 0} busy={busy} onDecide={decide} />)}
            </SectionCard>
            {past.length > 0 && (
              <SectionCard title={`History (${past.length})`} padded={false} defaultOpen={false}>
                {past.map((r, i) => <RequestRow key={r.id} r={r} first={i === 0} busy={busy} onDecide={decide} />)}
              </SectionCard>
            )}
          </>
        )}
      </div>
    </div>
  );
};
