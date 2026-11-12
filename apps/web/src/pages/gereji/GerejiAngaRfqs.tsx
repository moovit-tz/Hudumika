import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { CheckboxRow } from '../../components/ui/list-item-row.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Rfq {
  id: string; number: string; customer_id: string | null; source: string; status: string;
  aircraft_reg: string | null; aog_flag: boolean; created_at: string;
}
interface Customer { id: string; name: string }
interface DraftItem { pn_free_text: string; quantity: number }

const RFQ_BADGE: Record<string, 'gray' | 'info' | 'success' | 'error' | 'warning'> = {
  new: 'info', quoted: 'warning', won: 'success', lost: 'error', expired: 'gray',
};
const TRANSITIONS: Record<string, string[]> = {
  new: ['quoted', 'lost', 'expired'], quoted: ['won', 'lost', 'expired'], won: [], lost: [], expired: [],
};


export function GerejiAngaRfqs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Rfq[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [aircraftReg, setAircraftReg] = useState('');
  const [aogFlag, setAogFlag] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ pn_free_text: '', quantity: 1 }]);

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/rfqs').then(d => setRows(d.rfqs ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/anga/customers').then(d => setCustomers(d.customers ?? []));
  }, [reload]);

  const filtered = q.trim() ? rows.filter(r => r.number.toLowerCase().includes(q.toLowerCase()) || (r.aircraft_reg ?? '').toLowerCase().includes(q.toLowerCase())) : rows;

  function resetForm() { setCustomerId(''); setAircraftReg(''); setAogFlag(false); setNotes(''); setItems([{ pn_free_text: '', quantity: 1 }]); }

  async function create() {
    if (items.some(it => !it.pn_free_text.trim())) { showAlert('Every item needs a part number.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/rfqs', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId || undefined, aircraft_reg: aircraftReg.trim() || undefined, aog_flag: aogFlag,
          notes: notes.trim() || undefined, items: items.map(it => ({ pn_free_text: it.pn_free_text.trim(), quantity: it.quantity })),
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create RFQ.'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/gereji/anga/rfqs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="RFQ"
        titleEm="intake"
        subtitle="Incoming parts requests — from phone, email or the AOG desk."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New RFQ</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search RFQ number or tail registration..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No RFQs yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['RFQ #', 'Customer', 'Aircraft', 'Status', 'Received', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const customer = customers.find(c => c.id === r.customer_id);
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 600 }}>
                          {r.number} {r.aog_flag && <Badge variant="error" style={{ marginLeft: 6 }}>AOG</Badge>}
                        </td>
                        <td style={TD}>{customer?.name ?? '—'}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{r.aircraft_reg ?? '—'}</td>
                        <td style={TD}><Badge variant={RFQ_BADGE[r.status] ?? 'gray'}>{r.status}</Badge></td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/gereji/anga/quotes?rfq=${r.id}`)}><Icon name="fileText" size={14} /> Create quote</DropdownMenuItem>
                              {(TRANSITIONS[r.status] ?? []).map(s => (
                                <DropdownMenuItem key={s} onClick={() => transition(r.id, s)}>Mark {s}</DropdownMenuItem>
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
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New RFQ</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Customer</label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><label style={LABEL}>Aircraft registration</label><Input value={aircraftReg} onChange={e => setAircraftReg(e.target.value)} placeholder="e.g. 5H-CAS" /></div>
              </div>
              <CheckboxRow title="AOG — aircraft on ground, urgent" checked={aogFlag} onCheckedChange={setAogFlag} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={LABEL as React.CSSProperties}>Items</label>
                  <Button variant="ghost" size="sm" onClick={() => setItems(prev => [...prev, { pn_free_text: '', quantity: 1 }])}>
                    <Icon name="plus" size={12} /> Add item
                  </Button>
                </div>
                {items.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, marginBottom: 8 }}>
                    <Input placeholder="Part number" value={it.pn_free_text} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, pn_free_text: e.target.value } : x))} />
                    <Input type="number" min={1} value={it.quantity} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))} />
                    <Button variant="ghost" size="icon" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} disabled={items.length === 1}><Icon name="close" size={14} /></Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} loadingText="Creating…">Create RFQ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
