import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

// Cross-app link to Bliss (Support & Helpdesk) — raises a real support
// ticket (support_tickets) directly from a SEAL/ClearOS event (a
// discrepancy, a seizure recommendation, an expired-storage lot, etc.),
// carrying the SEAL context into the ticket description rather than
// leaving ops staff to re-explain it manually in Bliss. POST /v1/support/
// tickets has no extra entitlement gate beyond authentication, so this
// works the same from any app.

interface Props {
  customerId: string;
  defaultSubject: string;
  contextNote: string;
  defaultPriority?: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
  buttonClassName?: string;
}

export function RaiseSealTicketButton({ customerId, defaultSubject, contextNote, defaultPriority = 'NORMAL', buttonClassName = 'seal-btn-secondary' }: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [priority, setPriority] = useState(defaultPriority);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ ref: string } | null>(null);

  async function handleCreate() {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      const ticket = await apiFetch('/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId, subject: subject.trim(), description: contextNote,
          channel: 'SYSTEM', priority, category: 'Warehouse Operations',
        }),
      });
      setCreated({ ref: ticket.ref_number });
      setOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'Failed to raise support ticket.');
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="checkCircle" size={13} />
        <span>Ticket {created.ref} raised in Bliss —</span>
        <Link to="/bliss/tickets" style={{ color: 'var(--green)', fontWeight: 700 }}>view in Support</Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>
        <Icon name="helpCircle" size={13} /><span>Raise Support Ticket</span>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <input type="text" className="input-field" style={{ width: 240 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ticket subject" />
      <Select value={priority} onValueChange={v => setPriority(v as any)}>
        <SelectTrigger className="input-field" style={{ width: 130 }}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="LOW">Low</SelectItem>
          <SelectItem value="NORMAL">Normal</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="URGENT">Urgent</SelectItem>
        </SelectContent>
      </Select>
      <button type="button" className="seal-btn-primary" disabled={saving || !subject.trim()} onClick={handleCreate}>
        {saving ? 'Raising…' : 'Raise Ticket'}
      </button>
      <button type="button" className="seal-btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
