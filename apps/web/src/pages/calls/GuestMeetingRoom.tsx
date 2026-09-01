// ─── GuestMeetingRoom.tsx — the lean, guest-scoped meeting room ──────────
// Deliberately NOT MeetingRoom.tsx cut down: that component's polls/Q&A/
// transcript/breakout-rooms/AI-summary/host-controls panels are ALL backed
// by authenticated /v1/calls/... REST endpoints a guest cookie is blocked
// from ever reaching (middleware/auth.ts rejects typ:'guest' outright — see
// calls.routes.ts's module comment on the guest join feature). Duplicating
// the WebRTC mesh logic here — rather than refactoring MeetingRoom.tsx to
// share it — keeps the working, complex authenticated room completely
// untouched while this smaller, independently-auditable surface is the one
// actually exposed to anonymous visitors. What a real guest gets, same as
// joining a Zoom/Meet/Teams call as a guest: camera/mic, screen share,
// chat, reactions, the live participant grid, leave. Nothing more.
import React, { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../../lib/api.js';
import { guestFetch } from '../../lib/guestCallApi.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';

interface ParticipantState { name: string; stream: MediaStream | null; audioMuted: boolean; videoOff: boolean; }
interface ChatMsg { from: string; fromName: string; text: string; ts: number; }

const fmtDur = (s: number) => {
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${hrs > 0 ? `${hrs}:` : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export function GuestMeetingRoom({
  meetingId, title, kind, iceServers, initialAudioEnabled, initialVideoEnabled,
  myGuestId, myName, participantId, chatDisabled, screenShareDisabled,
}: {
  meetingId: string; title: string; kind: 'VIDEO' | 'VOICE'; iceServers: any[];
  initialAudioEnabled: boolean; initialVideoEnabled: boolean;
  myGuestId: string; myName: string; participantId: string;
  chatDisabled: boolean; screenShareDisabled: boolean;
}) {
  const [muted, setMuted] = useState(!initialAudioEnabled);
  const [camOff, setCamOff] = useState(!initialVideoEnabled || kind !== 'VIDEO');
  const [sharing, setSharing] = useState(false);
  const [participants, setParticipants] = useState<Record<string, ParticipantState>>({});
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [left, setLeft] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const reactionIdRef = useRef(0);
  const timerRef = useRef<any>(null);

  const send = (m: any) => { try { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ meetingId, ...m })); } catch { /* */ } };

  function createPeerConnection(remoteId: string): RTCPeerConnection {
    const existing = pcMapRef.current.get(remoteId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'ice', to: remoteId, candidate: e.candidate }); };
    pc.ontrack = (e) => {
      setParticipants(prev => ({ ...prev, [remoteId]: { ...(prev[remoteId] || { name: '', audioMuted: false, videoOff: false }), stream: e.streams[0] } }));
    };
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    pcMapRef.current.set(remoteId, pc);
    return pc;
  }
  function closePeer(remoteId: string) {
    pcMapRef.current.get(remoteId)?.close();
    pcMapRef.current.delete(remoteId);
    setParticipants(prev => { const next = { ...prev }; delete next[remoteId]; return next; });
  }

  async function leaveMeeting() {
    try { send({ type: 'leave-room' }); } catch { /* */ }
    try { wsRef.current?.close(); } catch { /* */ }
    pcMapRef.current.forEach(pc => pc.close());
    pcMapRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    guestFetch(`/v1/calls-public/meetings/${meetingId}/leave`, { method: 'POST', body: JSON.stringify({ participantId }) }).catch(() => {});
    setLeft(true);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: kind === 'VIDEO',
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        stream.getAudioTracks().forEach(t => t.enabled = initialAudioEnabled);
        stream.getVideoTracks().forEach(t => t.enabled = initialVideoEnabled);
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        setError('Could not access your camera/microphone.');
      }
    })();

    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/v1/calls/signal';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (ev) => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'ready': send({ type: 'join-room' }); break;
        case 'room-peers':
          for (const peer of (m.peers || [])) {
            setParticipants(prev => ({ ...prev, [peer.id]: prev[peer.id] || { name: peer.name, stream: null, audioMuted: false, videoOff: false } }));
            const pc = createPeerConnection(peer.id);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              send({ type: 'offer', to: peer.id, sdp: offer });
            } catch { /* */ }
          }
          break;
        case 'peer-joined':
          setParticipants(prev => ({ ...prev, [m.userId]: prev[m.userId] || { name: m.name, stream: null, audioMuted: false, videoOff: false } }));
          break;
        case 'offer': {
          setParticipants(prev => ({ ...prev, [m.from]: { ...(prev[m.from] || { stream: null, audioMuted: false, videoOff: false }), name: m.fromName || prev[m.from]?.name || 'Guest' } }));
          const pc = createPeerConnection(m.from);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            send({ type: 'answer', to: m.from, sdp: answer });
          } catch { /* */ }
          break;
        }
        case 'answer': { try { await pcMapRef.current.get(m.from)?.setRemoteDescription(new RTCSessionDescription(m.sdp)); } catch { /* */ } break; }
        case 'ice': { try { await pcMapRef.current.get(m.from)?.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch { /* */ } break; }
        case 'peer-left': closePeer(m.userId); break;
        case 'meeting-ended': setEnded(true); break;
        case 'room-chat': setChat(prev => [...prev, { from: m.from, fromName: m.fromName, text: m.text, ts: Date.now() }]); break;
        case 'room-reaction': {
          const rid = ++reactionIdRef.current;
          setReactions(prev => [...prev, { id: rid, emoji: m.emoji }]);
          setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2500);
          break;
        }
        case 'room-status': setParticipants(prev => prev[m.from] ? { ...prev, [m.from]: { ...prev[m.from], audioMuted: !!m.audioMuted, videoOff: !!m.videoOff } } : prev); break;
        case 'host-mute-request': { const t = localStreamRef.current?.getAudioTracks()[0]; if (t) t.enabled = false; setMuted(true); break; }
        case 'host-camera-off-request': { const t = localStreamRef.current?.getVideoTracks()[0]; if (t) t.enabled = false; setCamOff(true); break; }
        case 'host-remove': setEnded(true); break;
      }
    };

    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      try { ws.close(); } catch { /* */ }
      pcMapRef.current.forEach(pc => pc.close());
      pcMapRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { send({ type: 'room-status', audioMuted: muted, videoOff: camOff }); }, [muted, camOff]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const toggleMute = () => { const t = localStreamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); } };
  const toggleCam = () => { const t = localStreamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled); } };

  const toggleScreenShare = async () => {
    if (screenShareDisabled) return;
    if (sharing) {
      const camTrack = cameraTrackRef.current;
      for (const pc of pcMapRef.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && camTrack) sender.replaceTrack(camTrack).catch(() => {});
      }
      if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setSharing(false);
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      for (const pc of pcMapRef.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack).catch(() => {});
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      screenTrack.onended = () => toggleScreenShare();
      setSharing(true);
    } catch { /* cancelled */ }
  };

  const sendChat = () => {
    const text = chatDraft.trim();
    if (!text || chatDisabled) return;
    send({ type: 'room-chat', text });
    setChat(prev => [...prev, { from: myGuestId, fromName: myName, text, ts: Date.now() }]);
    setChatDraft('');
  };
  const sendReaction = (emoji: string) => {
    send({ type: 'room-reaction', emoji });
    const rid = ++reactionIdRef.current;
    setReactions(prev => [...prev, { id: rid, emoji }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2500);
  };
  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/meet/${meetingId}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const ctrlBtn = (icon: IconName, label: string, active: boolean, danger: boolean, onClick: () => void, disabled?: boolean) => (
    <button
      type="button" title={label} onClick={onClick} disabled={disabled}
      style={{
        width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: danger ? 'var(--red)' : active ? '#3c4043' : '#fff', color: danger || active ? '#fff' : '#202124',
        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={20} />
    </button>
  );

  if (left) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#111827', borderRadius: 16, border: '1px solid #1f2937', padding: 32, width: 360, textAlign: 'center' }}>
          <Icon name="checkCircle" size={28} color="var(--green)" />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>You left the meeting</div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 6 }}>You can close this tab now.</div>
        </div>
      </div>
    );
  }
  if (ended) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#111827', borderRadius: 16, border: '1px solid #1f2937', padding: 32, width: 360, textAlign: 'center' }}>
          <Icon name="clock" size={28} color="#9ca3af" />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginTop: 12 }}>The host ended this meeting</div>
        </div>
      </div>
    );
  }

  const tiles = [
    { id: myGuestId, name: `${myName} (You)`, stream: localVideoRef, isLocal: true, muted, videoOff: camOff },
    ...Object.entries(participants).map(([id, p]) => ({ id, name: p.name || 'Guest', stream: p.stream, isLocal: false, muted: p.audioMuted, videoOff: p.videoOff })),
  ];
  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : 3;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0b0f', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#e8eaed', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600 }}>{title}</span>
          <span style={{ color: '#9aa0a6', fontVariantNumeric: 'tabular-nums' }}>{fmtDur(elapsed)}</span>
        </div>
        <Button variant="outline" onClick={copyLink} style={{ height: 32, fontSize: 12, borderColor: '#374151', color: '#d1d5db', background: 'transparent' }}>
          <Icon name={copiedLink ? 'check' : 'link'} size={13} /> {copiedLink ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      {error && <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#7f1d1d', color: '#fecaca', fontSize: 12.5, borderRadius: 8 }}>{error}</div>}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, padding: '0 16px 16px', overflow: 'auto' }}>
        {tiles.map(t => (
          <div key={t.id} style={{ position: 'relative', background: '#1f2937', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
            {t.isLocal ? (
              !camOff ? <video ref={t.stream as React.RefObject<HTMLVideoElement>} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} /> : <PersonAvatar name={t.name} size={56} />
            ) : (
              (t.stream && !t.videoOff) ? (
                <video autoPlay playsInline ref={el => { if (el && t.stream) (el as any).srcObject = t.stream; }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : <PersonAvatar name={t.name} size={56} />
            )}
            <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: 6, fontSize: 11.5, color: '#fff' }}>
              {t.muted && <Icon name="micOff" size={11} />}
              {t.name}
            </div>
          </div>
        ))}
      </div>

      {reactions.length > 0 && (
        <div style={{ position: 'absolute', bottom: 90, right: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {reactions.map(r => <div key={r.id} style={{ fontSize: 28, animation: 'floatUp 2.5s ease-out' }}>{r.emoji}</div>)}
          <style>{'@keyframes floatUp { from { opacity:1; transform: translateY(0); } to { opacity:0; transform: translateY(-40px); } }'}</style>
        </div>
      )}

      {chatOpen && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, background: '#1f2937', borderLeft: '1px solid #374151', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb' }}>In-call messages</span>
            <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><Icon name="x" size={16} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chat.map((c, i) => (
              <div key={i}>
                <div style={{ fontSize: 11.5, color: '#9ca3af' }}>{c.fromName}</div>
                <div style={{ fontSize: 13, color: '#f3f4f6' }}>{c.text}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: 10, borderTop: '1px solid #374151', display: 'flex', gap: 6 }}>
            <input
              value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder={chatDisabled ? 'Chat is disabled by the host' : 'Send a message'} disabled={chatDisabled}
              style={{ flex: 1, height: 34, borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: 12.5, padding: '0 10px', outline: 'none' }}
            />
          </div>
        </div>
      )}

      <div style={{ padding: '12px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        {ctrlBtn(muted ? 'micOff' : 'mic', muted ? 'Unmute' : 'Mute', muted, false, toggleMute)}
        {kind === 'VIDEO' && ctrlBtn('camera', camOff ? 'Start video' : 'Stop video', camOff, false, toggleCam)}
        {ctrlBtn('monitor', screenShareDisabled ? 'Screen share disabled by host' : 'Share screen', sharing, false, toggleScreenShare, screenShareDisabled)}
        <Popover2 onEmoji={sendReaction} />
        {ctrlBtn('messageSquare', 'Chat', chatOpen, false, () => setChatOpen(v => !v))}
        {ctrlBtn('phone', 'Leave', false, true, leaveMeeting)}
      </div>
    </div>
  );
}

// A minimal inline reaction picker — not worth its own file for six emoji.
function Popover2({ onEmoji }: { onEmoji: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const EMOJI = ['👍', '👏', '❤️', '😂', '🎉', '👋'];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button" title="Reactions" onClick={() => setOpen(v => !v)}
        style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer', background: open ? '#3c4043' : '#fff', color: open ? '#fff' : '#202124', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="smile" size={20} />
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: 58, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', border: '1px solid #374151', borderRadius: 12, padding: 8, display: 'flex', gap: 4 }}>
          {EMOJI.map(e => (
            <button key={e} onClick={() => { onEmoji(e); setOpen(false); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4 }}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
