import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useCompany } from '../data/companyStore.js';

/**
 * The organization/"Business" half of Ondi's identity surface — KYB
 * (business-registration verification), the counterpart to
 * AccountSecurityPanel's personal half. Originally only on Subscription.tsx's
 * Company Info tab; also rendered inside the Ondi app's own "Business" mode
 * (see OneIdShell.tsx) so business identity lives alongside the rest of
 * Ondi rather than only on the billing-admin screen.
 */
export function OrgVerificationPanel() {
  const co = useCompany();
  const { user } = useAuth();
  const isAdmin = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);

  const [kyb, setKyb] = useState<{ kyb_status: string; latest_submission: any } | null>(null);
  const [kybBusy, setKybBusy] = useState(false);
  const reloadKyb = useCallback(async () => {
    try { setKyb(await apiFetch('/v1/oneid/org/kyb/status')); } catch { setKyb(null); }
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
      const res = await apiFetch('/v1/oneid/org/kyb/submit', { method: 'POST', body: JSON.stringify({ image_base64: base64, media_type }) });
      showAlert(`Submitted. We read "${res.extracted.companyName || 'this document'}" — a Hudumika reviewer will verify it.`, { variant: 'success', title: 'Submitted for review' });
      await reloadKyb();
    } catch (err: any) {
      showAlert(err.message || 'Could not read that document. Try a clearer photo.');
    } finally {
      setKybBusy(false);
    }
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', maxWidth: 640 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>Business Verification</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Verify this company's registration with Hudumika.</div>
        </div>
        {kyb?.kyb_status === 'verified' ? <span style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--green-l)', color: '#059669', fontSize: 11, fontWeight: 700 }}>Verified</span> :
          kyb?.kyb_status === 'pending' ? <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fffbeb', color: '#d97706', fontSize: 11, fontWeight: 700 }}>Under review</span> : undefined}
      </div>
      <div style={{ padding: '4px 20px 20px' }}>
        {kyb === null && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}

        {kyb?.kyb_status === 'verified' && kyb.latest_submission && (
          <div style={{ fontSize: 13, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="checkCircle" size={14} strokeWidth={2} />
            Verified as {kyb.latest_submission.extracted_company_name || co.name} ({kyb.latest_submission.extracted_registry_number || 'no reg. number on file'}).
          </div>
        )}

        {kyb?.kyb_status === 'pending' && (
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6 }}>
            Your registration document is with a Hudumika reviewer. This usually takes a day or two.
          </div>
        )}

        {(kyb?.kyb_status === 'not_started' || kyb?.kyb_status === 'rejected') && (
          !isAdmin ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Only a workspace admin can submit business verification.</div>
          ) : (
            <>
              {kyb.kyb_status === 'rejected' && kyb.latest_submission?.rejection_reason && (
                <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                  Previous submission was rejected: {kyb.latest_submission.rejection_reason}
                </div>
              )}
              <label style={{
                padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none',
                background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
                fontFamily: 'var(--font)', fontWeight: 600, cursor: kybBusy ? 'default' : 'pointer',
                fontSize: 13, opacity: kybBusy ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box',
                lineHeight: 1.25, display: 'inline-flex', alignItems: 'center',
              }}>
                {kybBusy ? 'Reading document…' : 'Upload registration document'}
                <input type="file" accept="image/*" capture="environment" disabled={kybBusy} style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) submitKyb(f); e.target.value = ''; }} />
              </label>
            </>
          )
        )}
      </div>
    </div>
  );
}

export default OrgVerificationPanel;
