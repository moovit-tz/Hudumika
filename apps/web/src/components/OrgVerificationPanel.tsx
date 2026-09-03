import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useCompany } from '../data/companyStore.js';

export function OrgVerificationPanel() {
  const co = useCompany();
  const { user } = useAuth();
  const isAdmin = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);

  const [kyb, setKyb] = useState<{ kyb_status: string; latest_submission: any } | null>(null);
  const [kybBusy, setKybBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const reloadKyb = useCallback(async () => {
    try { setKyb(await apiFetch('/v1/ondi/org/kyb/status')); } catch { setKyb(null); }
  }, []);

  useEffect(() => { reloadKyb(); }, [reloadKyb]);

  async function submitKyb(file: File) {
    setKybBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const [meta, base64] = dataUrl.split(',');
      const media_type = /data:(.*);base64/.exec(meta)?.[1] || file.type || 'image/jpeg';
      const res = await apiFetch('/v1/ondi/org/kyb/submit', { method: 'POST', body: JSON.stringify({ image_base64: base64, media_type }) });
      showAlert(`Submitted. We read "${res.extracted.companyName || 'this document'}" — a Hudumika reviewer will verify it.`, { variant: 'success', title: 'Submitted for review' });
      await reloadKyb();
    } catch (err: any) {
      showAlert(err.message || 'Could not read that document. Try a clearer photo.');
    } finally {
      setKybBusy(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!kybBusy) setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (kybBusy) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      submitKyb(file);
    } else {
      showAlert('Please upload a valid image file of your registration document.');
    }
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', maxWidth: 640, boxShadow: 'var(--elev-sm)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Business Verification</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Verify this company's registration with Hudumika.</div>
        </div>
        {kyb?.kyb_status === 'verified' && (
          <span style={{ padding: '4px 12px', borderRadius: 20, background: '#ecfdf5', color: '#047857', fontSize: 11, fontWeight: 700 }}>Verified</span>
        )}
        {kyb?.kyb_status === 'pending' && (
          <span style={{ padding: '4px 12px', borderRadius: 20, background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 700 }}>Under review</span>
        )}
      </div>

      <div style={{ padding: 20 }}>
        {kyb === null && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading verification state…</div>}

        {kyb?.kyb_status === 'verified' && kyb.latest_submission && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13.5, color: '#047857', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: '#ecfdf5', padding: '10px 14px', borderRadius: 8 }}>
              <Icon name="checkCircle" size={16} style={{ color: '#047857' }} />
              Verified Profile Active
            </div>
            <div style={{ border: '1px solid var(--border-soft)', borderRadius: 9, padding: 14, background: 'var(--bg)', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>Entity Name</span>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{kyb.latest_submission.extracted_company_name || co.name}</span>

              <span style={{ fontWeight: 600, color: 'var(--ink3)', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>Registry Number</span>
              <span style={{ fontWeight: 700, color: 'var(--ink)', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>{kyb.latest_submission.extracted_registry_number || 'BRELA Linked'}</span>
            </div>
          </div>
        )}

        {kyb?.kyb_status === 'pending' && (
          <div style={{ display: 'flex', gap: 12, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <Icon name="clock" size={20} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Submission Under Review</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.5 }}>
                Your business registration certificate is currently with a Hudumika reviewer. Verifications are usually completed within 24 hours.
              </div>
            </div>
          </div>
        )}

        {(kyb?.kyb_status === 'not_started' || kyb?.kyb_status === 'rejected') && (
          !isAdmin ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Only workspace administrators are authorized to submit company verification documents.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {kyb.kyb_status === 'rejected' && kyb.latest_submission?.rejection_reason && (
                <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="alertTriangle" size={15} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>Verification Rejected</div>
                    <div style={{ marginTop: 2 }}>{kyb.latest_submission.rejection_reason}</div>
                  </div>
                </div>
              )}

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: isDragOver ? '2px dashed var(--teal)' : '2px dashed var(--border)',
                  borderRadius: 10,
                  padding: '30px 20px',
                  textAlign: 'center',
                  background: isDragOver ? 'rgba(0,181,137,0.03)' : 'var(--bg)',
                  cursor: kybBusy ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                {!kybBusy ? (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--white)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                      <Icon name="upload" size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Upload Business Registration Certificate</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Drag & drop document scan here, or click to browse</div>
                    </div>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) submitKyb(f); e.target.value = ''; }} />
                  </label>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTop: '3px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Extracting & verifying registration details...</div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default OrgVerificationPanel;
