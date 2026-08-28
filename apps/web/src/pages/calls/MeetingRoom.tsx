// ─── MeetingRoom.tsx — Ultra-modern Video Meeting Stage ──────────────────
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, BASE_URL } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { useMediaDevices } from '../../hooks/useMediaDevices.js';

interface ParticipantState {
  name: string;
  stream: MediaStream | null;
  audioMuted: boolean;
  videoOff: boolean;
}
interface ChatMsg { from: string; fromName: string; text: string; ts: number; }
interface QualityStat { kbpsUp: number; kbpsDown: number; packetLoss: number; rttMs: number }

const ini = (n: string) => (n || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtDur = (s: number) => {
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${hrs > 0 ? `${hrs}:` : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export function MeetingRoom({ meetingId, title, kind, role, iceServers, initialAudioEnabled, initialVideoEnabled, myUserId, myName, onLeave, onEndedByHost }: {
  meetingId: string; title: string; kind: 'VIDEO' | 'VOICE'; role: 'HOST' | 'PARTICIPANT';
  iceServers: any[]; initialAudioEnabled: boolean; initialVideoEnabled: boolean;
  myUserId: string; myName: string; onLeave: () => void; onEndedByHost: () => void;
}) {
  const devices = useMediaDevices();
  const isHost = role === 'HOST';

  const [muted, setMuted] = useState(!initialAudioEnabled);
  const [camOff, setCamOff] = useState(!initialVideoEnabled || kind !== 'VIDEO');
  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [participants, setParticipants] = useState<Record<string, ParticipantState>>({});
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [reactions, setReactions] = useState<{ id: number; from: string; emoji: string }[]>([]);
  const [panel, setPanel] = useState<'none' | 'chat' | 'participants' | 'settings' | 'stats'>('none');
  const [chatDraft, setChatDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, QualityStat>>({});
  const [spotlightUser, setSpotlightUser] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<any>(null);
  const reactionIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const statsTimerRef = useRef<any>(null);

  const send = (m: any) => { try { wsRef.current?.send(JSON.stringify({ ...m, meetingId })); } catch { /* */ } };

  const broadcastStatus = useCallback(() => {
    send({ type: 'room-status', audioMuted: muted, videoOff: camOff });
  }, [muted, camOff]);
  useEffect(() => { broadcastStatus(); }, [broadcastStatus]);

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

  // ── Media + signaling setup ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: devices.micId ? { deviceId: { exact: devices.micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: kind === 'VIDEO' ? (devices.cameraId ? { deviceId: { exact: devices.cameraId } } : true) : false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
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

    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/v1/hr/signal';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (ev) => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'ready': send({ type: 'join-room' }); break;
        case 'room-peers': {
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
        }
        case 'peer-joined': {
          setParticipants(prev => ({ ...prev, [m.userId]: prev[m.userId] || { name: m.name, stream: null, audioMuted: false, videoOff: false } }));
          break;
        }
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
        case 'meeting-ended': onEndedByHost(); break;
        case 'room-chat': setChat(prev => [...prev, { from: m.from, fromName: m.fromName, text: m.text, ts: Date.now() }]); break;
        case 'room-reaction': {
          const id = ++reactionIdRef.current;
          setReactions(prev => [...prev, { id, from: m.fromName, emoji: m.emoji }]);
          setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2500);
          break;
        }
        case 'room-status': setParticipants(prev => prev[m.from] ? { ...prev, [m.from]: { ...prev[m.from], audioMuted: !!m.audioMuted, videoOff: !!m.videoOff } } : prev); break;
        case 'host-mute-request': setMuted(true); break;
        case 'host-remove': onEndedByHost(); break;
      }
    };

    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
      try { send({ type: 'leave-room' }); } catch { /* */ }
      try { ws.close(); } catch { /* */ }
      pcMapRef.current.forEach(pc => pc.close());
      pcMapRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // Controls
  const toggleMute = () => { const t = localStreamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); } };
  const toggleCam = () => { const t = localStreamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled); } };

  const toggleScreenShare = async () => {
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
    if (!text) return;
    send({ type: 'room-chat', text });
    setChat(prev => [...prev, { from: myUserId, fromName: myName, text, ts: Date.now() }]);
    setChatDraft('');
  };

  const sendReaction = (emoji: string) => {
    send({ type: 'room-reaction', emoji });
    const id = ++reactionIdRef.current;
    setReactions(prev => [...prev, { id, from: myName, emoji }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2500);
  };

  const copyMeetingLink = () => {
    const url = `${window.location.origin}/nexushr/calls/meeting/${meetingId}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const leave = async () => {
    try { await apiFetch(`/v1/hr/meetings/${meetingId}/leave`, { method: 'POST' }); } catch { /* */ }
    onLeave();
  };

  const endForEveryone = async () => {
    try { await apiFetch(`/v1/hr/meetings/${meetingId}/end`, { method: 'POST' }); } catch { /* */ }
    onLeave();
  };

  const participantList = Object.entries(participants);
  const totalCount = participantList.length + 1;

  // Determine active main speaker spotlight
  const activeSpotlight = spotlightUser ? participants[spotlightUser] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#0b0f19', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'var(--font)' }}>
      {error && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, fontSize: 13, color: '#fff', background: '#ef4444', borderRadius: 20, padding: '6px 16px', boxShadow: '0 4px 12px rgba(239,68,68,0.4)', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* 🌟 Top Header Bar (O'Meeting / Parrot Style) */}
      <div style={{ height: 60, background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 10 }}>
        {/* Left Title & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
            N
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{title}</span>
              {recording && (
                <span style={{ fontSize: 10, fontWeight: 800, background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' }} /> REC
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Elapsed: {fmtDur(elapsed)}</span>
              <span>•</span>
              <span>{totalCount} Participant{totalCount === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>

        {/* Right Header Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={copyMeetingLink}
            style={{ height: 34, fontSize: 12, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="link" size={13} />
            {copiedLink ? 'Link Copied!' : 'Copy Meeting Link'}
          </Button>

          <Button
            size="sm"
            onClick={() => setPanel(p => p === 'participants' ? 'none' : 'participants')}
            style={{ height: 34, fontSize: 12, background: 'rgba(255,255,255,0.08)', color: '#f8fafc', border: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="users" size={14} color="#38bdf8" />
            <span>{totalCount}</span>
          </Button>
        </div>
      </div>

      {/* 🚀 Main Video Stage & Side Panel Grid */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Reaction overlay animations */}
        <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 40 }}>
          {reactions.map(r => (
            <div key={r.id} style={{ fontSize: 15, color: '#fff', background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}>
              {r.emoji} <span style={{ fontWeight: 600, marginLeft: 4 }}>{r.from}</span>
            </div>
          ))}
        </div>

        {/* Video Canvas Stage */}
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          
          {/* Main Pinned / Active Speaker Spotlight (Large Video Screen) */}
          <div style={{ flex: 1, background: '#020617', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            
            {/* If a remote user is spotlighted */}
            {activeSpotlight && activeSpotlight.stream && !activeSpotlight.videoOff ? (
              <video
                autoPlay
                playsInline
                ref={el => { if (el && el.srcObject !== activeSpotlight.stream) el.srcObject = activeSpotlight.stream; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              /* Local User Video Spotlight (Default) */
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: camOff && !sharing ? 'none' : 'block',
                    transform: sharing ? 'none' : 'scaleX(-1)',
                  }}
                />
                {camOff && !sharing && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#1e293b', border: '3px solid #38bdf8', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, boxShadow: '0 0 30px rgba(56,189,248,0.25)' }}>
                      {ini(myName)}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>{myName}</div>
                    <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Camera is currently turned off</div>
                  </div>
                )}
              </>
            )}

            {/* Pinned Speaker Tag */}
            <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 14px', border: '1px solid rgba(255,255,255,0.15)', fontSize: 12.5, fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="bookmark" size={13} color="#38bdf8" />
              <span>{activeSpotlight ? activeSpotlight.name : `${myName} (Main Stage)`}</span>
            </div>
          </div>

          {/* Bottom Participant Thumbnails Ribbon (Only shown when 2+ people in meeting) */}
          {participantList.length > 0 && (
            <div style={{ height: 110, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
              {/* Local thumbnail */}
              <div
                onClick={() => setSpotlightUser(null)}
                style={{
                  width: 160,
                  height: '100%',
                  borderRadius: 12,
                  background: '#1e293b',
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: 'pointer',
                  border: spotlightUser === null ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                  flexShrink: 0,
                }}
              >
                {!camOff ? (
                  <video ref={el => { if (el && localStreamRef.current) el.srcObject = localStreamRef.current; }} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#38bdf8', fontWeight: 700, fontSize: 16 }}>
                    {ini(myName)}
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.65)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#fff', fontWeight: 600 }}>
                  You {muted && ' (Muted)'}
                </div>
              </div>

              {/* Remote Participants */}
              {participantList.map(([id, p]) => (
                <div
                  key={id}
                  onClick={() => setSpotlightUser(id)}
                  style={{
                    width: 160,
                    height: '100%',
                    borderRadius: 12,
                    background: '#1e293b',
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: 'pointer',
                    border: spotlightUser === id ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                    flexShrink: 0,
                  }}
                >
                  {p.stream && !p.videoOff ? (
                    <video autoPlay playsInline ref={el => { if (el && el.srcObject !== p.stream) el.srcObject = p.stream; }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#93c5fd', fontWeight: 700, fontSize: 16 }}>
                      {ini(p.name)}
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.65)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#fff', fontWeight: 600 }}>
                    {p.name} {p.audioMuted && ' (Muted)'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 💬 Right Drawer Side Panel (Chat / Participants / Quality Stats) */}
        {panel !== 'none' && (
          <div style={{ width: 340, background: '#0f172a', borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
            {/* Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', textTransform: 'capitalize' }}>
                {panel === 'chat' ? 'Meeting Live Chat' : panel === 'participants' ? `Participants (${totalCount})` : 'Call Settings & Stats'}
              </div>
              <button type="button" onClick={() => setPanel('none')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* Chat Panel */}
            {panel === 'chat' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chat.length === 0 && (
                    <div style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>
                      No messages sent yet. Start the conversation with everyone in this call!
                    </div>
                  )}
                  {chat.map((m, i) => (
                    <div key={i} style={{ background: m.from === myUserId ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: m.from === myUserId ? '#38bdf8' : '#93c5fd', marginBottom: 2 }}>
                        {m.from === myUserId ? 'You' : m.fromName}
                      </div>
                      <div style={{ fontSize: 13, color: '#f8fafc' }}>{m.text}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
                  <input
                    value={chatDraft}
                    onChange={e => setChatDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                    placeholder="Type a message to everyone…"
                    style={{ flex: 1, height: 36, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '0 12px', color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                  <Button size="sm" onClick={sendChat} style={{ height: 36, background: '#38bdf8', color: '#0f172a', fontWeight: 700 }}>
                    Send
                  </Button>
                </div>
              </div>
            )}

            {/* Participants Panel */}
            {panel === 'participants' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{myName} (You)</div>
                  <span style={{ fontSize: 11, background: '#38bdf8', color: '#0f172a', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>Host</span>
                </div>
                {participantList.map(([id, p]) => (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{p.name}</span>
                    <Icon name="volume2" size={14} color={p.audioMuted ? '#ef4444' : '#10b981'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🔴 Floating Media Controls Toolbar (Bottom Dock) */}
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
        <div style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 40, padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          {/* Record */}
          <button
            type="button"
            onClick={() => setRecording(v => !v)}
            title={recording ? 'Stop Recording' : 'Start Recording'}
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: recording ? '#ef4444' : 'rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
          </button>

          {/* Mute Mic */}
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? 'Unmute Mic' : 'Mute Mic'}
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: muted ? '#ef4444' : 'rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <Icon name="volume2" size={18} color="#fff" />
          </button>

          {/* Camera On/Off */}
          {kind === 'VIDEO' && (
            <button
              type="button"
              onClick={toggleCam}
              title={camOff ? 'Turn Camera On' : 'Turn Camera Off'}
              style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: camOff ? '#ef4444' : 'rgba(255,255,255,0.12)', color: '#fff' }}
            >
              <Icon name="camera" size={18} color="#fff" />
            </button>
          )}

          {/* Screen Share */}
          {kind === 'VIDEO' && (
            <button
              type="button"
              onClick={toggleScreenShare}
              title={sharing ? 'Stop Screen Sharing' : 'Share Screen'}
              style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sharing ? '#38bdf8' : 'rgba(255,255,255,0.12)', color: sharing ? '#0f172a' : '#fff' }}
            >
              <Icon name="monitor" size={18} />
            </button>
          )}

          {/* Reaction */}
          <button
            type="button"
            onClick={() => sendReaction('👍')}
            title="Send Thumbs Up"
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <Icon name="smile" size={18} color="#fff" />
          </button>

          {/* Chat Toggle */}
          <button
            type="button"
            onClick={() => setPanel(p => p === 'chat' ? 'none' : 'chat')}
            title="Chat Panel"
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: panel === 'chat' ? '#38bdf8' : 'rgba(255,255,255,0.12)', color: panel === 'chat' ? '#0f172a' : '#fff' }}
          >
            <Icon name="messageSquare" size={18} />
          </button>

          {/* End / Leave Call Button */}
          <button
            type="button"
            onClick={isHost ? endForEveryone : leave}
            title={isHost ? 'End Meeting for All' : 'Leave Meeting'}
            style={{ height: 44, padding: '0 20px', borderRadius: 22, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 4px 14px rgba(239,68,68,0.45)' }}
          >
            <Icon name="x" size={18} color="#fff" />
            <span>{isHost ? 'End Meeting' : 'Leave Call'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
