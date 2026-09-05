import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch, apiFetchRaw } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface KybRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  extracted_company_name: string | null;
  extracted_registry_number: string | null;
  extracted_entity_type: string | null;
  extracted_status: string | null;
  extracted_incorporation_date: string | null;
  submitted_by_name: string;
  submitted_by_email: string;
  created_at: string;
}

/**
 * Platform review of tenants' own business-registration (KYB) submissions
 * — cross-tenant by nature (a tenant can't verify its own business
 * identity), gated on SUPER_ADMIN at the API route level, same convention
 * as SuperAdminIssues.tsx.
 */
export const SuperAdminKyb: React.FC = () => {
  const [queue, setQueue] = useState<KybRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const reload = useCallback(() => {
    apiFetch('/v1/superadmin/kyb-queue').then(setQueue).catch(() => setQueue([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function viewDocument(id: string) {
    setPreviewLoading(id);
    try {
      const res = await apiFetchRaw(`/v1/superadmin/kyb/${id}/document`);
      setPreviewUrl(URL.createObjectURL(await res.blob()));
    } catch {
      showAlert('Could not load the document image.');
    } finally {
      setPreviewLoading(null);
    }
  }

  async function approve(row: KybRow) {
    if (!(await showConfirm(`Verify ${row.tenant_name}'s business registration?`, { confirmLabel: 'Verify' }))) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/v1/superadmin/kyb/${row.id}/approve`, { method: 'POST' });
      setQueue(prev => prev?.filter(r => r.id !== row.id) ?? null);
    } catch (err: any) {
      showAlert(err.message);
    } finally { setBusyId(null); }
  }

  async function reject(row: KybRow) {
    const reason = window.prompt(`Why is ${row.tenant_name}'s submission being rejected?`, 'Document image is unclear');
    if (!reason || !reason.trim()) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/v1/superadmin/kyb/${row.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setQueue(prev => prev?.filter(r => r.id !== row.id) ?? null);
    } catch (err: any) {
      showAlert(err.message);
    } finally { setBusyId(null); }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Admin', 'Business Verification']}
        titlePlain="Business"
        titleEm="verification"
        subtitle="Pending KYB submissions across every workspace."
      />

      <SectionCard padded={false} title={`Pending review${queue ? ` (${queue.length})` : ''}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Workspace', 'Submitted by', 'Extracted name', 'Registry #', 'Entity type', 'Submitted', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue?.map(row => (
              <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', color: 'var(--ink)', fontWeight: 600 }}>{row.tenant_name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>
                  <div>{row.submitted_by_name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{row.submitted_by_email}</div>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.extracted_company_name || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.extracted_registry_number || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.extracted_entity_type || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(row.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => viewDocument(row.id)} disabled={previewLoading === row.id}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--card)', color: 'var(--ink2)' }}>
                      {previewLoading === row.id ? '…' : 'View'}
                    </button>
                    <button type="button" onClick={() => approve(row)} disabled={busyId === row.id}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: 'none', cursor: 'pointer', background: 'var(--green-l)', color: '#059669' }}>
                      Verify
                    </button>
                    <button type="button" onClick={() => reject(row)} disabled={busyId === row.id}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: 'none', cursor: 'pointer', background: '#fef2f2', color: '#dc2626' }}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue === null && <SectionLoading />}
        {queue?.length === 0 && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending submissions.</div>}
      </SectionCard>

      {previewUrl && (
        <div onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer' }}>
          <img src={previewUrl} alt="KYB document" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: 'var(--elev-lg)' }} />
          <button type="button" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
            style={{ position: 'absolute', top: 24, right: 24, background: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer' }}>
            <Icon name="x" size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default SuperAdminKyb;
