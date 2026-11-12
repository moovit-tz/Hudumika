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

const TYPES = ['dpia', 'pia', 'tia', 'lia'] as const;
const STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'gray', in_progress: 'info', review: 'warning', approved: 'success', rejected: 'error',
};

const TRANSITIONS: Record<string, string[]> = {
  draft: ['in_progress'], in_progress: ['review'], review: ['approved', 'rejected'], rejected: ['draft'],
};

export function NgaoAssessments() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('dpia');
  const [desc, setDesc] = useState('');
  const [scope, setScope] = useState('');

  function reload() {
    apiFetch('/v1/ngao/assessments').then(d => setRows(d.assessments ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/ngao/assessments', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), assessment_type: type, description: desc || undefined, scope: scope || undefined }),
      });
      setTitle(''); setDesc(''); setScope(''); setType('dpia'); setShowNew(false);
      reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    try {
      const d = await apiFetch(`/v1/ngao/assessments/${id}`);
      setDetail(d);
    } catch (err: any) { showAlert(err.message); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/ngao/assessments/${id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      reload();
      if (expanded === id) {
        const d = await apiFetch(`/v1/ngao/assessments/${id}`);
        setDetail(d);
      }
    } catch (err: any) { showAlert(err.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Privacy']}
        titlePlain="Impact"
        titleEm="assessments"
        subtitle="Data Protection Impact Assessments — questionnaires, risk scores and mitigations."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Assessment</Button>}
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Title</th><th>Type</th><th>Status</th><th>Risk</th><th>Created</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <>
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(r.id)}>
                    <td>{r.title}</td>
                    <td><Badge variant="brand">{r.assessment_type?.toUpperCase()}</Badge></td>
                    <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status?.replace('_', ' ')}</Badge></td>
                    <td>{r.risk_level ? <Badge variant={r.risk_level === 'critical' ? 'error' : r.risk_level === 'high' ? 'warning' : r.risk_level === 'medium' ? 'info' : 'gray'}>{r.risk_level}</Badge> : '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td><Icon name={expanded === r.id ? 'chevronUp' : 'chevronDown'} size={14} /></td>
                  </tr>
                  {expanded === r.id && detail && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={6} style={{ padding: 16, background: 'var(--surface2, var(--bg))' }}>
                        {detail.description && <p style={{ marginBottom: 8 }}>{detail.description}</p>}
                        {detail.scope && <p style={{ marginBottom: 8, color: 'var(--ink2)' }}>Scope: {detail.scope}</p>}
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
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No assessments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent size="md">
          <form onSubmit={handleCreate}>
            <DialogHeader><DialogTitle>New Assessment</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input placeholder="Assessment title" value={title} onChange={e => setTitle(e.target.value)} required />
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
                <Input placeholder="Scope (optional)" value={scope} onChange={e => setScope(e.target.value)} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" loading={saving} disabled={!title.trim()} loadingText="Creating…">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
