import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../ui/dialog.js';
import { showAlert } from '../../lib/alert.js';

type SubjectType = 'lead' | 'deal' | 'customer';

/**
 * Replaces the old `mailto:` "Send Email" action — sends through the
 * platform's own mail service (POST /v1/crm/activity/send-email) so the
 * message actually leaves Hudumika and logs itself to the subject's
 * activity timeline, instead of just handing off to the rep's own mail
 * client and never being seen again.
 */
export function ComposeEmailButton({ subjectType, subjectId, onSent, children }: {
  subjectType: SubjectType; subjectId: string; onSent?: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await apiFetch('/v1/crm/activity/send-email', {
        method: 'POST',
        body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, subject: subject.trim(), body: body.trim() }),
      });
      setOpen(false);
      setSubject('');
      setBody('');
      onSent?.();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} style={{ display: 'contents' }}>{children}</span>
      <Dialog open={open} onOpenChange={o => { if (!sending) setOpen(o); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="mail" size={16} color="var(--teal)" /> Compose email
            </DialogTitle>
          </DialogHeader>
          <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="input-field" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} autoFocus
            />
            <textarea
              className="input-field" placeholder="Write your message…" value={body} onChange={e => setBody(e.target.value)}
              rows={8} style={{ resize: 'vertical', minHeight: 140 }}
            />
          </DialogBody>
          <DialogFooter>
            <button type="button" className="btn btn-secondary btn-sm" disabled={sending} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={sending || !subject.trim() || !body.trim()} onClick={send}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
