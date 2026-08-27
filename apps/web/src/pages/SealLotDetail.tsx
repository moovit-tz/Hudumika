import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SealDocumentPanel } from '../components/SealDocumentPanel.js';
import { RaiseSealTicketButton } from '../components/RaiseSealTicketButton.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { CUSTOMS_STATUS_VARIANT, CUSTOMS_STATUS_COLOR_VAR } from '../lib/sealStatus.js';
import {
  CUSTOMS_STATUS_TRANSITIONS, CUSTOMS_STATUS_LABELS, type CustomsStatus, type SealLot, type SealMovement,
} from '@hudumika/types';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Location { id: string; code: string; location_type: string; }
interface ReeferReading { id: string; recordedAt: string; temperatureC: number; withinRange: boolean; note: string | null; }
interface StorageAccrual {
  fromDate: string; toDate: string; days: number; billingMethod: 'flat_per_lot' | 'per_cbm';
  storageFeePerDay: number; volumeCbm: number | null; storageFeeCurrency: string;
  storageAmount: number; handlingFeeFlat: number; includesHandling: boolean; totalAmount: number;
}

const ACTION_LABELS: Record<CustomsStatus, string> = {
  FOREIGN_DUTY_SUSPENDED: 'Confirm Arrival Under Bond',
  FOREIGN_DUTY_PAID: 'Release for Home Use',
  TRANSIT: 'Declare Transit',
  TEMPORARY_ADMISSION: 'Temporary Admission',
  INWARD_PROCESSING: 'Begin Inward Processing',
  OUTWARD_PROCESSING: 'Begin Outward Processing',
  EXPORT_DECLARED: 'Declare for Export',
  EXPORTED: 'Confirm Departure',
  DOMESTIC: 'Mark Domestic',
  ZONE_RESTRICTED: 'Move to Zone-Restricted',
  ABANDONED: 'Mark Abandoned',
  SEIZED: 'Record Customs Seizure',
  DESTROYED: 'Destroy Under Supervision',
};

