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
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';

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
  id: string; filename: string; media_type: string; size_bytes: number; sha256: string; source: string; created_at: string;
}
interface AuditEntry {
  id: string; actor_name: string | null; action: string; detail: Record<string, unknown> | null; ip_address: string | null; created_at: string;
}
interface StructuralFinding { severity: 'info' | 'risk'; text: string; }
interface AnalysisRun {
  id: string; run_number: number; content_verdict: string | null; created_at: string; triggered_by_name: string | null;
}
interface CaseDetail extends CaseSummary {
  canonical_hash: string | null;
  manifest_hash: string | null;
  evidence: Evidence[];
  audit: AuditEntry[];
  job: { id: string; result: Record<string, unknown>; media_type: string; created_at: string } | null;
  analysisRuns: AnalysisRun[];
}

const STATUS_CFG: Record<CaseStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Open', variant: 'warning' },
  reviewing: { label: 'Reviewing', variant: 'info' },
  resolved: { label: 'Resolved', variant: 'success' },
  dismissed: { label: 'Dismissed', variant: 'gray' },
};

const VERDICT_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
  EXACT_MATCH: { label: 'Exact match', variant: 'success' },
  SEAL_VERIFIED_SCAN_VARIATION_ONLY: { label: 'Scan variation only', variant: 'success' },
  SEAL_VERIFIED_CONTENT_DIFFERENCE: { label: 'Content difference', variant: 'warning' },
  SEAL_INVALID: { label: 'Seal invalid', variant: 'error' },
  DOCUMENT_MISMATCH: { label: 'Document mismatch', variant: 'error' },
  INCONCLUSIVE: { label: 'Inconclusive', variant: 'gray' },
};

function verdictBadge(verdict: string | null) {
  if (!verdict) return { label: 'Unknown', variant: 'gray' as BadgeVariant };
  return VERDICT_CFG[verdict] ?? { label: verdict, variant: 'gray' as BadgeVariant };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTION_LABEL: Record<string, string> = {
  opened: 'Case opened', uploaded: 'Evidence uploaded', analysis_initiated: 'Analysis started',
  viewed: 'Viewed', exported: 'Evidence exported', status_changed: 'Status changed',
  re_analyzed: 'Re-analyzed', report_generated: 'Report generated',
};

export function SignForensicCasesPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  if (id) return <CaseDetailView id={id} />;
  return <CaseListView />;
}

