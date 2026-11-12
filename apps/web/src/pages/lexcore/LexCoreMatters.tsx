import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

const STATUSES = ['open', 'active', 'on_hold', 'closed', 'archived'];
const MATTER_TYPES = ['litigation', 'corporate', 'real_estate', 'employment', 'ip', 'tax', 'criminal', 'family', 'immigration', 'general'];
const BILLING_METHODS = ['hourly', 'fixed', 'contingency', 'pro_bono', 'retainer'];

const STATUS_V: Record<string, 'info' | 'brand' | 'warning' | 'gray'> = {
  open: 'info', active: 'brand', on_hold: 'warning', closed: 'gray', archived: 'gray',
};

const TRANSITIONS: Record<string, string[]> = {
  open: ['active', 'on_hold', 'closed'], active: ['on_hold', 'closed'], on_hold: ['active', 'closed'], closed: ['archived'], archived: [],
};

interface Matter { id: string; matter_number: string; title: string; matter_type: string; status: string; billing_method: string; client_name: string; created_at: string; }
interface Client { id: string; name: string; }
interface MatterDetail extends Matter { description?: string; client?: Client | null; court_cases?: any[]; deadlines?: any[]; }

export function LexCoreMatters() {
  const [rows, setRows] = useState<Matter[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatterDetail | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [mType, setMType] = useState('general');
  const [billing, setBilling] = useState('hourly');
  const [desc, setDesc] = useState('');

  function reload() {
    const p = new URLSearchParams();
    if (statusF) p.set('status', statusF);
    apiFetch(`/v1/legal/matters?${p}`).then(d => { setRows(d.rows ?? []); setTotal(d.total ?? 0); }).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [statusF]);
  useEffect(() => { apiFetch('/v1/legal/clients').then(d => setClients(d.rows ?? [])).catch(() => {}); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !clientId) return;
    setSaving(true);
    try {
      await apiFetch('/v1/legal/matters', { method: 'POST', body: JSON.stringify({ title: title.trim(), client_id: clientId, matter_type: mType, billing_method: billing, description: desc.trim() || undefined }) });
      setOpen(false); setTitle(''); setClientId(''); setDesc(''); setMType('general'); setBilling('hourly');
      reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function handleExpand(id: string) {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    try { const d = await apiFetch(`/v1/legal/matters/${id}`); setDetail(d); } catch { setDetail(null); }
  }

  async function handleTransition(id: string, status: string) {
    try {
      await apiFetch(`/v1/legal/matters/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
      if (expanded === id) { const d = await apiFetch(`/v1/legal/matters/${id}`); setDetail(d); }
    } catch (err: any) { showAlert(err.message); }
  }

  const activeFilterCount = statusF ? 1 : 0;
  const displayed = q.trim() ? rows.filter(r => r.title.toLowerCase().includes(q.toLowerCase()) || r.matter_number.toLowerCase().includes(q.toLowerCase()) || (r.client_name || '').toLowerCase().includes(q.toLowerCase())) : rows;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Practice']}
        titlePlain="Client"
        titleEm="matters"
        subtitle="Open and closed matters — parties, documents, deadlines and billing status."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Matter</Button>}
      />

      <div style={{ marginBottom: 12 }}>
        <SearchToolbar search={q} onSearch={setQ} placeholder="Search matters…" activeFilterCount={activeFilterCount} onFiltersClick={() => setShowFilters(f => !f)} filtersOpen={showFilters} />
        {showFilters && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0 2px' }}>
            <SingleSelectFilter label="Status" options={STATUSES.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} value={statusF} onChange={setStatusF} allLabel="All Statuses" />
          </div>
        )}
      </div>

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {displayed.length === 0 ? <div className="lc-empty">No matters{q || statusF ? ' match your filters' : ' yet'}.</div> : (
            <table className="lc-table">
              <thead><tr><th>Number</th><th>Title</th><th>Client</th><th>Type</th><th>Status</th><th>Billing</th></tr></thead>
              <tbody>
                {displayed.map(m => (
                  <tr key={m.id} onClick={() => handleExpand(m.id)} style={expanded === m.id ? { background: 'var(--hover-bg)' } : undefined}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{m.matter_number}</td>
                    <td style={{ fontWeight: 600 }}>{m.title}</td>
                    <td>{m.client_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{m.matter_type.replace(/_/g, ' ')}</td>
                    <td><Badge variant={STATUS_V[m.status] ?? 'gray'}>{m.status.replace(/_/g, ' ')}</Badge></td>
                    <td style={{ fontSize: 12 }}>{m.billing_method.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {expanded && detail && (
            <div style={{ padding: 20, borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{detail.title}</span>
                {TRANSITIONS[detail.status]?.map(s => (
                  <Button key={s} variant="outline" size="sm" onClick={() => handleTransition(detail.id, s)}>{s.replace(/_/g, ' ')}</Button>
                ))}
              </div>
              {detail.description && <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12 }}>{detail.description}</div>}
              {detail.court_cases && detail.court_cases.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>Court Cases</div>
                  {detail.court_cases.map((cc: any) => <div key={cc.id} style={{ fontSize: 12, padding: '4px 0' }}>{cc.case_number} — {cc.court_name} ({cc.court_hierarchy})</div>)}
                </div>
              )}
              {detail.deadlines && detail.deadlines.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>Deadlines</div>
                  {detail.deadlines.map((d: any) => (
                    <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                      <Badge variant={d.is_critical ? 'error' : 'gray'}>{d.deadline_type.replace(/_/g, ' ')}</Badge>
                      <span>{d.description}</span>
                      <span style={{ color: 'var(--ink3)', marginLeft: 'auto' }}>{formatDate(d.due_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {total > rows.length && <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--ink3)' }}>Showing {rows.length} of {total}</div>}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New Matter</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate}>
            <DialogBody>
              <div className="lc-form-grid">
                <div className="lc-field lc-field-full"><label>Title</label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Matter title" /></div>
                <div className="lc-field"><label>Client</label>
                  <Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="lc-field"><label>Type</label>
                  <Select value={mType} onValueChange={setMType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MATTER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="lc-field"><label>Billing Method</label>
                  <Select value={billing} onValueChange={setBilling}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BILLING_METHODS.map(b => <SelectItem key={b} value={b}>{b.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="lc-field lc-field-full"><label>Description</label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Brief description…" /></div>
              </div>
            </DialogBody>
            <DialogFooter><Button type="submit" loading={saving} disabled={!title.trim() || !clientId} loadingText="Saving…">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
