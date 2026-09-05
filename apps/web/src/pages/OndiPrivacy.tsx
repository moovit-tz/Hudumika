// ─── OndiPrivacy.tsx — Ondi Personal · Privacy Hub ───────────────────
// Enterprise-grade personal privacy center with data transparency,
// complete self-service data export, account deactivation/erasure requests,
// and compliance guarantees.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiDownload } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { useAuth } from '../hooks/useAuth.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import './OndiPrivacy.css';

interface DeleteRequest {
  id: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OndiPrivacy: React.FC = () => {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [requests, setRequests] = useState<DeleteRequest[] | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/delete-requests/mine');
      setRequests(data);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function exportData() {
    setExporting(true);
    try {
      await apiDownload(
        '/v1/security/data-export',
        `hudumika-privacy-export-${new Date().toISOString().slice(0, 10)}.json`
      );
      showAlert('Privacy data package downloaded successfully.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  async function submitDeactivation() {
    if (!user?.id) return;
    const confirmed = await showConfirm(
      'Request deactivation of your account? A workspace compliance administrator will review and verify your identity before it takes effect.',
      { variant: 'warning', confirmLabel: 'Submit Deactivation Request' }
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await apiFetch('/v1/hr/delete-requests', {
        method: 'POST',
        body: JSON.stringify({ user_id: user.id, reason: reason.trim() || undefined }),
      });
      setReason('');
      showAlert('Deactivation request submitted for compliance review.', { variant: 'success' });
      await reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  const pending = requests?.find((r) => r.status === 'PENDING');
  const pastRequests = requests?.filter((r) => r.status !== 'PENDING') || [];

  return (
    <div className="op-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Privacy"
        titleEm="hub."
        subtitle="Manage your personal data transparency, download machine-readable records, or request account deactivation."
      />

      {/* ── Top Executive Posture KPI Grid (2x2 on Mobile) ── */}
      <div className="op-kpi-grid">
        <div className="op-kpi-card">
          <div className="op-kpi-header">
            <span className="op-kpi-title">Privacy Tier</span>
            <div className="op-kpi-icon primary">
              <Icon name="shield" size={17} />
            </div>
          </div>
          <div className="op-kpi-body">
            <div className="op-kpi-val" style={{ color: 'var(--teal)' }}>
              ISOLATED
            </div>
            <div className="op-kpi-sub">
              <Icon name="checkCircle" size={12} color="var(--green)" />
              Tenant boundary partition
            </div>
          </div>
        </div>

        <div className="op-kpi-card">
          <div className="op-kpi-header">
            <span className="op-kpi-title">Data Export</span>
            <div className="op-kpi-icon success">
              <Icon name="download" size={17} />
            </div>
          </div>
          <div className="op-kpi-body">
            <div className="op-kpi-val" style={{ color: 'var(--green, #10b981)' }}>
              READY
            </div>
            <div className="op-kpi-sub">JSON format on-demand</div>
          </div>
        </div>

        <div className="op-kpi-card">
          <div className="op-kpi-header">
            <span className="op-kpi-title">Erasure Rights</span>
            <div className="op-kpi-icon warning">
              <Icon name="userMinus" size={17} />
            </div>
          </div>
          <div className="op-kpi-body">
            <div className="op-kpi-val">
              {pending ? 'PENDING' : 'ACTIVE'}
            </div>
            <div className="op-kpi-sub">Self-service workflow</div>
          </div>
        </div>

        <div className="op-kpi-card">
          <div className="op-kpi-header">
            <span className="op-kpi-title">Third-Party Sale</span>
            <div className="op-kpi-icon purple">
              <Icon name="lock" size={17} />
            </div>
          </div>
          <div className="op-kpi-body">
            <div className="op-kpi-val">0 %</div>
            <div className="op-kpi-sub">Zero commercial disclosure</div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Content Grid (2 Columns Desktop) ── */}
      <div className="op-layout-grid">
        <div className="op-main-col">
          {/* 1. Download Personal Data Package */}
          <div className="op-card">
            <div className="op-card-hdr">
              <div className="op-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="download" size={15} />
                </FeaturedIcon>
                <div>
                  <h3 className="op-card-title">Download Personal Data Package</h3>
                  <p className="op-card-sub">Export machine-readable records of all data associated with your identity</p>
                </div>
              </div>
              <Badge variant="info">JSON Archive</Badge>
            </div>

            <div className="op-card-body">
              <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55, margin: 0 }}>
                This export compiles your full identity footprint across Hudumika into a standardized JSON file. It includes your profile information, authentication telemetry, active security credentials, recognized devices, and authorized applications.
              </p>

              <div className="op-categories-grid">
                <div className="op-category-item">
                  <div className="op-category-icon">
                    <Icon name="user" size={14} />
                  </div>
                  <div>
                    <div className="op-category-name">Profile & Credentials</div>
                    <div className="op-category-desc">Name, email, phone, role metadata</div>
                  </div>
                </div>

                <div className="op-category-item">
                  <div className="op-category-icon">
                    <Icon name="shield" size={14} />
                  </div>
                  <div>
                    <div className="op-category-name">Security & 2FA State</div>
                    <div className="op-category-desc">TOTP enrollments, passkeys, trust index</div>
                  </div>
                </div>

                <div className="op-category-item">
                  <div className="op-category-icon">
                    <Icon name="smartphone" size={14} />
                  </div>
                  <div>
                    <div className="op-category-name">Device Telemetry</div>
                    <div className="op-category-desc">Recognized hardware, browser sessions</div>
                  </div>
                </div>

                <div className="op-category-item">
                  <div className="op-category-icon">
                    <Icon name="grid" size={14} />
                  </div>
                  <div>
                    <div className="op-category-name">Connected OAuth Apps</div>
                    <div className="op-category-desc">Consents, scopes, and granted access</div>
                  </div>
                </div>
              </div>

              <div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={exportData}
                  disabled={exporting}
                >
                  <Icon name="download" size={14} style={{ marginRight: 6 }} />
                  {exporting ? 'Generating Package…' : 'Export My Data Package'}
                </Button>
              </div>
            </div>
          </div>

          {/* 2. Account Deactivation & Erasure Workflow */}
          <div className="op-card">
            <div className="op-card-hdr">
              <div className="op-card-hdr-left">
                <FeaturedIcon variant="error" size="sm" shape="square">
                  <Icon name="userMinus" size={15} />
                </FeaturedIcon>
                <div>
                  <h3 className="op-card-title">Account Deactivation & Erasure</h3>
                  <p className="op-card-sub">Request revocation of access and scheduling of data retention purge</p>
                </div>
              </div>
              <Badge variant={pending ? 'warning' : 'gray'}>
                {pending ? 'Review in Progress' : 'No Active Request'}
              </Badge>
            </div>

            <div className="op-card-body">
              {requests === null ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading request status…</div>
              ) : pending ? (
                <div className="op-pending-box">
                  <Icon name="clock" size={18} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                      Deactivation Request Awaiting Compliance Approval
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.5 }}>
                      Submitted on <strong>{fmtDate(pending.created_at)}</strong>
                      {pending.reason ? ` with stated reason: "${pending.reason}"` : ''}.
                      A workspace compliance officer will process your request in accordance with statutory retention regulations.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55, margin: 0 }}>
                    Submitting a deactivation request alerts your tenant administrator and compliance team. Once approved, your credentials will be revoked and statutory data retention timelines will initiate.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                      Reason for deactivation (Optional)
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Departing organization, role transfer, or account consolidation…"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm, 8px)',
                        fontFamily: 'var(--font)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        background: 'var(--white)',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={submitDeactivation}
                      disabled={submitting}
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    >
                      <Icon name="trash" size={13} style={{ marginRight: 6 }} />
                      {submitting ? 'Submitting Request…' : 'Request Account Deactivation'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Past Requests History Table */}
              {pastRequests.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Historical Requests Log
                  </div>
                  <table className="op-requests-table">
                    <thead>
                      <tr>
                        <th>Date Submitted</th>
                        <th>Reason Given</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastRequests.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{fmtDate(r.created_at)}</td>
                          <td style={{ color: 'var(--ink2)' }}>{r.reason || 'None provided'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <Badge variant={r.status === 'APPROVED' ? 'error' : 'gray'}>
                              {r.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Privacy Safeguards & Rights ── */}
        <div className="op-side-col">
          <div className="op-card">
            <div className="op-card-hdr">
              <div className="op-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="shield" size={15} />
                </FeaturedIcon>
                <div>
                  <h4 className="op-card-title">Privacy Safeguards</h4>
                  <p className="op-card-sub">Statutory compliance principles</p>
                </div>
              </div>
            </div>

            <div className="op-card-body" style={{ gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Strict Tenant Partitioning</strong>
                  Your personal identity records are strictly isolated and never leaked across organizations.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Zero Commercial Profiling</strong>
                  Hudumika never monetizes, licenses, or sells employee telemetry to third parties.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Immutable Audit Logging</strong>
                  All credential accesses and administrative inspections generate cryptographic audit trails.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OndiPrivacy;
