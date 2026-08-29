// ─── MeetingSession.tsx — fetch meeting → lobby → room, the full join flow ─
// The one entry point both Calls.tsx (click a meeting in the list) and the
// standalone join-by-link route mount, so a shared link and an in-app click
// go through identical logic.
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MeetingLobby } from './MeetingLobby.js';
import { MeetingRoom } from './MeetingRoom.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';

interface MeetingRecord {
  id: string; title: string; join_code: string; kind: 'VIDEO' | 'VOICE'; status: string;
  scheduled_at: string | null; started_at: string | null; ended_at: string | null; locked: boolean;
  host_id: string; host_name: string; hasPassword?: boolean; waiting_room_enabled?: boolean;
}

export function MeetingSession({ meetingId, onExit }: { meetingId: string; onExit: () => void }) {
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ iceServers: any[]; role: 'HOST' | 'PARTICIPANT'; audioEnabled: boolean; videoEnabled: boolean } | null>(null);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);
  const [pendingOpts, setPendingOpts] = useState<{ audioEnabled: boolean; videoEnabled: boolean } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState<'PENDING' | 'REJECTED' | null>(null);
  // The password check runs on every /join call, not just the first — a
  // waiting-room admission doesn't exempt a later retry from it, so the
  // retry below must resend whatever password got us admitted in the first
  // place, not just the join options.
  const admittedPasswordRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/v1/calls/meetings/${meetingId}`).then(m => { if (!cancelled) setMeeting(m); })
      .catch(() => { if (!cancelled) setError('This meeting could not be found.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [meetingId]);

  // While waiting for the host to admit us, poll our own status every 3s —
  // we don't have a live socket yet (that only opens once actually inside
  // the room), so this is the real mechanism, not a fallback.
  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const res = await apiFetch(`/v1/calls/meetings/${meetingId}/waiting-room/my-status`);
        if (cancelled) return;
        if (res.status === 'ADMITTED') {
          clearInterval(iv);
          setWaiting(false);
          if (pendingOpts) doJoin(pendingOpts, admittedPasswordRef.current);
        } else if (res.status === 'REJECTED') {
          clearInterval(iv);
          setWaitingStatus('REJECTED');
        }
      } catch { /* */ }
    }, 3000);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, meetingId]);

  async function doJoin(opts: { audioEnabled: boolean; videoEnabled: boolean }, password?: string) {
    if (password) admittedPasswordRef.current = password;
    try {
      const res = await apiFetch(`/v1/calls/meetings/${meetingId}/join`, { method: 'POST', body: JSON.stringify(password ? { password } : {}) });
      if (res.waiting) {
        setPendingOpts(opts);
        setWaiting(true);
        setWaitingStatus('PENDING');
        return;
      }
      setMeeting(res.meeting);
      setJoined({ iceServers: res.iceServers, role: res.role, audioEnabled: opts.audioEnabled, videoEnabled: opts.videoEnabled });
    } catch (e: any) {
      if ((e?.body as any)?.passwordRequired) {
        setPendingOpts(opts);
        setPasswordError(password ? 'Incorrect password.' : null);
      } else {
        setError(e?.message || 'Could not join this meeting.');
      }
    }
  }

  async function handleJoin(opts: { audioEnabled: boolean; videoEnabled: boolean }) {
    // The server always lets the host straight in regardless of password —
    // mirror that here, or the host would be stuck looking at a prompt for
    // a password they never need to type (surfaced by a real remount, e.g.
    // a page refresh mid-flow, re-running this check from scratch).
    const isHost = meeting?.host_id === user?.id;
    if (meeting?.hasPassword && !isHost) { setPendingOpts(opts); return; }
    doJoin(opts);
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13 }}>
        Loading meeting…
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 28, width: 360, textAlign: 'center' }}>
          <Icon name="alertCircle" size={28} color="var(--red)" />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 10 }}>{error || 'Meeting not found'}</div>
          <Button variant="outline" onClick={onExit} style={{ marginTop: 16 }}>Back to Calls</Button>
        </div>
      </div>
    );
  }

  if (endedNotice) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 28, width: 360, textAlign: 'center' }}>
          <Icon name="checkCircle" size={28} color="var(--green)" />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 10 }}>{endedNotice}</div>
          <Button variant="outline" onClick={onExit} style={{ marginTop: 16 }}>Back to Calls</Button>
        </div>
      </div>
    );
  }

  if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 28, width: 360, textAlign: 'center' }}>
          <Icon name="clock" size={28} color="var(--ink3)" />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 10 }}>This meeting has {meeting.status === 'CANCELLED' ? 'been cancelled' : 'ended'}.</div>
          <Button variant="outline" onClick={onExit} style={{ marginTop: 16 }}>Back to Calls</Button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#111827', borderRadius: 16, border: '1px solid #1f2937', padding: 32, width: 360, textAlign: 'center' }}>
          {waitingStatus === 'REJECTED' ? (
            <>
              <Icon name="alertCircle" size={28} color="var(--red)" />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>The host did not admit you</div>
              <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 6 }}>Try reaching out to the meeting host directly.</div>
            </>
          ) : (
            <>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #1f2937', borderTopColor: '#10b981', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
              <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 16 }}>Waiting for the host to let you in…</div>
              <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 6 }}>{meeting.title}</div>
            </>
          )}
          <Button variant="outline" onClick={onExit} style={{ marginTop: 20, borderColor: '#374151', color: '#d1d5db', background: 'transparent' }}>Cancel &amp; Return</Button>
        </div>
      </div>
    );
  }

  if (meeting.hasPassword && pendingOpts && !joined) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#111827', borderRadius: 16, border: '1px solid #1f2937', padding: 32, width: 360 }}>
          <Icon name="lock" size={24} color="#8ab4f8" />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>This meeting is password-protected</div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 4, marginBottom: 16 }}>Enter the password the host shared with you.</div>
          <input
            type="password" autoFocus value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doJoin(pendingOpts, passwordInput)}
            placeholder="Meeting password"
            style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 13, padding: '0 12px', outline: 'none', boxSizing: 'border-box' }}
          />
          {passwordError && <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 8 }}>{passwordError}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="default" onClick={() => doJoin(pendingOpts, passwordInput)} style={{ flex: 1 }}>Join</Button>
            <Button variant="outline" onClick={onExit} style={{ borderColor: '#374151', color: '#d1d5db', background: 'transparent' }}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!joined) {
    return <MeetingLobby title={meeting.title} kind={meeting.kind} onJoin={handleJoin} onCancel={onExit} />;
  }

  return (
    <MeetingRoom
      meetingId={meeting.id}
      title={meeting.title}
      kind={meeting.kind}
      role={joined.role}
      iceServers={joined.iceServers}
      initialAudioEnabled={joined.audioEnabled}
      initialVideoEnabled={joined.videoEnabled}
      myUserId={user?.id || ''}
      myName={user?.name || 'You'}
      onLeave={onExit}
      onEndedByHost={() => setEndedNotice(joined.role === 'HOST' ? 'Meeting ended.' : 'The host ended this meeting.')}
    />
  );
}
