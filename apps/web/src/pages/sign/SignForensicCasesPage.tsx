// ─── SignForensicCasesPage.tsx — Digital Execution Seal, Phase 3 ────────────
// Admin-only (same DOCUMENT_ADMIN_ROLES gate as All Documents/Matters — see
// sign-forensics.routes.ts). A case is NOT opened for every verification —
// sign_forensic_verify.job.ts only opens one automatically when a
// comparison comes back non-clean (SEAL_INVALID / DOCUMENT_MISMATCH /
// CONTENT_DIFFERENCE / INCONCLUSIVE); this page is where an investigator
// reviews what was found, the evidence it was built from, and the full
// chain of custody, then resolves or dismisses it.
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';
import './SignForensicCasesPage.css';

type CaseStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
type BadgeVariant = 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';

interface CaseSummary {
  id: string;
  envelope_id: string;
  envelope_title: string;
  verification_code: string;
  content_verdict: string | null;
  status: CaseStatus;
  opened_by_name: string | null;
  opened_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

interface Evidence {
  id: string;
  filename: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  source: string;
  created_at: string;
}

interface AuditEntry {
  id: string;
  actor_name: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface StructuralFinding {
  severity: 'info' | 'risk';
  text: string;
}

interface AnalysisRun {
  id: string;
  run_number: number;
  content_verdict: string | null;
  created_at: string;
  triggered_by_name: string | null;
}

interface CaseDetail extends CaseSummary {
  canonical_hash: string | null;
  manifest_hash: string | null;
  evidence: Evidence[];
  audit: AuditEntry[];
  job: {
    id: string;
    result: {
      findings?: Array<{ type: string; text?: string; context?: string }>;
      structural?: { findings?: StructuralFinding[] };
      [key: string]: unknown;
    };
    media_type: string;
    created_at: string;
  } | null;
  analysisRuns: AnalysisRun[];
}

const STATUS_CFG: Record<CaseStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Open', variant: 'warning' },
  reviewing: { label: 'Reviewing', variant: 'info' },
  resolved: { label: 'Resolved', variant: 'success' },
  dismissed: { label: 'Dismissed', variant: 'gray' },
};

interface VerdictConfig {
  label: string;
  variant: BadgeVariant;
  icon: IconName;
  theme: 'danger' | 'warning' | 'success' | 'info';
  desc: string;
}

const VERDICT_DETAILS: Record<string, VerdictConfig> = {
  EXACT_MATCH: {
    label: 'Exact Match',
    variant: 'success',
    icon: 'checkCircle',
    theme: 'success',
    desc: 'The cryptographic digital execution seal and content hashes match the canonical baseline perfectly without any alterations.',
  },
  SEAL_VERIFIED_SCAN_VARIATION_ONLY: {
    label: 'Scan Variation Only',
    variant: 'success',
    icon: 'checkCircle',
    theme: 'success',
    desc: 'Seal is mathematically verified. Minor visual rasterization or scan variations detected, but semantic text and structural nodes remain authentic.',
  },
  SEAL_VERIFIED_CONTENT_DIFFERENCE: {
    label: 'Content Difference Detected',
    variant: 'warning',
    icon: 'alertTriangle',
    theme: 'warning',
    desc: 'The digital seal is valid, but textual or visual alterations were detected against the original canonical agreement baseline.',
  },
  SEAL_INVALID: {
    label: 'Invalid Execution Seal',
    variant: 'error',
    icon: 'xCircle',
    theme: 'danger',
    desc: 'The cryptographic signature or manifest seal failed verification. The document may have been tampered with or corrupted.',
  },
  DOCUMENT_MISMATCH: {
    label: 'Document Mismatch',
    variant: 'error',
    icon: 'xCircle',
    theme: 'danger',
    desc: 'Severe structural or hash discrepancy. The uploaded document does not correlate with the registered envelope manifest baseline.',
  },
  INCONCLUSIVE: {
    label: 'Inconclusive Analysis',
    variant: 'gray',
    icon: 'info',
    theme: 'info',
    desc: 'Forensic engine could not compute a definitive verdict. Additional manual review or higher-resolution scan is recommended.',
  },
};

function getVerdictInfo(verdict: string | null): VerdictConfig {
  if (!verdict) {
    return {
      label: 'Unknown Verdict',
      variant: 'gray',
      icon: 'info',
      theme: 'info',
      desc: 'No forensic analysis verdict has been recorded for this case.',
    };
  }
  return (
    VERDICT_DETAILS[verdict] ?? {
      label: verdict.replace(/_/g, ' '),
      variant: 'gray',
      icon: 'info',
      theme: 'info',
      desc: 'Custom verification verdict evaluated by the forensic analysis pipeline.',
    }
  );
}

function fmtBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTION_LABEL: Record<string, string> = {
  opened: 'Case opened',
  uploaded: 'Evidence uploaded',
  analysis_initiated: 'Analysis started',
  viewed: 'Viewed by investigator',
  exported: 'Evidence exported',
  status_changed: 'Status updated',
  re_analyzed: 'Re-analyzed by engine',
  report_generated: 'Forensic report generated',
};

function getAuditIcon(action: string): IconName {
  switch (action) {
    case 'opened':
      return 'shield';
    case 'uploaded':
      return 'upload';
    case 'analysis_initiated':
    case 're_analyzed':
      return 'refresh';
    case 'report_generated':
    case 'exported':
      return 'fileText';
    case 'status_changed':
      return 'checkCircle';
    default:
      return 'eye';
  }
}

export function SignForensicCasesPage() {
  const { id } = useParams<{ id?: string }>();
  if (id) return <CaseDetailView id={id} />;
  return <CaseListView />;
}

/* ════════════════════════════════════════════════════════════════════════════
   CASE LIST VIEW
   ════════════════════════════════════════════════════════════════════════════ */
function CaseListView() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | CaseStatus>('all');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/sign/forensics/cases${statusFilter === 'all' ? '' : `?status=${statusFilter}`}`)
      .then((res: any) => setCases(Array.isArray(res) ? res : []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const openCount = cases.filter(c => c.status === 'open').length;
  const reviewingCount = cases.filter(c => c.status === 'reviewing').length;
  const resolvedCount = cases.filter(c => c.status === 'resolved').length;

  return (
    <div className="sfc-page-root">
      <PageHeader
        crumbs={['eSign', 'Forensics']}
        titlePlain="Forensic"
        titleEm="Cases"
        subtitle="Verifications that came back non-clean — a seal that didn't validate, or a scanned copy whose content doesn't match the canonical document."
      />

      {/* Top summary stats */}
      <div className="sfc-list-stats">
        <div className="sfc-list-stat-box">
          <span className="sfc-stat-label">Total Cases</span>
          <span className="sfc-stat-val">{cases.length}</span>
        </div>
        <div className="sfc-list-stat-box">
          <span className="sfc-stat-label" style={{ color: 'var(--gold)' }}>Open Action Required</span>
          <span className="sfc-stat-val" style={{ color: 'var(--gold)' }}>{openCount}</span>
        </div>
        <div className="sfc-list-stat-box">
          <span className="sfc-stat-label" style={{ color: 'var(--blue)' }}>Under Review</span>
          <span className="sfc-stat-val" style={{ color: 'var(--blue)' }}>{reviewingCount}</span>
        </div>
        <div className="sfc-list-stat-box">
          <span className="sfc-stat-label" style={{ color: 'var(--green)' }}>Resolved</span>
          <span className="sfc-stat-val" style={{ color: 'var(--green)' }}>{resolvedCount}</span>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 'var(--r)', padding: 3 }}>
          {(['all', 'open', 'reviewing', 'resolved', 'dismissed'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
                textTransform: 'capitalize',
                background: statusFilter === s ? 'var(--white)' : 'transparent',
                color: statusFilter === s ? 'var(--ink)' : 'var(--ink3)',
                boxShadow: statusFilter === s ? 'var(--elev-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {s}{s === 'open' && openCount > 0 ? ` (${openCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 56,
                  borderRadius: 10,
                  background: 'var(--border)',
                  opacity: 0.35,
                  animation: 'pulse 1.4s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 280,
              gap: 12,
              color: 'var(--ink3)',
              textAlign: 'center',
              padding: 32,
              background: 'var(--white)',
              borderRadius: 12,
              border: '1px dashed var(--border)',
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="shield" size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {statusFilter === 'all' ? 'No Forensic Cases' : `No ${statusFilter} cases`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, lineHeight: 1.5 }}>
              A case opens automatically the moment a verification's seal fails to validate or its content doesn't match the canonical document — all documents in this tenant are authentic.
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="sfc-list-table-wrap rtbl-wrap">
              <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                <thead>
                  <tr>
                    <th>Envelope Document</th>
                    <th>Verdict</th>
                    <th>Status</th>
                    <th>Opened By / Date</th>
                    <th style={{ textAlign: 'right' }}>Verification Code</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => {
                    const verdict = getVerdictInfo(c.content_verdict);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/sign/forensics/${c.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && navigate(`/sign/forensics/${c.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="sign-envelope-row-icon">
                              <Icon name="fileText" size={15} style={{ color: 'var(--teal)' }} />
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.envelope_title}</div>
                          </div>
                        </td>
                        <td>
                          <Badge variant={verdict.variant}>{verdict.label}</Badge>
                        </td>
                        <td>
                          <Badge variant={STATUS_CFG[c.status].variant}>{STATUS_CFG[c.status].label}</Badge>
                        </td>
                        <td style={{ color: 'var(--ink3)', fontSize: 12.5 }}>
                          {c.opened_by_name || 'System'} · {new Date(c.opened_at).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                          {c.verification_code}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Grid */}
            <div className="sfc-list-card-grid">
              {cases.map(c => {
                const verdict = getVerdictInfo(c.content_verdict);
                return (
                  <div
                    key={c.id}
                    className="sfc-case-card"
                    onClick={() => navigate(`/sign/forensics/${c.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/sign/forensics/${c.id}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="sign-envelope-row-icon">
                          <Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{c.envelope_title}</span>
                      </div>
                      <Badge variant={STATUS_CFG[c.status].variant}>{STATUS_CFG[c.status].label}</Badge>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <Badge variant={verdict.variant}>{verdict.label}</Badge>
                      <span style={{ fontFamily: 'monospace', fontSize: 11.5, background: 'var(--bg)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        #{c.verification_code}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <span>Opened by {c.opened_by_name || 'System'}</span>
                      <span>{new Date(c.opened_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CASE DETAIL VIEW
   ════════════════════════════════════════════════════════════════════════════ */
function CaseDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [kase, setKase] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<{ src: string; filename: string } | null>(null);

  function load() {
    apiFetch(`/v1/sign/forensics/cases/${id}`)
      .then((data: any) => setKase(data))
      .catch(() => setKase(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function reanalyze() {
    setReanalyzing(true);
    try {
      await apiFetch(`/v1/sign/forensics/cases/${id}/reanalyze`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not re-run analysis on this case.');
    } finally {
      setReanalyzing(false);
    }
  }

  async function generateReport() {
    setGeneratingReport(true);
    try {
      await apiFetch(`/v1/sign/forensics/cases/${id}/report`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not generate a report for this case.');
    } finally {
      setGeneratingReport(false);
    }
  }

  async function changeStatus(status: CaseStatus) {
    let note: string | null = '';
    if (status === 'resolved' || status === 'dismissed') {
      note = await showPrompt('', {
        title: status === 'resolved' ? 'Resolve this Forensic Case' : 'Dismiss this Forensic Case',
        placeholder: 'What did the investigation find? (optional resolution note)',
        confirmLabel: status === 'resolved' ? 'Mark Resolved' : 'Dismiss Case',
      });
      if (note === null) return;
    } else {
      const ok = await showConfirm(`Mark this forensic case as ${status}?`, {
        title: 'Update Case Status',
        variant: 'info',
      });
      if (!ok) return;
    }
    setUpdating(true);
    try {
      await apiFetch(`/v1/sign/forensics/cases/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, note: note || undefined }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this case.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="sfc-page-root" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink3)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="refresh" size={20} />
          </div>
          <span style={{ fontWeight: 600 }}>Loading forensic investigation…</span>
        </div>
      </div>
    );
  }

  if (!kase) {
    return (
      <div className="sfc-page-root" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--red-l)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="xCircle" size={32} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Case Not Found</div>
          <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 360 }}>
            The requested forensic case ID does not exist or may belong to another tenant.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/sign/forensics')}>
            <Icon name="arrowLeft" size={14} /> Back to Forensic Cases
          </Button>
        </div>
      </div>
    );
  }

  const verdict = getVerdictInfo(kase.content_verdict);
  const rawFindings = (kase.job?.result?.findings as Array<{ type: string; text?: string; context?: string }> | undefined) ?? [];
  const structural = kase.job?.result?.structural as { findings?: StructuralFinding[] } | null | undefined;
  const structuralFindings = structural?.findings ?? [];
  const visualDiffs = kase.evidence.filter(e => e.source === 'visual_diff');
  const latestReport = [...kase.evidence].reverse().find(e => e.source === 'report');

  return (
    <div className="sfc-page-root">
      {/* Lightbox Modal */}
      {modalImage && (
        <div className="sfc-modal-overlay" onClick={() => setModalImage(null)}>
          <div className="sfc-modal-content" onClick={e => e.stopPropagation()}>
            <div className="sfc-modal-hdr">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="eye" size={16} style={{ color: 'var(--red)' }} />
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{modalImage.filename}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a href={modalImage.src} target="_blank" rel="noreferrer" download={modalImage.filename}>
                  <Button variant="outline" size="sm">
                    <Icon name="download" size={13} /> Download
                  </Button>
                </a>
                <button
                  type="button"
                  onClick={() => setModalImage(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ink3)',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                  }}
                >
                  <Icon name="x" size={18} />
                </button>
              </div>
            </div>
            <div className="sfc-modal-body">
              <img src={modalImage.src} alt={modalImage.filename} className="sfc-modal-img" />
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        crumbs={['eSign', 'Forensics']}
        title={kase.envelope_title}
        subtitle={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--ink3)', fontSize: 13 }}>Verification Code:</span>
            <div
              className="sfc-code-pill"
              onClick={() => copyToClipboard(kase.verification_code, 'code')}
              title="Click to copy verification code"
            >
              <Icon name="hash" size={12} style={{ color: 'var(--teal)' }} />
              <span>{kase.verification_code}</span>
              <Icon
                name={copiedKey === 'code' ? 'check' : 'copy'}
                size={11}
                style={{ color: copiedKey === 'code' ? 'var(--green)' : 'var(--ink3)' }}
              />
            </div>
          </div>
        }
        actions={
          <div className="sfc-header-actions">
            <Button variant="outline" size="sm" onClick={() => navigate('/sign/forensics')} style={{ fontWeight: 600 }}>
              <Icon name="arrowLeft" size={14} /> Back
            </Button>
            <Badge variant={STATUS_CFG[kase.status].variant} style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700 }}>
              {STATUS_CFG[kase.status].label}
            </Badge>
            <Button variant="outline" size="sm" disabled={reanalyzing} onClick={reanalyze}>
              <Icon name="refresh" size={14} /> {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
            </Button>
            {latestReport ? (
              <a href={`${BASE_URL}/v1/sign/forensics/cases/${kase.id}/evidence/${latestReport.id}/download`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <Icon name="download" size={14} /> Download Report
                </Button>
              </a>
            ) : (
              <Button variant="outline" size="sm" disabled={generatingReport} onClick={generateReport}>
                <Icon name="fileText" size={14} /> {generatingReport ? 'Generating…' : 'Generate Report'}
              </Button>
            )}
            {kase.status !== 'resolved' && kase.status !== 'dismissed' && (
              <>
                {kase.status === 'open' && (
                  <Button variant="outline" size="sm" disabled={updating} onClick={() => changeStatus('reviewing')}>
                    Start Reviewing
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updating}
                  onClick={() => changeStatus('resolved')}
                  style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
                >
                  <Icon name="checkCircle" size={14} /> Mark Resolved
                </Button>
                <Button variant="outline" size="sm" disabled={updating} onClick={() => changeStatus('dismissed')}>
                  Dismiss
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Metrics Overview Bar */}
      <div className="sfc-stats-bar">
        <div className="sfc-stat-card">
          <div className="sfc-stat-icon">
            <Icon name={verdict.icon} size={18} />
          </div>
          <div className="sfc-stat-info">
            <span className="sfc-stat-label">Analysis Verdict</span>
            <span className="sfc-stat-val" style={{ fontSize: 14 }}>{verdict.label}</span>
          </div>
        </div>
        <div className="sfc-stat-card">
          <div className="sfc-stat-icon" style={{ background: rawFindings.length > 0 ? 'var(--red-l)' : 'var(--bg)', color: rawFindings.length > 0 ? 'var(--red)' : 'var(--teal)' }}>
            <Icon name="fileText" size={18} />
          </div>
          <div className="sfc-stat-info">
            <span className="sfc-stat-label">Text Diffs</span>
            <span className="sfc-stat-val">{rawFindings.length}</span>
          </div>
        </div>
        <div className="sfc-stat-card">
          <div className="sfc-stat-icon" style={{ background: visualDiffs.length > 0 ? 'var(--gold-l)' : 'var(--bg)', color: visualDiffs.length > 0 ? 'var(--gold)' : 'var(--teal)' }}>
            <Icon name="eye" size={18} />
          </div>
          <div className="sfc-stat-info">
            <span className="sfc-stat-label">Visual Diffs</span>
            <span className="sfc-stat-val">{visualDiffs.length}</span>
          </div>
        </div>
        <div className="sfc-stat-card">
          <div className="sfc-stat-icon">
            <Icon name="lock" size={18} />
          </div>
          <div className="sfc-stat-info">
            <span className="sfc-stat-label">Evidence Files</span>
            <span className="sfc-stat-val">{kase.evidence.length}</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="sfc-detail-grid">
        {/* Left Column: Forensic Findings, Visual Diffs, Evidence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Verdict Hero Banner */}
          <div className={`sfc-verdict-hero sfc-verdict-hero--${verdict.theme}`}>
            <div className="sfc-verdict-icon-wrap">
              <Icon name={verdict.icon} size={24} />
            </div>
            <div className="sfc-verdict-body">
              <div className="sfc-verdict-title-row">
                <div className="sfc-verdict-title">{verdict.label}</div>
                <Badge variant={verdict.variant}>{verdict.label}</Badge>
              </div>
              <div className="sfc-verdict-desc">{verdict.desc}</div>

              {kase.resolution_note && (
                <div className="sfc-verdict-resolution">
                  <strong>Resolution note:</strong> {kase.resolution_note}
                </div>
              )}

              {(kase.canonical_hash || kase.manifest_hash) && (
                <div className="sfc-hash-grid">
                  {kase.canonical_hash && (
                    <div className="sfc-hash-item">
                      <span style={{ color: 'var(--ink3)' }}>Canonical:</span>
                      <span className="sfc-hash-val" title={kase.canonical_hash}>
                        {kase.canonical_hash.slice(0, 14)}…{kase.canonical_hash.slice(-8)}
                      </span>
                      <button
                        type="button"
                        className="sfc-copy-btn"
                        onClick={() => copyToClipboard(kase.canonical_hash!, 'canonical_hash')}
                        title="Copy Canonical Hash"
                      >
                        <Icon name={copiedKey === 'canonical_hash' ? 'check' : 'copy'} size={12} />
                      </button>
                    </div>
                  )}
                  {kase.manifest_hash && (
                    <div className="sfc-hash-item">
                      <span style={{ color: 'var(--ink3)' }}>Manifest:</span>
                      <span className="sfc-hash-val" title={kase.manifest_hash}>
                        {kase.manifest_hash.slice(0, 14)}…{kase.manifest_hash.slice(-8)}
                      </span>
                      <button
                        type="button"
                        className="sfc-copy-btn"
                        onClick={() => copyToClipboard(kase.manifest_hash!, 'manifest_hash')}
                        title="Copy Manifest Hash"
                      >
                        <Icon name={copiedKey === 'manifest_hash' ? 'check' : 'copy'} size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Document Structural & Integrity Findings */}
          {structuralFindings.length > 0 && (
            <SectionCard title="Document Structure & Integrity Findings" collapsible={false}>
              <div className="sfc-struct-list">
                {structuralFindings.map((f, i) => (
                  <div key={i} className={`sfc-struct-item sfc-struct-item--${f.severity}`}>
                    <Icon name={f.severity === 'risk' ? 'alertTriangle' : 'info'} size={16} className="sfc-struct-icon" />
                    <div style={{ flex: 1 }}>{f.text}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Textual Differences */}
          {rawFindings.length > 0 && (
            <SectionCard title={`${rawFindings.length} Textual Difference${rawFindings.length === 1 ? '' : 's'}`} collapsible={false}>
              <div className="sfc-findings-list">
                {rawFindings.map((f, i) => {
                  const isAdded = f.type === 'added';
                  const findingText = f.context || f.text || '';
                  return (
                    <div key={i} className={`sfc-finding-item ${isAdded ? 'sfc-finding-item--added' : 'sfc-finding-item--deleted'}`}>
                      <div className="sfc-finding-hdr">
                        <span className="sfc-finding-tag">
                          <Icon name={isAdded ? 'plus' : 'minus'} size={12} />
                          {isAdded ? 'Present in uploaded, missing in original' : 'Present in original, missing from uploaded'}
                        </span>
                        {findingText && (
                          <button
                            type="button"
                            className="sfc-copy-btn"
                            onClick={() => copyToClipboard(findingText, `finding_${i}`)}
                            title="Copy snippet"
                          >
                            <Icon name={copiedKey === `finding_${i}` ? 'check' : 'copy'} size={12} />
                          </button>
                        )}
                      </div>
                      <div className="sfc-finding-context">{findingText}</div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Visual Differences */}
          {visualDiffs.length > 0 && (
            <SectionCard title="Visual Differences (Pixel-Level Inspection)" collapsible={false}>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 12, lineHeight: 1.5 }}>
                Rendered page differences highlighted in red — pixel-level analysis executed during comparison against original canonical PDF.
              </div>
              <div className="sfc-visual-grid">
                {visualDiffs.map(e => {
                  const imgUrl = `${BASE_URL}/v1/sign/forensics/cases/${kase.id}/evidence/${e.id}/download`;
                  return (
                    <div key={e.id} className="sfc-visual-card">
                      <div className="sfc-visual-hdr">
                        <span>{e.filename}</span>
                        <Badge variant="error" style={{ fontSize: 10 }}>Diff Layer</Badge>
                      </div>
                      <div
                        className="sfc-visual-img-wrap"
                        onClick={() => setModalImage({ src: imgUrl, filename: e.filename })}
                        title="Click to view fullscreen"
                      >
                        <img src={imgUrl} alt={e.filename} className="sfc-visual-img" />
                      </div>
                      <div className="sfc-visual-ftr">
                        <Button size="sm" variant="ghost" onClick={() => setModalImage({ src: imgUrl, filename: e.filename })}>
                          <Icon name="maximize" size={13} /> Zoom
                        </Button>
                        <a href={imgUrl} target="_blank" rel="noreferrer" download={e.filename}>
                          <Button size="sm" variant="outline">
                            <Icon name="download" size={13} /> Download
                          </Button>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Evidence Vault */}
          <SectionCard title={`Evidence Vault (${kase.evidence.length})`} collapsible={false}>
            <div className="sfc-evidence-list">
              {kase.evidence.map(e => {
                const downloadUrl = `${BASE_URL}/v1/sign/forensics/cases/${kase.id}/evidence/${e.id}/download`;
                const iconName: IconName =
                  e.source === 'manifest'
                    ? 'clipboardList'
                    : e.source === 'canonical'
                    ? 'shield'
                    : e.source === 'visual_diff'
                    ? 'eye'
                    : 'upload';
                return (
                  <div key={e.id} className="sfc-evidence-tile">
                    <div className="sfc-evidence-icon">
                      <Icon name={iconName} size={18} />
                    </div>
                    <div className="sfc-evidence-info">
                      <div className="sfc-evidence-name" title={e.filename}>
                        {e.filename}
                      </div>
                      <div className="sfc-evidence-meta">
                        <span>{fmtBytes(e.size_bytes)}</span>
                        <span>•</span>
                        <span title={e.sha256}>SHA256: {e.sha256.slice(0, 12)}…</span>
                        <button
                          type="button"
                          className="sfc-copy-btn"
                          onClick={() => copyToClipboard(e.sha256, `ev_${e.id}`)}
                          title="Copy Full SHA256 Hash"
                        >
                          <Icon name={copiedKey === `ev_${e.id}` ? 'check' : 'copy'} size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="sfc-evidence-actions">
                      <Badge variant="gray" style={{ textTransform: 'capitalize' }}>
                        {e.source.replace(/_/g, ' ')}
                      </Badge>
                      <a href={downloadUrl} target="_blank" rel="noreferrer" download={e.filename}>
                        <Button variant="outline" size="sm" style={{ padding: '5px 9px' }}>
                          <Icon name="download" size={13} />
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Analysis History & Chain of Custody */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Analysis History */}
          <SectionCard title={`Analysis Runs (${kase.analysisRuns?.length || 0})`} collapsible={false}>
            <div className="sfc-run-list">
              {kase.analysisRuns?.map(run => {
                const v = getVerdictInfo(run.content_verdict);
                return (
                  <div key={run.id} className="sfc-run-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sfc-run-num">#{run.run_number}</span>
                      <Badge variant={v.variant}>{v.label}</Badge>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--ink3)' }}>
                      <div>{run.triggered_by_name ?? 'System Automated'}</div>
                      <div>{new Date(run.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Chain of Custody Timeline */}
          <SectionCard title="Chain of Custody & Audit Timeline" collapsible={false}>
            <div className="sfc-timeline">
              {kase.audit.map((ev, i) => {
                const isLast = i === kase.audit.length - 1;
                const icon = getAuditIcon(ev.action);
                return (
                  <div key={ev.id} className="sfc-timeline-row">
                    {!isLast && <div className="sfc-timeline-line" />}
                    <div className="sfc-timeline-dot">
                      <Icon name={icon} size={13} />
                    </div>
                    <div className="sfc-timeline-content">
                      <div className="sfc-timeline-title">
                        {ACTION_LABEL[ev.action] ?? ev.action.replace(/_/g, ' ')}
                        {ev.actor_name && (
                          <span className="sfc-timeline-actor"> — {ev.actor_name}</span>
                        )}
                      </div>
                      <div className="sfc-timeline-time">
                        <Icon name="clock" size={11} />
                        <span>{new Date(ev.created_at).toLocaleString()}</span>
                        {ev.ip_address && <span>• IP {ev.ip_address}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
