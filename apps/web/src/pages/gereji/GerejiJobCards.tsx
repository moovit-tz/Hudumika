import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface JobCard {
  id: string; work_id: string; vehicle_id: string; reported_fault: string;
  status: string; bay_number: string | null; technician_id: string | null;
  estimated_hours: number | null; created_at: string;
}
interface Vehicle { id: string; registration: string; make: string | null; model: string | null; customer_id: string | null }

const JC_BADGE: Record<string, 'info' | 'warning' | 'brand' | 'success' | 'gray'> = {
  received: 'info', diagnosing: 'warning', awaiting_parts: 'warning',
  in_progress: 'brand', quality_check: 'brand', ready: 'success', delivered: 'success',
};

// Mirrors JOB_CARD_TRANSITIONS in apps/api/src/routes/gereji-crud.routes.ts.
const TRANSITIONS: Record<string, string[]> = {
  received: ['diagnosing'], diagnosing: ['awaiting_parts', 'in_progress'], awaiting_parts: ['in_progress'],
  in_progress: ['quality_check'], quality_check: ['ready', 'in_progress'], ready: ['delivered'], delivered: [],
};

export function GerejiJobCards() {
  const [rows, setRows] = useState<JobCard[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [fault, setFault] = useState('');
  const [bay, setBay] = useState('');
  const [estHours, setEstHours] = useState('');
  const navigate = useNavigate();

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/job-cards').then(d => setRows(d.jobCards ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/vehicles').then(d => setVehicles(d.vehicles ?? []));
  }, [reload]);

  const filtered = q.trim()
    ? rows.filter(r => r.reported_fault.toLowerCase().includes(q.toLowerCase()) || r.vehicle_id.toLowerCase().includes(q.toLowerCase()))
    : rows;

  function resetForm() { setVehicleId(''); setFault(''); setBay(''); setEstHours(''); }

  async function create() {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) { showAlert('Select a vehicle.'); return; }
    if (!vehicle.customer_id) { showAlert('This vehicle has no customer on file — edit it under Vehicles first.'); return; }
    if (!fault.trim()) { showAlert('Describe the reported fault.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/job-cards', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicle.id, customer_id: vehicle.customer_id, reported_fault: fault.trim(),
          bay_number: bay.trim() || undefined, estimated_hours: estHours ? Number(estHours) : undefined,
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create job card.'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/gereji/job-cards/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function bill(id: string) {
    try {
      await apiFetch(`/v1/gereji/job-cards/${id}/bill`, { method: 'POST' });
      showAlert('Invoice created — view it in FinOps.', { variant: 'success' });
    } catch (e: any) { showAlert(e.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'Workshop']}
        titlePlain="Job"
        titleEm="cards"
        subtitle="Open and completed workshop jobs — diagnosis, labour, parts and customer sign-off."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Job Card</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search job cards..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {rows.length === 0 ? 'No job cards yet.' : 'No matches.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Vehicle', 'Reported Fault', 'Status', 'Bay', 'Est. Hours', 'Created', ''].map(h => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const veh = vehicles.find(v => v.id === r.vehicle_id);
                    const nextStatuses = TRANSITIONS[r.status] ?? [];
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--ink)' }}>{veh ? veh.registration : r.vehicle_id.slice(0, 8)}</td>
                        <td style={{ padding: '12px 18px', color: 'var(--ink)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reported_fault}</td>
                        <td style={{ padding: '12px 18px' }}><Badge variant={JC_BADGE[r.status] ?? 'gray'}>{r.status.replace(/_/g, ' ')}</Badge></td>
                        <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.bay_number ?? '—'}</td>
                        <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.estimated_hours ?? '—'}</td>
                        <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {nextStatuses.map(s => (
                                <DropdownMenuItem key={s} onClick={() => transition(r.id, s)}>Move to {s.replace(/_/g, ' ')}</DropdownMenuItem>
                              ))}
                              {r.status === 'ready' && <DropdownMenuItem onClick={() => bill(r.id)}><Icon name="invoice" size={14} /> Bill this job</DropdownMenuItem>}
                              <DropdownMenuItem onClick={() => navigate('/finops/journal')}><Icon name="invoice" size={14} /> View costs in FinOps</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate('/inventory')}><Icon name="package" size={14} /> Issue parts from Inventory</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate('/gereji/estimates')}><Icon name="fileText" size={14} /> Back to Estimates</DropdownMenuItem>
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

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New job card</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Vehicle</label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.registration} {v.make ? `— ${v.make} ${v.model ?? ''}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Reported fault</label>
                <Input value={fault} onChange={e => setFault(e.target.value)} placeholder="e.g. Brakes squeaking" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Bay</label>
                  <Input value={bay} onChange={e => setBay(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Est. hours</label>
                  <Input type="number" value={estHours} onChange={e => setEstHours(e.target.value)} />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} loadingText="Creating…">Create job card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
