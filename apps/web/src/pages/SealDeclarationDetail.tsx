import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SealDocumentPanel } from '../components/SealDocumentPanel.js';
import { SEAL_DECLARATION_STATUS_VARIANT } from '../lib/sealStatus.js';
import { SEAL_DECLARATION_STATUS_LABELS, SEAL_DECLARATION_PROCEDURE_LABELS, type SealDeclarationStatus } from '@hudumika/types';
import './Seal.css';

interface Examination {
  id: string; selectivityChannel: string; examinationType: string; status: string;
  officerName: string | null; officerReference: string | null; outcome: string | null; findings: string | null;
}

interface DutyLineItem { code: string; label: string; base: number; ratePct: number; amount: number; }
interface Computation {
  hsCodeDescription: string; cifValueLocal: number; lineItems: DutyLineItem[];
  totalDuty: number; totalTax: number; totalPayableLocal: number; computedAt: string;
}
interface Declaration {
  id: string; lotId: string; lotDescription?: string; procedureCode: string; jurisdiction: string;
  declarationDate: string; hsCode: string; countryOfOrigin: string | null;
  invoiceValue: number; freight: number; insurance: number; currency: string; fxRate: number;
  computation: Computation | null; status: SealDeclarationStatus;
  submissionReference: string | null; paymentReference: string | null; createdAt: string;
  legalNextStatuses: SealDeclarationStatus[];
}

