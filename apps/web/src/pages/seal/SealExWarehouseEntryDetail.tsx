import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SealDocumentPanel } from '../../components/SealDocumentPanel.js';
import { RaiseSealTicketButton } from '../../components/RaiseSealTicketButton.js';
import { SEAL_DECLARATION_STATUS_LABELS, SEAL_DECLARATION_PROCEDURE_LABELS, type SealDeclarationStatus } from '@hudumika/types';
import '../Seal.css';

const STATUS_VARIANT: Record<SealDeclarationStatus, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  DRAFT: 'gray', SUBMITTED: 'info', QUERIED: 'warning', ASSESSED: 'brand', PAID: 'success', RELEASED: 'success', CANCELLED: 'error',
};

interface DutyLineItem { code: string; label: string; base: number; ratePct: number; amount: number; }
interface Computation {
  hsCodeDescription: string; cifValueLocal: number; lineItems: DutyLineItem[];
  totalDuty: number; totalTax: number; totalPayableLocal: number; computedAt: string;
}
interface Declaration {
  id: string; lotId: string; lotDescription?: string; lotOwnerId?: string; lotOwnerName?: string; procedureCode: string;
  declarationDate: string; hsCode: string; countryOfOrigin: string | null;
  invoiceValue: number; freight: number; insurance: number; currency: string; fxRate: number;
  computation: Computation | null; status: SealDeclarationStatus;
  submissionReference: string | null; paymentReference: string | null; createdAt: string;
  legalNextStatuses: SealDeclarationStatus[];
}
interface Examination {
  id: string; selectivityChannel: string; examinationType: string; status: string;
  outcome: string | null; findings: string | null;
}

