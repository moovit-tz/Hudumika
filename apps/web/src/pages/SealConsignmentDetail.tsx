import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { getHudumikaFooterHtml } from '../lib/watermark.js';
import { SealDocumentPanel } from '../components/SealDocumentPanel.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { STATUS_VARIANT } from './SealConsignments.js';
import { validateContainerNumber } from '@hudumika/types';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Container {
  id: string; container_number: string; container_size: string; seal_number: string | null;
  gross_weight_kg: string | null; tare_weight_kg: string | null; net_weight_kg: string | null;
  gate_in_at: string | null; gate_out_at: string | null; eir_reference: string | null;
  yard_slot_id: string | null; vehicle_id: string | null;
}
interface YardSlot { id: string; code: string; capacityTeu: number; occupiedCount: number; }
interface Vehicle { id: string; name: string; plateNumber: string | null; driverName: string | null; }
interface Consignment {
  id: string; owner_id: string; owner_name?: string; compartment_id: string; transport_doc_type: string;
  transport_doc_number: string | null; status: string; expected_arrival: string | null;
  goods_description: string | null; containers: Container[];
}
interface TallyLine {
  description: string; hsCode: string; qty: string; uom: string; customsValue: string; currency: string;
  dutyAtRisk: string; taxAtRisk: string; discrepancy: boolean; discrepancyType: string;
}

const CONTAINER_SIZES = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', 'OTHER'];
const emptyLine = (): TallyLine => ({
  description: '', hsCode: '', qty: '', uom: 'PCS', customsValue: '', currency: 'USD',
  dutyAtRisk: '', taxAtRisk: '', discrepancy: false, discrepancyType: 'shortage',
});

