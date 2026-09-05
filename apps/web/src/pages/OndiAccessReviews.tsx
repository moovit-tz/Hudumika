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

export const OndiAccessReviews: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState(`Access review — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try { setCampaigns(await apiFetch('/v1/ondi/org/access-reviews')); } catch { setCampaigns([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const campaign = await apiFetch('/v1/ondi/org/access-reviews', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      navigate(`/ondi/access-reviews/${campaign.id}`);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setCreating(false);
    }
  }

  const activeCount = campaigns ? campaigns.filter(c => c.status === 'active').length : 0;
  const completedCount = campaigns ? campaigns.filter(c => c.status === 'completed').length : 0;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Access"
        titleEm="reviews"
        subtitle="Periodically re-confirm role grants, reattest entitlement compliance, and revoke stale access."
        actions={!showNew ? (
          <button type="button" onClick={() => setShowNew(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
            <Icon name="plus" size={15} /> New Campaign
          </button>
        ) : undefined}
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Review Campaigns</span>
            <div className="ondi-kpi-icon-box"><Icon name="clipboard" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{campaigns ? campaigns.length : 0}</span>
            <span className="ondi-kpi-sub">total campaigns</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Active Audits</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fffbeb', color: '#b45309' }}><Icon name="clock" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#b45309' }}>{activeCount}</span>
            <span className="ondi-kpi-sub">in progress</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Completed Audits</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}><Icon name="checkCircle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857' }}>{completedCount}</span>
            <span className="ondi-kpi-sub">fully attested</span>
          </div>
        </div>
      </div>

      {showNew && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="New Access Review Campaign">
            <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
              Snapshots every role currently granted across this tenant into a review list. Approving keeps a grant intact; revoking removes it immediately.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={name} onChange={e => setName(e.target.value)}
                style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' }} />
              <button type="button" disabled={creating || !name.trim()} onClick={create}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', opacity: creating ? 0.6 : 1, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
                {creating ? 'Starting…' : 'Start Campaign'}
              </button>
              <button type="button" onClick={() => setShowNew(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard padded={false}>
        {campaigns === null && <div style={{ padding: 24, fontSize: 13, color: 'var(--ink3)' }}>Loading campaigns…</div>}
        {campaigns?.length === 0 && !showNew && <div style={{ padding: 36, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No review campaigns recorded yet — start one above.</div>}
        {campaigns?.map((c, i, arr) => {
          const decided = c.approved + c.revoked;
          const pct = c.total > 0 ? Math.round((decided / c.total) * 100) : 100;
          return (
            <Link key={c.id} to={`/ondi/access-reviews/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: c.status === 'completed' ? '#ecfdf5' : 'var(--teal-l, #ecfeff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={c.status === 'completed' ? 'checkCircle' : 'userCheck'} size={18} color={c.status === 'completed' ? '#047857' : 'var(--teal)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {c.name}
                  <span className={`ondi-status-pill ${c.status === 'completed' ? 'success' : 'warning'}`}>
                    {c.status === 'completed' ? 'Completed' : 'Active'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>
                  Started {fmtDate(c.created_at)}{c.created_by_name ? ` by ${c.created_by_name}` : ''} · {c.total} grant{c.total === 1 ? '' : 's'} · {decided}/{c.total} reviewed
                </div>
              </div>
              <div style={{ width: 140, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>
                  <span>Progress</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: c.revoked > 0 ? '#b45309' : '#047857', borderRadius: 3, transition: 'width 0.3s ease' }} />
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

// ── Detail: Campaign Items & Decisions ─────────────────────────────
interface ReviewItem {
  id: string; user_id: string; user_name: string; user_email: string;
  role_name: string; decision: 'pending' | 'approved' | 'revoked';
  decided_at: string | null; decided_by_name: string | null;
}

export const OndiAccessReviewDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiFetch(`/v1/ondi/org/access-reviews/${id}`);
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
      await apiFetch(`/v1/ondi/org/access-reviews/${id}/items/${itemId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  async function decideBulk(decision: 'approved' | 'revoked') {
    if (selected.size === 0) return;
    if (decision === 'revoked' && !(await showConfirm(`Revoke ${selected.size} role grant${selected.size === 1 ? '' : 's'}? They'll be removed immediately.`, { variant: 'warning', confirmLabel: 'Revoke All' }))) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/ondi/org/access-reviews/${id}/bulk-decide`, { method: 'POST', body: JSON.stringify({ item_ids: Array.from(selected), decision }) });
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setBusy(false); }
  }

  async function complete() {
    if (!(await showConfirm('Mark this campaign complete? Any remaining pending grants will stay as-is.', { confirmLabel: 'Complete Campaign' }))) return;
    try {
      await apiFetch(`/v1/ondi/org/access-reviews/${id}/complete`, { method: 'POST' });
      await reload();
    } catch (err: any) { showAlert(err.message); }
  }

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise', 'Access Reviews']}
        titlePlain={campaign?.name ? campaign.name.split(' ').slice(0, -1).join(' ') || campaign.name : 'Review'}
        titleEm={campaign?.name ? campaign.name.split(' ').slice(-1)[0] : 'campaign'}
        subtitle={campaign?.status === 'completed' ? 'This review campaign is complete.' : 'Approve to keep a grant intact, or revoke to remove access immediately.'}
        actions={campaign?.status === 'active' ? (
          <button type="button" onClick={complete}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Complete Campaign
          </button>
        ) : undefined}
      />

      {pending.length > 0 && campaign?.status === 'active' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <input type="checkbox" checked={selected.size === pending.length && pending.length > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{selected.size > 0 ? `${selected.size} grants selected` : `Select all ${pending.length} pending grants`}</span>
          <div style={{ flex: 1 }} />
          <button type="button" disabled={selected.size === 0 || busy} onClick={() => decideBulk('approved')}
            style={{ fontSize: 12.5, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid rgba(4,120,87,0.3)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', opacity: selected.size === 0 ? 0.5 : 1 }}>
            Approve Selected
          </button>
          <button type="button" disabled={selected.size === 0 || busy} onClick={() => decideBulk('revoked')}
            style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', background: '#fef2f2', border: '1px solid rgba(185,28,28,0.3)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', opacity: selected.size === 0 ? 0.5 : 1 }}>
            Revoke Selected
          </button>
        </div>
      )}

      <SectionCard padded={false}>
        {items === null && <div style={{ padding: 24, fontSize: 13, color: 'var(--ink3)' }}>Loading items…</div>}
        {items?.length === 0 && <div style={{ padding: 36, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No role grants existed when this campaign started.</div>}
        {items?.map((item, i, arr) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {item.decision === 'pending' && campaign?.status === 'active' && (
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} style={{ cursor: 'pointer' }} />
            )}
            <PersonAvatar userId={item.user_id} name={item.user_name} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{item.user_name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{item.user_email} · role: <span className="ondi-perm-chip">{item.role_name}</span></div>
            </div>
            {item.decision !== 'pending' ? (
              <div style={{ textAlign: 'right' }}>
                <span className={`ondi-status-pill ${item.decision === 'approved' ? 'success' : 'error'}`}>
                  {item.decision === 'approved' ? 'Approved' : 'Revoked'}
                </span>
                {item.decided_by_name && <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 3 }}>by {item.decided_by_name}</div>}
              </div>
            ) : campaign?.status === 'active' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => decideOne(item.id, 'approved')}
                  style={{ fontSize: 12.5, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid rgba(4,120,87,0.3)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                  Approve
                </button>
                <button type="button" onClick={() => decideOne(item.id, 'revoked')}
                  style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', background: '#fef2f2', border: '1px solid rgba(185,28,28,0.3)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                  Revoke
                </button>
              </div>
            ) : (
              <span className="ondi-status-pill warning">Pending</span>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default OndiAccessReviews;
