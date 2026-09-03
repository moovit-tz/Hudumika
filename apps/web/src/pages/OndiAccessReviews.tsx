// ─── OneIdAccessReviews.tsx — Ondi Enterprise · Access Reviews ────
// The periodic sweep-and-reattest counterpart to OneIdRoles.tsx's ad-hoc
// access-request queue: instead of waiting for someone to ask for a role,
// a reviewer starts a campaign that snapshots every current grant and
// walks through each one, approve (keep) or revoke (remove, immediately —
// see oneid.routes.ts). Backed by ondi_access_review_campaigns/_items
// (migration 369), gated by the new access_reviews.manage permission.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface Campaign {
  id: string; name: string; status: 'active' | 'completed' | 'cancelled';
  created_at: string; completed_at: string | null; created_by_name: string | null;
  total: number; pending: number; approved: number; revoked: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── List: every campaign, past and present ─────────────────────────

export const OneIdAccessReviews: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState(`Access review — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try { setCampaigns(await apiFetch('/v1/oneid/org/access-reviews')); } catch { setCampaigns([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const campaign = await apiFetch('/v1/oneid/org/access-reviews', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      navigate(`/ondi/access-reviews/${campaign.id}`);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Access"
        titleEm="reviews"
        subtitle="Periodically re-confirm every role grant is still warranted, instead of waiting for someone to ask."
        actions={!showNew ? (
          <button type="button" onClick={() => setShowNew(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            <Icon name="plus" size={15} /> New campaign
          </button>
        ) : undefined}
      />

      {showNew && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="New review campaign">
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
              Snapshots every role currently granted across this tenant into a list you can work through — approving keeps a grant as-is, revoking removes it immediately.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={name} onChange={e => setName(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' }} />
              <button type="button" disabled={creating || !name.trim()} onClick={create}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', opacity: creating ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                {creating ? 'Starting…' : 'Start campaign'}
              </button>
              <button type="button" onClick={() => setShowNew(false)}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
                Cancel
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard padded={false}>
        {campaigns === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {campaigns?.length === 0 && !showNew && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>No review campaigns yet — start one above.</div>}
        {campaigns?.map((c, i, arr) => {
          const decided = c.approved + c.revoked;
          const pct = c.total > 0 ? Math.round((decided / c.total) * 100) : 100;
          return (
            <Link key={c.id} to={`/ondi/access-reviews/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: c.status === 'completed' ? 'var(--green-l)' : 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={c.status === 'completed' ? 'checkCircle' : 'userCheck'} size={17} color={c.status === 'completed' ? 'var(--green)' : 'var(--teal)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {c.name}
                  <Badge variant={c.status === 'completed' ? 'success' : 'brand'}>{c.status === 'completed' ? 'Completed' : 'Active'}</Badge>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>
                  Started {fmtDate(c.created_at)}{c.created_by_name ? ` by ${c.created_by_name}` : ''} · {c.total} grant{c.total === 1 ? '' : 's'} · {decided}/{c.total} reviewed
                </div>
              </div>
              <div style={{ width: 120, flexShrink: 0 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: c.revoked > 0 ? 'var(--gold)' : 'var(--green)', borderRadius: 3 }} />
                </div>
              </div>
              <Icon name="chevronRight" size={16} color="var(--ink3)" />
            </Link>
          );
        })}
      </SectionCard>
    </div>
  );
};

// ── Detail: one campaign's items, decide one-by-one or in bulk ─────

interface ReviewItem {
  id: string; user_id: string; user_name: string; user_email: string;
  role_name: string; decision: 'pending' | 'approved' | 'revoked';
  decided_at: string | null; decided_by_name: string | null;
}