export function SealExWarehouseEntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [examinations, setExaminations] = useState<Examination[]>([]);

  const [submissionReference, setSubmissionReference] = useState('');
  const [selectivityChannel, setSelectivityChannel] = useState<'GREEN' | 'YELLOW' | 'RED' | ''>('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<{ matches: boolean } | null>(null);
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

  async function handleSubmitDeclaration() {
    if (!id || !submissionReference.trim() || !selectivityChannel) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/customs-entries/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ submissionReference: submissionReference.trim(), selectivityChannel }),
      });
      setShowSubmit(false); setSubmissionReference(''); setSelectivityChannel(''); load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to submit declaration.');
    } finally { setBusy(false); }
  }

  async function handleAdvance(to: SealDeclarationStatus, reference?: string) {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/customs-entries/${id}/advance`, { method: 'POST', body: JSON.stringify({ to, reference: reference ?? null }) });
      setShowPay(false); setPaymentReference(''); load();
    } catch (err: any) {
      showAlert(err.message || `Failed to move this declaration to ${to}.`);
    } finally { setBusy(false); }
  }

  async function handleRelease() {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/customs-entries/${id}/release`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to release this declaration — the lot may not be in a state that permits this transition.');
    } finally { setBusy(false); }
  }

  async function handleRecompute() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/v1/seal/customs-entries/${id}/recompute`);
      setRecomputeResult({ matches: res.matches });
    } catch (err: any) {
      showAlert(err.message || 'Recompute failed.');
    } finally { setBusy(false); }
  }

  async function handleCompleteExamination(examId: string) {
    setBusy(true);
    try {
      await apiFetch(`/v1/seal/examinations/${examId}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', outcome: examOutcome, findings: examFindings.trim() || null }) });
      setCompletingExamId(null); setExamFindings(''); load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to complete examination.');
    } finally { setBusy(false); }
  }

  if (loading || !entry) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>;
  const c = entry.computation;

  return (
    <div style={{ padding: '0 0 24px'}}>
      <PageHeader
        crumbs={['ClearOS', 'Ops Command', 'Declarations']}
        titlePlain={entry.lotDescription ?? 'Declaration'}
        titleEm=""
        subtitle={`${SEAL_DECLARATION_PROCEDURE_LABELS[entry.procedureCode] ?? entry.procedureCode} · HS ${entry.hsCode}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/seal/ex-warehouse')}>
              <Icon name="arrowLeft" size={13} /> Back
            </button>
            <Badge variant={STATUS_VARIANT[entry.status]}>{SEAL_DECLARATION_STATUS_LABELS[entry.status]}</Badge>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'flex-start', marginTop: 16 }}>
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
          <Row label="Declaration Date" value={new Date(entry.declarationDate).toLocaleDateString()} />
          <Row label="Country of Origin" value={entry.countryOfOrigin ?? '—'} />
          <Row label="Invoice Value" value={`${entry.invoiceValue.toLocaleString()} ${entry.currency}`} />
          <Row label="Freight / Insurance" value={`${entry.freight.toLocaleString()} / ${entry.insurance.toLocaleString()} ${entry.currency}`} />
          <Row label="FX Rate" value={String(entry.fxRate)} />
          <Row label="Submission Reference" value={entry.submissionReference ?? '—'} mono />
          <Row label="Payment Reference" value={entry.paymentReference ?? '—'} mono />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            {entry.status === 'DRAFT' && (
              <>
                <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={handleRecompute}>
                  <Icon name="calculator" size={13} /> Verify Reproducibility
                </button>
                {recomputeResult && (
                  <div style={{ fontSize: 12.5, color: recomputeResult.matches ? 'var(--green)' : 'var(--red)' }}>
                    {recomputeResult.matches ? '✓ Recomputing from stored inputs gives the identical result.' : '✗ Recomputed result differs from stored computation.'}
                  </div>
                )}
                {showSubmit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      Both fields come from the same real TANESW/TANCIS submission — this records what the portal returned, it does not assign either one.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <input type="text" className="input-field" style={{ width: 220 }} value={submissionReference} onChange={e => setSubmissionReference(e.target.value)} placeholder="Submission reference (from TANESW)" />
                      <Select value={selectivityChannel || '__none__'} onValueChange={v => setSelectivityChannel((v === '__none__' ? '' : v) as any)}>
                        <SelectTrigger style={{ width: 200 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Selectivity channel…</SelectItem>
                          <SelectItem value="GREEN">GREEN — no examination</SelectItem>
                          <SelectItem value="YELLOW">YELLOW — document check</SelectItem>
                          <SelectItem value="RED">RED — physical exam</SelectItem>
                        </SelectContent>
                      </Select>
                      <button type="button" className="btn btn-primary" disabled={busy || !submissionReference.trim() || !selectivityChannel} onClick={handleSubmitDeclaration}>{busy ? 'Submitting…' : 'Confirm Submission'}</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowSubmit(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSubmit(true)}>
                    <Icon name="send" size={13} /> Submit Declaration
                  </button>
                )}
              </>
            )}

            {(entry.status === 'SUBMITTED' || entry.status === 'QUERIED') && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {entry.legalNextStatuses.includes('ASSESSED') && (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleAdvance('ASSESSED')}>
                    <Icon name="checkCircle" size={13} /> Mark Assessed
                  </button>
                )}
                {entry.legalNextStatuses.includes('QUERIED') && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => handleAdvance('QUERIED')}>Query</button>
                )}
              </div>
            )}

            {entry.status === 'ASSESSED' && (
              showPay ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input type="text" className="input-field" style={{ width: 220 }} value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Payment reference" />
                  <button type="button" className="btn btn-primary" disabled={busy || !paymentReference.trim()} onClick={() => handleAdvance('PAID', paymentReference.trim())}>{busy ? 'Recording…' : 'Confirm Payment'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPay(false)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowPay(true)}>
                  <Icon name="creditCard" size={13} /> Record Payment
                </button>
              )
            )}

            {entry.status === 'PAID' && (
              <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={handleRelease}>
                <Icon name="unlock" size={13} /> {busy ? 'Releasing…' : 'Release Lot'}
              </button>
            )}

            {['DRAFT', 'SUBMITTED', 'QUERIED', 'ASSESSED'].includes(entry.status) && entry.legalNextStatuses.includes('CANCELLED') && (
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => handleAdvance('CANCELLED')}>Cancel Declaration</button>
            )}

            {entry.status === 'RELEASED' && (
              <div style={{ fontSize: 12.5, color: 'var(--green)' }}>
                <Icon name="checkCircle" size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Duty settled and the SEAL lot's customs status has been advanced through the ledger.
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px' }}>Duty Computation</h2>
          {!c ? (
            <div style={{ color: 'var(--ink3)' }}>No computation stored.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{c.hsCodeDescription}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>CIF Value (local)</span><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{c.cifValueLocal.toLocaleString()}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 4 }}>
                <thead><tr><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Line</th><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Base</th><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Rate</th><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Amount</th></tr></thead>
                <tbody>
                  {c.lineItems.map(li => (
                    <tr key={li.code} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 0' }}>{li.label}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{li.base.toLocaleString()}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{li.ratePct}%</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{li.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span>Total Payable</span><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{c.totalPayableLocal.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {examinations.length > 0 && (
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginTop: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px' }}>Customs Examination</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {examinations.map(ex => (
              <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge variant={ex.selectivityChannel === 'GREEN' ? 'success' : ex.selectivityChannel === 'YELLOW' ? 'warning' : 'error'}>{ex.selectivityChannel} channel</Badge>
                  <Badge variant={ex.status === 'COMPLETED' || ex.status === 'WAIVED' ? 'gray' : 'brand'}>{ex.status}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{ex.examinationType.toLowerCase()} examination</span>
                </div>
                {ex.outcome && <div style={{ fontSize: 13 }}>Outcome: <strong>{ex.outcome.replace(/_/g, ' ')}</strong></div>}
                {ex.findings && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{ex.findings}</div>}
                {(ex.outcome === 'DISCREPANCY_FOUND' || ex.outcome === 'SEIZURE_RECOMMENDED') && entry.lotOwnerId && (
                  <RaiseSealTicketButton
                    customerId={entry.lotOwnerId}
                    defaultSubject={`Customs examination — ${ex.outcome.replace(/_/g, ' ').toLowerCase()} on ${entry.lotDescription ?? 'declaration'}`}
                    contextNote={`${ex.selectivityChannel} channel examination on declaration ${entry.id} (lot: ${entry.lotDescription ?? entry.lotId}, owner: ${entry.lotOwnerName ?? entry.lotOwnerId}). Outcome: ${ex.outcome}. Findings: ${ex.findings ?? 'none recorded'}.`}
                    defaultPriority={ex.outcome === 'SEIZURE_RECOMMENDED' ? 'URGENT' : 'HIGH'}
                    buttonClassName="btn btn-secondary"
                  />
                )}
                {['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'].includes(ex.status) && (
                  completingExamId === ex.id ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <Select value={examOutcome} onValueChange={setExamOutcome}>
                        <SelectTrigger className="input-field" style={{ width: 180 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CLEARED">Cleared</SelectItem>
                          <SelectItem value="DISCREPANCY_FOUND">Discrepancy Found</SelectItem>
                          <SelectItem value="SEIZURE_RECOMMENDED">Seizure Recommended</SelectItem>
                        </SelectContent>
                      </Select>
                      <input type="text" className="input-field" style={{ width: 240 }} value={examFindings} onChange={e => setExamFindings(e.target.value)} placeholder="Officer's notes" />
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleCompleteExamination(ex.id)}>{busy ? 'Recording…' : 'Complete Examination'}</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setCompletingExamId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setCompletingExamId(ex.id)}>Complete Examination</button>
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
      <span style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right', ...(mono ? { fontFamily: 'ui-monospace, monospace', fontSize: 12.5 } : {}) }}>{value}</span>
    </div>
  );
}
