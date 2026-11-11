import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Supplier { id: string; name: string; contact_email: string | null; contact_phone: string | null; approval_status: string; approval_scope: string | null }
interface Certification { id: string; type: string; reference: string | null; expiry: string | null }

const APPROVAL_BADGE: Record<string, 'gray' | 'success' | 'warning' | 'error'> = {
  pending: 'gray', approved: 'success', suspended: 'warning', rejected: 'error',
};
const TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected'], approved: ['suspended'], suspended: ['approved', 'rejected'], rejected: [],
};


export function GerejiAngaSuppliers() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [certType, setCertType] = useState('');
  const [certRef, setCertRef] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/suppliers').then(d => setRows(d.suppliers ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = q.trim() ? rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

  function resetForm() { setName(''); setEmail(''); setPhone(''); }

  async function create() {
    if (!name.trim()) { showAlert('Enter the supplier name.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/suppliers', { method: 'POST', body: JSON.stringify({ name: name.trim(), contact_email: email.trim() || undefined, contact_phone: phone.trim() || undefined }) });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create supplier.'); }
    finally { setSaving(false); }
  }

  async function setApproval(id: string, approval_status: string) {
    try {
      await apiFetch(`/v1/gereji/anga/suppliers/${id}/approval`, { method: 'PATCH', body: JSON.stringify({ approval_status }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function expand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setCertType(''); setCertRef('');
    const d = await apiFetch(`/v1/gereji/anga/suppliers/${id}/certifications`).catch(() => ({ certifications: [] }));
    setCerts(d.certifications ?? []);
  }

  async function addCert(supplierId: string) {
    if (!certType.trim()) { showAlert('Enter the certification type.'); return; }
    try {
      await apiFetch(`/v1/gereji/anga/suppliers/${supplierId}/certifications`, { method: 'POST', body: JSON.stringify({ type: certType.trim(), reference: certRef.trim() || undefined }) });
      const d = await apiFetch(`/v1/gereji/anga/suppliers/${supplierId}/certifications`);
      setCerts(d.certifications ?? []);
      setCertType(''); setCertRef('');
    } catch (e: any) { showAlert(e.message || 'Failed to add certification.'); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Approved"
        titleEm="vendors"
        subtitle="Supplier approvals and the certifications backing the Approved Vendor List."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Supplier</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search suppliers..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No suppliers yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Name', 'Contact', 'Status', 'Scope', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(s => (
                    <React.Fragment key={s.id}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 600, cursor: 'pointer' }} onClick={() => expand(s.id)}>{s.name}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{s.contact_email ?? s.contact_phone ?? '—'}</td>
                        <td style={TD}><Badge variant={APPROVAL_BADGE[s.approval_status] ?? 'gray'}>{s.approval_status}</Badge></td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{s.approval_scope ?? '—'}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {(TRANSITIONS[s.approval_status] ?? []).map(status => (
                                <DropdownMenuItem key={status} onClick={() => setApproval(s.id, status)}>Mark {status}</DropdownMenuItem>
                              ))}
                              <DropdownMenuItem onClick={() => expand(s.id)}>Certifications</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                      {expanded === s.id && (
                        <tr><td colSpan={5} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                          <div style={{ padding: '12px 24px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Certifications</div>
                            {certs.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 12 }}>None on file.</div> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {certs.map(c => (
                                  <div key={c.id} style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12.5 }}>
                                    <strong>{c.type}</strong>{c.reference ? ` — ${c.reference}` : ''}{c.expiry ? ` (exp. ${formatDate(c.expiry)})` : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Input placeholder="Type (e.g. ISO 9001)" value={certType} onChange={e => setCertType(e.target.value)} style={{ maxWidth: 200 }} />
                              <Input placeholder="Reference (optional)" value={certRef} onChange={e => setCertRef(e.target.value)} style={{ maxWidth: 200 }} />
                              <Button size="sm" onClick={() => addCert(s.id)}>Add certification</Button>
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
          <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Name</label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Contact email</label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><label style={LABEL}>Contact phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating...' : 'Create supplier'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
