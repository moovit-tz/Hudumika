import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Tip } from '../components/ui/tooltip.js';

interface ProductReview {
  id: string;
  product_id: string;
  product_name?: string;
  customer_id: string | null;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reply: string | null;
  created_at: string;
  updated_at: string;
}

function StarRow({ rating, interactive, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n}
          style={{ fontSize: 16, cursor: interactive ? 'pointer' : 'default', color: (interactive ? hover || rating : rating) >= n ? 'var(--gold)' : 'var(--border)' }}
          onClick={() => interactive && onChange?.(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}>
          ★
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ProductReview['status'] }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    pending:  { bg: 'var(--gold-l)',  color: 'var(--gold)'  },
    approved: { bg: 'var(--green-l)', color: 'var(--green)' },
    rejected: { bg: 'var(--red-l)',   color: 'var(--red)'   },
  };
  const c = cfg[status] ?? cfg.pending;
  return <span style={{ padding: '2px 8px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>{status}</span>;
}

function ReplyModal({ review, onSave, onClose }: { review: ProductReview; onSave: (reply: string, status: ProductReview['status']) => Promise<void>; onClose: () => void }) {
  const [reply, setReply] = useState(review.reply ?? '');
  const [status, setStatus] = useState(review.status);
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

  async function submit() {
    setSaving(true);
    try { await onSave(reply, status); onClose(); }
    catch (err: any) { showAlert(err.message || 'Failed to save.'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Moderate Review</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* Review being moderated */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PersonAvatar userId={review.customer_id ?? undefined} name={review.customer_name} size={28} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{review.customer_name}</div>
                  {review.product_name && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{review.product_name}</div>}
                </div>
              </div>
              <StarRow rating={review.rating} />
            </div>
            {review.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{review.title}</div>}
            {review.body && <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{review.body}</div>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Status</label>
            <Select value={status} onValueChange={v => setStatus(v as ProductReview['status'])}>
              <SelectTrigger aria-label="Status" style={inp}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label style={lbl}>Staff Reply (optional)</label>
            <textarea title="Staff reply" value={reply} onChange={e => setReply(e.target.value)} rows={3}
              placeholder="Thank you for your review…"
              style={{ ...inp, resize: 'vertical' }} />
          </div>
        </DialogBody>
        <DialogFooter>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ProductReviewsPage: React.FC = () => {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProductReview['status']>('ALL');
  const [search, setSearch] = useState('');
  const [moderating, setModerating] = useState<ProductReview | null>(null);

  function load() {
    setLoading(true);
    apiFetch('/v1/products/reviews')
      .then((res: any) => setReviews(Array.isArray(res) ? res : (res.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleModerate(review: ProductReview, reply: string, status: ProductReview['status']) {
    const updated: ProductReview = await apiFetch(`/v1/products/reviews/${review.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reply: reply || null }),
    });
    setReviews(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  async function handleDelete(review: ProductReview) {
    if (!(await showConfirm(`Delete this review from ${review.customer_name}?`, { confirmLabel: 'Delete', variant: 'danger' }))) return;
    await apiFetch(`/v1/products/reviews/${review.id}`, { method: 'DELETE' });
    setReviews(prev => prev.filter(r => r.id !== review.id));
  }

  async function quickStatus(review: ProductReview, status: ProductReview['status']) {
    const updated: ProductReview = await apiFetch(`/v1/products/reviews/${review.id}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    });
    setReviews(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  const displayed = reviews.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return r.customer_name.toLowerCase().includes(s) || (r.product_name ?? '').toLowerCase().includes(s) || (r.title ?? '').toLowerCase().includes(s) || (r.body ?? '').toLowerCase().includes(s);
    }
    return true;
  });

  const pending  = reviews.filter(r => r.status === 'pending').length;
  const approved = reviews.filter(r => r.status === 'approved').length;
  const rejected = reviews.filter(r => r.status === 'rejected').length;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

  return (
    <div style={{ paddingBottom: 40 }}>
      {moderating && (
        <ReplyModal
          review={moderating}
          onSave={(reply, status) => handleModerate(moderating, reply, status)}
          onClose={() => setModerating(null)}
        />
      )}

      <PageHeader
        crumbs={['FINANCE', 'PRODUCTS & SERVICES', 'REVIEWS']}
        titlePlain="Product"
        titleEm="reviews"
        subtitle="Moderate customer reviews — approve, reject, or reply on behalf of the store."
        actions={
          <button type="button" onClick={() => navigate('/finance/products')} className="btn btn-secondary btn-sm">
            <Icon name="arrowLeft" size={13} /> Back to Catalog
          </button>
        }
      />

      <MetricsRow cards={[
        { title: 'Total Reviews', value: String(reviews.length), sub1Label: 'PENDING', sub1Value: String(pending), sub2Label: 'APPROVED', sub2Value: String(approved), barHighlight: 'var(--blue)' },
        { title: 'Avg Rating', value: reviews.length ? `${avgRating.toFixed(1)} ★` : '—', sub1Label: 'REVIEWS', sub1Value: String(reviews.length), sub2Label: 'APPROVED', sub2Value: String(approved), barHighlight: 'var(--gold)' },
        { title: 'Pending Moderation', value: String(pending), sub1Label: 'APPROVED', sub1Value: String(approved), sub2Label: 'REJECTED', sub2Value: String(rejected), barHighlight: pending > 0 ? 'var(--gold)' : 'var(--green)' },
        { title: 'Rejected', value: String(rejected), sub1Label: 'TOTAL', sub1Value: String(reviews.length), sub2Label: 'RATE', sub2Value: reviews.length ? `${Math.round(rejected / reviews.length * 100)}%` : '—', barHighlight: 'var(--red)' },
      ]} />

      {/* Toolbar */}
      <SectionCard>
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search reviews, customers, or products"
          quickFilter={{
            label: 'Status', allLabel: `All (${reviews.length})`, value: statusFilter === 'ALL' ? null : statusFilter,
            onChange: value => setStatusFilter((value || 'ALL') as typeof statusFilter),
            options: (['pending', 'approved', 'rejected'] as const).map(status => ({
              value: status,
              label: `${status.charAt(0).toUpperCase() + status.slice(1)} (${reviews.filter(review => review.status === status).length})`,
            })),
          }}
        />
      </SectionCard>

      <SectionCard padded={false}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Icon name="star" size={44} color="var(--border)" /></div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>No reviews</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{search || statusFilter !== 'ALL' ? 'Try a different filter.' : 'Customer reviews will appear here.'}</div>
          </div>
        ) : (
          <div>
            {displayed.map(r => (
              <div key={r.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                    <PersonAvatar userId={r.customer_id ?? undefined} name={r.customer_name} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{r.customer_name}</span>
                        <StarRow rating={r.rating} />
                        <StatusBadge status={r.status} />
                        <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }}>{fmtDate(r.created_at)}</span>
                      </div>
                      {r.product_name && (
                        <div style={{ fontSize: 11.5, color: 'var(--teal)', fontWeight: 600, marginBottom: 4 }}>on {r.product_name}</div>
                      )}
                      {r.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{r.title}</div>}
                      {r.body && <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 6 }}>{r.body}</div>}
                      {r.reply && (
                        <div style={{ background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 'var(--r)', padding: '8px 12px', marginTop: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>STORE REPLY</div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{r.reply}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {r.status === 'pending' && (<>
                      <button type="button" onClick={() => quickStatus(r, 'approved')}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, border: '1px solid var(--green)', borderRadius: 'var(--r-sm)', background: 'var(--green-l)', color: 'var(--green)', cursor: 'pointer' }}>
                        Approve
                      </button>
                      <button type="button" onClick={() => quickStatus(r, 'rejected')}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, border: '1px solid var(--red)', borderRadius: 'var(--r-sm)', background: 'var(--red-l)', color: 'var(--red)', cursor: 'pointer' }}>
                        Reject
                      </button>
                    </>)}
                    <button type="button" onClick={() => setModerating(r)}
                      style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink3)', cursor: 'pointer' }}>
                      <Icon name="messageSquare" size={12} /> Reply
                    </button>
                    <Tip label="Delete review">
                      <button type="button" aria-label="Delete review" onClick={() => handleDelete(r)}
                        style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                        <Icon name="trash" size={12} />
                      </button>
                    </Tip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