export function SealConsignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [consignment, setConsignment] = useState<Consignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [yardSlots, setYardSlots] = useState<YardSlot[]>([]);
  const [assigningSlot, setAssigningSlot] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assigningVehicle, setAssigningVehicle] = useState<string | null>(null);

  const [newContainerNumber, setNewContainerNumber] = useState('');
  const [newContainerSize, setNewContainerSize] = useState('40GP');
  const [addingContainer, setAddingContainer] = useState(false);

  const [gateActionId, setGateActionId] = useState<string | null>(null);
  const [sealNumber, setSealNumber] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [tareWeight, setTareWeight] = useState('');
  const [gating, setGating] = useState(false);

  const [devanActionId, setDevanActionId] = useState<string | null>(null);
  const [tallyLines, setTallyLines] = useState<TallyLine[]>([emptyLine()]);
  const [devanning, setDevanning] = useState(false);
  const [devanResults, setDevanResults] = useState<any[] | null>(null);

  const check = newContainerNumber.trim() ? validateContainerNumber(newContainerNumber) : null;

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/consignments/${id}`).then(c => {
      setConsignment(c);
      apiFetch(`/v1/seal/yard-slots?compartment_id=${c.compartment_id}`).then(setYardSlots);
    }).finally(() => setLoading(false));
    apiFetch('/v1/seal/vehicles-for-assignment').then(setVehicles).catch(() => setVehicles([]));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function handleAssignVehicle(containerId: string, vehicleId: string) {
    setAssigningVehicle(containerId);
    try {
      await apiFetch(`/v1/seal/containers/${containerId}/vehicle`, {
        method: 'PATCH', body: JSON.stringify({ vehicleId: vehicleId || null }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to assign vehicle.');
    } finally {
      setAssigningVehicle(null);
    }
  }

  async function handleAssignYardSlot(containerId: string, yardSlotId: string) {
    setAssigningSlot(containerId);
    try {
      await apiFetch(`/v1/seal/containers/${containerId}/yard-slot`, {
        method: 'PATCH', body: JSON.stringify({ yardSlotId: yardSlotId || null }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to assign yard slot.');
    } finally {
      setAssigningSlot(null);
    }
  }

  async function handleAddContainer(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !check?.valid) return;
    setAddingContainer(true);
    try {
      await apiFetch(`/v1/seal/consignments/${id}/containers`, {
        method: 'POST',
        body: JSON.stringify({ containerNumber: newContainerNumber, containerSize: newContainerSize }),
      });
      setNewContainerNumber('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add container.');
    } finally {
      setAddingContainer(false);
    }
  }

  async function handleGateIn(containerId: string) {
    setGating(true);
    try {
      await apiFetch(`/v1/seal/containers/${containerId}/gate-in`, {
        method: 'POST',
        body: JSON.stringify({
          sealNumber: sealNumber.trim() || null,
          grossWeightKg: grossWeight ? Number(grossWeight) : null,
          tareWeightKg: tareWeight ? Number(tareWeight) : null,
        }),
      });
      setGateActionId(null); setSealNumber(''); setGrossWeight(''); setTareWeight('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Gate-in failed.');
    } finally {
      setGating(false);
    }
  }

  async function handleDevan(containerId: string) {
    setDevanning(true);
    try {
      const payload = {
        lines: tallyLines.map(l => ({
          description: l.description.trim(),
          hsCode: l.hsCode.trim() || null,
          qty: Number(l.qty) || 0,
          uom: l.uom.trim() || 'PCS',
          customsValue: Number(l.customsValue) || 0,
          currency: l.currency || 'USD',
          dutyAtRisk: l.dutyAtRisk ? Number(l.dutyAtRisk) : null,
          taxAtRisk: l.taxAtRisk ? Number(l.taxAtRisk) : null,
          discrepancy: l.discrepancy,
          discrepancyType: l.discrepancy ? l.discrepancyType : null,
        })),
      };
      const res = await apiFetch(`/v1/seal/containers/${containerId}/devan-tally`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDevanResults(res.results ?? []);
      setDevanActionId(null);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Devanning tally failed.');
    } finally {
      setDevanning(false);
    }
  }

  function updateLine(idx: number, patch: Partial<TallyLine>) {
    setTallyLines(lines => lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function handlePrintEir(c: Container) {
    if (!consignment) return;
    const footerHtml = getHudumikaFooterHtml('seal');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>EIR - ${c.container_number}</title>
      <style>body{font-family:sans-serif;padding:30px;font-size:13px;color:#0d1117;}
      .hdr{border-bottom:2px solid #e1e4e8;padding-bottom:12px;margin-bottom:20px;}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
      .box{background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:6px;}
      .label{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;}
      .val{font-size:13px;font-weight:700;margin-top:2px;}
      </style></head><body>
      <div class="hdr"><div style="font-size:20px;font-weight:800;">EQUIPMENT INTERCHANGE RECEIPT</div>
      <div style="font-size:12px;color:#64748b;">${c.eir_reference}</div></div>
      <div class="grid">
      <div class="box"><div class="label">Container Number</div><div class="val">${c.container_number}</div></div>
      <div class="box"><div class="label">Size</div><div class="val">${c.container_size}</div></div>
      <div class="box"><div class="label">Seal Number</div><div class="val">${c.seal_number ?? '—'}</div></div>
      <div class="box"><div class="label">Gate-In Time</div><div class="val">${c.gate_in_at ? new Date(c.gate_in_at).toLocaleString() : '—'}</div></div>
      <div class="box"><div class="label">Gross / Tare / Net (kg)</div><div class="val">${c.gross_weight_kg ?? '—'} / ${c.tare_weight_kg ?? '—'} / ${c.net_weight_kg ?? '—'}</div></div>
      <div class="box"><div class="label">Consignee</div><div class="val">${consignment.owner_name ?? '—'}</div></div>
      </div>${footerHtml}</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
  }

  if (loading || !consignment) return <div className="seal-page"><div className="seal-empty">Loading consignment data…</div></div>;

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Consignment']}
        titlePlain="Inbound"
        titleEm="consignment"
        subtitle="Pre-arrival through gate-in to devanning."
      />
      {/* Header */}
      <div className="seal-page-hdr">
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/seal/consignments')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} />
            <span>Back to Consignments</span>
          </button>
          <h1 className="seal-page-title">{consignment.transport_doc_type} {consignment.transport_doc_number ?? ''}</h1>
          <p className="seal-page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PersonAvatar userId={consignment.owner_id} kind="customers" name={consignment.owner_name ?? 'Unknown owner'} size={18} />
            {consignment.owner_name ?? 'Unknown owner'} · {consignment.goods_description ?? 'No description'}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[consignment.status] ?? 'brand'}>{consignment.status.replace(/_/g, ' ')}</Badge>
      </div>

      <div style={{ marginBottom: 20 }}>
        <SealDocumentPanel entityType="consignment" entityId={consignment.id} />
      </div>

      {/* Add Container Form Card */}
      <div className="seal-card" style={{ marginBottom: 20 }}>
        <div className="seal-card-hdr"><h2 className="seal-card-title">Add Container</h2></div>
        <form onSubmit={handleAddContainer} className="seal-form-row">
          <div className="seal-field-row" style={{ flex: '1 1 220px' }}>
            <label className="seal-field-label">Container Number</label>
            <input
              type="text"
              className="seal-input-control seal-mono"
              value={newContainerNumber}
              onChange={e => setNewContainerNumber(e.target.value.toUpperCase())}
              placeholder="MSCU1234567"
            />
            {check && (
              <span style={{ fontSize: 11.5, color: check.valid ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
                {check.valid ? `✓ Valid ISO 6346 — ${check.formatted}` : check.reason}
              </span>
            )}
          </div>

          <div className="seal-field-row" style={{ width: 140 }}>
            <label className="seal-field-label">Size</label>
            <Select value={newContainerSize} onValueChange={setNewContainerSize}>
              <SelectTrigger className="seal-input-control"><SelectValue /></SelectTrigger>
              <SelectContent>{CONTAINER_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ height: 38, padding: '0 20px', whiteSpace: 'nowrap' }}
            disabled={!check?.valid || addingContainer}
          >
            <Icon name="plus" size={14} />
            <span>{addingContainer ? 'Adding…' : 'Add Container'}</span>
          </button>
        </form>
      </div>

      {/* Container Cards List */}
      {consignment.containers.length === 0 ? (
        <div className="seal-card"><div className="seal-empty">No containers on this consignment yet.</div></div>
      ) : consignment.containers.map(c => (
        <div className="seal-card" key={c.id} style={{ marginBottom: 16 }}>
          <div className="seal-card-hdr">
            <div>
              <div className="seal-card-title seal-mono" style={{ fontSize: 16 }}>{c.container_number}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                {c.container_size}{c.seal_number ? ` · seal ${c.seal_number}` : ''}
              </div>
            </div>
            <Badge variant={c.gate_in_at ? 'success' : 'gray'}>
              {c.gate_in_at ? 'Gated In' : 'Awaiting Gate-In'}
            </Badge>
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!c.gate_in_at ? (
              gateActionId === c.id ? (
                <div className="seal-form-row">
                  <div className="seal-field-row" style={{ flex: '1 1 160px' }}>
                    <label className="seal-field-label">Seal Number</label>
                    <input type="text" className="seal-input-control" value={sealNumber} onChange={e => setSealNumber(e.target.value)} placeholder="SL482910" />
                  </div>
                  <div className="seal-field-row" style={{ flex: '1 1 120px' }}>
                    <label className="seal-field-label">Gross (kg)</label>
                    <input type="number" className="seal-input-control" value={grossWeight} onChange={e => setGrossWeight(e.target.value)} />
                  </div>
                  <div className="seal-field-row" style={{ flex: '1 1 120px' }}>
                    <label className="seal-field-label">Tare (kg)</label>
                    <input type="number" className="seal-input-control" value={tareWeight} onChange={e => setTareWeight(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-primary" style={{ height: 38 }} disabled={gating} onClick={() => handleGateIn(c.id)}>
                    <Icon name="truck" size={14} /><span>{gating ? 'Recording…' : 'Confirm Gate-In'}</span>
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ height: 38 }} onClick={() => setGateActionId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="button" className="btn btn-primary" onClick={() => setGateActionId(c.id)}>
                    <Icon name="truck" size={14} /><span>Gate In</span>
                  </button>
                </div>
              )
            ) : (
              <>
                {/* Gated-In Container Metadata & Action Bar */}
                <div className="seal-container-meta-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="scale" size={14} style={{ color: 'var(--teal)' }} />
                      Net {c.net_weight_kg ?? '—'} kg
                    </span>
                    <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>
                      Gated in {new Date(c.gate_in_at).toLocaleString()}
                    </span>
                    <Select value={c.yard_slot_id ?? '__none__'} onValueChange={v => handleAssignYardSlot(c.id, v === '__none__' ? '' : v)} disabled={assigningSlot === c.id}>
                      <SelectTrigger className="seal-input-control" style={{ width: 160, height: 32 }}><SelectValue placeholder="Yard slot…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {yardSlots.map(s => <SelectItem key={s.id} value={s.id}>{s.code} ({s.occupiedCount}/{s.capacityTeu})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {vehicles.length > 0 && (
                      <Select value={c.vehicle_id ?? '__none__'} onValueChange={v => handleAssignVehicle(c.id, v === '__none__' ? '' : v)} disabled={assigningVehicle === c.id}>
                        <SelectTrigger className="seal-input-control" style={{ width: 180, height: 32 }}><SelectValue placeholder="Vehicle (HuduFreight)…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}{v.plateNumber ? ` (${v.plateNumber})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {c.vehicle_id && (
                      <Link to={`/tracking/vehicles/${c.vehicle_id}`} className="btn btn-secondary" style={{ height: 32 }}>
                        <Icon name="mapPin" size={13} /><span>Track on Map</span>
                      </Link>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {c.eir_reference && (
                      <button type="button" className="btn btn-secondary" onClick={() => handlePrintEir(c)}>
                        <Icon name="printer" size={13} /><span>Print EIR ({c.eir_reference})</span>
                      </button>
                    )}
                    {devanActionId !== c.id && (
                      <button type="button" className="btn btn-primary" onClick={() => setDevanActionId(c.id)}>
                        <Icon name="package" size={14} /><span>Devan / Tally</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Devan Tally Form */}
                {devanActionId === c.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>
                      Tally Lines
                    </div>
                    {tallyLines.map((line, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: 12, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <input type="text" className="seal-input-control" style={{ flex: '2 1 180px' }} placeholder="Description" value={line.description} onChange={e => updateLine(i, { description: e.target.value })} />
                        {!line.discrepancy && (
                          <>
                            <input type="text" className="seal-input-control" style={{ flex: '1 1 90px' }} placeholder="HS code" value={line.hsCode} onChange={e => updateLine(i, { hsCode: e.target.value })} />
                            <input type="number" className="seal-input-control" style={{ flex: '1 1 80px' }} placeholder="Qty" value={line.qty} onChange={e => updateLine(i, { qty: e.target.value })} />
                            <input type="text" className="seal-input-control" style={{ flex: '1 1 70px' }} placeholder="UOM" value={line.uom} onChange={e => updateLine(i, { uom: e.target.value })} />
                            <input type="number" className="seal-input-control" style={{ flex: '1 1 100px' }} placeholder="Value ($)" value={line.customsValue} onChange={e => updateLine(i, { customsValue: e.target.value })} />
                          </>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink2)', cursor: 'pointer', height: 38 }}>
                          <input type="checkbox" checked={line.discrepancy} onChange={e => updateLine(i, { discrepancy: e.target.checked })} />
                          Discrepancy
                        </label>
                        {line.discrepancy && (
                          <Select value={line.discrepancyType} onValueChange={v => updateLine(i, { discrepancyType: v })}>
                            <SelectTrigger className="seal-input-control" style={{ width: 140 }}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['shortage', 'overage', 'damage', 'misdescription', 'weight_variance'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        <button type="button" className="btn btn-secondary" style={{ height: 38, width: 38, padding: 0, justifyContent: 'center' }} onClick={() => setTallyLines(lines => lines.filter((_, idx) => idx !== i))}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setTallyLines(lines => [...lines, emptyLine()])}>
                        <Icon name="plus" size={13} /><span>Add Line</span>
                      </button>
                      <button type="button" className="btn btn-primary" disabled={devanning} onClick={() => handleDevan(c.id)}>
                        <Icon name="check" size={14} /><span>{devanning ? 'Recording…' : 'Submit Tally'}</span>
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setDevanActionId(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Devan Results Summary */}
                {devanResults && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {devanResults.map((r, i) => r.kind === 'lot' ? (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Icon name="checkCircle" size={14} style={{ color: 'var(--green)' }} />
                        <Link to={`/seal/lots/${r.row.id}`} style={{ color: 'var(--seal)', fontWeight: 700 }}>{r.row.description}</Link>
                        <span style={{ color: 'var(--ink3)' }}>lot created</span>
                      </div>
                    ) : r.kind === 'discrepancy' ? (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Icon name="alertTriangle" size={14} style={{ color: 'var(--gold)' }} />
                        <span>{r.row.description} — discrepancy raised ({r.row.discrepancy_type})</span>
                      </div>
                    ) : (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--red)' }}>
                        <Icon name="alertTriangle" size={14} style={{ color: 'var(--red)' }} />
                        <span>{r.line}: {r.error?.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
