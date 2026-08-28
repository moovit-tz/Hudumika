import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { DatePicker } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { MeetingSession } from './calls/MeetingSession.js';
import { CallsMetrics } from './calls/CallsMetrics.js';

interface Staff { id: string; name: string; role: string; email?: string }
interface CallRow { id: string; caller_id: string; callee_id: string; kind: string; status: string; started_at: string; duration_seconds: number; caller_name: string; callee_name: string }
type CallState = 'idle' | 'calling' | 'incoming' | 'in-call';
interface MeetingRow { id: string; title: string; join_code: string; kind: string; status: string; scheduled_at: string | null; started_at: string | null; ended_at: string | null; locked: boolean; host_id: string; host_name: string }

const ini = (n: string) => (n || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Calls() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<CallRow[]>([]);
  const [callState, setCallState] = useState<CallState>('idle');
  const [peer, setPeer] = useState<Staff | null>(null);
  const [kind, setKind] = useState<'VIDEO' | 'VOICE'>('VIDEO');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const callId = useRef<string | null>(null);
  const iceServers = useRef<any[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const answeredAt = useRef<number | null>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try { const s = await apiFetch('/v1/hr/staff'); if (Array.isArray(s)) setStaff(s.filter((x: any) => x.id !== user?.id)); } catch { /* */ }
    try { const p = await apiFetch('/v1/hr/presence'); if (p?.online) setOnline(new Set(p.online)); } catch { /* */ }
    try { const h = await apiFetch('/v1/hr/calls'); if (Array.isArray(h)) setHistory(h); } catch { /* */ }
    try { const cfg = await apiFetch('/v1/hr/config'); if (cfg?.iceServers) iceServers.current = cfg.iceServers; } catch { /* */ }
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  // ── Meetings ──
  const [tab, setTab] = useState<'directory' | 'meetings' | 'metrics'>('directory');
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState<Date | undefined>(undefined);
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedKind, setSchedKind] = useState<'VIDEO' | 'VOICE'>('VIDEO');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const loadMeetings = useCallback(async () => {
    try { const m = await apiFetch('/v1/hr/meetings'); if (Array.isArray(m)) setMeetings(m); } catch { /* */ }
  }, []);
  useEffect(() => { if (tab === 'meetings') loadMeetings(); }, [tab, loadMeetings]);

  async function startInstantMeeting() {
    setCreatingMeeting(true);
    try {
      const m = await apiFetch('/v1/hr/meetings', { method: 'POST', body: JSON.stringify({ title: `${user?.name || 'Team'}'s meeting`, kind: 'VIDEO' }) });
      setActiveMeetingId(m.id);
    } catch (e: any) { showAlert(e?.message || 'Could not start a meeting.'); }
    finally { setCreatingMeeting(false); }
  }

  async function scheduleMeeting() {
    if (!schedTitle.trim()) { showAlert('Give the meeting a title.'); return; }
    if (!schedDate) { showAlert('Pick a date.'); return; }
    const [h, min] = schedTime.split(':').map(Number);
    const when = new Date(schedDate); when.setHours(h || 0, min || 0, 0, 0);
    try {
      await apiFetch('/v1/hr/meetings', { method: 'POST', body: JSON.stringify({ title: schedTitle, kind: schedKind, scheduled_at: when.toISOString() }) });
      setShowSchedule(false); setSchedTitle(''); setSchedDate(undefined); setSchedTime('09:00');
      loadMeetings();
    } catch (e: any) { showAlert(e?.message || 'Could not schedule that meeting.'); }
  }

  async function cancelMeeting(id: string) {
    try { await apiFetch(`/v1/hr/meetings/${id}`, { method: 'DELETE' }); loadMeetings(); } catch (e: any) { showAlert(e?.message || 'Could not cancel.'); }
  }

  function copyJoinLink(m: MeetingRow) {
    const url = `${window.location.origin}/nexushr/calls/meeting/${m.id}`;
    navigator.clipboard?.writeText(url);
  }

  async function joinByCode() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    try {
      const m = await apiFetch(`/v1/hr/meetings/by-code/${encodeURIComponent(code)}`);
      setActiveMeetingId(m.id);
      setJoinCodeInput('');
    } catch { showAlert('No meeting found for that code.'); }
  }

  // ── Signaling socket ──
  const send = (m: any) => { try { wsRef.current?.send(JSON.stringify(m)); } catch { /* */ } };

  const cleanup = useCallback((logStatus?: string) => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    pcRef.current?.close(); pcRef.current = null;
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    if (logStatus && callId.current) {
      const dur = answeredAt.current ? Math.round((Date.now() - answeredAt.current) / 1000) : 0;
      apiFetch(`/v1/hr/calls/${callId.current}`, { method: 'PATCH', body: JSON.stringify({ status: logStatus, duration_seconds: dur }) }).then(load).catch(() => {});
    }
    callId.current = null; answeredAt.current = null;
    setElapsed(0); setMuted(false); setCamOff(false);
    setCallState('idle'); setPeer(null);
  }, [load]);

  const newPeerConnection = useCallback((remoteId: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers.current });
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'ice', to: remoteId, candidate: e.candidate }); };
    pc.ontrack = (e) => { if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { /* peer gone */ } };
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pcRef.current = pc;
    return pc;
  }, []);

  const startTimer = () => {
    answeredAt.current = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - (answeredAt.current || Date.now())) / 1000)), 1000);
  };

  const getMedia = async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
    return stream;
  };

  useEffect(() => {
    // Browsers send cookies on a WS handshake the same as any other request
    // to this origin, so the httpOnly access cookie authenticates this
    // connection with nothing to attach — see calls.routes.ts's /signal.
    // No more raw access token riding in the URL (server/proxy logs,
    // browser history).
    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/v1/hr/signal';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (ev) => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'ready': setOnline(new Set(m.online || [])); break;
        case 'presence': setOnline(prev => { const s = new Set(prev); if (m.online) s.add(m.userId); else s.delete(m.userId); return s; }); break;
        case 'ring': {
          if (callState !== 'idle') { send({ type: 'decline', to: m.from }); return; } // busy
          callId.current = m.callId || null;
          setPeer({ id: m.from, name: m.fromName || 'Caller', role: '' });
          setKind(m.kind === 'VOICE' ? 'VOICE' : 'VIDEO');
          setCallState('incoming');
          break;
        }
        case 'accept': { // callee accepted — caller now makes the offer
          try {
            const pc = newPeerConnection(m.from);
            const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
            send({ type: 'offer', to: m.from, sdp: offer });
            if (callId.current) apiFetch(`/v1/hr/calls/${callId.current}`, { method: 'PATCH', body: JSON.stringify({ status: 'ONGOING' }) }).catch(() => {});
            setCallState('in-call'); startTimer();
          } catch { setError('Could not start the call.'); cleanup('ENDED'); }
          break;
        }
        case 'offer': { // callee receives the caller's offer
          try {
            const pc = pcRef.current || newPeerConnection(m.from);
            await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
            const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
            send({ type: 'answer', to: m.from, sdp: answer });
          } catch { setError('Could not connect.'); cleanup('ENDED'); }
          break;
        }
        case 'answer': { try { await pcRef.current?.setRemoteDescription(new RTCSessionDescription(m.sdp)); } catch { /* */ } break; }
        case 'ice': { try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch { /* */ } break; }
        case 'decline': cleanup('DECLINED'); setError('Call declined.'); break;
        case 'cancel': cleanup('MISSED'); break;
        case 'hangup': cleanup('ENDED'); break;
      }
    };
    return () => { try { ws.close(); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, newPeerConnection, cleanup]);

  // ── Actions ──
  const startCall = async (person: Staff, k: 'VIDEO' | 'VOICE') => {
    setError(null); setKind(k); setPeer(person);
    try {
      await getMedia(k === 'VIDEO');
      const rec = await apiFetch('/v1/hr/calls', { method: 'POST', body: JSON.stringify({ callee_id: person.id, kind: k }) });
      callId.current = rec?.id || null;
      send({ type: 'ring', to: person.id, kind: k, callId: callId.current });
      setCallState('calling');
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' : (e?.message || 'Could not start the call.'));
      cleanup();
    }
  };
  const acceptCall = async () => {
    try { await getMedia(kind === 'VIDEO'); send({ type: 'accept', to: peer!.id }); setCallState('in-call'); startTimer(); }
    catch (e: any) { setError(e?.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' : 'Could not answer.'); send({ type: 'decline', to: peer!.id }); cleanup('DECLINED'); }
  };
  const declineCall = () => { if (peer) send({ type: 'decline', to: peer.id }); cleanup('DECLINED'); };
  const hangup = () => { if (peer) send({ type: callState === 'calling' ? 'cancel' : 'hangup', to: peer.id }); cleanup(callState === 'calling' ? 'MISSED' : 'ENDED'); };
  const toggleMute = () => { const t = localStream.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); } };
  const toggleCam = () => { const t = localStream.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled); } };

  const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
  const inCall = callState === 'in-call' || callState === 'calling';

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader crumbs={['NexusHR', 'Calls']} titlePlain="Voice &" titleEm="video"
        subtitle="Call a colleague directly — peer-to-peer, with live presence and a record of every call." />

      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {([['directory', 'Direct calls'], ['meetings', 'Meetings'], ['metrics', 'Metrics']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', color: tab === key ? 'hsl(var(--primary))' : 'var(--ink3)', borderBottom: tab === key ? '2px solid hsl(var(--primary))' : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'directory' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
        {/* Directory + presence */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Team</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>{online.size} online now</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {staff.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No colleagues found.</div>}
            {staff.map(p => {
              const isOnline = online.has(p.id);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{ini(p.name)}</div>
                    <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--white)', background: isOnline ? 'var(--green)' : 'var(--ink3)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: isOnline ? 'var(--green)' : 'var(--ink3)' }}>{isOnline ? 'Online' : 'Offline'}{p.role ? ` · ${p.role}` : ''}</div>
                  </div>
                  <button type="button" title="Voice call" disabled={!isOnline || callState !== 'idle'} onClick={() => startCall(p, 'VOICE')}
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: isOnline && callState === 'idle' ? 'pointer' : 'default', opacity: isOnline && callState === 'idle' ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="phone" size={15} color="var(--ink2)" />
                  </button>
                  <button type="button" title="Video call" disabled={!isOnline || callState !== 'idle'} onClick={() => startCall(p, 'VIDEO')}
                    style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: isOnline && callState === 'idle' ? 'hsl(var(--primary))' : 'var(--bg)', cursor: isOnline && callState === 'idle' ? 'pointer' : 'default', opacity: isOnline && callState === 'idle' ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="camera" size={15} color={isOnline && callState === 'idle' ? 'hsl(var(--primary-foreground))' : 'var(--ink3)'} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* History */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>Recent calls</div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No calls yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {history.slice(0, 12).map(h => {
                const outgoing = h.caller_id === user?.id;
                const other = outgoing ? h.callee_name : h.caller_name;
                const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                    <Icon name={h.kind === 'VOICE' ? 'phone' : 'camera'} size={14} color={missed ? 'var(--red)' : 'var(--ink3)'} />
                    <Icon name={outgoing ? 'arrowUpRight' : 'arrowDown'} size={12} color="var(--ink3)" />
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{other}</span>
                    <span style={{ fontSize: 11, color: missed ? 'var(--red)' : 'var(--ink3)' }}>{missed ? h.status.toLowerCase() : (h.duration_seconds ? fmtDur(h.duration_seconds) : h.status.toLowerCase())}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink3)', minWidth: 62, textAlign: 'right' }}>{new Date(h.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {tab === 'meetings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="default" onClick={startInstantMeeting} disabled={creatingMeeting}>
              <Icon name="camera" size={14} /> {creatingMeeting ? 'Starting…' : 'New meeting'}
            </Button>
            <Button variant="outline" onClick={() => setShowSchedule(v => !v)}>
              <Icon name="calendar" size={14} /> Schedule
            </Button>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinByCode()} placeholder="Have a code? Enter it here"
                style={{ height: 34, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 12.5, width: 200 }} />
              <Button variant="outline" size="sm" onClick={joinByCode}>Join</Button>
            </div>
          </div>

          {showSchedule && (
            <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Schedule a meeting</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="Meeting title"
                  style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13, gridColumn: '1 / -1' }} />
                <DatePicker date={schedDate} onChange={setSchedDate} placeholder="Date" />
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13 }} />
                <select value={schedKind} onChange={e => setSchedKind(e.target.value as 'VIDEO' | 'VOICE')} style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13 }}>
                  <option value="VIDEO">Video</option>
                  <option value="VOICE">Voice only</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="default" size="sm" onClick={scheduleMeeting}>Schedule</Button>
                <Button variant="outline" size="sm" onClick={() => setShowSchedule(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>Meetings</div>
            {meetings.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No meetings yet — start an instant one or schedule ahead.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {meetings.map(m => {
                  const isPast = m.status === 'ENDED' || m.status === 'CANCELLED';
                  const isMine = m.host_id === user?.id;
                  const statusColor = m.status === 'ACTIVE' ? 'var(--green)' : m.status === 'SCHEDULED' ? 'var(--gold)' : 'var(--ink3)';
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                      <Icon name={m.kind === 'VOICE' ? 'phone' : 'camera'} size={14} color="var(--ink3)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}{m.locked && <Icon name="lock" size={10} color="var(--ink3)" />}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                          Hosted by {isMine ? 'you' : m.host_name} · {m.status === 'SCHEDULED' && m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : m.status.toLowerCase()}
                        </div>
                      </div>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      {!isPast && (
                        <>
                          <Button variant="ghost" size="xs" onClick={() => copyJoinLink(m)} title="Copy join link"><Icon name="copy" size={13} /></Button>
                          {isMine && m.status === 'SCHEDULED' && (
                            <Button variant="ghost" size="xs" onClick={() => cancelMeeting(m.id)} title="Cancel"><Icon name="x" size={13} color="var(--red)" /></Button>
                          )}
                          <Button variant="default" size="xs" onClick={() => setActiveMeetingId(m.id)}>Join</Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'metrics' && <CallsMetrics />}

      {activeMeetingId && (
        <MeetingSession meetingId={activeMeetingId} onExit={() => { setActiveMeetingId(null); loadMeetings(); }} />
      )}

      {/* Incoming call prompt */}
      {callState === 'incoming' && peer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 18, padding: 32, width: 340, textAlign: 'center', boxShadow: 'var(--elev-lg)' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, margin: '0 auto 14px' }}>{ini(peer.name)}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{peer.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4, marginBottom: 24 }}>Incoming {kind === 'VIDEO' ? 'video' : 'voice'} call…</div>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
              {/* TODO design-system: migrate to <Button variant="destructive"> once it can express a fixed-size circular icon button (paired with the plain --green accept button below, so only converting one half would leave the pair inconsistent). */}
              <button type="button" onClick={declineCall} style={{ width: 58, height: 58, borderRadius: '50%', border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={22} color="#fff" /></button>
              <button type="button" onClick={acceptCall} style={{ width: 58, height: 58, borderRadius: '50%', border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={22} color="#fff" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Active / outgoing call stage */}
      {inCall && peer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0b0b0f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video ref={remoteVideo} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#0b0b0f' }} />
            {callState === 'calling' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 10 }}>
                <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>{ini(peer.name)}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{peer.name}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Ringing…</div>
              </div>
            )}
            {callState === 'in-call' && (
              <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{peer.name} · {fmtDur(elapsed)}</div>
            )}
            {/* Local preview */}
            <video ref={localVideo} autoPlay playsInline muted style={{ position: 'absolute', bottom: 100, right: 16, width: 150, height: 200, objectFit: 'cover', borderRadius: 12, border: '2px solid rgba(255,255,255,0.3)', background: '#111', display: kind === 'VIDEO' ? 'block' : 'none' }} />
          </div>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 30px', background: '#0b0b0f' }}>
            <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={ctrlBtn(muted)}><Icon name="volume2" size={20} color={muted ? '#111' : '#fff'} /></button>
            {kind === 'VIDEO' && <button type="button" onClick={toggleCam} title={camOff ? 'Camera on' : 'Camera off'} style={ctrlBtn(camOff)}><Icon name="camera" size={20} color={camOff ? '#111' : '#fff'} /></button>}
            <button type="button" onClick={hangup} title="Hang up" style={{ ...ctrlBtn(false), background: 'var(--red)' }}><Icon name="x" size={20} color="#fff" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function ctrlBtn(active: boolean): React.CSSProperties {
  return { width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)' };
}
