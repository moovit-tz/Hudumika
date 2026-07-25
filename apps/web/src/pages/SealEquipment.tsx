import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface Equipment {
  id: string; compartmentId: string; equipmentType: string; assetTag: string; name: string;
  status: 'operational' | 'under_maintenance' | 'out_of_service' | 'retired';
  condition: 'good' | 'fair' | 'poor';
  lastServiceDate: string | null; nextServiceDueDate: string | null; notes: string | null;
  compartmentName?: string; daysUntilServiceDue: number | null;
  alert: 'out_of_service' | 'overdue' | 'due_soon' | null;
}
interface MaintenanceRecord {
  id: string; maintenanceType: string; performedAt: string; performedBy: string | null;
  description: string | null; cost: number | null; nextDueDate: string | null;
}
interface Compartment { id: string; code: string; name: string; }

const EQUIPMENT_TYPES = ['forklift', 'pallet_jack', 'reach_truck', 'scanner', 'racking', 'conveyor', 'reefer_unit', 'generator', 'hvac', 'scale', 'other'];
const STATUS_VARIANT: Record<Equipment['status'], 'success' | 'warning' | 'error' | 'gray'> = {
  operational: 'success', under_maintenance: 'warning', out_of_service: 'error', retired: 'gray',
};
const CONDITION_VARIANT: Record<Equipment['condition'], 'success' | 'warning' | 'error'> = {
  good: 'success', fair: 'warning', poor: 'error',
};

