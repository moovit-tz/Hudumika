import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

interface Props {
  customerId: string;
  defaultSubject: string;
  contextNote: string;
  defaultPriority?: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
}

export function RaiseSealTicketButton({ customerId, defaultSubject, contextNote, defaultPriority = 'NORMAL' }: Props) {
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
      <div className="seal-ticket-success">
        <Icon name="checkCircle" size={13} />
        <span>Ticket {created.ref} raised in Bliss —</span>
        <Link to="/bliss/tickets" className="seal-ticket-link">view in Support</Link>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icon name="helpCircle" size={13} /><span>Raise Support Ticket</span>
      </Button>
    );
  }

  return (
    <div className="seal-ticket-form">
      <Input className="seal-ticket-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ticket subject" />
      <Select value={priority} onValueChange={v => setPriority(v as any)}>
        <SelectTrigger className="seal-ticket-priority"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="LOW">Low</SelectItem>
          <SelectItem value="NORMAL">Normal</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="URGENT">Urgent</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" disabled={saving || !subject.trim()} onClick={handleCreate}>
        {saving ? 'Raising…' : 'Raise Ticket'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}
