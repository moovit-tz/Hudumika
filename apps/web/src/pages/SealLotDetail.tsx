import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.js';
import { Banner } from '../components/ui/alert.js';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { PageLoading } from '../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../components/ui/dropdown-menu.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SealDocumentPanel } from '../components/SealDocumentPanel.js';
import { RaiseSealTicketButton } from '../components/RaiseSealTicketButton.js';
import { CUSTOMS_STATUS_VARIANT, CUSTOMS_STATUS_COLOR_VAR } from '../lib/sealStatus.js';
import {
  CUSTOMS_STATUS_TRANSITIONS, CUSTOMS_STATUS_LABELS, type CustomsStatus, type SealLot, type SealMovement, type SealLotRevision,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auxiliaryError, setAuxiliaryError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<SealLotRevision[]>([]);
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
  const [opsTab, setOpsTab] = useState<'customs' | 'move' | 'return'>('customs');
  const [recordTab, setRecordTab] = useState<'history' | 'documents' | 'changes'>('history');

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setAuxiliaryError(null);
    Promise.all([
      apiFetch(`/v1/seal/lots/${id}`),
      apiFetch(`/v1/seal/lots/${id}/movements`),
      apiFetch(`/v1/seal/lots/${id}/revisions`),
    ]).then(([l, m, changes]) => {
      setLot(l);
      setMovements(m);
      setRevisions(changes);
      apiFetch(`/v1/seal/locations?compartment_id=${l.compartmentId}`).then(setLocations).catch(e => setAuxiliaryError(e.message));
      if (l.requiresReefer) apiFetch(`/v1/seal/lots/${id}/reefer-readings`).then(setReeferReadings).catch(e => setAuxiliaryError(e.message));
    }).catch(e => { setLot(null); setLoadError(e.message); }).finally(() => setLoading(false));
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
    try {
      const res = await apiFetch(`/v1/seal/lots/${id}/verify-chain`);
      setVerifyResult(res);
    } catch (err: any) {
      showAlert(err.message || 'Failed to verify movement chain.');
    }
  }

  async function handleLogReading() {
    if (!id || !newReading) return;
    setLoggingReading(true);
    try {
      await apiFetch(`/v1/seal/lots/${id}/reefer-readings`, {
        method: 'POST', body: JSON.stringify({ temperatureC: Number(newReading) }),
      });
      setNewReading('');
      apiFetch(`/v1/seal/lots/${id}/reefer-readings`).then(setReeferReadings).catch(e => setAuxiliaryError(e.message));
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

  if (loading) return <div className="seal-page"><PageLoading /></div>;
  if (!lot) return <div className="seal-page"><PageHeader crumbs={['SEAL','Lots']} titlePlain="Lot" titleEm="details" backTo="/seal/lots" /><Banner variant="error">{loadError ?? 'Lot not found.'}</Banner><Button variant="outline" onClick={load}>Try again</Button></div>;

  const titleWords = lot.description.trim().split(/\s+/);
  const titleEm = titleWords.pop() || 'Lot';

  const runwayPct = lot.daysRemaining == null ? null : Math.max(0, Math.min(100, (lot.daysRemaining / 180) * 100));
  const legalActions = CUSTOMS_STATUS_TRANSITIONS[lot.customsStatus] ?? [];
  const clockColor = lot.daysRemaining == null ? 'var(--teal)'
    : lot.daysRemaining < 0 ? 'var(--red)' : lot.daysRemaining <= 30 ? 'var(--gold)' : 'var(--teal)';
  const canInvoice = !!accrual && accrual.days > 0 && accrual.totalAmount > 0 && !generatingInvoice;
  const outstandingReturns = Math.max(0,-movements.filter(m=>['pick','release','return'].includes(m.movementType)).reduce((sum,m)=>sum+m.qtyDelta,0));

  // One dense facts grid replaces the old separate Fiscal + Commercial panels:
  // same eight fields, a quarter of the vertical space.
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Customs Status', value: CUSTOMS_STATUS_LABELS[lot.customsStatus] },
    { label: 'Entry Reference', value: <span className="seal-mono">{lot.entryReference ?? '—'}</span> },
    { label: 'Location', value: <span className="seal-mono">{lot.currentLocationCode ?? 'Awaiting putaway'}</span> },
    { label: 'HS Code / Origin', value: <span className="seal-mono">{lot.hsCode ?? '—'}{lot.countryOfOrigin ? ` · ${lot.countryOfOrigin}` : ''}</span> },
    { label: 'Customs Value', value: lot.customsValue != null ? `${lot.customsValue.toLocaleString()} ${lot.currency ?? ''}` : '—' },
    {
      label: 'Duty / Tax at Risk',
      value: lot.dutyAtRisk || lot.taxAtRisk ? `${(lot.dutyAtRisk + lot.taxAtRisk).toLocaleString()} ${lot.currency ?? ''}` : 'Not yet computed',
    },
    { label: 'Quantity on Hand', value: `${lot.qtyOnHand.toLocaleString()} ${lot.uom}` },
    {
      label: 'Storage Clock',
      value: lot.daysRemaining == null ? '—' : (
        <div className="seal-lot-clock">
          <span style={{ color: lot.daysRemaining < 0 ? 'var(--red)' : 'var(--ink)' }}>
            {lot.daysRemaining < 0 ? `Expired ${Math.abs(lot.daysRemaining)}d ago` : `${lot.daysRemaining} days left`}
          </span>
          <div className="seal-runway seal-lot-runway">
            <div className="seal-runway-fill" style={{ width: `${runwayPct}%`, background: clockColor }} />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="seal-page">
      {auxiliaryError && <Banner variant="error">{auxiliaryError}</Banner>}
      <PageHeader
        crumbs={[{ label: 'SEAL', to: '/seal' }, { label: 'Lots', to: '/seal/lots' }, lot.description]}
        titlePlain={titleWords.join(' ')}
        titleEm={titleEm}
        subtitle="Ownership, fiscal state and the storage clock on this lot."
        backTo="/seal/lots"
        backLabel="All Lots"
        actions={
          <div className="seal-lot-actions">
            <Button variant="outline" size="sm" onClick={() => navigate(`/seal/lots/${lot.id}/edit`)}>Edit Lot</Button>
            <Button size="sm" disabled={!canInvoice} onClick={handleGenerateInvoice}>
              <Icon name="dollarSign" size={14} />
              <span>{generatingInvoice ? 'Generating…' : 'Generate Invoice'}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Lot actions">
                  <Icon name="moreHorizontal" size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="seal-lot-dropdown">
                <DropdownMenuItem onClick={() => { setRecordTab('history'); handleVerifyChain(); }}>
                  <Icon name="shield" size={14} /> Verify Movement Chain
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpsTab('move')}>
                  <Icon name="arrowRight" size={14} /> Move to Location
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpsTab('return')}>
                  <Icon name="package" size={14} /> Process Return
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Identity + key facts */}
      <div className="seal-card seal-lot-card--mb">
        <div className="seal-lot-identity">
          <div className="seal-lot-identity-left">
            <span className="seal-strip seal-lot-strip" style={{ background: `var(${CUSTOMS_STATUS_COLOR_VAR[lot.customsStatus]})` }} />
            <div className="seal-lot-identity-name">
              <h2 className="seal-entity-title seal-lot-entity-title">{lot.description}</h2>
              <div className="seal-lot-owner">
                <PersonAvatar userId={lot.ownerId} kind="customers" name={lot.ownerName ?? 'Unknown owner'} size={18} />
                <span>{lot.ownerName ?? 'Unknown owner'}</span>
              </div>
            </div>
          </div>
          <div className="seal-lot-badges">
            {lot.isDangerousGoods && <Badge variant="warning">DG Class {lot.imdgClass ?? '?'}</Badge>}
            {lot.requiresReefer && <Badge variant="gray">Reefer</Badge>}
            <Badge variant={CUSTOMS_STATUS_VARIANT[lot.customsStatus]}>{CUSTOMS_STATUS_LABELS[lot.customsStatus]}</Badge>
          </div>
        </div>
        <div className="seal-lot-facts">
          {facts.map(f => (
            <div key={f.label} className="seal-field-row">
              <span className="seal-field-label">{f.label}</span>
              <span className="seal-field-value seal-lot-field-val">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="seal-lot-layout">
        {/* Main column */}
        <div className="seal-lot-col">
          <Card>
            <CardHeader><CardTitle>Lot details</CardTitle></CardHeader>
            <CardContent><dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Batch',lot.batch??'Not set'],['Serial number',lot.serial??'Not set'],
                ['Product expiry',lot.expiryDate?new Date(lot.expiryDate).toLocaleDateString():'Not set'],
                ['Storage deadline',lot.expiresOn?new Date(lot.expiresOn).toLocaleDateString():'Not set'],
                ['Volume',lot.volumeCbm==null?'Not set':`${lot.volumeCbm.toLocaleString()} m³`],
                ['Gross weight',lot.grossWeightKg==null?'Not set':`${lot.grossWeightKg.toLocaleString()} kg`],
                ['Destination',lot.destinationLabel??'Not set'],['Marks and numbers',lot.marksAndNumbers??'Not set'],
                ['UN number',lot.unNumber??'Not set'],
              ].map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium break-words mt-1">{value}</dd></div>)}
              <div><dt className="text-xs text-muted-foreground">Catalogue product</dt><dd className="text-sm mt-1">{lot.productId?<Link className="underline" to="/seal/items">Catalogue linked</Link>:'Not linked'}</dd></div>
            </dl></CardContent>
          </Card>

          <div className="seal-card">
            <div className="seal-card-hdr seal-lot-card-hdr--wrap">
              <h2 className="seal-card-title">Operations</h2>
              <Tabs value={opsTab} onValueChange={v => setOpsTab(v as typeof opsTab)}>
                <TabsList>
                  <TabsTrigger value="customs">Customs Status</TabsTrigger>
                  <TabsTrigger value="move">Move</TabsTrigger>
                  <TabsTrigger value="return">Return</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="seal-lot-pad">
              {opsTab === 'customs' && (legalActions.length === 0 ? (
                <div className="seal-lot-terminal">
                  This lot's status is terminal — no further customs transitions apply.
                </div>
              ) : (
                <div className="seal-lot-form">
                  <div>
                    <label className="seal-field-label seal-lot-field-block">Reference</label>
                    <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Entry no., certificate no., etc." />
                  </div>
                  <div className="seal-lot-action-btns">
                    {legalActions.map((a, i) => (
                      <Button
                        key={a.to}
                        size="sm"
                        variant={i === 0 ? 'default' : 'outline'}
                        disabled={acting !== null || !reference.trim()}
                        title={`Requires: ${a.evidenceHint}`}
                        onClick={() => handleAction(a.to)}
                      >
                        {acting === a.to ? 'Recording…' : ACTION_LABELS[a.to]}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}

              {opsTab === 'move' && (locations.length === 0 ? (
                <div className="seal-lot-terminal">
                  No locations defined in this compartment yet — add rack/slot locations in Compartment setup before moving lots.
                </div>
              ) : (
                <div className="seal-lot-ops-row">
                  <div className="seal-lot-ops-field">
                    <label className="seal-field-label seal-lot-field-block">Destination Location</label>
                    <Select value={transferTo} onValueChange={setTransferTo}>
                      <SelectTrigger><SelectValue placeholder="Select location…" /></SelectTrigger>
                      <SelectContent>
                        {locations.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" disabled={!transferTo || acting !== null} onClick={handleTransfer}>
                    {acting === 'transfer' ? 'Moving…' : 'Move Lot'}
                  </Button>
                  <div className="seal-lot-ops-hint">
                    Re-slotting only — no fiscal or customs effect.
                  </div>
                </div>
              ))}

              {opsTab === 'return' && (
                <div className="seal-lot-ops-row">
                  <p className="text-sm text-muted-foreground w-full">Up to {outstandingReturns} {lot.uom} can be returned against recorded issues.</p>
                  <div className="seal-lot-ops-field--qty">
                    <label className="seal-field-label seal-lot-field-block">Qty ({lot.uom})</label>
                    <Input type="number" min="0" max={outstandingReturns} step="any" value={returnQty} onChange={e => setReturnQty(e.target.value)} placeholder="0" />
                  </div>
                  <div className="seal-lot-ops-field--ref">
                    <label className="seal-field-label seal-lot-field-block">Return Reference</label>
                    <Input value={returnReference} onChange={e => setReturnReference(e.target.value)} placeholder="RMA / return reference" />
                  </div>
                  <Button size="sm" disabled={!returnQty || Number(returnQty) <= 0 || Number(returnQty)>outstandingReturns || !returnReference.trim() || acting !== null} onClick={handleReturn}>
                    {acting === 'return' ? 'Processing…' : 'Process Return'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Records */}
          <div className="seal-card">
            <div className="seal-card-hdr seal-lot-card-hdr--wrap">
              <Tabs value={recordTab} onValueChange={v => setRecordTab(v as typeof recordTab)}>
                <TabsList>
                  <TabsTrigger value="history">Movement History ({movements.length})</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="changes">Edit History ({revisions.length})</TabsTrigger>
                </TabsList>
              </Tabs>
              {recordTab === 'history' && (
                <Button variant="outline" size="sm" onClick={handleVerifyChain}>
                  <Icon name="shield" size={14} /><span>Verify Chain</span>
                </Button>
              )}
            </div>

            {recordTab === 'history' && (
              <>
                {verifyResult && (
                  <div className={`seal-lot-verify ${verifyResult.valid ? 'seal-lot-verify--ok' : 'seal-lot-verify--fail'}`}>
                    {verifyResult.valid
                      ? `✓ Hash chain verified across ${verifyResult.checked} movement(s).`
                      : '✗ Hash chain broken — this record has been tampered with.'}
                  </div>
                )}
                <div className="seal-lot-history-scroll">
                  {movements.length === 0 ? (
                    <div className="seal-empty">No movements recorded.</div>
                  ) : (
                    <div className="seal-timeline">
                      {movements.map(m => (
                        <div key={m.id} className="seal-timeline-row">
                          <div className="seal-timeline-dot" />
                          <div className="seal-timeline-body">
                            <div className="seal-lot-timeline-header">
                              <div className="seal-timeline-text">
                                <strong className="seal-lot-movement-type">{m.movementType.replace(/_/g, ' ')}</strong>
                                {m.toCustomsStatus && m.fromCustomsStatus !== m.toCustomsStatus && (
                                  <> — {CUSTOMS_STATUS_LABELS[m.fromCustomsStatus as CustomsStatus] ?? m.fromCustomsStatus ?? 'new'} → {CUSTOMS_STATUS_LABELS[m.toCustomsStatus as CustomsStatus] ?? m.toCustomsStatus}</>
                                )}
                                {m.qtyDelta !== 0 && <> · qty {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}</>}
                                {m.reference && <> · ref {m.reference}</>}
                                {m.entryReference && <> · entry {m.entryReference}</>}
                              </div>
                              <span className="seal-timeline-time">{new Date(m.occurredAt).toLocaleString()}</span>
                            </div>
                            <div className="seal-timeline-hash seal-mono">hash {m.hash.slice(0, 16)}…</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {recordTab === 'changes' && <div className="seal-lot-pad-sm space-y-4">
              {!revisions.length && <p className="text-sm text-muted-foreground">No lot corrections recorded.</p>}
              {revisions.map(revision => <div key={revision.id} className="border-b pb-4 space-y-2">
                <div className="flex items-center gap-2"><PersonAvatar userId={revision.actorId ?? undefined} name={revision.actorName ?? 'Staff'} size={24}/><span className="font-medium">{revision.actorName ?? 'Staff'}</span><span className="text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span></div>
                <p>{revision.reason}</p><dl>{Object.entries(revision.changes).map(([field,change])=><div key={field} className="text-sm py-1"><dt className="font-medium inline">{field.replace(/([A-Z])/g,' $1')}: </dt><dd className="inline break-words">{String(change.before ?? 'Not set')} → {String(change.after ?? 'Not set')}</dd></div>)}</dl>
              </div>)}
            </div>}

            {recordTab === 'documents' && (
              <div className="seal-lot-pad-sm">
                <SealDocumentPanel entityType="lot" entityId={lot.id} />
              </div>
            )}
          </div>
        </div>

        {/* Side column */}
        <div className="seal-lot-col">
          <div className="seal-card">
            <div className="seal-card-hdr"><h2 className="seal-card-title">Storage Billing</h2></div>
            <div className="seal-lot-billing-body">
              {accrualError ? (
                <>
                  <Badge variant="warning">Cannot bill</Badge>
                  <div className="seal-lot-billing-error">{accrualError}</div>
                </>
              ) : !accrual ? (
                <span className="seal-lot-muted">Calculating accrual…</span>
              ) : accrual.days > 0 ? (
                <div className="seal-lot-billing-stack">
                  <div className="seal-lot-billing-amount">
                    {accrual.totalAmount.toLocaleString()} <span className="seal-lot-billing-currency">{accrual.storageFeeCurrency}</span>
                  </div>
                  <div className="seal-lot-billing-meta">
                    {accrual.days} day(s) · {accrual.fromDate} → {accrual.toDate}<br />
                    {accrual.storageFeePerDay}/day
                    {accrual.billingMethod === 'per_cbm' && accrual.volumeCbm != null && <> · {accrual.volumeCbm} m³</>}
                    {accrual.includesHandling && accrual.handlingFeeFlat > 0 && <> · +{accrual.handlingFeeFlat} handling</>}
                  </div>
                </div>
              ) : (
                <span className="seal-lot-muted">Already billed through today — nothing new has accrued.</span>
              )}
            </div>
          </div>

          {lot.requiresReefer && (
            <div className="seal-card">
              <div className="seal-card-hdr">
                <h2 className="seal-card-title">Reefer Log</h2>
                <span className="seal-lot-reefer-setpoint">Setpoint {lot.reeferSetpointC ?? '—'}°C ±2</span>
              </div>
              <div className="seal-lot-reefer-body">
                <div className="seal-lot-reefer-input">
                  <Input type="number" step="any" placeholder="°C reading" value={newReading} onChange={e => setNewReading(e.target.value)} />
                  <Button size="sm" disabled={!newReading || loggingReading} onClick={handleLogReading}>
                    {loggingReading ? 'Logging…' : 'Log'}
                  </Button>
                </div>
                {reeferReadings.length === 0 ? (
                  <div className="seal-lot-reefer-empty">No readings logged yet.</div>
                ) : (
                  <div className="seal-lot-reefer-list">
                    {reeferReadings.slice(0, 6).map(r => (
                      <div key={r.id} className="seal-lot-reefer-row">
                        <span className="seal-lot-reefer-time">{new Date(r.recordedAt).toLocaleString()}</span>
                        <span className="seal-mono seal-lot-reefer-val" style={{ color: r.withinRange ? 'var(--ink)' : 'var(--red)' }}>
                          {r.temperatureC}°C{!r.withinRange && ' ⚠'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="seal-card">
            <div className="seal-card-hdr"><h2 className="seal-card-title">Support</h2></div>
            <div className="seal-lot-pad-sm">
              <RaiseSealTicketButton
                customerId={lot.ownerId}
                defaultSubject={`Warehouse issue — ${lot.description}`}
                contextNote={`Raised from SEAL lot "${lot.description}" (${lot.id}), status ${lot.customsStatus}, owner ${lot.ownerName ?? lot.ownerId}.`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
