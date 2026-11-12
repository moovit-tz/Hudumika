import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Customer {
  id: string; name: string; email: string | null; phone: string | null; currency: string;
  credit_limit_minor: number | null; payment_terms_days: number | null;
}
interface Aircraft { id: string; registration: string; aircraft_type: string | null; msn: string | null; base: string | null }


export function GerejiAngaCustomers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [newReg, setNewReg] = useState('');
  const [newType, setNewType] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/customers').then(d => setRows(d.customers ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = q.trim() ? rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

  function resetForm() { setName(''); setEmail(''); setPhone(''); setCreditLimit(''); setPaymentTerms(''); }

  async function create() {
    if (!name.trim()) { showAlert('Enter the customer name.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined,
          credit_limit_minor: creditLimit ? Math.round(Number(creditLimit) * 100) : undefined,
          payment_terms_days: paymentTerms ? Number(paymentTerms) : undefined,
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create customer.'); }
    finally { setSaving(false); }
  }

  async function expand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setNewReg(''); setNewType('');
    const d = await apiFetch(`/v1/gereji/anga/customers/${id}/aircraft`).catch(() => ({ aircraft: [] }));
    setAircraft(d.aircraft ?? []);
  }

  async function addAircraft(customerId: string) {
    if (!newReg.trim()) { showAlert('Enter the tail registration.'); return; }
    try {
      await apiFetch(`/v1/gereji/anga/customers/${customerId}/aircraft`, {
        method: 'POST', body: JSON.stringify({ registration: newReg.trim(), aircraft_type: newType.trim() || undefined }),
      });
      const d = await apiFetch(`/v1/gereji/anga/customers/${customerId}/aircraft`);
      setAircraft(d.aircraft ?? []);
      setNewReg(''); setNewType('');
    } catch (e: any) { showAlert(e.message || 'Failed to add aircraft.'); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Customers"
        titleEm="& fleet"
        subtitle="Airline and operator customers — credit terms, escalation contacts and their aircraft."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Customer</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search customers..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No customers yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Name', 'Email', 'Phone', 'Currency', 'Credit Limit', 'Terms'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(c => (
                    <React.Fragment key={c.id}>
                      <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => expand(c.id)}>
                        <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{c.email ?? '—'}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{c.phone ?? '—'}</td>
                        <td style={TD}>{c.currency}</td>
                        <td style={TD}>{c.credit_limit_minor != null ? (c.credit_limit_minor / 100).toLocaleString() : '—'}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{c.payment_terms_days != null ? `${c.payment_terms_days}d` : '—'}</td>
                      </tr>
                      {expanded === c.id && (
                        <tr><td colSpan={6} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                          <div style={{ padding: '12px 24px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fleet</div>
                            {aircraft.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 12 }}>No aircraft on file.</div> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {aircraft.map(a => (
                                  <div key={a.id} style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12.5 }}>
                                    <strong>{a.registration}</strong>{a.aircraft_type ? ` — ${a.aircraft_type}` : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                              <Input placeholder="Registration (e.g. 5H-ZAC)" value={newReg} onChange={e => setNewReg(e.target.value)} style={{ maxWidth: 200 }} />
                              <Input placeholder="Type (optional)" value={newType} onChange={e => setNewType(e.target.value)} style={{ maxWidth: 200 }} />
                              <Button size="sm" onClick={() => addAircraft(c.id)}>Add aircraft</Button>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Name</label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Email</label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><label style={LABEL}>Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                <div><label style={LABEL}>Credit limit</label><Input type="number" min={0} value={creditLimit} onChange={e => setCreditLimit(e.target.value)} /></div>
                <div><label style={LABEL}>Payment terms (days)</label><Input type="number" min={0} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} /></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} loadingText="Creating…">Create customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