export const OneIdAccessReviewDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiFetch(`/v1/oneid/org/access-reviews/${id}`);
      setCampaign(res.campaign);
      setItems(res.items);
      setSelected(new Set());
    } catch { setItems([]); }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const pending = items?.filter(i => i.decision === 'pending') ?? [];

  function toggle(itemId: string) {
    setSelected(prev => { const next = new Set(prev); next.has(itemId) ? next.delete(itemId) : next.add(itemId); return next; });
  }
  function toggleAll() {
    setSelected(prev => prev.size === pending.length ? new Set() : new Set(pending.map(i => i.id)));
  }

  async function decideOne(itemId: string, decision: 'approved' | 'revoked') {
    if (decision === 'revoked' && !(await showConfirm('Revoke this role grant? It will be removed immediately.', { variant: 'warning', confirmLabel: 'Revoke' }))) return;
    try {
      await apiFetch(`/v1/oneid/org/access-reviews/${id}/items/${itemId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  async function decideBulk(decision: 'approved' | 'revoked') {
    if (selected.size === 0) return;
    if (decision === 'revoked' && !(await showConfirm(`Revoke ${selected.size} role grant${selected.size === 1 ? '' : 's'}? They'll be removed immediately.`, { variant: 'warning', confirmLabel: 'Revoke All' }))) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/oneid/org/access-reviews/${id}/bulk-decide`, { method: 'POST', body: JSON.stringify({ item_ids: Array.from(selected), decision }) });
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setBusy(false); }
  }

  async function complete() {
    if (!(await showConfirm('Mark this campaign complete? Any remaining pending grants will stay as-is.', { confirmLabel: 'Complete Campaign' }))) return;
    try {
      await apiFetch(`/v1/oneid/org/access-reviews/${id}/complete`, { method: 'POST' });
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  const DECISION_BADGE: Record<ReviewItem['decision'], { variant: 'warning' | 'success' | 'error'; label: string }> = {
    pending: { variant: 'warning', label: 'Pending' },
    approved: { variant: 'success', label: 'Approved' },
    revoked: { variant: 'error', label: 'Revoked' },
  };

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise', 'Access Reviews']}
        titlePlain={campaign?.name ? campaign.name.split(' ').slice(0, -1).join(' ') || campaign.name : 'Review'}
        titleEm={campaign?.name ? campaign.name.split(' ').slice(-1)[0] : 'campaign'}
        subtitle={campaign?.status === 'completed' ? 'This campaign is complete.' : 'Approve to keep a grant as-is, or revoke to remove it immediately.'}
        actions={campaign?.status === 'active' ? (
          <button type="button" onClick={complete}
            style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            Complete campaign
          </button>
        ) : undefined}
      />

      {pending.length > 0 && campaign?.status === 'active' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <input type="checkbox" checked={selected.size === pending.length && pending.length > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} />
          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{selected.size > 0 ? `${selected.size} selected` : `Select all ${pending.length} pending`}</span>
          <div style={{ flex: 1 }} />
          <button type="button" disabled={selected.size === 0 || busy} onClick={() => decideBulk('approved')}
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--green)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: selected.size === 0 ? 0.5 : 1 }}>
            Approve selected
          </button>
          <button type="button" disabled={selected.size === 0 || busy} onClick={() => decideBulk('revoked')}
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: selected.size === 0 ? 0.5 : 1 }}>
            Revoke selected
          </button>
        </div>
      )}

      <SectionCard padded={false}>
        {items === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {items?.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>No role grants existed when this campaign started.</div>}
        {items?.map((item, i, arr) => {
          const badge = DECISION_BADGE[item.decision];
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              {item.decision === 'pending' && campaign?.status === 'active' && (
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} style={{ cursor: 'pointer' }} />
              )}
              <PersonAvatar userId={item.user_id} name={item.user_name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.user_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{item.user_email} · role: {item.role_name}</div>
              </div>
              {item.decision !== 'pending' ? (
                <div style={{ textAlign: 'right' }}>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {item.decided_by_name && <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 3 }}>by {item.decided_by_name}</div>}
                </div>
              ) : campaign?.status === 'active' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => decideOne(item.id, 'approved')}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--green)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    Approve
                  </button>
                  <button type="button" onClick={() => decideOne(item.id, 'revoked')}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    Revoke
                  </button>
                </div>
              ) : (
                <Badge variant="warning">Pending</Badge>
              )}
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
};

export default OneIdAccessReviews;