export function SealLotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [lot, setLot] = useState<(SealLot & { legalNextStatuses: CustomsStatus[] }) | null>(null);
  const [movements, setMovements] = useState<SealMovement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState<string>('');
  const [returnQty, setReturnQty] = useState('');
  const [returnReference, setReturnReference] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; checked: number } | null>(null);
  const [reeferReadings, setReeferReadings] = useState<ReeferReading[]>([]);
  const [newReading, setNewReading] = useState('');
  const [loggingReading, setLoggingReading] = useState(false);
  const [accrual, setAccrual] = useState<StorageAccrual | null>(null);
  const [accrualError, setAccrualError] = useState<string | null>(null);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/v1/seal/lots/${id}`),
      apiFetch(`/v1/seal/lots/${id}/movements`),
    ]).then(([l, m]) => {
      setLot(l);
      setMovements(m);
      apiFetch(`/v1/seal/locations?compartment_id=${l.compartmentId}`).then(setLocations);
      if (l.requiresReefer) apiFetch(`/v1/seal/lots/${id}/reefer-readings`).then(setReeferReadings);
    }).finally(() => setLoading(false));
    apiFetch(`/v1/seal/lots/${id}/storage-accrual`).then(a => { setAccrual(a); setAccrualError(null); }).catch(err => { setAccrual(null); setAccrualError(err.message || null); });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(to: CustomsStatus) {
    if (!id) return;
    setActing(to);
    try {
      await apiFetch(`/v1/seal/lots/${id}/movements`, {
        method: 'POST',
        body: JSON.stringify({ movementType: 'status_change', toCustomsStatus: to, entryReference: reference || null, reasonCode: 'MANUAL_ACTION' }),
      });
      setReference('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'That transition was rejected.', { title: 'Illegal Customs Transition' });
    } finally {
      setActing(null);
    }
  }

  async function handleTransfer() {
    if (!id || !transferTo) return;
    setActing('transfer');
    try {
      await apiFetch(`/v1/seal/lots/${id}/movements`, {
        method: 'POST',
        body: JSON.stringify({ movementType: 'transfer', toLocationId: transferTo, qtyDelta: 0, reasonCode: 'RE_SLOT' }),
      });
      setTransferTo('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Transfer failed.');
    } finally {
      setActing(null);
    }
  }

  async function handleReturn() {
    if (!id || !returnQty || Number(returnQty) <= 0) return;
    setActing('return');
    try {
      await apiFetch(`/v1/seal/lots/${id}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          movementType: 'return', qtyDelta: Number(returnQty),
          reasonCode: 'customer_return', reference: returnReference.trim() || null,
        }),
      });
      setReturnQty(''); setReturnReference('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to process this return.');
    } finally {
      setActing(null);
    }
  }

  async function handleVerifyChain() {
    if (!id) return;
    const res = await apiFetch(`/v1/seal/lots/${id}/verify-chain`);
    setVerifyResult(res);
  }

  async function handleLogReading() {
    if (!id || !newReading) return;
    setLoggingReading(true);
    try {
      await apiFetch(`/v1/seal/lots/${id}/reefer-readings`, {
        method: 'POST', body: JSON.stringify({ temperatureC: Number(newReading) }),
      });
      setNewReading('');
      apiFetch(`/v1/seal/lots/${id}/reefer-readings`).then(setReeferReadings);
    } catch (err: any) {
      showAlert(err.message || 'Failed to log reading.');
    } finally {
      setLoggingReading(false);
    }
  }

  async function handleGenerateInvoice() {
    if (!id) return;
    setGeneratingInvoice(true);
    try {
      const res = await apiFetch(`/v1/seal/lots/${id}/generate-storage-invoice`, { method: 'POST' });
      showAlert(`Draft invoice ${res.invoice.invoice_number} created for ${res.accrual.totalAmount.toLocaleString()} ${res.accrual.storageFeeCurrency} — review and send it from FinOps.`, { title: 'Storage Invoice Generated', variant: 'success' });
      apiFetch(`/v1/seal/lots/${id}/storage-accrual`).then(a => { setAccrual(a); setAccrualError(null); }).catch(err => { setAccrual(null); setAccrualError(err.message || null); });
    } catch (err: any) {
      showAlert(err.message || 'Failed to generate storage invoice.');
    } finally {
      setGeneratingInvoice(false);
    }
  }

  if (loading || !lot) return <div className="seal-page"><div className="seal-empty">Loading…</div></div>;

  const runwayPct = lot.daysRemaining == null ? null : Math.max(0, Math.min(100, (lot.daysRemaining / 180) * 100));
  const legalActions = CUSTOMS_STATUS_TRANSITIONS[lot.customsStatus] ?? [];

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Lot']}
        titlePlain="Bonded"
        titleEm="lot"
        subtitle="Ownership, fiscal state and the storage clock on this lot."
      />
      <div className="seal-page-hdr">
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/seal/lots')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} />
            <span>Back to Lots</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="seal-strip" style={{ height: 24, background: `var(${CUSTOMS_STATUS_COLOR_VAR[lot.customsStatus]})` }} />
            <h1 className="seal-page-title" style={{ margin: 0 }}>{lot.description}</h1>
          </div>
          <p className="seal-page-sub" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <PersonAvatar userId={lot.ownerId} kind="customers" name={lot.ownerName ?? 'Unknown owner'} size={18} />
            {lot.ownerName ?? 'Unknown owner'} · {lot.qtyOnHand.toLocaleString()} {lot.uom}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lot.isDangerousGoods && <Badge variant="warning">DG Class {lot.imdgClass ?? '?'}</Badge>}
          {lot.requiresReefer && <Badge variant="info">Reefer</Badge>}
          <Badge variant={CUSTOMS_STATUS_VARIANT[lot.customsStatus]}>{CUSTOMS_STATUS_LABELS[lot.customsStatus]}</Badge>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Fiscal panel */}
        <div className="seal-card">
          <div className="seal-card-hdr"><h2 className="seal-card-title">Fiscal State</h2></div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="seal-field-row">
              <span className="seal-field-label">Customs Status</span>
              <span className="seal-field-value">{CUSTOMS_STATUS_LABELS[lot.customsStatus]}</span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Entry Reference</span>
              <span className="seal-field-value seal-mono">{lot.entryReference ?? '—'}</span>
            </div>
            {lot.daysRemaining != null && (
              <div className="seal-field-row">
                <span className="seal-field-label">Storage Clock</span>
                <div className="seal-runway" style={{ marginTop: 2 }}>
                  <div className="seal-runway-fill" style={{
                    width: `${runwayPct}%`,
                    background: lot.daysRemaining < 0 ? 'var(--red)' : lot.daysRemaining <= 30 ? 'var(--gold)' : 'var(--seal)',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                  {lot.daysRemaining < 0 ? `Expired ${Math.abs(lot.daysRemaining)}d ago` : `${lot.daysRemaining} days remaining`}
                </span>
              </div>
            )}
            <div className="seal-field-row">
              <span className="seal-field-label">Duty / Tax at Risk</span>
              <span className="seal-field-value seal-mono">
                {lot.dutyAtRisk || lot.taxAtRisk ? `${(lot.dutyAtRisk + lot.taxAtRisk).toLocaleString()} ${lot.currency ?? ''}` : 'Not yet computed'}
              </span>
            </div>
          </div>
        </div>

        {/* Commercial panel */}
        <div className="seal-card">
          <div className="seal-card-hdr"><h2 className="seal-card-title">Commercial Detail</h2></div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="seal-field-row">
              <span className="seal-field-label">Owner</span>
              <span className="seal-field-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <PersonAvatar userId={lot.ownerId} kind="customers" name={lot.ownerName ?? ''} size={20} />
                {lot.ownerName ?? '—'}
              </span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Location</span>
              <span className="seal-field-value seal-mono">{lot.currentLocationCode ?? '—'}</span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">HS Code / Origin</span>
              <span className="seal-field-value seal-mono">{lot.hsCode ?? '—'} {lot.countryOfOrigin ? `· ${lot.countryOfOrigin}` : ''}</span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Customs Value</span>
              <span className="seal-field-value">{lot.customsValue != null ? `${lot.customsValue.toLocaleString()} ${lot.currency ?? ''}` : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions — only the legal next statuses from this lot's current state
          are offered; the domain layer rejects everything else regardless. */}
      <div className="seal-card" style={{ marginBottom: 20 }}>
        <div className="seal-card-hdr"><h2 className="seal-card-title">Actions</h2></div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {legalActions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>This lot's status is terminal for Increment 1 — no further customs transitions apply.</div>
          ) : (
            <>
              <input
                type="text"
                className="input-field"
                placeholder="Reference (entry no., certificate no., etc.)"
                value={reference}
                onChange={e => setReference(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {legalActions.map(a => (
                  <button
                    key={a.to}
                    type="button"
                    className="btn btn-primary"
                    disabled={acting !== null}
                    title={`Requires: ${a.evidenceHint}`}
                    onClick={() => handleAction(a.to)}
                  >
                    {acting === a.to ? 'Recording…' : ACTION_LABELS[a.to]}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger className="input-field" style={{ width: 220 }}><SelectValue placeholder="Transfer to location…" /></SelectTrigger>
              <SelectContent>
                {locations.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.code}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" className="btn btn-secondary" disabled={!transferTo || acting !== null} onClick={handleTransfer}>
              {acting === 'transfer' ? 'Moving…' : 'Move (No Fiscal Effect)'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <input
              type="number" min="0" step="any" className="input-field" style={{ width: 120 }}
              value={returnQty} onChange={e => setReturnQty(e.target.value)}
              placeholder={`Qty (${lot.uom})`}
            />
            <input
              type="text" className="input-field" style={{ width: 200 }}
              value={returnReference} onChange={e => setReturnReference(e.target.value)}
              placeholder="RMA / return reference"
            />
            <button type="button" className="btn btn-secondary" disabled={!returnQty || Number(returnQty) <= 0 || acting !== null} onClick={handleReturn}>
              {acting === 'return' ? 'Processing…' : 'Process Return'}
            </button>
          </div>
        </div>
      </div>

      {lot.requiresReefer && (
        <div className="seal-card" style={{ marginBottom: 20 }}>
          <div className="seal-card-hdr"><h2 className="seal-card-title">Reefer Log</h2></div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
              Setpoint {lot.reeferSetpointC ?? '—'}°C · ±2°C tolerance band
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="number" step="any" className="input-field" style={{ width: 140 }} placeholder="°C reading" value={newReading} onChange={e => setNewReading(e.target.value)} />
              <button type="button" className="btn btn-primary" disabled={!newReading || loggingReading} onClick={handleLogReading}>
                {loggingReading ? 'Logging…' : 'Log Reading'}
              </button>
            </div>
            {reeferReadings.length === 0 ? (
              <div className="seal-empty">No readings logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {reeferReadings.slice(0, 10).map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--ink3)' }}>{new Date(r.recordedAt).toLocaleString()}</span>
                    <span className="seal-mono" style={{ color: r.withinRange ? 'var(--ink)' : 'var(--red)', fontWeight: 600 }}>
                      {r.temperatureC}°C {!r.withinRange && '⚠ out of range'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(accrual || accrualError) && (
        <div className="seal-card" style={{ marginBottom: 20 }}>
          <div className="seal-card-hdr"><h2 className="seal-card-title">Storage Billing (FinOps)</h2></div>
          {accrualError ? (
            <div style={{ padding: 20 }}>
              <Badge variant="warning">Cannot bill</Badge>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8 }}>{accrualError}</div>
            </div>
          ) : accrual && (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 13 }}>
                {accrual.days > 0 ? (
                  <>
                    <strong>{accrual.days} day(s)</strong> accrued ({accrual.fromDate} to {accrual.toDate}) at {accrual.storageFeePerDay}/day
                    {accrual.billingMethod === 'per_cbm' && accrual.volumeCbm != null && <> ({accrual.volumeCbm} m³ recorded volume)</>}
                    {accrual.includesHandling && accrual.handlingFeeFlat > 0 && <> + {accrual.handlingFeeFlat} one-time handling fee</>}
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{accrual.totalAmount.toLocaleString()} {accrual.storageFeeCurrency}</div>
                  </>
                ) : (
                  <span style={{ color: 'var(--ink3)' }}>Already billed through today — nothing new has accrued.</span>
                )}
              </div>
              <button type="button" className="btn btn-primary" disabled={accrual.days <= 0 || generatingInvoice} onClick={handleGenerateInvoice}>
                <Icon name="dollarSign" size={14} /><span>{generatingInvoice ? 'Generating…' : 'Generate Storage Invoice'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <RaiseSealTicketButton
          customerId={lot.ownerId}
          defaultSubject={`Warehouse issue — ${lot.description}`}
          contextNote={`Raised from SEAL lot "${lot.description}" (${lot.id}), status ${lot.customsStatus}, owner ${lot.ownerName ?? lot.ownerId}.`}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <SealDocumentPanel entityType="lot" entityId={lot.id} />
      </div>

      {/* Immutable movement history */}
      <div className="seal-card">
        <div className="seal-card-hdr">
          <h2 className="seal-card-title">Movement History</h2>
          <button type="button" className="btn btn-secondary" onClick={handleVerifyChain}>
            <Icon name="shield" size={13} />
            <span>Verify Chain</span>
          </button>
        </div>
        {verifyResult && (
          <div style={{ padding: '10px 20px', background: verifyResult.valid ? 'var(--green-l)' : 'var(--red-l)', color: verifyResult.valid ? 'var(--green)' : 'var(--red)', fontSize: 13, fontWeight: 600 }}>
            {verifyResult.valid ? `✓ Hash chain verified across ${verifyResult.checked} movement(s).` : `✗ Hash chain broken — this record has been tampered with.`}
          </div>
        )}
        <div style={{ padding: '4px 20px' }}>
          {movements.length === 0 ? (
            <div className="seal-empty">No movements recorded.</div>
          ) : (
            <div className="seal-timeline">
              {movements.map(m => (
                <div key={m.id} className="seal-timeline-row">
                  <div className="seal-timeline-dot" />
                  <div className="seal-timeline-body">
                    <div className="seal-timeline-time">{new Date(m.occurredAt).toLocaleString()}</div>
                    <div className="seal-timeline-text">
                      <strong>{m.movementType.replace('_', ' ')}</strong>
                      {m.toCustomsStatus && m.fromCustomsStatus !== m.toCustomsStatus && (
                        <> — {CUSTOMS_STATUS_LABELS[m.fromCustomsStatus as CustomsStatus] ?? m.fromCustomsStatus ?? 'new'} → {CUSTOMS_STATUS_LABELS[m.toCustomsStatus as CustomsStatus] ?? m.toCustomsStatus}</>
                      )}
                      {m.qtyDelta !== 0 && <> · qty {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}</>}
                      {m.reference && <> · ref {m.reference}</>}
                      {m.entryReference && <> · entry {m.entryReference}</>}
                    </div>
                    <div className="seal-timeline-hash seal-mono">hash {m.hash.slice(0, 16)}…</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
