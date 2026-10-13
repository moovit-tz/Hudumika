import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Button } from '../../components/ui/button.js';
import { Badge, type BadgeProps } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import './Onsite.css';

const CATEGORIES = ['Domain issue', 'Hosting / VPS issue', 'DNS / SSL issue', 'Deployment failure', 'Billing', 'Other'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

interface PlatformTicket {
  id: string; ref_number: string; subject: string; category: string;
  priority: string; status: string; created_at: string; updated_at: string;
  app: string | null;
}

const STATUS_META: Record<string, { variant: NonNullable<BadgeProps['variant']>; label: string }> = {
  OPEN: { variant: 'warning', label: 'Open' },
  IN_PROGRESS: { variant: 'info', label: 'In progress' },
  RESOLVED: { variant: 'success', label: 'Resolved' },
  CLOSED: { variant: 'gray', label: 'Closed' },
};

export function OnsiteSupport() {
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('NORMAL');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/platform-support/tickets')
      .then((res: any) => setTickets(Array.isArray(res) ? res.filter((t: PlatformTicket) => t.app === 'onsite') : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const canSubmit = subject.trim() && message.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/platform-support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          message: message.trim(),
          app: 'onsite',
          context: { route: window.location.pathname },
        }),
      });
      setSubject(''); setMessage(''); setCategory(CATEGORIES[0]); setPriority('NORMAL');
      setShowForm(false);
      showAlert('Your request has been sent to Hudumika support.', { variant: 'success' });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not send your request.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Support']}
        titlePlain="Onsite"
        titleEm="support"
        subtitle="Contact Hudumika support about your hosting, domains, or infrastructure — routed to a priority queue for Onsite."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} /> New request
          </Button>
        }
      />

      {loading ? (
        <div className="onsite-card"><SectionLoading /></div>
      ) : tickets.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="helpCircle" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)' }}>No requests yet</h3>
          <p style={{ margin: '0.4rem 0 1rem', fontSize: '0.875rem', color: 'var(--ink2)' }}>
            Something not working? File a request and Hudumika support will pick it up.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> New request
          </Button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td className="onsite-mono">{t.ref_number}</td>
                    <td style={{ fontWeight: 600 }}>{t.subject}</td>
                    <td>{t.category}</td>
                    <td style={{ textTransform: 'capitalize' }}>{t.priority.toLowerCase()}</td>
                    <td><Badge variant={(STATUS_META[t.status] ?? STATUS_META.OPEN).variant}>{(STATUS_META[t.status] ?? STATUS_META.OPEN).label}</Badge></td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>New support request</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Subject *</label>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="e.g. My domain isn't resolving"
                    value={subject}
                    maxLength={300}
                    onChange={e => setSubject(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                  <div className="onsite-form-group">
                    <label>Category</label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="onsite-form-group">
                    <label>Priority</label>
                    <Select value={priority} onValueChange={v => setPriority(v as typeof PRIORITIES[number])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="onsite-form-group">
                  <label>Describe the issue *</label>
                  <textarea
                    className="onsite-textarea"
                    rows={5}
                    placeholder="What's happening, and what have you already tried?"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? <><ButtonSpinner /> Sending…</> : 'Send request'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
