// ─── GuestMeetingJoin.tsx — the public "join like Zoom/Meet/Teams" entry
// point, mounted at /meet/:id with NO Hudumika account required. Mirrors
// MeetingSession.tsx's own state machine (name/password gate → waiting room
// → device lobby → room) against calls-public's routes instead of the
// authenticated /v1/calls ones, and hands off to GuestMeetingRoom (a lean,
// guest-scoped room UI) rather than the full MeetingRoom.
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { guestFetch } from '../../lib/guestCallApi.js';
import { MeetingLobby } from './MeetingLobby.js';
import { GuestMeetingRoom } from './GuestMeetingRoom.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';

interface PublicMeeting {
  id: string; title: string; kind: 'VIDEO' | 'VOICE'; status: string;
  host_name: string; hasPassword: boolean; waiting_room_enabled: boolean;
  chat_disabled: boolean; screen_share_disabled: boolean; locked: boolean;
}

export function GuestMeetingJoin() {
  const { id: meetingId } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<PublicMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [waiting, setWaiting] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState<'PENDING' | 'REJECTED' | null>(null);
  const guestTokenRef = useRef<string | null>(null);

  const [joinPayload, setJoinPayload] = useState<{ iceServers: any[]; participantId: string; guestId: string; meeting: PublicMeeting } | null>(null);
  const [pendingOpts, setPendingOpts] = useState<{ audioEnabled: boolean; videoEnabled: boolean } | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    guestFetch(`/v1/calls-public/meetings/${meetingId}`).then(m => { if (!cancelled) setMeeting(m); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'This meeting link is not available.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [meetingId]);

  // Poll while in the waiting room — the same 3s cadence MeetingSession.tsx
  // uses for the authenticated flow, for the same reason: no live socket
  // exists yet for a push (that only opens once actually admitted).
  useEffect(() => {
    if (!waiting || !meetingId) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const res = await guestFetch(`/v1/calls-public/meetings/${meetingId}/waiting-room/status?guestToken=${encodeURIComponent(guestTokenRef.current || '')}`);
        if (cancelled) return;
        if (res.status === 'ADMITTED') {
          clearInterval(iv);
          setWaiting(false);
          setJoinPayload({ iceServers: res.iceServers, participantId: res.participantId, guestId: res.guestId, meeting: res.meeting });
        } else if (res.status === 'REJECTED') {
          clearInterval(iv);
          setWaitingStatus('REJECTED');
        }
      } catch { /* transient — try again next tick */ }
    }, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [waiting, meetingId]);

  async function submitJoin() {
    if (!meetingId) return;
    const trimmedName = name.trim();
    if (!trimmedName) { setPasswordError('Enter your name to join.'); return; }
    setSubmitting(true);
    setPasswordError(null);
    try {
      const res = await guestFetch(`/v1/calls-public/meetings/${meetingId}/join`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, ...(password ? { password } : {}) }),
      });
      if (res.waiting) {
        guestTokenRef.current = res.guestToken;
        setWaiting(true);
        setWaitingStatus('PENDING');
        return;
      }
      setJoinPayload({ iceServers: res.iceServers, participantId: res.participantId, guestId: res.guestId, meeting: res.meeting });
    } catch (e: any) {
      if ((e?.body as any)?.passwordRequired) {
        setPasswordError(password ? 'Incorrect password.' : 'A password is required to join this meeting.');
      } else {
        setError(e?.message || 'Could not join this meeting.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const shellStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' };
  const cardStyle: React.CSSProperties = { background: '#111827', borderRadius: 16, border: '1px solid #1f2937', padding: 32, width: 380, textAlign: 'center' };

  if (loading) {
    return <div style={shellStyle}><div style={{ color: '#9ca3af', fontSize: 13 }}>Loading meeting…</div></div>;
  }

  if (error || !meeting) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <Icon name="alertCircle" size={28} color="#f87171" />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>{error || 'Meeting not found'}</div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 6 }}>Ask the host to share a current meeting link.</div>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          {waitingStatus === 'REJECTED' ? (
            <>
              <Icon name="alertCircle" size={28} color="#f87171" />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>The host did not admit you</div>
              <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 6 }}>Try reaching out to whoever sent you this link.</div>
            </>
          ) : (
            <>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #1f2937', borderTopColor: '#10b981', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
              <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 16 }}>Waiting for the host to let you in…</div>
              <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 6 }}>{meeting.title}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (joinPayload && !pendingOpts) {
    return <MeetingLobby title={meeting.title} kind={meeting.kind} onJoin={setPendingOpts} onCancel={() => window.close()} hideWorkspaceLinks />;
  }

  if (joinPayload && pendingOpts) {
    return (
      <GuestMeetingRoom
        meetingId={meeting.id}
        title={meeting.title}
        kind={meeting.kind}
        iceServers={joinPayload.iceServers}
        initialAudioEnabled={pendingOpts.audioEnabled}
        initialVideoEnabled={pendingOpts.videoEnabled}
        myGuestId={joinPayload.guestId}
        myName={name.trim()}
        participantId={joinPayload.participantId}
        chatDisabled={joinPayload.meeting.chat_disabled}
        screenShareDisabled={joinPayload.meeting.screen_share_disabled}
      />
    );
  }

  // ── Name / password gate ──
  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <Icon name={meeting.kind === 'VIDEO' ? 'video' : 'phone'} size={24} color="#8ab4f8" />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>{meeting.title}</div>
        <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 4, marginBottom: 20 }}>Hosted by {meeting.host_name} · joining as a guest</div>

        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !meeting.hasPassword && submitJoin()}
          placeholder="Your name" maxLength={80}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 13, padding: '0 12px', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
        />
        {meeting.hasPassword && (
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitJoin()}
            placeholder="Meeting password"
            style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 13, padding: '0 12px', outline: 'none', boxSizing: 'border-box' }}
          />
        )}
        {passwordError && <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 8 }}>{passwordError}</div>}

        <Button variant="default" onClick={submitJoin} disabled={submitting} style={{ width: '100%', marginTop: 16 }}>
          {submitting ? 'Joining…' : 'Join meeting'}
        </Button>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 14 }}>
          Have a Hudumika account? <a href={`/bliss/calls/meeting/${meeting.id}`} style={{ color: '#8ab4f8' }}>Sign in to join instead</a>
        </div>
      </div>
    </div>
  );
}
