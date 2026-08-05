import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Compartment { id: string; code: string; name: string; }
interface Period {
  id: string; compartmentId: string; compartmentName?: string; periodStart: string; periodEnd: string;
  status: string; openingLotCount: number; closingLotCount: number; totalDutyAtRisk: number; totalTaxAtRisk: number;
  generatedAt: string | null; submissionReference: string | null; submittedAt: string | null;
}
interface Line {
  id: string; lotId: string; lotDescription?: string; openingQty: number; receivedQty: number;
  releasedQty: number; adjustedQty: number; closingQty: number; closingCustomsStatus: string | null;
  dutyAtRisk: number; taxAtRisk: number;
}

export function SealStockAccount() {
  const isMobile = useIsMobile();
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [compartmentId] = useSealCompartmentId();

  const [newCompartmentId, setNewCompartmentId] = useState('');
  const [periodStart, setPeriodStart] = useState<Date | undefined>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>(new Date());

  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [submitRef, setSubmitRef] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/stock-account/periods?${params.toString()}`).then(setPeriods).finally(() => setLoading(false));
  }
  useEffect(() => {
    reload();
  }, [compartmentId]);
  useEffect(() => {
    apiFetch('/v1/seal/compartments').then(rows => { setCompartments(rows); if (rows.length === 1) setNewCompartmentId(rows[0].id); });
  }, []);
  useEffect(() => {
    if (compartmentId) setNewCompartmentId(compartmentId);
  }, [compartmentId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCompartmentId || !periodStart || !periodEnd) return;
    setGenerating(true);
    try {
      await apiFetch('/v1/seal/stock-account/periods', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: newCompartmentId, periodStart: toDateOnlyString(periodStart), periodEnd: toDateOnlyString(periodEnd) }),
      });
      setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to generate this stock-account period.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleExpand(period: Period) {
    if (expanded === period.id) { setExpanded(null); return; }
    setExpanded(period.id);
    setLoadingLines(true);
    try {
      const detail = await apiFetch(`/v1/seal/stock-account/periods/${period.id}`);
      setLines(detail.lines);
    } finally {
      setLoadingLines(false);
    }
  }

  async function handleSubmit(periodId: string) {
    if (!submitRef.trim()) return;
    try {
      await apiFetch(`/v1/seal/stock-account/periods/${periodId}/submit`, {
        method: 'POST', body: JSON.stringify({ submissionReference: submitRef.trim() }),
      });
      setSubmittingId(null); setSubmitRef('');
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to submit this period.');
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Stock Account']}
        titlePlain="Stock"
        titleEm="account"
        subtitle="The periodic compliance report — opening/closing balances per lot, reconstructed from the movement ledger, never hand-entered."
      />
      <div className="seal-page-hdr">
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>Generate Period</span>
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleGenerate} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, alignItems: 'flex-end' }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Compartment</label>
              <Select value={newCompartmentId} onValueChange={setNewCompartmentId}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Choose a compartment" /></SelectTrigger>
                <SelectContent>{compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Period Start</label>
              <DatePicker date={periodStart} onChange={setPeriodStart} />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Period End</label>
              <DatePicker date={periodEnd} onChange={setPeriodEnd} />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <button type="submit" className="btn btn-primary" disabled={generating || !newCompartmentId}>{generating ? 'Generating…' : 'Generate from Ledger'}</button>
          </div>
        </form>
      )}

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : periods.length === 0 ? (
            <div className="seal-empty">No stock-account periods generated yet.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr><th>Compartment</th><th>Period</th><th>Opening / Closing Lots</th><th>Duty+Tax at Risk</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {periods.map(p => (
                  <React.Fragment key={p.id}>
                    <tr onClick={() => handleExpand(p)}>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{p.compartmentName ?? '—'}</td>
                      <td>{new Date(p.periodStart).toLocaleDateString()} – {new Date(p.periodEnd).toLocaleDateString()}</td>
                      <td>{p.openingLotCount} → {p.closingLotCount}</td>
                      <td className="seal-mono">{(p.totalDutyAtRisk + p.totalTaxAtRisk).toLocaleString()}</td>
                      <td><Badge variant={p.status === 'SUBMITTED' ? 'success' : 'gray'}>{p.status}</Badge></td>
                      <td><Icon name={expanded === p.id ? 'chevronUp' : 'chevronDown'} size={14} /></td>
                    </tr>
                    {expanded === p.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg)', padding: 16 }}>
                          {loadingLines ? (
                            <div className="seal-empty">Loading lines…</div>
                          ) : lines.length === 0 ? (
                            <div className="seal-empty">No lot activity in this period.</div>
                          ) : (
                            <table className="seal-table" style={{ background: 'var(--white)' }}>
                              <thead>
                                <tr><th>Lot</th><th>Opening</th><th>Received</th><th>Released</th><th>Adjusted</th><th>Closing</th><th>Closing Status</th></tr>
                              </thead>
                              <tbody>
                                {lines.map(l => (
                                  <tr key={l.id}>
                                    <td>{l.lotDescription ?? '—'}</td>
                                    <td className="seal-mono">{l.openingQty}</td>
                                    <td className="seal-mono">{l.receivedQty}</td>
                                    <td className="seal-mono">{l.releasedQty}</td>
                                    <td className="seal-mono">{l.adjustedQty}</td>
                                    <td className="seal-mono">{l.closingQty}</td>
                                    <td>{l.closingCustomsStatus ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {p.status === 'DRAFT' && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                              {submittingId === p.id ? (
                                <>
                                  <input type="text" className="input-field" style={{ width: 220 }} placeholder="Submission reference" value={submitRef} onChange={e => setSubmitRef(e.target.value)} />
                                  <button type="button" className="btn btn-primary" disabled={!submitRef.trim()} onClick={() => handleSubmit(p.id)}>Confirm Submission</button>
                                  <button type="button" className="btn btn-secondary" onClick={() => setSubmittingId(null)}>Cancel</button>
                                </>
                              ) : (
                                <button type="button" className="btn btn-primary" onClick={() => setSubmittingId(p.id)}>
                                  <Icon name="send" size={13} /><span>Submit to Customs</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
