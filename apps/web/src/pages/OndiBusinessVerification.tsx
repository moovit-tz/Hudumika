import React, { useState, useEffect } from 'react';
import './OndiPages.css';
import { PageHeader } from '../components/PageHeader.js';
import { OrgVerificationPanel } from '../components/OrgVerificationPanel.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { useCompany } from '../data/companyStore.js';
import { apiFetch } from '../lib/api.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';

export const OndiBusinessVerification: React.FC = () => {
  const co = useCompany();
  const [kyb, setKyb] = useState<{ kyb_status: string; latest_submission: any } | null>(null);

  useEffect(() => {
    apiFetch('/v1/ondi/org/kyb/status')
      .then(setKyb)
      .catch(() => setKyb(null));
  }, []);

  const isVerified = kyb?.kyb_status === 'verified';
  const isPending = kyb?.kyb_status === 'pending';

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Business']}
        titlePlain="Business"
        titleEm="identity"
        subtitle="Verify and govern this workspace's legal business registration status, tax identity, and security clearance."
      />

      {/* KPI Stat Cards */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Workspace Entity</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfeff', color: 'var(--teal)' }}>
              <Icon name="building" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {co.name}
            </span>
          </div>
          <div className="ondi-kpi-sub" style={{ marginTop: -4 }}>
            {co.regNumber ? `Reg #${co.regNumber}` : 'Incorporated Organization'}
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">KYB Verification Status</span>
            <div className="ondi-kpi-icon-box" style={{
              background: isVerified ? '#ecfdf5' : isPending ? '#fffbeb' : '#fef2f2',
              color: isVerified ? '#047857' : isPending ? '#b45309' : '#dc2626'
            }}>
              <Icon name={isVerified ? 'checkCircle' : isPending ? 'clock' : 'alertTriangle'} size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{
              fontSize: 22,
              color: isVerified ? '#047857' : isPending ? '#b45309' : '#dc2626'
            }}>
              {isVerified ? 'Verified' : isPending ? 'Under Review' : 'Unverified'}
            </span>
          </div>
          <div className="ondi-kpi-sub" style={{ marginTop: -4 }}>
            {isVerified ? 'Full KYB Clearance' : isPending ? 'Pending Inspector Approval' : 'Action Required'}
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Trust &amp; Security Grade</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#eff6ff', color: '#1e40af' }}>
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#1e40af' }}>
              {isVerified ? 'Tier 3' : 'Tier 1'}
            </span>
          </div>
          <div className="ondi-kpi-sub" style={{ marginTop: -4 }}>
            {isVerified ? 'Enterprise Verified Workspace' : 'Standard Unverified Profile'}
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Compliance Standard</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Icon name="fileText" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ fontSize: 22, color: '#7c3aed' }}>
              BRELA / TRA
            </span>
          </div>
          <div className="ondi-kpi-sub" style={{ marginTop: -4 }}>
            National Business Registry Standards
          </div>
        </div>
      </div>

      {/* Main Content & Sidebar Grid */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {/* Verification Panel Column */}
        <div style={{ flex: '1 1 540px', minWidth: 0 }}>
          <OrgVerificationPanel />
        </div>

        {/* Verification Guidelines & Info Sidebar */}
        <div style={{ flex: '0 0 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="KYB Guidelines">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="shield" size={16} />
                </FeaturedIcon>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>BRELA &amp; TRA Compliance</div>
                  <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                    Upload official company incorporation certificates or business licenses issued by BRELA or relevant licensing authorities.
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14, display: 'flex', gap: 12 }}>
                <FeaturedIcon variant="info" size="sm" shape="square">
                  <Icon name="eye" size={16} />
                </FeaturedIcon>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Automated OCR Verification</div>
                  <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                    Our system automatically extracts legal names, tax numbers, and registration IDs to accelerate inspector approval.
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14, display: 'flex', gap: 12 }}>
                <FeaturedIcon variant="success" size="sm" shape="square">
                  <Icon name="checkCircle" size={16} />
                </FeaturedIcon>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Enterprise Trust Privileges</div>
                  <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                    Verified businesses unlock higher API limits, verified organization badges, and priority support dispatching.
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Quick Help Card */}
          <div style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md, 12px)',
            padding: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <Icon name="helpCircle" size={20} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
              Need assistance with business verification? Contact our support team at <a href="mailto:support@hudumika.com" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>support@hudumika.com</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OndiBusinessVerification;

