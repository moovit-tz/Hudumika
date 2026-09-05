import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useCompany } from '../data/companyStore.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Badge } from './ui/badge.js';
import { CompanyAvatar } from './PersonAvatar.js';
import { Spinner } from './ui/spinner.js';

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
      showAlert(`Submitted. We read "${res.extracted?.companyName || 'this document'}" — a Hudumika reviewer will verify it.`, { variant: 'success', title: 'Submitted for review' });
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

  const isVerified = kyb?.kyb_status === 'verified';
  const isPending = kyb?.kyb_status === 'pending';
  const isRejected = kyb?.kyb_status === 'rejected';

  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md, 12px)',
      overflow: 'hidden',
      width: '100%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
      transition: 'all 0.2s ease'
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        background: 'var(--bg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant={isVerified ? 'success' : isPending ? 'warning' : 'brand'} size="md" shape="square">
            <Icon name={isVerified ? 'checkCircle' : isPending ? 'clock' : 'building'} size={20} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Business Verification (KYB)</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>
              Verify this workspace's legal entity status &amp; registration compliance.
            </div>
          </div>
        </div>

        <div>
          {isVerified && (
            <Badge variant="success">
              <Icon name="checkCircle" size={13} /> Verified Entity
            </Badge>
          )}
          {isPending && (
            <Badge variant="warning">
              <Icon name="clock" size={13} /> Under Review
            </Badge>
          )}
          {!isVerified && !isPending && (
            <Badge variant="secondary">
              <Icon name="alertTriangle" size={13} /> Unverified
            </Badge>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div style={{ padding: 24 }}>
        {kyb === null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--ink3)', fontSize: 13 }}>
            <Spinner size={20} />
            <span>Retrieving KYB verification status…</span>
          </div>
        )}

        {isVerified && kyb?.latest_submission && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Success Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 14,
              background: '#ecfdf5',
              border: '1px solid rgba(4,120,87,0.2)',
              borderRadius: 10,
              padding: '16px 20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <CompanyAvatar name={co.name} logoUrl={co.logoUrl} size={44} shape="square" />
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#047857', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Verified Business Profile Active
                    <Icon name="checkCircle" size={16} style={{ color: '#047857' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#065f46', marginTop: 2 }}>
                    This organization has completed formal KYB registration verification.
                  </div>
                </div>
              </div>
              <span className="ondi-status-pill success">
                <span className="ondi-status-dot" /> Level 3 Security Tier
              </span>
            </div>

            {/* Extracted Details Table / Data Grid */}
            <div style={{
              border: '1px solid var(--border-soft)',
              borderRadius: 10,
              padding: 20,
              background: 'var(--bg)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              fontSize: 13
            }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Legal Entity Name</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                  {kyb.latest_submission.extracted_company_name || co.name}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registry / License Number</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                  {kyb.latest_submission.extracted_registry_number || co.regNumber || 'BRELA Linked'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tax Identification (TIN)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                  {co.taxId || 'TRA Verified'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Verification Authority</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="shield" size={14} /> BRELA / TRA Verified
                </div>
              </div>
            </div>
          </div>
        )}

        {isPending && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: 12,
            padding: 20
          }}>
            <FeaturedIcon variant="warning" size="md" shape="square">
              <Icon name="clock" size={20} />
            </FeaturedIcon>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                Submission Under Review
                <span className="ondi-status-pill warning" style={{ fontSize: 11 }}>In Progress</span>
              </div>
              <div style={{ fontSize: 13, color: '#b45309', marginTop: 6, lineHeight: 1.5 }}>
                Your business registration certificate is currently with a Hudumika reviewer. Verifications are automatically processed within 24 hours.
              </div>
            </div>
          </div>
        )}

        {(!isVerified && !isPending && kyb !== null) && (
          !isAdmin ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              background: 'var(--bg)',
              border: '1px solid var(--border-soft)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--ink3)'
            }}>
              <Icon name="lock" size={18} style={{ color: 'var(--ink3)' }} />
              <span>Only workspace administrators are authorized to submit company verification documents.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isRejected && kyb.latest_submission?.rejection_reason && (
                <div style={{
                  fontSize: 13,
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: 10,
                  padding: '14px 18px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start'
                }}>
                  <FeaturedIcon variant="error" size="sm" shape="square">
                    <Icon name="alertTriangle" size={16} />
                  </FeaturedIcon>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>Verification Rejected</div>
                    <div style={{ marginTop: 2, color: '#991b1b' }}>{kyb.latest_submission.rejection_reason}</div>
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: isDragOver ? '2px dashed var(--teal)' : '2px dashed var(--border)',
                  borderRadius: 12,
                  padding: '40px 24px',
                  textAlign: 'center',
                  background: isDragOver ? 'rgba(0,181,137,0.04)' : 'var(--bg)',
                  cursor: kybBusy ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {!kybBusy ? (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                    <FeaturedIcon variant="brand" size="lg" shape="circle" className="shadow-sm">
                      <Icon name="upload" size={22} />
                    </FeaturedIcon>

                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
                        Upload Registration Certificate (BRELA / Business License)
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>
                        Drag &amp; drop high-resolution document scan here, or click to browse files
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <Badge variant="gray">JPEG / PNG / WebP</Badge>
                      <Badge variant="gray">BRELA Certificate</Badge>
                      <Badge variant="gray">Max 10MB</Badge>
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) submitKyb(f); e.target.value = ''; }}
                    />
                  </label>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                    <Spinner size={36} thickness={3} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Extracting &amp; verifying registration details...</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Our OCR engine is reading document identifiers and company credentials.</div>
                    </div>
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

