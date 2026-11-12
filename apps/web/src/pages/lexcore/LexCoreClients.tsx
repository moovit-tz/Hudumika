import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

const CLIENT_TYPES = ['individual', 'company', 'government', 'ngo'] as const;
const TYPE_V: Record<string, 'brand' | 'info' | 'warning' | 'gray'> = {
  individual: 'brand', company: 'info', government: 'warning', ngo: 'gray',
};

interface Client { id: string; name: string; client_type: string; email: string | null; phone: string | null; address: string | null; created_at: string; }

export function LexCoreClients() {
  const [rows, setRows] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('individual');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  function reload() {
    const p = new URLSearchParams();
    if (q.trim()) p.set('search', q.trim());
    apiFetch(`/v1/legal/clients?${p}`).then(d => { setRows(d.rows ?? []); setTotal(d.total ?? 0); }).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [q]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/legal/clients', { method: 'POST', body: JSON.stringify({ name: name.trim(), client_type: type, email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined }) });
      setOpen(false); setName(''); setEmail(''); setPhone(''); setAddress(''); setType('individual');
      reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Clients']}
        titlePlain="Legal"
        titleEm="clients"
        subtitle="Client directory with KYC/AML status, BRELA and TIN verification, risk scoring."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Client</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search clients…" activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No clients{q ? ' match your search' : ' yet'}.</div> : (
            <table className="lc-table">
              <thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>Added</th></tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><Badge variant={TYPE_V[c.client_type] ?? 'gray'}>{c.client_type}</Badge></td>
                    <td style={{ color: 'var(--ink2)' }}>{c.email || '—'}</td>
                    <td style={{ color: 'var(--ink2)' }}>{c.phone || '—'}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total > rows.length && <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--ink3)' }}>Showing {rows.length} of {total}</div>}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate}>
            <DialogBody>
              <div className="lc-form-grid">
                <div className="lc-field lc-field-full"><label>Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Client name" /></div>
                <div className="lc-field"><label>Type</label>
                  <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CLIENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="lc-field"><label>Email</label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" /></div>
                <div className="lc-field"><label>Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255…" /></div>
                <div className="lc-field lc-field-full"><label>Address</label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Physical address" /></div>
              </div>
            </DialogBody>
            <DialogFooter><Button type="submit" loading={saving} disabled={!name.trim()} loadingText="Saving…">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
