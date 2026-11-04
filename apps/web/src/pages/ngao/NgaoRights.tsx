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

const REQUEST_TYPES = ['ACCESS', 'CORRECTION', 'ERASURE', 'OBJECTION', 'PORTABILITY'] as const;
const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'error' | 'gray'> = {
  PENDING: 'warning', IN_PROGRESS: 'info', COMPLETED: 'success', REJECTED: 'error', EXPIRED: 'gray',
};
const RESPOND_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;

export function NgaoRights() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [reqType, setReqType] = useState<string>('ACCESS');
  const [subName, setSubName] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [desc, setDesc] = useState('');

  function reload() {
    apiFetch('/v1/ngao/rights-requests').then(d => setRows(d.requests ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!subName.trim() || !subEmail.trim() || !desc.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/ngao/rights-requests', {
        method: 'POST',
        body: JSON.stringify({
          request_type: reqType, subject_name: subName.trim(),
          subject_email: subEmail.trim(), description: desc.trim(),
        }),
      });
      setReqType('ACCESS'); setSubName(''); setSubEmail(''); setDesc('');
      setShowNew(false); reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function respond(id: string, status: string) {
    try {
      await apiFetch(`/v1/ngao/rights-requests/${id}/respond`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      reload();
    } catch (err: any) { showAlert(err.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Ngao', 'Data Subjects']}
        titlePlain="Rights"
        titleEm="requests"
        subtitle="Data subject access, correction, erasure and portability requests with 30-day deadline tracking."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Request</Button>}
      />

      {loading ? <SectionLoading /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Type</th><th>Subject</th><th>Status</th><th>Deadline</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => {
                const canRespond = r.status === 'PENDING' || r.status === 'IN_PROGRESS';
                return (
                  <tr key={r.id}>
                    <td><Badge variant="brand">{r.request_type}</Badge></td>
                    <td>{r.subject_name}</td>
                    <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status?.replace('_', ' ')}</Badge></td>
                    <td>{r.deadline_at ? formatDate(r.deadline_at) : '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>
                      {canRespond && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {RESPOND_STATUSES.filter(s => s !== r.status).map(s => (
                            <Button key={s} variant="outline" size="sm" onClick={() => respond(r.id, s)}>
                              {s === 'IN_PROGRESS' ? 'Start' : s === 'COMPLETED' ? 'Complete' : 'Reject'}
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink2)' }}>No rights requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent size="md">
          <form onSubmit={handleCreate}>
            <DialogHeader><DialogTitle>New Rights Request</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Select value={reqType} onValueChange={setReqType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Subject name" value={subName} onChange={e => setSubName(e.target.value)} required />
                <Input placeholder="Subject email" type="email" value={subEmail} onChange={e => setSubEmail(e.target.value)} required />
                <Textarea placeholder="Request description" value={desc} onChange={e => setDesc(e.target.value)} rows={3} required />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !subName.trim() || !subEmail.trim() || !desc.trim()}>{saving ? 'Submitting…' : 'Submit'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
