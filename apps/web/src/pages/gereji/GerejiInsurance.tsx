import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Policy {
  id: string; policy_number: string; holder_name: string; coverage_start: string; coverage_end: string;
  sum_insured: number; premium_amount: number; currency: string; status: string; created_at: string;
}
interface Claim {
  id: string; policy_id: string; claim_number: string; incident_date: string; description: string;
  claim_amount: number; approved_amount: number | null; status: string; created_at: string;
}
interface Vehicle { id: string; registration: string; make: string | null; customer_id: string | null }

const POLICY_BADGE: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'brand'> = {
  draft: 'gray', active: 'success', lapsed: 'warning', cancelled: 'error', expired: 'error', claimed: 'brand',
};
const CLAIM_BADGE: Record<string, 'info' | 'warning' | 'success' | 'error' | 'gray'> = {
  reported: 'info', investigating: 'warning', approved: 'success', denied: 'error', settled: 'gray', closed: 'gray',
};
const CLAIM_TRANSITIONS: Record<string, string[]> = {
  reported: ['investigating', 'denied'], investigating: ['approved', 'denied'],
  approved: ['settled'], denied: ['closed'], settled: ['closed'], closed: [],
};


export function GerejiInsurance() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState('');
  const [customer, setCustomer] = useState<PickerItem | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [coverageStart, setCoverageStart] = useState('');
  const [coverageEnd, setCoverageEnd] = useState('');
  const [sumInsured, setSumInsured] = useState('');
  const [premium, setPremium] = useState('');

  const [claimPolicyId, setClaimPolicyId] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [claimDesc, setClaimDesc] = useState('');
  const [claimAmount, setClaimAmount] = useState('');

  const reload = useCallback(() => {
    Promise.all([
      apiFetch('/v1/gereji/insurance/policies').then(d => setPolicies(d.policies ?? [])),
      apiFetch('/v1/gereji/insurance/claims').then(d => setClaims(d.claims ?? [])),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/vehicles').then(d => setVehicles(d.vehicles ?? []));
  }, [reload]);

  async function searchCustomers(query: string): Promise<PickerItem[]> {
    const qs = query.trim() ? `?search=${encodeURIComponent(query.trim())}&active=true` : '?active=true';
    const res = await apiFetch(`/v1/customers${qs}`).catch(() => ({ data: [] }));
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    return list.slice(0, 25).map(c => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined, avatarUserId: c.id, avatarKind: 'customers' as const, avatarType: 'company' as const }));
  }

  function resetPolicyForm() {
    setVehicleId(''); setCustomer(null); setPolicyNumber(''); setHolderName('');
    setCoverageStart(''); setCoverageEnd(''); setSumInsured(''); setPremium('');
  }
  function resetClaimForm() { setClaimPolicyId(''); setIncidentDate(''); setClaimDesc(''); setClaimAmount(''); }

  async function createPolicy() {
    if (!vehicleId) { showAlert('Select a vehicle.'); return; }
    if (!customer) { showAlert('Select the policy holder (customer).'); return; }
    if (!policyNumber.trim() || !holderName.trim() || !coverageStart || !coverageEnd) { showAlert('Fill in the policy number, holder name and coverage dates.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/insurance/policies', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId, customer_id: customer.id, policy_number: policyNumber.trim(),
          holder_name: holderName.trim(), coverage_start: coverageStart, coverage_end: coverageEnd,
          sum_insured: Number(sumInsured) || 0, premium_amount: Number(premium) || 0,
        }),
      });
      setShowNewPolicy(false);
      resetPolicyForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create policy.'); }
    finally { setSaving(false); }
  }

  async function createClaim() {
    if (!claimPolicyId) { showAlert('Select a policy.'); return; }
    if (!incidentDate) { showAlert('Enter the incident date.'); return; }
    if (!claimDesc.trim()) { showAlert('Describe the incident.'); return; }
    if (!claimAmount || Number(claimAmount) <= 0) { showAlert('Enter a valid claim amount.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/insurance/claims', {
        method: 'POST',
        body: JSON.stringify({ policy_id: claimPolicyId, incident_date: incidentDate, description: claimDesc.trim(), claim_amount: Number(claimAmount) }),
      });
      setShowNewClaim(false);
      resetClaimForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create claim.'); }
    finally { setSaving(false); }
  }

  async function reviewClaim(id: string, status: string, approvedAmount?: number) {
    try {
      await apiFetch(`/v1/gereji/insurance/claims/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(approvedAmount !== undefined ? { approved_amount: approvedAmount } : {}) }),
      });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'After-Sales']}
        titlePlain="Motor"
        titleEm="insurance"
        subtitle="Vehicle insurance policies and claims — coverage, premiums and settlement tracking."
        actions={<Button onClick={() => setShowNewPolicy(true)}><Icon name="plus" size={14} /> New Policy</Button>}
      />

      {loading ? <SectionLoading /> : (
        <>
          <SectionCard title="Policies">
            {policies.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No policies yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>{['Policy #', 'Holder', 'Coverage', 'Sum Insured', 'Premium', 'Status', 'Created'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {policies.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 600 }}>{p.policy_number}</td>
                        <td style={TD}>{p.holder_name}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(p.coverage_start)} – {formatDate(p.coverage_end)}</td>
                        <td style={TD}>{Number(p.sum_insured).toLocaleString()} {p.currency}</td>
                        <td style={TD}>{Number(p.premium_amount).toLocaleString()} {p.currency}</td>
                        <td style={TD}><Badge variant={POLICY_BADGE[p.status] ?? 'gray'}>{p.status}</Badge></td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Claims" action={<Button variant="outline" size="sm" onClick={() => setShowNewClaim(true)}><Icon name="plus" size={14} /> New Claim</Button>}>
            {claims.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No claims yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>{['Claim #', 'Policy', 'Incident', 'Description', 'Claimed', 'Approved', 'Status', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {claims.map(c => {
                      const policy = policies.find(p => p.id === c.policy_id);
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ ...TD, fontWeight: 600 }}>{c.claim_number}</td>
                          <td style={TD}>{policy?.policy_number ?? c.policy_id.slice(0, 8)}</td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(c.incident_date)}</td>
                          <td style={{ ...TD, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</td>
                          <td style={TD}>{Number(c.claim_amount).toLocaleString()}</td>
                          <td style={TD}>{c.approved_amount != null ? Number(c.approved_amount).toLocaleString() : '—'}</td>
                          <td style={TD}><Badge variant={CLAIM_BADGE[c.status] ?? 'gray'}>{c.status}</Badge></td>
                          <td style={{ ...TD, textAlign: 'right' }}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(CLAIM_TRANSITIONS[c.status] ?? []).map(s => (
                                  <DropdownMenuItem key={s} onClick={() => reviewClaim(c.id, s, s === 'approved' ? c.claim_amount : undefined)}>
                                    {s === 'approved' ? 'Approve (full)' : `Mark ${s}`}
                                  </DropdownMenuItem>
                                ))}
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
        </>
      )}

      <Dialog open={showNewPolicy} onOpenChange={v => { setShowNewPolicy(v); if (!v) resetPolicyForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New insurance policy</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Vehicle</label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.registration} {v.make ? `— ${v.make}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <EntityPicker label="Policy holder (customer)" value={customer} onChange={setCustomer} search={searchCustomers} entityType="customer" placeholder="Search customers..." />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Policy number</label><Input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} /></div>
                <div><label style={LABEL}>Holder name</label><Input value={holderName} onChange={e => setHolderName(e.target.value)} /></div>
                <div><label style={LABEL}>Coverage start</label><Input type="date" value={coverageStart} onChange={e => setCoverageStart(e.target.value)} /></div>
                <div><label style={LABEL}>Coverage end</label><Input type="date" value={coverageEnd} onChange={e => setCoverageEnd(e.target.value)} /></div>
                <div><label style={LABEL}>Sum insured</label><Input type="number" min={0} value={sumInsured} onChange={e => setSumInsured(e.target.value)} /></div>
                <div><label style={LABEL}>Premium</label><Input type="number" min={0} value={premium} onChange={e => setPremium(e.target.value)} /></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPolicy(false)}>Cancel</Button>
            <Button onClick={createPolicy} disabled={saving}>{saving ? 'Creating...' : 'Create policy'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewClaim} onOpenChange={v => { setShowNewClaim(v); if (!v) resetClaimForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New insurance claim</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Policy</label>
                <Select value={claimPolicyId} onValueChange={setClaimPolicyId}>
                  <SelectTrigger><SelectValue placeholder="Select policy" /></SelectTrigger>
                  <SelectContent>{policies.map(p => <SelectItem key={p.id} value={p.id}>{p.policy_number} — {p.holder_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label style={LABEL}>Incident date</label><Input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} /></div>
              <div><label style={LABEL}>Description</label><Input value={claimDesc} onChange={e => setClaimDesc(e.target.value)} placeholder="What happened" /></div>
              <div><label style={LABEL}>Claim amount</label><Input type="number" min={0} value={claimAmount} onChange={e => setClaimAmount(e.target.value)} /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClaim(false)}>Cancel</Button>
            <Button onClick={createClaim} disabled={saving}>{saving ? 'Submitting...' : 'Submit claim'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
