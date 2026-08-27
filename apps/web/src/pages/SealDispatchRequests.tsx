import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';

interface DispatchRequest {
  id: string;
  lotId: string;
  lotDescription?: string;
  lotUom?: string;
  requestedByOrgName?: string;
  qtyRequested: number;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fulfillmentOrderId: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, 'gray' | 'warning' | 'success' | 'error'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'error',
};

/**
 * Cross-tenant dispatch requests an Organization has filed against goods it
 * owns in this warehouse (org.routes.ts POST /seal-lots/:lotId/dispatch-
 * request, migration 232). Approving one creates a real draft fulfillment
 * order through the exact same insert POST /fulfillment-orders performs —
 * this page never moves stock itself, it only decides whether that order
 * gets created; the pick/pack/dispatch flow afterward is the existing
 * SealFulfillment page, unchanged.
 */
export function SealDispatchRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    apiFetch('/v1/seal/dispatch-requests').then(setRequests).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    if (status === 'REJECTED') {
      const ok = await showConfirm('Reject this dispatch request?');
      if (!ok) return;
    }
    setDecidingId(id);
    try {
      const updated = await apiFetch(`/v1/seal/dispatch-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
      if (status === 'APPROVED' && updated.fulfillmentOrderId) {
        showAlert('Draft fulfillment order created.', { title: 'Request approved', variant: 'success' });
      }
    } catch (err: any) {
      showAlert(err.message || 'Could not update this request.');
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Dispatch Requests']}
        titlePlain="Dispatch"
        titleEm="requests"
        subtitle="Cross-tenant requests an Organization has filed against goods it owns here — approving one creates a draft fulfillment order."
      />

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="seal-empty">No dispatch requests yet.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Lot</th><th>Requested By</th><th>Quantity</th><th>Note</th><th>Status</th><th>Filed</th><th></th></tr></thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>{r.lotDescription ?? '—'}</td>
                    <td>
                      {r.requestedByOrgName ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <CompanyAvatar name={r.requestedByOrgName} size={22} shape="circle" />
                          {r.requestedByOrgName}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{r.qtyRequested} {r.lotUom ?? ''}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || '—'}</td>
                    <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status}</Badge></td>
                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {r.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button type="button" size="sm" disabled={decidingId === r.id} onClick={() => decide(r.id, 'APPROVED')}>Approve</Button>
                          <Button type="button" size="sm" variant="outline" disabled={decidingId === r.id} onClick={() => decide(r.id, 'REJECTED')}>Reject</Button>
                        </div>
                      ) : r.fulfillmentOrderId ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => navigate(`/seal/fulfillment/${r.fulfillmentOrderId}`)}>View Order</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
