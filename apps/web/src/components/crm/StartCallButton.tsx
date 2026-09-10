import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useEntitlements } from '../../hooks/useEntitlements.js';
import { Icon } from '../Icon.js';
import { showAlert } from '../../lib/alert.js';

type SubjectType = 'lead' | 'deal' | 'customer';

/**
 * The CRM's "click-to-call" — honestly named for what this platform
 * actually has. There's no PSTN dialer anywhere in Hudumika (Bliss's own
 * "Telephony" screen is WebRTC ICE/TURN config, not a phone line), so the
 * real equivalent is a Bliss video call the lead/customer joins as a guest
 * (no account needed — the same guest_join_enabled path Calendar/Tasks/
 * Notes already use via MeetingLinkPanel), with the join link handed to
 * them over WhatsApp/phone. It logs to the same activity timeline a real
 * click-to-call would.
 */
export function StartCallButton({ subjectType, subjectId, phone, onLogged, children }: {
  subjectType: SubjectType; subjectId: string; phone?: string; onLogged?: () => void; children: React.ReactNode;
}) {
  const entitlements = useEntitlements();
  const hasBliss = !!entitlements?.features?.bliss;
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function start() {
    setCreating(true);
    try {
      let meetingUrl: string;
      if (hasBliss) {
        const meeting = await apiFetch('/v1/calls/meetings', {
          method: 'POST',
          body: JSON.stringify({ title: 'Call', kind: 'VIDEO', guest_join_enabled: true }),
        });
        meetingUrl = `${window.location.origin}/bliss/calls/meeting/${meeting.id}`;
      } else {
        meetingUrl = `https://meet.jit.si/Hudumika-${crypto.randomUUID()}`;
      }
      await apiFetch('/v1/crm/activity', {
        method: 'POST',
        body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, type: 'call', body: `Call started — ${meetingUrl}` }),
      });
      setLink(meetingUrl);
      onLogged?.();
    } catch (err: any) {
      showAlert(err.message || 'Failed to start a call');
    } finally {
      setCreating(false);
    }
  }

  if (link) {
    const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Join our call: ${link}`)}` : null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--teal-l)' }}>
        <Icon name="phone" size={14} color="var(--teal-deep)" />
        <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--teal-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</div>
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" title="Share via WhatsApp" style={{ color: 'var(--teal-deep)', display: 'flex' }}>
            <Icon name="send" size={14} />
          </a>
        )}
        <a href={link} target="_blank" rel="noreferrer" title="Join" style={{ color: 'var(--teal-deep)', display: 'flex' }}>
          <Icon name="externalLink" size={14} />
        </a>
      </div>
    );
  }

  return <span onClick={creating ? undefined : start} style={{ display: 'contents', cursor: creating ? 'wait' : undefined }}>{children}</span>;
}