function CaseListView() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | CaseStatus>('all');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/sign/forensics/cases${statusFilter === 'all' ? '' : `?status=${statusFilter}`}`)
      .then(setCases).catch(() => setCases([])).finally(() => setLoading(false));
  }, [statusFilter]);

  const openCount = cases.filter(c => c.status === 'open').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign', 'Forensics']}
        titlePlain="Forensic"
        titleEm="cases"
        subtitle="Verifications that came back non-clean — a seal that didn't validate, or a scanned copy whose content doesn't match the canonical document."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 'var(--r)', padding: 3 }}>
          {(['all', 'open', 'reviewing', 'resolved', 'dismissed'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600, fontSize: 12, textTransform: 'capitalize', background: statusFilter === s ? 'var(--white)' : 'transparent', color: statusFilter === s ? 'var(--ink)' : 'var(--ink3)', boxShadow: statusFilter === s ? 'var(--elev-sm)' : 'none' }}>
              {s}{s === 'open' && openCount > 0 ? ` (${openCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 46, borderRadius: 8, background: 'var(--border)', opacity: 0.4, animation: 'pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 280, gap: 12, color: 'var(--ink3)', textAlign: 'center', padding: 32 }}>
            <Icon name="shield" size={28} style={{ opacity: 0.4 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {statusFilter === 'all' ? 'No forensic cases' : `No ${statusFilter} cases`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 360, lineHeight: 1.5 }}>
              A case opens automatically the moment a verification's seal fails to validate or its content doesn't match the canonical document — nothing here means every check so far has come back clean.
            </div>
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <thead>
                <tr>
                  <th>Envelope</th>
                  <th>Verdict</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th style={{ textAlign: 'right' }}>Code</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => {
                  const verdict = verdictBadge(c.content_verdict);
                  return (
                    <tr key={c.id} onClick={() => navigate(`/sign/forensics/${c.id}`)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/sign/forensics/${c.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
                          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.envelope_title}</div>
                        </div>
                      </td>
                      <td><Badge variant={verdict.variant}>{verdict.label}</Badge></td>
                      <td><Badge variant={STATUS_CFG[c.status].variant}>{STATUS_CFG[c.status].label}</Badge></td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12.5 }}>
                        {c.opened_by_name || 'System'} · {new Date(c.opened_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--ink3)' }}>{c.verification_code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CaseDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [kase, setKase] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  function load() {
    apiFetch(`/v1/sign/forensics/cases/${id}`).then(setKase).catch(() => setKase(null)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

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
      note = await showPrompt('', { title: status === 'resolved' ? 'Resolve this case' : 'Dismiss this case', placeholder: 'What did the investigation find? (optional)', confirmLabel: status === 'resolved' ? 'Mark Resolved' : 'Dismiss' });
      if (note === null) return;
    } else {
      const ok = await showConfirm(`Mark this case as ${status}?`, { title: 'Update case status', variant: 'info' });
      if (!ok) return;
    }
    setUpdating(true);
    try {
      await apiFetch(`/v1/sign/forensics/cases/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note: note || undefined }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this case.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading case…</div>;
  if (!kase) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, gap: 12, color: 'var(--ink3)' }}>
      <Icon name="xCircle" size={36} style={{ color: 'var(--red)', opacity: 0.8 }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Case Not Found</div>
      <Button variant="outline" size="sm" onClick={() => navigate('/sign/forensics')}>Back to Forensic Cases</Button>
    </div>
  );

  const verdict = verdictBadge(kase.content_verdict);
  const findings = (kase.job?.result?.findings as Array<{ type: string; text: string; context: string }> | undefined) ?? [];
  const structural = kase.job?.result?.structural as { findings?: StructuralFinding[] } | null | undefined;
  const structuralFindings = structural?.findings ?? [];
  const latestReport = [...kase.evidence].reverse().find(e => e.source === 'report');

  return (
    <div style={{ fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['eSign', 'Forensics']}
        title={kase.envelope_title}
        subtitle={`Verification code ${kase.verification_code}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/sign/forensics')} style={{ fontWeight: 600 }}>
              <Icon name="arrowLeft" size={14} /> Back to Cases
            </Button>
            <Badge variant={STATUS_CFG[kase.status].variant} style={{ padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}>{STATUS_CFG[kase.status].label}</Badge>
            <Button variant="outline" size="sm" disabled={reanalyzing} onClick={reanalyze}>
              <Icon name="refresh" size={14} /> {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
            </Button>
            {latestReport ? (
              <a href={`${BASE_URL}/v1/sign/forensics/cases/${kase.id}/evidence/${latestReport.id}/download`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><Icon name="download" size={14} /> Download Report</Button>
              </a>
            ) : (
              <Button variant="outline" size="sm" disabled={generatingReport} onClick={generateReport}>
                <Icon name="fileText" size={14} /> {generatingReport ? 'Generating…' : 'Generate Report'}
              </Button>
            )}
            {kase.status !== 'resolved' && kase.status !== 'dismissed' && (
              <>
                {kase.status === 'open' && (
                  <Button variant="outline" size="sm" disabled={updating} onClick={() => changeStatus('reviewing')}>Start Reviewing</Button>
                )}
                <Button variant="outline" size="sm" disabled={updating} onClick={() => changeStatus('resolved')} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
                  <Icon name="checkCircle" size={14} /> Mark Resolved
                </Button>
                <Button variant="outline" size="sm" disabled={updating} onClick={() => changeStatus('dismissed')}>Dismiss</Button>
              </>
            )}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <SectionCard title="Verdict" collapsible={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Badge variant={verdict.variant} style={{ fontSize: 13, padding: '5px 12px' }}>{verdict.label}</Badge>
              {kase.resolution_note && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>— {kase.resolution_note}</span>}
            </div>
            {kase.canonical_hash && (
              <div style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--ink3)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                Canonical hash: {kase.canonical_hash}
              </div>
            )}
            {kase.manifest_hash && (
              <div style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--ink3)', wordBreak: 'break-all' }}>
                Manifest hash: {kase.manifest_hash}
              </div>
            )}
          </SectionCard>

          {structuralFindings.length > 0 && (
            <SectionCard title="Document structure & metadata" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {structuralFindings.map((f, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: f.severity === 'risk' ? 'var(--red-l)' : 'var(--bg)', border: `1px solid ${f.severity === 'risk' ? 'var(--red)' : 'var(--border)'}`, fontSize: 12, color: f.severity === 'risk' ? 'var(--red)' : 'var(--ink2)' }}>
                    {f.text}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {findings.length > 0 && (
            <SectionCard title={`${findings.length} textual difference${findings.length === 1 ? '' : 's'}`} collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {findings.map((f, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: f.type === 'added' ? 'var(--green-l)' : 'var(--red-l)', border: `1px solid ${f.type === 'added' ? 'var(--green)' : 'var(--red)'}`, fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: f.type === 'added' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', fontSize: 10 }}>
                      {f.type === 'added' ? 'Present in uploaded, not original' : 'Present in original, missing from uploaded'}
                    </span>
                    <div style={{ marginTop: 4, fontFamily: 'monospace', color: 'var(--ink)', wordBreak: 'break-word' }}>{f.context}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {kase.evidence.some(e => e.source === 'visual_diff') && (
            <SectionCard title="Visual differences" collapsible={false}>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10 }}>
                Rendered page differences highlighted in red — pixel-level, only run for a PDF-to-PDF comparison.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {kase.evidence.filter(e => e.source === 'visual_diff').map(e => (
                  <div key={e.id}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>{e.filename}</div>
                    <img src={`${BASE_URL}/v1/sign/forensics/cases/${kase.id}/evidence/${e.id}/download`} alt={e.filename} style={{ width: '100%', border: '1px solid var(--red)', borderRadius: 6 }} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Evidence" collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {kase.evidence.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <Icon name={e.source === 'manifest' ? 'clipboardList' : e.source === 'canonical' ? 'shield' : e.source === 'visual_diff' ? 'eye' : 'upload'} size={15} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'monospace' }}>{fmtBytes(e.size_bytes)} · {e.sha256.slice(0, 16)}…</div>
                  </div>
                  <Badge variant="gray" style={{ textTransform: 'capitalize', flexShrink: 0 }}>{e.source}</Badge>
                  <a href={`${BASE_URL}/v1/sign/forensics/cases/${kase.id}/evidence/${e.id}/download`} target="_blank" rel="noreferrer"
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', color: 'var(--ink2)' }}>
                    <Icon name="download" size={13} />
                  </a>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <SectionCard title={`Analysis History (${kase.analysisRuns.length})`} collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {kase.analysisRuns.map(run => {
                const v = verdictBadge(run.content_verdict);
                return (
                  <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', width: 22, flexShrink: 0 }}>#{run.run_number}</span>
                    <Badge variant={v.variant} style={{ flexShrink: 0 }}>{v.label}</Badge>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: 'var(--ink3)' }}>
                      {run.triggered_by_name ?? 'System'} · {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Chain of Custody" collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 4 }}>
              {kase.audit.map((ev, i) => (
                <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: i === kase.audit.length - 1 ? 0 : 16, position: 'relative' }}>
                  {i !== kase.audit.length - 1 && (
                    <div style={{ position: 'absolute', left: 11, top: 22, bottom: 0, width: 2, background: 'var(--border)' }} />
                  )}
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, border: '2px solid var(--card-bg)' }}>
                    <Icon name="eye" size={11} />
                  </div>
                  <div style={{ flex: 1, paddingTop: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {ACTION_LABEL[ev.action] ?? ev.action}{ev.actor_name ? ` — ${ev.actor_name}` : ''}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {new Date(ev.created_at).toLocaleString()}{ev.ip_address ? ` · ${ev.ip_address}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