export function SealDeclarationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [submissionReference, setSubmissionReference] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<{ matches: boolean } | null>(null);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [examOutcome, setExamOutcome] = useState('CLEARED');
  const [examFindings, setExamFindings] = useState('');
  const [completingExamId, setCompletingExamId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/customs-entries/${id}`).then(setEntry).finally(() => setLoading(false));
    apiFetch(`/v1/seal/examinations?customs_entry_id=${id}`).then(setExaminations);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function handleCompleteExamination(examId: string) {
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/examinations/${examId}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', outcome: examOutcome, findings: examFindings.trim() || null }),
      });
      setCompletingExamId(null); setExamFindings('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to complete examination.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitDeclaration() {
    if (!id || !submissionReference.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/customs-entries/${id}/submit`, {
        method: 'POST', body: JSON.stringify({ submissionReference: submissionReference.trim() }),
      });
      setShowSubmit(false); setSubmissionReference('');
      load();
    } catch (err: any) {
      showAlert(err.message || err.detail || 'Failed to submit declaration.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance(to: SealDeclarationStatus, reference?: string) {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/customs-entries/${id}/advance`, {
        method: 'POST', body: JSON.stringify({ to, reference: reference ?? null }),
      });
      setShowPay(false); setPaymentReference('');
      load();
    } catch (err: any) {
      showAlert(err.message || err.detail || `Failed to move this declaration to ${to}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease() {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/customs-entries/${id}/release`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || err.detail || 'Failed to release this declaration — the lot may not be in a state that permits this transition.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecompute() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/v1/seal/customs-entries/${id}/recompute`);
      setRecomputeResult({ matches: res.matches });
    } catch (err: any) {
      showAlert(err.message || 'Recompute failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !entry) return <div className="seal-page"><div className="seal-empty">Loading…</div></div>;

  const c = entry.computation;

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/declarations')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} /><span>Back to Declarations</span>
          </button>
          <h1 className="seal-page-title">{entry.lotDescription ?? 'Declaration'}</h1>
          <p className="seal-page-sub">
            {SEAL_DECLARATION_PROCEDURE_LABELS[entry.procedureCode] ?? entry.procedureCode} · HS {entry.hsCode} ·{' '}
            <Link to={`/seal/lots/${entry.lotId}`} style={{ color: 'var(--seal)', fontWeight: 600 }}>View Lot</Link>
          </p>
        </div>
        <Badge variant={SEAL_DECLARATION_STATUS_VARIANT[entry.status]}>{SEAL_DECLARATION_STATUS_LABELS[entry.status]}</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'flex-start' }}>
        <div className="seal-card">
          <div className="seal-card-hdr"><h2 className="seal-card-title">Declaration Details</h2></div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
            <Row label="Declaration Date" value={new Date(entry.declarationDate).toLocaleDateString()} />
            <Row label="Country of Origin" value={entry.countryOfOrigin ?? '—'} />
            <Row label="Invoice Value" value={`${entry.invoiceValue.toLocaleString()} ${entry.currency}`} />
            <Row label="Freight / Insurance" value={`${entry.freight.toLocaleString()} / ${entry.insurance.toLocaleString()} ${entry.currency}`} />
            <Row label="FX Rate" value={String(entry.fxRate)} />
            <Row label="Submission Reference" value={entry.submissionReference ?? '—'} mono />
            <Row label="Payment Reference" value={entry.paymentReference ?? '—'} mono />
            <Row label="Created" value={new Date(entry.createdAt).toLocaleString()} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              {entry.status === 'DRAFT' && (
                <>
                  <button type="button" className="seal-btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={handleRecompute}>
                    <Icon name="calculator" size={13} /><span>Verify Reproducibility</span>
                  </button>
                  {recomputeResult && (
                    <div style={{ fontSize: 12.5, color: recomputeResult.matches ? 'var(--green)' : 'var(--red)' }}>
                      {recomputeResult.matches ? '✓ Recomputing from stored inputs gives the identical result.' : '✗ Recomputed result differs from stored computation — tariff rates may have changed since this draft was created.'}
                    </div>
                  )}
                  {showSubmit ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="seal-field-row" style={{ width: 220 }}>
                        <label className="seal-field-label" title="Reference from the real TANCIS/TANESW portal — no live integration exists">Submission Reference (from TANCIS)</label>
                        <input type="text" className="input-field" value={submissionReference} onChange={e => setSubmissionReference(e.target.value)} placeholder="e.g. TZTANESW20260001234" />
                      </div>
                      <button type="button" className="seal-btn-primary" disabled={busy || !submissionReference.trim()} onClick={handleSubmitDeclaration}>
                        {busy ? 'Submitting…' : 'Confirm Submission'}
                      </button>
                      <button type="button" className="seal-btn-secondary" onClick={() => setShowSubmit(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="seal-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSubmit(true)}>
                      <Icon name="send" size={13} /><span>Submit Declaration</span>
                    </button>
                  )}
                </>
              )}

              {(entry.status === 'SUBMITTED' || entry.status === 'QUERIED') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {entry.legalNextStatuses.includes('ASSESSED') && (
                    <button type="button" className="seal-btn-primary" disabled={busy} onClick={() => handleAdvance('ASSESSED')}>
                      <Icon name="checkCircle" size={13} /><span>Mark Assessed</span>
                    </button>
                  )}
                  {entry.legalNextStatuses.includes('QUERIED') && (
                    <button type="button" className="seal-btn-secondary" disabled={busy} onClick={() => handleAdvance('QUERIED')}>Query</button>
                  )}
                </div>
              )}

              {entry.status === 'ASSESSED' && (
                showPay ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="seal-field-row" style={{ width: 220 }}>
                      <label className="seal-field-label">Payment Reference</label>
                      <input type="text" className="input-field" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="e.g. GEPG-CTRL-0099123" />
                    </div>
                    <button type="button" className="seal-btn-primary" disabled={busy || !paymentReference.trim()} onClick={() => handleAdvance('PAID', paymentReference.trim())}>
                      {busy ? 'Recording…' : 'Confirm Payment'}
                    </button>
                    <button type="button" className="seal-btn-secondary" onClick={() => setShowPay(false)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className="seal-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowPay(true)}>
                    <Icon name="creditCard" size={13} /><span>Record Payment</span>
                  </button>
                )
              )}

              {entry.status === 'PAID' && (
                <button type="button" className="seal-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={handleRelease}>
                  <Icon name="unlock" size={13} /><span>{busy ? 'Releasing…' : 'Release Lot'}</span>
                </button>
              )}

              {['DRAFT', 'SUBMITTED', 'QUERIED', 'ASSESSED'].includes(entry.status) && entry.legalNextStatuses.includes('CANCELLED') && (
                <button type="button" className="seal-btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => handleAdvance('CANCELLED')}>
                  Cancel Declaration
                </button>
              )}

              {entry.status === 'RELEASED' && (
                <div style={{ fontSize: 12.5, color: 'var(--green)' }}>
                  <Icon name="checkCircle" size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Duty settled and the lot's customs status has been advanced through the ledger.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="seal-card">
          <div className="seal-card-hdr"><h2 className="seal-card-title">Duty Computation</h2></div>
          <div style={{ padding: 20 }}>
            {!c ? (
              <div className="seal-empty">No computation stored.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{c.hsCodeDescription}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CIF Value (local)</span><span className="seal-mono">{c.cifValueLocal.toLocaleString()}</span>
                </div>
                <table className="seal-table" style={{ marginTop: 4 }}>
                  <thead><tr><th>Line</th><th>Base</th><th>Rate</th><th>Amount</th></tr></thead>
                  <tbody>
                    {c.lineItems.map(li => (
                      <tr key={li.code}>
                        <td>{li.label}</td>
                        <td className="seal-mono">{li.base.toLocaleString()}</td>
                        <td className="seal-mono">{li.ratePct}%</td>
                        <td className="seal-mono">{li.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <span>Total Payable</span><span className="seal-mono">{c.totalPayableLocal.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Computed {new Date(c.computedAt).toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {examinations.length > 0 && (
        <div className="seal-card" style={{ marginTop: 20 }}>
          <div className="seal-card-hdr"><h2 className="seal-card-title">Customs Examination</h2></div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {examinations.map(ex => (
              <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge variant={ex.selectivityChannel === 'GREEN' ? 'success' : ex.selectivityChannel === 'YELLOW' ? 'warning' : 'error'}>
                    {ex.selectivityChannel} channel
                  </Badge>
                  <Badge variant={ex.status === 'COMPLETED' || ex.status === 'WAIVED' ? 'gray' : 'brand'}>{ex.status}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{ex.examinationType.toLowerCase()} examination</span>
                </div>
                {ex.outcome && <div style={{ fontSize: 13 }}>Outcome: <strong>{ex.outcome.replace(/_/g, ' ')}</strong></div>}
                {ex.findings && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{ex.findings}</div>}
                {['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'].includes(ex.status) && (
                  completingExamId === ex.id ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="seal-field-row" style={{ width: 180 }}>
                        <label className="seal-field-label">Outcome</label>
                        <Select value={examOutcome} onValueChange={setExamOutcome}>
                          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CLEARED">Cleared</SelectItem>
                            <SelectItem value="DISCREPANCY_FOUND">Discrepancy Found</SelectItem>
                            <SelectItem value="SEIZURE_RECOMMENDED">Seizure Recommended</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="seal-field-row" style={{ width: 240 }}>
                        <label className="seal-field-label">Findings</label>
                        <input type="text" className="input-field" value={examFindings} onChange={e => setExamFindings(e.target.value)} placeholder="Officer's notes" />
                      </div>
                      <button type="button" className="seal-btn-primary" disabled={busy} onClick={() => handleCompleteExamination(ex.id)}>
                        {busy ? 'Recording…' : 'Complete Examination'}
                      </button>
                      <button type="button" className="seal-btn-secondary" onClick={() => setCompletingExamId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="seal-btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setCompletingExamId(ex.id)}>
                      Complete Examination
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <SealDocumentPanel entityType="customs_entry" entityId={entry.id} />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--ink3)' }}>{label}</span>
      <span className={mono ? 'seal-mono' : undefined} style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
