// ─── MeetingSession.tsx — fetch meeting → lobby → room, the full join flow ─
// The one entry point both Calls.tsx (click a meeting in the list) and the
// standalone join-by-link route mount, so a shared link and an in-app click
// go through identical logic.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MeetingLobby } from './MeetingLobby.js';
import { MeetingRoom } from './MeetingRoom.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';

interface MeetingRecord {
  id: string; title: string; join_code: string; kind: 'VIDEO' | 'VOICE'; status: string;
  scheduled_at: string | null; started_at: string | null; ended_at: string | null; locked: boolean;
  host_id: string; host_name: string;
}

export function MeetingSession({ meetingId, onExit }: { meetingId: string; onExit: () => void }) {
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ iceServers: any[]; role: 'HOST' | 'PARTICIPANT'; audioEnabled: boolean; videoEnabled: boolean } | null>(null);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/v1/hr/meetings/${meetingId}`).then(m => { if (!cancelled) setMeeting(m); })
      .catch(() => { if (!cancelled) setError('This meeting could not be found.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [meetingId]);

  async function handleJoin(opts: { audioEnabled: boolean; videoEnabled: boolean }) {
    try {
      const res = await apiFetch(`/v1/hr/meetings/${meetingId}/join`, { method: 'POST' });
      setMeeting(res.meeting);
      setJoined({ iceServers: res.iceServers, role: res.role, audioEnabled: opts.audioEnabled, videoEnabled: opts.videoEnabled });
    } catch (e: any) {
      setError(e?.message || 'Could not join this meeting.');
    }
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
