// ─── MeetingLinkPanel.tsx — one "Add video call" control, shared by every
// app that can carry a meeting: Calendar events, Tasks, Notes. Whatever
// creates the call goes through the exact same path — POST /v1/calls/meetings
// — and picks up the exact same access-control settings (password, waiting
// room, guest access without an account) the Bliss meeting room itself
// offers, rather than each app growing its own copy of that decision.
//
// Bliss is the default and the only path a tenant entitled to it ever sees;
// a tenant without Bliss (or a failed create call) still gets a real,
// joinable Jitsi room rather than a dead "Add video call" button — the same
// fallback reasoning CalendarApp.tsx's original handleAddVideoCall already
// established, generalized here so Tasks/Notes get it for free too.
import React, { useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { useEntitlements } from '../hooks/useEntitlements.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { SwitchRow } from './ui/list-item-row.js';

/** A real, joinable Jitsi Meet room — the fallback when Bliss isn't
 *  entitled or the create call fails. Same construction as CalendarApp.tsx's
 *  own newMeetingUrl(), duplicated rather than imported since that one is
 *  private to a 2000+ line page component not meant to export from. */
function newJitsiUrl(): string {
  return `https://meet.jit.si/Hudumika-${crypto.randomUUID()}`;
}

export function isBlissUrl(url: string | null | undefined): boolean {
  return !!url && url.includes('/calls/meeting/');
}

export interface MeetingLinkValue {
  meetingUrl: string | null;
  blissMeetingId?: string | null;
}

export function MeetingLinkPanel({ title, value, onChange, disabled }: {
  /** Used as the created meeting's title (e.g. the event/task/note title). */
  title: string;
  value: MeetingLinkValue;
  onChange: (next: MeetingLinkValue) => void;
  disabled?: boolean;
}) {
  const entitlements = useEntitlements();
  const hasBliss = !!entitlements?.features?.bliss;

  const [configuring, setConfiguring] = useState(false);
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [guestJoin, setGuestJoin] = useState(false);

  async function createMeeting() {
    if (!hasBliss) {
      onChange({ meetingUrl: newJitsiUrl(), blissMeetingId: null });
      setConfiguring(false);
      return;
    }
    setCreating(true);
    try {
      const meeting = await apiFetch('/v1/calls/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || 'Meeting', kind: 'VIDEO',
          password: password.trim() || undefined,
          waiting_room_enabled: waitingRoom,
          guest_join_enabled: guestJoin,
        }),
      });
      onChange({ meetingUrl: `${window.location.origin}/bliss/calls/meeting/${meeting.id}`, blissMeetingId: meeting.id });
      setConfiguring(false);
      setPassword(''); setWaitingRoom(false); setGuestJoin(false);
    } catch (e: any) {
      // A tenant that IS entitled to Bliss but hit a transient failure still
      // gets a working link rather than a dead end — same reasoning as the
      // !hasBliss branch above.
      onChange({ meetingUrl: newJitsiUrl(), blissMeetingId: null });
      setConfiguring(false);
      showAlert(e?.message || 'Could not create a Bliss meeting — used a plain video call link instead.', { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  function copyLink() {
    if (!value.meetingUrl) return;
    navigator.clipboard?.writeText(value.meetingUrl);
    showAlert('Meeting link copied', { variant: 'success' });
  }
  function removeLink() {
    onChange({ meetingUrl: null, blissMeetingId: null });
  }

  if (value.meetingUrl) {
    const isBliss = isBlissUrl(value.meetingUrl);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)' }}>
        <Icon name="video" size={16} color="var(--teal)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{isBliss ? 'Bliss video call' : 'Video call'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.meetingUrl}</div>
        </div>
        <button type="button" title="Copy link" onClick={copyLink} disabled={disabled} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
          <Icon name="copy" size={15} />
        </button>
        <a href={value.meetingUrl} target="_blank" rel="noreferrer" title="Open" style={{ color: 'var(--ink3)', padding: 4, display: 'flex' }}>
          <Icon name="externalLink" size={15} />
        </a>
        <button type="button" title="Remove" onClick={removeLink} disabled={disabled} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
          <Icon name="x" size={15} />
        </button>
      </div>
    );
  }

  if (!configuring) {
    return (
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setConfiguring(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="video" size={15} /> Add video call
      </Button>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Input
        value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Password (optional)" disabled={!hasBliss}
      />
      {hasBliss ? (
        <>
          <SwitchRow
            title="Waiting room" description="You admit each person before they can join."
            checked={waitingRoom} onCheckedChange={setWaitingRoom}
          />
          <SwitchRow
            title="Allow guests without an account" description="Anyone with the link can join, locked by the password/waiting room above."
            checked={guestJoin} onCheckedChange={setGuestJoin}
          />
        </>
      ) : (
        <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '4px 0' }}>
          This workspace isn't on Bliss — this will be a plain, unsecured video call link instead.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button type="button" onClick={createMeeting} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
        <Button type="button" variant="outline" onClick={() => setConfiguring(false)} disabled={creating}>Cancel</Button>
      </div>
    </div>
  );
}
