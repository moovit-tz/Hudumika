import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, apiFetchRaw } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface KycQueueRow {
  id: string;
  document_type: 'national_id' | 'passport' | 'drivers_license';
  status: string;
  created_at: string;
  extracted_full_name: string | null;
  extracted_dob: string | null;
  extracted_document_number: string | null;
  extracted_nationality: string | null;
  extracted_expiry: string | null;
  mrz_valid: boolean | null;
  user_id: string;
  user_name: string;
  user_email: string;
}

const DOC_LABEL: Record<string, string> = { national_id: 'National ID', passport: 'Passport', drivers_license: "Driver's License" };

/** Admin review queue for Ondi's personal KYC (M4) — the counterpart to the
 *  self-service submission card on Workspace ▸ Subscription ▸ Security.
 *  Reviewing here approves/rejects a real ondi_kyc_submissions row and
 *  moves the person's users.kyc_status/verification_level accordingly
 *  (see oneid.routes.ts's POST /kyc/:id/approve|reject). */
export const OneIdKyc: React.FC = () => {
  const [queue, setQueue] = useState<KycQueueRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const reload = useCallback(() => {
    apiFetch('/v1/oneid/kyc/queue').then(setQueue).catch(() => setQueue([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function viewDocument(id: string) {
    setPreviewLoading(id);
    try {
      const res = await apiFetchRaw(`/v1/oneid/kyc/${id}/document`);
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      showAlert('Could not load the document image.');
    } finally {
      setPreviewLoading(null);
    }
  }

  async function approve(row: KycQueueRow) {
    if (!(await showConfirm(`Approve ${row.user_name}'s ${DOC_LABEL[row.document_type]}? This verifies their identity on Hudumika.`, { confirmLabel: 'Approve' }))) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/v1/oneid/kyc/${row.id}/approve`, { method: 'POST' });
      setQueue(prev => prev?.filter(r => r.id !== row.id) ?? null);
    } catch (err: any) {
      showAlert(err.message);
    } finally { setBusyId(null); }
  }

  async function reject(row: KycQueueRow) {
    const reason = window.prompt(`Why is ${row.user_name}'s submission being rejected?`, 'Document image is unclear');
    if (!reason || !reason.trim()) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/v1/oneid/kyc/${row.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setQueue(prev => prev?.filter(r => r.id !== row.id) ?? null);
    } catch (err: any) {
      showAlert(err.message);
    } finally { setBusyId(null); }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        crumbs={['Ondi', 'KYC Review']}
        titlePlain="Identity"
        titleEm="verification"
        subtitle="Pending personal KYC submissions for this workspace."
      />

      <SectionCard padded={false} title={`Pending review${queue ? ` (${queue.length})` : ''}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Person', 'Document', 'Extracted name', 'DOB', 'Doc #', 'MRZ', 'Submitted', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue?.map(row => (
              <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', color: 'var(--ink)' }}>
                  <div style={{ fontWeight: 600 }}>{row.user_name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{row.user_email}</div>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{DOC_LABEL[row.document_type]}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.extracted_full_name || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.extracted_dob || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.extracted_document_number || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  {row.mrz_valid === null ? <span style={{ color: 'var(--ink3)' }}>n/a</span> : (
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: row.mrz_valid ? 'var(--green-l)' : 'var(--red-l, #fef2f2)',
                      color: row.mrz_valid ? '#059669' : '#dc2626',
                    }}>{row.mrz_valid ? 'Valid' : 'Invalid'}</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(row.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => viewDocument(row.id)} disabled={previewLoading === row.id}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--card)', color: 'var(--ink2)', minHeight: 'var(--ctl-h-xs)' }}>
                      {previewLoading === row.id ? '…' : 'View'}
                    </button>
                    <button type="button" onClick={() => approve(row)} disabled={busyId === row.id}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: 'none', cursor: 'pointer', background: 'var(--green-l)', color: '#059669', minHeight: 'var(--ctl-h-xs)' }}>
                      Approve
                    </button>
                    <button type="button" onClick={() => reject(row)} disabled={busyId === row.id}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: 'none', cursor: 'pointer', background: '#fef2f2', color: '#dc2626', minHeight: 'var(--ctl-h-xs)' }}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue === null && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}
        {queue?.length === 0 && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending submissions.</div>}
      </SectionCard>

      {previewUrl && (
        <div onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer' }}>
          <img src={previewUrl} alt="KYC document" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: 'var(--elev-lg)' }} />
          <button type="button" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
            style={{ position: 'absolute', top: 24, right: 24, background: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer' }}>
            <Icon name="x" size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default OneIdKyc;
