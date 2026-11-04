import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const RISK_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  LOW: 'success', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'error',
};

export function NgaoVendors() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [riskLevel, setRiskLevel] = useState<string>('LOW');
  const [hasDpa, setHasDpa] = useState(false);

  function reload() {
    apiFetch('/v1/ngao/vendors').then(d => setRows(d.vendors ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/ngao/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          contact_name: contactName || undefined,
          contact_email: contactEmail || undefined,
          website: website || undefined,
          risk_level: riskLevel,
          has_dpa: hasDpa,
        }),
      });
      setName(''); setContactName(''); setContactEmail(''); setWebsite('');
      setRiskLevel('LOW'); setHasDpa(false); setShowNew(false); reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Third Parties']}
        titlePlain="Vendor"
        titleEm="oversight"
        subtitle="Data processor inventory — DPA status, risk assessment and service-level tracking."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> Add Vendor</Button>}
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Name</th><th>Contact</th><th>Email</th><th>Risk Level</th><th>DPA</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.contact_name ?? '—'}</td>
                  <td>{r.contact_email ?? '—'}</td>
                  <td>{r.risk_level ? <Badge variant={RISK_VARIANT[r.risk_level] ?? 'gray'}>{r.risk_level}</Badge> : '—'}</td>
                  <td>{r.has_dpa ? <Icon name="check" size={14} style={{ color: 'var(--green)' }} /> : '—'}</td>
                  <td><Badge variant={r.status === 'ACTIVE' ? 'success' : r.status === 'INACTIVE' ? 'gray' : 'info'}>{r.status ?? 'Active'}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No vendors yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent size="md">
          <form onSubmit={handleCreate}>
            <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input placeholder="Vendor name" value={name} onChange={e => setName(e.target.value)} required />
                <Input placeholder="Contact person" value={contactName} onChange={e => setContactName(e.target.value)} />
                <Input placeholder="Contact email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                <Input placeholder="Website URL" value={website} onChange={e => setWebsite(e.target.value)} />
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Checkbox checked={hasDpa} onCheckedChange={v => setHasDpa(!!v)} /> Data Processing Agreement signed
                </label>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Adding…' : 'Add Vendor'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
