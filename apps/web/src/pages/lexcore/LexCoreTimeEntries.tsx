import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

interface TimeEntry { id: string; entry_date: string; description: string; hours: number; rate: number | null; amount: number | null; is_billable: boolean; matter_id: string; }
interface Matter { id: string; title: string; matter_number: string; }

export function LexCoreTimeEntries() {
  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matters, setMatters] = useState<Matter[]>([]);

  const [matterId, setMatterId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [billable, setBillable] = useState('true');

  function reload() {
    apiFetch('/v1/legal/time').then(d => setRows(d.rows ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => { apiFetch('/v1/legal/matters?limit=100').then(d => setMatters(d.rows ?? [])).catch(() => {}); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!matterId || !desc.trim() || !hours) return;
    setSaving(true);
    try {
      await apiFetch('/v1/legal/time', { method: 'POST', body: JSON.stringify({ matter_id: matterId, entry_date: date, description: desc.trim(), hours: Number(hours), rate: rate ? Number(rate) : undefined, is_billable: billable === 'true' }) });
      setOpen(false); setMatterId(''); setDesc(''); setHours(''); setRate('');
      reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  const fmt = (n: number | null) => n != null ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Billing']}
        titlePlain="Time"
        titleEm="entries"
        subtitle="Billable and non-billable hours recorded against matters."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Log Time</Button>}
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No time entries recorded.</div> : (
            <table className="lc-table">
              <thead><tr><th>Date</th><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Billable</th></tr></thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12 }}>{formatDate(t.entry_date)}</td>
                    <td style={{ fontWeight: 600 }}>{t.description}</td>
                    <td>{t.hours}h</td>
                    <td>{fmt(t.rate)}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(t.amount)}</td>
                    <td>{t.is_billable ? <Badge variant="brand">Billable</Badge> : <Badge variant="gray">Non-billable</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Log Time Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate}>
            <DialogBody>
              <div className="lc-form-grid">
                <div className="lc-field"><label>Matter</label>
                  <Select value={matterId} onValueChange={setMatterId}><SelectTrigger><SelectValue placeholder="Select matter…" /></SelectTrigger><SelectContent>{matters.map(m => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="lc-field"><label>Date</label><DatePicker date={parseDateOnly(date) ?? null} onChange={d => setDate(toDateOnlyString(d))} /></div>
                <div className="lc-field"><label>Hours</label><Input type="number" step="0.25" min="0.25" value={hours} onChange={e => setHours(e.target.value)} placeholder="1.5" /></div>
                <div className="lc-field"><label>Rate (optional)</label><Input type="number" step="any" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate per hour" /></div>
                <div className="lc-field"><label>Billable</label>
                  <Select value={billable} onValueChange={setBillable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Billable</SelectItem><SelectItem value="false">Non-billable</SelectItem></SelectContent></Select>
                </div>
                <div className="lc-field lc-field-full"><label>Description</label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Work performed…" /></div>
              </div>
            </DialogBody>
            <DialogFooter><Button type="submit" loading={saving} disabled={!matterId || !desc.trim() || !hours} loadingText="Saving…">Log Entry</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
