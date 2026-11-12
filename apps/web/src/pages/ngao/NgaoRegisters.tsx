import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';

const LAWFUL_BASES = ['CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS'] as const;
const BASIS_VARIANT: Record<string, 'brand' | 'info' | 'success' | 'warning' | 'gray'> = {
  CONSENT: 'success', CONTRACT: 'brand', LEGAL_OBLIGATION: 'info',
  VITAL_INTERESTS: 'warning', PUBLIC_TASK: 'gray', LEGITIMATE_INTERESTS: 'brand',
};

export function NgaoRegisters() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [basis, setBasis] = useState<string>('CONSENT');
  const [retention, setRetention] = useState('');
  const [automated, setAutomated] = useState(false);
  const [dpiaReq, setDpiaReq] = useState(false);

  function reload() {
    apiFetch('/v1/ngao/registers').then(d => setRows(d.activities ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !purpose.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/ngao/registers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), purpose: purpose.trim(), lawful_basis: basis,
          retention_days: retention ? Number(retention) : undefined,
          is_automated: automated, dpia_required: dpiaReq,
        }),
      });
      setName(''); setPurpose(''); setBasis('CONSENT'); setRetention(''); setAutomated(false); setDpiaReq(false);
      setShowNew(false); reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Registers']}
        titlePlain="Processing"
        titleEm="registers"
        subtitle="Article 30 records of processing activities — purposes, categories, retention and transfers."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Activity</Button>}
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Name</th><th>Purpose</th><th>Lawful Basis</th><th>Retention (days)</th><th>Automated</th><th>DPIA Req.</th><th>Created</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.purpose}</td>
                  <td><Badge variant={BASIS_VARIANT[r.lawful_basis] ?? 'gray'}>{r.lawful_basis?.replace('_', ' ')}</Badge></td>
                  <td>{r.retention_days ?? '—'}</td>
                  <td>{r.is_automated ? <Icon name="check" size={14} style={{ color: 'var(--green)' }} /> : '—'}</td>
                  <td>{r.dpia_required ? <Icon name="alertTriangle" size={14} style={{ color: 'var(--gold)' }} /> : '—'}</td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No processing activities yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent size="md">
          <form onSubmit={handleCreate}>
            <DialogHeader><DialogTitle>New Processing Activity</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input placeholder="Activity name" value={name} onChange={e => setName(e.target.value)} required />
                <Textarea placeholder="Purpose of processing" value={purpose} onChange={e => setPurpose(e.target.value)} rows={2} required />
                <Select value={basis} onValueChange={setBasis}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAWFUL_BASES.map(b => <SelectItem key={b} value={b}>{b.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Retention period (days)" type="number" value={retention} onChange={e => setRetention(e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Checkbox checked={automated} onCheckedChange={v => setAutomated(!!v)} /> Automated processing
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Checkbox checked={dpiaReq} onCheckedChange={v => setDpiaReq(!!v)} /> DPIA required
                </label>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" loading={saving} disabled={!name.trim() || !purpose.trim()} loadingText="Creating…">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
