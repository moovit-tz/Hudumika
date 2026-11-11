import { useEffect, useState, useCallback } from 'react';
import { TH, TD } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Claim {
  id: string; claim_number: string; vehicle_id: string; job_card_id: string | null;
  claim_type: string; status: string; description: string;
  claimed_amount: number; approved_amount: number | null; currency: string;
  supplier_name: string | null; warranty_start: string | null; warranty_end: string | null;
  created_at: string;
}
interface Vehicle { id: string; registration: string; make: string | null; model: string | null }

const WC_BADGE: Record<string, 'info' | 'warning' | 'success' | 'brand' | 'error' | 'gray'> = {
  submitted: 'info', under_review: 'warning', approved: 'success',
  partially_approved: 'brand', rejected: 'error', settled: 'gray',
};


export function GerejiWarranty() {
  const [rows, setRows] = useState<Claim[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [vehicleId, setVehicleId] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [claimType, setClaimType] = useState('both');
  const [supplierName, setSupplierName] = useState('');
  const [wStart, setWStart] = useState('');
  const [wEnd, setWEnd] = useState('');

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/warranty').then(d => setRows(d.claims ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/vehicles').then(d => setVehicles(d.vehicles ?? []));
  }, [reload]);

  function resetForm() { setVehicleId(''); setDesc(''); setAmount(''); setClaimType('both'); setSupplierName(''); setWStart(''); setWEnd(''); }

  async function handleCreate() {
    if (!vehicleId) { showAlert('Select a vehicle.'); return; }
    if (!desc.trim()) { showAlert('Description is required.'); return; }
    if (!amount || Number(amount) <= 0) { showAlert('Enter a valid claimed amount.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/warranty', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId,
          description: desc.trim(),
          claimed_amount: Number(amount),
          claim_type: claimType,
          supplier_name: supplierName || undefined,
          warranty_start: wStart || undefined,
          warranty_end: wEnd || undefined,
        }),
      });
      setShowNew(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create claim.'); }
    finally { setSaving(false); }
  }

  async function review(id: string, status: string, approvedAmount?: number) {
    try {
      await apiFetch(`/v1/gereji/warranty/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(approvedAmount !== undefined ? { approved_amount: approvedAmount } : {}) }),
      });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  const filtered = q.trim()
    ? rows.filter(r => r.claim_number.toLowerCase().includes(q.toLowerCase()) || r.description.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'After-Sales']}
        titlePlain="Warranty"
        titleEm="claims"
        subtitle="Parts and labour warranty tracking — claims, approvals and supplier recovery."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Claim</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search claims..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {rows.length === 0 ? 'No warranty claims yet.' : 'No matches.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Claim #', 'Vehicle', 'Description', 'Type', 'Status', 'Claimed', 'Approved', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const veh = vehicles.find(v => v.id === r.vehicle_id);
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 600 }}>{r.claim_number}</td>
                        <td style={TD}>{veh ? veh.registration : r.vehicle_id.slice(0, 8)}</td>
                        <td style={{ ...TD, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                        <td style={TD}><Badge variant="gray">{r.claim_type}</Badge></td>
                        <td style={TD}><Badge variant={WC_BADGE[r.status] ?? 'gray'}>{r.status.replace(/_/g, ' ')}</Badge></td>
                        <td style={TD}>{Number(r.claimed_amount).toLocaleString()}</td>
                        <td style={TD}>{r.approved_amount != null ? Number(r.approved_amount).toLocaleString() : '—'}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.status === 'submitted' && <DropdownMenuItem onClick={() => review(r.id, 'under_review')}>Start review</DropdownMenuItem>}
                              {r.status === 'under_review' && <DropdownMenuItem onClick={() => review(r.id, 'approved', r.claimed_amount)}>Approve (full)</DropdownMenuItem>}
                              {r.status === 'under_review' && <DropdownMenuItem onClick={() => review(r.id, 'partially_approved', Math.round(r.claimed_amount * 0.5))}>Partially approve</DropdownMenuItem>}
                              {r.status === 'under_review' && <DropdownMenuItem onClick={() => review(r.id, 'rejected')}>Reject</DropdownMenuItem>}
                              {['approved', 'partially_approved'].includes(r.status) && <DropdownMenuItem onClick={() => review(r.id, 'settled')}>Mark settled</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── New Warranty Claim Dialog ── */}
      <Dialog open={showNew} onOpenChange={v => { if (!v) { setShowNew(false); resetForm(); } }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New Warranty Claim</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Vehicle</label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.registration} {v.make ? `— ${v.make}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Description</label>
                <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the warranty issue..." rows={3} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Claimed Amount</label>
                  <Input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Claim Type</label>
                  <Select value={claimType} onValueChange={setClaimType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="parts">Parts</SelectItem>
                      <SelectItem value="labour">Labour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Supplier Name</label>
                <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Optional" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Warranty Start</label>
                  <Input type="date" value={wStart} onChange={e => setWStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Warranty End</label>
                  <Input type="date" value={wEnd} onChange={e => setWEnd(e.target.value)} />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Submitting...' : 'Submit Claim'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