export function SealEquipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);

  const [newType, setNewType] = useState('forklift');
  const [newAssetTag, setNewAssetTag] = useState('');
  const [newName, setNewName] = useState('');
  const [newCompartmentId, setNewCompartmentId] = useState('');

  const [logType, setLogType] = useState('inspection');
  const [logDesc, setLogDesc] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logNextDue, setLogNextDue] = useState<Date | undefined>(undefined);

  function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/equipment?${params.toString()}`).then(setEquipment).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [compartmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiFetch('/v1/seal/compartments').then(rows => { setCompartments(rows); if (rows.length === 1) setNewCompartmentId(rows[0].id); }); }, []);
  useEffect(() => { if (compartmentId) setNewCompartmentId(compartmentId); }, [compartmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCompartmentId || !newAssetTag.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/equipment', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: newCompartmentId, equipmentType: newType, assetTag: newAssetTag.trim(), name: newName.trim() }),
      });
      setNewAssetTag(''); setNewName(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add this equipment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExpand(item: Equipment) {
    if (expanded === item.id) { setExpanded(null); return; }
    setExpanded(item.id);
    setLoadingRecords(true);
    try {
      const rows = await apiFetch(`/v1/seal/equipment/${item.id}/maintenance`);
      setRecords(rows);
    } finally {
      setLoadingRecords(false);
    }
  }

  async function handleLog(equipmentId: string) {
    setSaving(true);
    try {
      await apiFetch(`/v1/seal/equipment/${equipmentId}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({
          maintenanceType: logType, description: logDesc.trim() || null,
          cost: logCost ? Number(logCost) : null, nextDueDate: logNextDue ? toDateOnlyString(logNextDue) : null,
          resultingStatus: 'operational',
        }),
      });
      setLogging(null); setLogDesc(''); setLogCost(''); setLogNextDue(undefined);
      reload();
      const rows = await apiFetch(`/v1/seal/equipment/${equipmentId}/maintenance`);
      setRecords(rows);
    } catch (err: any) {
      showAlert(err.message || 'Failed to log this maintenance event.');
    } finally {
      setSaving(false);
    }
  }

  const alertCount = equipment.filter(e => e.alert).length;

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Equipment &amp; Tools</h1>
          <p className="seal-page-sub">Forklifts, scanners, racking hardware and plant — maintenance history, condition, and due-for-service alerts.</p>
        </div>
        <button type="button" className="seal-btn-primary" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>Add Equipment</span>
        </button>
      </div>

      <div className="seal-kpi-strip">
        <div className="seal-kpi-card">
          <div className="seal-kpi-value">{equipment.length}</div>
          <div className="seal-kpi-label">Total Equipment</div>
        </div>
        <div className="seal-kpi-card">
          <div className="seal-kpi-value">{equipment.filter(e => e.status === 'operational').length}</div>
          <div className="seal-kpi-label">Operational</div>
        </div>
        <div className="seal-kpi-card">
          <div className={`seal-kpi-value${alertCount > 0 ? ' seal-kpi-value--alert' : ''}`}>{alertCount}</div>
          <div className="seal-kpi-label">Needs Attention</div>
        </div>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="seal-field-row" style={{ width: 180 }}>
              <label className="seal-field-label">Compartment</label>
              <Select value={newCompartmentId} onValueChange={setNewCompartmentId}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Choose a compartment" /></SelectTrigger>
                <SelectContent>{compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row" style={{ width: 160 }}>
              <label className="seal-field-label">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{EQUIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row" style={{ width: 140 }}>
              <label className="seal-field-label">Asset Tag</label>
              <input type="text" className="input-field" value={newAssetTag} onChange={e => setNewAssetTag(e.target.value)} placeholder="FLT-001" />
            </div>
            <div className="seal-field-row" style={{ width: 220, flex: 1 }}>
              <label className="seal-field-label">Name</label>
              <input type="text" className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Toyota 2.5T Diesel Forklift" />
            </div>
            <button type="submit" className="seal-btn-primary" disabled={saving || !newCompartmentId || !newAssetTag.trim() || !newName.trim()}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : equipment.length === 0 ? (
            <div className="seal-empty">No equipment recorded yet.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr><th>Asset</th><th>Type</th><th>Compartment</th><th>Status</th><th>Condition</th><th>Next Service</th><th></th></tr>
              </thead>
              <tbody>
                {equipment.map(item => (
                  <React.Fragment key={item.id}>
                    <tr onClick={() => handleExpand(item)}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
                        <div className="seal-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{item.assetTag}</div>
                      </td>
                      <td>{item.equipmentType.replace(/_/g, ' ')}</td>
                      <td>{item.compartmentName ?? '—'}</td>
                      <td><Badge variant={STATUS_VARIANT[item.status]}>{item.status.replace(/_/g, ' ')}</Badge></td>
                      <td><Badge variant={CONDITION_VARIANT[item.condition]}>{item.condition}</Badge></td>
                      <td>
                        {item.alert === 'overdue' ? (
                          <Badge variant="error">Overdue{item.daysUntilServiceDue != null ? ` (${Math.abs(item.daysUntilServiceDue)}d)` : ''}</Badge>
                        ) : item.alert === 'due_soon' ? (
                          <Badge variant="warning">Due in {item.daysUntilServiceDue}d</Badge>
                        ) : item.nextServiceDueDate ? (
                          new Date(item.nextServiceDueDate).toLocaleDateString()
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>—</span>
                        )}
                      </td>
                      <td><Icon name={expanded === item.id ? 'chevronUp' : 'chevronDown'} size={14} /></td>
                    </tr>
                    {expanded === item.id && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--bg)', padding: 16 }}>
                          {loadingRecords ? (
                            <div className="seal-empty">Loading history…</div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                                {records.length === 0 ? (
                                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No maintenance logged yet.</div>
                                ) : records.map(r => (
                                  <div key={r.id} style={{ fontSize: 12.5, padding: '8px 10px', background: 'var(--white)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    <strong>{r.maintenanceType}</strong> — {new Date(r.performedAt).toLocaleDateString()}
                                    {r.performedBy && <> · {r.performedBy}</>}
                                    {r.cost != null && <> · {r.cost.toLocaleString()}</>}
                                    {r.description && <div style={{ color: 'var(--ink3)', marginTop: 2 }}>{r.description}</div>}
                                  </div>
                                ))}
                              </div>
                              {logging === item.id ? (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                  <div className="seal-field-row" style={{ width: 140 }}>
                                    <label className="seal-field-label">Type</label>
                                    <Select value={logType} onValueChange={setLogType}>
                                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="inspection">Inspection</SelectItem>
                                        <SelectItem value="repair">Repair</SelectItem>
                                        <SelectItem value="service">Service</SelectItem>
                                        <SelectItem value="calibration">Calibration</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="seal-field-row" style={{ width: 220 }}>
                                    <label className="seal-field-label">Description</label>
                                    <input type="text" className="input-field" value={logDesc} onChange={e => setLogDesc(e.target.value)} />
                                  </div>
                                  <div className="seal-field-row" style={{ width: 100 }}>
                                    <label className="seal-field-label">Cost</label>
                                    <input type="number" min="0" step="any" className="input-field" value={logCost} onChange={e => setLogCost(e.target.value)} />
                                  </div>
                                  <div className="seal-field-row" style={{ width: 150 }}>
                                    <label className="seal-field-label">Next Due</label>
                                    <DatePicker date={logNextDue} onChange={setLogNextDue} />
                                  </div>
                                  <button type="button" className="seal-btn-primary" disabled={saving} onClick={() => handleLog(item.id)}>{saving ? 'Saving…' : 'Log It'}</button>
                                  <button type="button" className="seal-btn-secondary" onClick={() => setLogging(null)}>Cancel</button>
                                </div>
                              ) : (
                                <button type="button" className="seal-btn-secondary" onClick={e => { e.stopPropagation(); setLogging(item.id); }}>
                                  <Icon name="plus" size={13} /><span>Log Maintenance</span>
                                </button>
                              )}
                            </>
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
