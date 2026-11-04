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

const CATEGORIES = ['unauthorized_access', 'data_loss', 'data_breach', 'system_compromise', 'human_error', 'third_party', 'other'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

const SEVERITY_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'gray'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'gray',
};
const STATUS_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'success' | 'gray'> = {
  detected: 'error', investigating: 'warning', contained: 'info',
  notified: 'info', remediated: 'success', closed: 'gray',
};
const TRANSITIONS: Record<string, string[]> = {
  detected: ['investigating'], investigating: ['contained', 'closed'],
  contained: ['notified', 'remediated'], notified: ['remediated'], remediated: ['closed'],
};

export function NgaoIncidents() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<string>('medium');
  const [category, setCategory] = useState<string>('other');
  const [desc, setDesc] = useState('');
  const [affected, setAffected] = useState('');

  function reload() {
    apiFetch('/v1/ngao/incidents').then(d => setRows(d.incidents ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/ngao/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), severity, category,
          description: desc || undefined,
          data_subjects_affected: affected ? Number(affected) : undefined,
        }),
      });
      setTitle(''); setDesc(''); setSeverity('medium'); setCategory('other'); setAffected('');
      setShowNew(false); reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    try { setDetail(await apiFetch(`/v1/ngao/incidents/${id}`)); }
    catch (err: any) { showAlert(err.message); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/ngao/incidents/${id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      reload();
      if (expanded === id) setDetail(await apiFetch(`/v1/ngao/incidents/${id}`));
    } catch (err: any) { showAlert(err.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Incidents']}
        titlePlain="Breach"
        titleEm="incidents"
        subtitle="Data breach register — detection, assessment, notification and remediation tracking."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> Report Incident</Button>}
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Number</th><th>Title</th><th>Severity</th><th>Status</th><th>Detected</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <>
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(r.id)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.incident_number}</td>
                    <td>{r.title}</td>
                    <td><Badge variant={SEVERITY_VARIANT[r.severity] ?? 'gray'}>{r.severity}</Badge></td>
                    <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status?.replace('_', ' ')}</Badge></td>
                    <td>{formatDate(r.detected_at ?? r.created_at)}</td>
                    <td><Icon name={expanded === r.id ? 'chevronUp' : 'chevronDown'} size={14} /></td>
                  </tr>
                  {expanded === r.id && detail && (
                    <tr key={`${r.id}-x`}>
                      <td colSpan={6} style={{ padding: 16, background: 'var(--surface2, var(--bg))' }}>
                        {detail.description && <p style={{ marginBottom: 8 }}>{detail.description}</p>}
                        {detail.category && <p style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}>Category: {detail.category.replace('_', ' ')}</p>}
                        {detail.data_subjects_affected != null && <p style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}>Subjects affected: {detail.data_subjects_affected}</p>}
                        {detail.root_cause && <p style={{ fontSize: 13, marginBottom: 8 }}>Root cause: {detail.root_cause}</p>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          {(TRANSITIONS[detail.status] ?? []).map((s: string) => (
                            <Button key={s} variant="outline" size="sm" onClick={() => transition(r.id, s)}>
                              → {s.replace('_', ' ')}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No incidents recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent size="md">
          <form onSubmit={handleCreate}>
            <DialogHeader><DialogTitle>Report Incident</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input placeholder="Incident title" value={title} onChange={e => setTitle(e.target.value)} required />
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
                <Input placeholder="Data subjects affected (count)" type="number" value={affected} onChange={e => setAffected(e.target.value)} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Reporting…' : 'Report'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
