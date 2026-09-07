import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, IconName } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

interface Staff {
  id: string;
  name: string;
  role: string;
  email?: string;
  department?: string;
}

interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  kind: string;
  status: string;
  started_at: string;
  duration_seconds: number;
  caller_name: string;
  callee_name: string;
}

type CallState = 'idle' | 'calling' | 'incoming' | 'in-call';

const ini = (n: string) => (n || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Calls() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [wsConnected, setWsConnected] = useState(false);

  // ── Filter & Pagination States - Directory ──
  const [searchStaff, setSearchStaff] = useState('');
  const [presenceFilter, setPresenceFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [dirPage, setDirPage] = useState(1);
  const DIR_PAGE_SIZE = 8;

  // ── Filter & Pagination States - History Log ──
  const [searchHistory, setSearchHistory] = useState('');
  const [directionFilter, setDirectionFilter] = useState('ALL');
  const [historyKindFilter, setHistoryKindFilter] = useState('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

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
    try {
      const s = await apiFetch('/v1/hr/staff');
      if (Array.isArray(s)) setStaff(s.filter((x: any) => x.id !== user?.id));
    } catch { /* */ }
    try {
      const p = await apiFetch('/v1/calls/presence');
      if (p?.online) setOnline(new Set(p.online));
    } catch { /* */ }
    try {
      const h = await apiFetch('/v1/calls/direct');
      if (Array.isArray(h)) setHistory(h);
    } catch { /* */ }
    try {
      const cfg = await apiFetch('/v1/calls/config');
      if (cfg?.iceServers) iceServers.current = cfg.iceServers;
    } catch { /* */ }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const [tab, setTab] = useState<'directory' | 'history'>('directory');

  // ── WebRTC Signaling Socket ──
  const send = (m: any) => {
    try { wsRef.current?.send(JSON.stringify(m)); } catch { /* */ }
  };

  const cleanup = useCallback((logStatus?: string) => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    pcRef.current?.close(); pcRef.current = null;
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    if (logStatus && callId.current) {
      const dur = answeredAt.current ? Math.round((Date.now() - answeredAt.current) / 1000) : 0;
      apiFetch(`/v1/calls/direct/${callId.current}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: logStatus, duration_seconds: dur })
      }).then(load).catch(() => {});
    }
    callId.current = null;
    answeredAt.current = null;
    setElapsed(0);
    setMuted(false);
    setCamOff(false);
    setCallState('idle');
    setPeer(null);
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
    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/v1/calls/signal';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = async (ev) => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'ready': setOnline(new Set(m.online || [])); break;
        case 'presence': setOnline(prev => { const s = new Set(prev); if (m.online) s.add(m.userId); else s.delete(m.userId); return s; }); break;
        case 'ring': {
          if (callState !== 'idle') { send({ type: 'decline', to: m.from }); return; }
          callId.current = m.callId || null;
          setPeer({ id: m.from, name: m.fromName || 'Caller', role: '' });
          setKind(m.kind === 'VOICE' ? 'VOICE' : 'VIDEO');
          setCallState('incoming');
          break;
        }
        case 'accept': {
          try {
            const pc = newPeerConnection(m.from);
            const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
            send({ type: 'offer', to: m.from, sdp: offer });
            if (callId.current) apiFetch(`/v1/calls/direct/${callId.current}`, { method: 'PATCH', body: JSON.stringify({ status: 'ONGOING' }) }).catch(() => {});
            setCallState('in-call'); startTimer();
          } catch { setError('Could not start the call.'); cleanup('ENDED'); }
          break;
        }
        case 'offer': {
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
  }, [callState, newPeerConnection, cleanup]);

  // ── Actions ──
  const startCall = async (person: Staff, k: 'VIDEO' | 'VOICE') => {
    setError(null); setKind(k); setPeer(person);
    try {
      await getMedia(k === 'VIDEO');
      const rec = await apiFetch('/v1/calls/direct', { method: 'POST', body: JSON.stringify({ callee_id: person.id, kind: k }) });
      callId.current = rec?.id || null;
      send({ type: 'ring', to: person.id, kind: k, callId: callId.current });
      setCallState('calling');
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' : (e?.message || 'Could not start the call.'));
      cleanup();
    }
  };

  const acceptCall = async () => {
    try {
      await getMedia(kind === 'VIDEO');
      send({ type: 'accept', to: peer!.id });
      setCallState('in-call');
      startTimer();
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' : 'Could not answer.');
      send({ type: 'decline', to: peer!.id });
      cleanup('DECLINED');
    }
  };

  const declineCall = () => { if (peer) send({ type: 'decline', to: peer.id }); cleanup('DECLINED'); };
  const hangup = () => { if (peer) send({ type: callState === 'calling' ? 'cancel' : 'hangup', to: peer.id }); cleanup(callState === 'calling' ? 'MISSED' : 'ENDED'); };
  const toggleMute = () => { const t = localStream.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); } };
  const toggleCam = () => { const t = localStream.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled); } };

  const inCall = callState === 'in-call' || callState === 'calling';

  // ── Filtering Logic: Directory ──
  const availableRoles = Array.from(new Set(staff.map(s => s.role).filter(Boolean)));
  const filteredStaff = staff.filter(s => {
    const isOnline = online.has(s.id);
    const matchesSearch = s.name.toLowerCase().includes(searchStaff.toLowerCase()) ||
      (s.role && s.role.toLowerCase().includes(searchStaff.toLowerCase())) ||
      (s.department && s.department.toLowerCase().includes(searchStaff.toLowerCase()));
    const matchesPresence = presenceFilter === 'ALL' || (presenceFilter === 'ONLINE' && isOnline) || (presenceFilter === 'OFFLINE' && !isOnline);
    const matchesRole = roleFilter === 'ALL' || s.role === roleFilter;
    return matchesSearch && matchesPresence && matchesRole;
  });

  const totalDirPages = Math.max(1, Math.ceil(filteredStaff.length / DIR_PAGE_SIZE));
  const paginatedStaff = filteredStaff.slice((dirPage - 1) * DIR_PAGE_SIZE, dirPage * DIR_PAGE_SIZE);


  // ── Filtering Logic: History ──
  const filteredHistory = history.filter(h => {
    const outgoing = h.caller_id === user?.id;
    const other = outgoing ? h.callee_name : h.caller_name;
    const missed = h.status === 'MISSED' || h.status === 'DECLINED';

    const matchesSearch = other.toLowerCase().includes(searchHistory.toLowerCase());
    const matchesDirection = directionFilter === 'ALL' || (directionFilter === 'OUTBOUND' && outgoing) || (directionFilter === 'INBOUND' && !outgoing);
    const matchesKind = historyKindFilter === 'ALL' || h.kind === historyKindFilter;
    const matchesStatus = historyStatusFilter === 'ALL' ||
      (historyStatusFilter === 'CONNECTED' && !missed) ||
      (historyStatusFilter === 'MISSED' && h.status === 'MISSED') ||
      (historyStatusFilter === 'DECLINED' && h.status === 'DECLINED');

    return matchesSearch && matchesDirection && matchesKind && matchesStatus;
  });

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      <PageHeader
        crumbs={['Bliss', 'Call Center']}
        titlePlain="Call"
        titleEm="Center"
        subtitle="Initiate direct WebRTC calls with team members and review call logs."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="default" size="sm" onClick={() => navigate('/bliss/meetings')}>
              <Icon name="camera" size={14} /> Meeting Center
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/calls/reports')}>
              <Icon name="barChart" size={14} /> Call Reports & Analytics
            </Button>
            {/* STUN/TURN connectivity — a call failing to connect for someone
                behind a strict NAT is a settings problem, not a bug, so the
                fix is one click away from where an agent would notice it. */}
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/telephony')}>
              <Icon name="settings" size={14} /> Settings
            </Button>
          </div>
        }
      />

      {error && <Banner variant="error">{error}</Banner>}

      {/* Top Metrics Summary Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
            <Icon name="users" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{online.size} Online</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Colleagues Available</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="phone" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{history.length} Calls</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Recent Direct Log</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: wsConnected ? 'var(--blue-l)' : 'var(--red-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: wsConnected ? 'var(--blue)' : 'var(--red)' }}>
            <Icon name="globe" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Signaling Server</div>
            {/* Real WebSocket readyState, not a fabricated audio-quality
                (MOS) score this platform has no way to actually measure. */}
            <div style={{ fontSize: 11.5, color: wsConnected ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
              {wsConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
        <TabsList style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
          <TabsTrigger value="directory">Team Directory & Direct Calls ({filteredStaff.length})</TabsTrigger>
          <TabsTrigger value="history">Call Logs & History ({filteredHistory.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* TAB 1: Team Directory & Direct Calls */}
      {tab === 'directory' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <SectionCard title="Colleague Directory">
            {/* Filter Bar */}
            <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink3)' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 30, fontSize: 12.5 }}
                  placeholder="Filter team members by name or role..."
                  value={searchStaff}
                  onChange={e => { setSearchStaff(e.target.value); setDirPage(1); }}
                />
              </div>

              <div style={{ width: 140 }}>
                <Select value={presenceFilter} onValueChange={v => { setPresenceFilter(v as any); setDirPage(1); }}>
                  <SelectTrigger className="input-field"><SelectValue placeholder="Presence" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="ONLINE">🟢 Online Only</SelectItem>
                    <SelectItem value="OFFLINE">⚪ Offline Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {availableRoles.length > 0 && (
                <div style={{ width: 150 }}>
                  <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setDirPage(1); }}>
                    <SelectTrigger className="input-field"><SelectValue placeholder="Role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Roles</SelectItem>
                      {availableRoles.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Staff List Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredStaff.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No colleagues found matching selected filters.</div>
              )}
              {paginatedStaff.map(p => {
                const isOnline = online.has(p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', boxShadow: 'var(--elev)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ position: 'relative' }}>
                        <PersonAvatar name={p.name} size={36} />
                        <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--white)', background: isOnline ? 'var(--green)' : 'var(--ink3)' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{p.role || 'Staff Member'} • <strong style={{ color: isOnline ? 'var(--green)' : 'var(--ink3)' }}>{isOnline ? 'Online' : 'Offline'}</strong></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isOnline || callState !== 'idle'}
                        onClick={() => startCall(p, 'VOICE')}
                        title="Start Voice Call"
                      >
                        <Icon name="phone" size={14} color="var(--green)" /> Call Voice
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={!isOnline || callState !== 'idle'}
                        onClick={() => startCall(p, 'VIDEO')}
                        title="Start Video Call"
                      >
                        <Icon name="camera" size={14} /> Start Video
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {filteredStaff.length > DIR_PAGE_SIZE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)' }}>
                <div>
                  Showing {Math.min(filteredStaff.length, (dirPage - 1) * DIR_PAGE_SIZE + 1)} to {Math.min(filteredStaff.length, dirPage * DIR_PAGE_SIZE)} of {filteredStaff.length} team members
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Button variant="outline" size="sm" disabled={dirPage <= 1} onClick={() => setDirPage(p => Math.max(1, p - 1))}>
                    <Icon name="chevronLeft" size={14} /> Prev
                  </Button>
                  <span style={{ padding: '0 8px', fontWeight: 600, color: 'var(--ink)' }}>Page {dirPage} of {totalDirPages}</span>
                  <Button variant="outline" size="sm" disabled={dirPage >= totalDirPages} onClick={() => setDirPage(p => Math.min(totalDirPages, p + 1))}>
                    Next <Icon name="chevronRight" size={14} />
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Quick Recent Activity Feed Sidebar */}
          <SectionCard title="Recent Direct Calls">
            {history.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: 14 }}>No recent direct call logs.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 8).map(h => {
                  const outgoing = h.caller_id === user?.id;
                  const other = outgoing ? h.callee_name : h.caller_name;
                  const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', fontSize: 12.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name={h.kind === 'VOICE' ? 'phone' : 'camera'} size={14} color={missed ? 'var(--red)' : 'var(--teal)'} />
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{other}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant={missed ? 'error' : 'success'}>
                          {missed ? h.status.toLowerCase() : fmtDur(h.duration_seconds)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Video meetings moved to Meeting Center (/bliss/meetings) — see the
          header action above; this page is direct 1:1 calls + history only. */}

      {/* TAB 3: Recent Call History Table */}
      {tab === 'history' && (
        <SectionCard padded={false} title="Comprehensive Call History Log">
          {/* Filter Bar for Call History */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', background: 'var(--bg)' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink3)' }} />
              <input
                className="input-field"
                style={{ paddingLeft: 30, fontSize: 12.5 }}
                placeholder="Search contact name..."
                value={searchHistory}
                onChange={e => { setSearchHistory(e.target.value); setHistoryPage(1); }}
              />
            </div>

            <div style={{ width: 140 }}>
              <Select value={directionFilter} onValueChange={v => { setDirectionFilter(v); setHistoryPage(1); }}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Directions</SelectItem>
                  <SelectItem value="OUTBOUND">Outbound</SelectItem>
                  <SelectItem value="INBOUND">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div style={{ width: 130 }}>
              <Select value={historyKindFilter} onValueChange={v => { setHistoryKindFilter(v); setHistoryPage(1); }}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Modes</SelectItem>
                  <SelectItem value="VIDEO">Video</SelectItem>
                  <SelectItem value="VOICE">Voice</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div style={{ width: 150 }}>
              <Select value={historyStatusFilter} onValueChange={v => { setHistoryStatusFilter(v); setHistoryPage(1); }}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Call Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="CONNECTED">Connected</SelectItem>
                  <SelectItem value="MISSED">Missed</SelectItem>
                  <SelectItem value="DECLINED">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Call Direction', 'Colleague / Contact', 'Mode', 'Duration', 'Status', 'Date & Time'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>No call history records matching selected filters.</td>
                  </tr>
                ) : (
                  paginatedHistory.map(h => {
                    const outgoing = h.caller_id === user?.id;
                    const other = outgoing ? h.callee_name : h.caller_name;
                    const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                    return (
                      <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={outgoing ? 'brand' : 'info'}>
                            {outgoing ? 'OUTBOUND' : 'INBOUND'}
                          </Badge>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink)' }}>{other}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{h.kind}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                          {missed ? '0s' : fmtDur(h.duration_seconds)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={missed ? 'error' : 'success'}>{h.status}</Badge>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--ink3)', fontSize: 12 }}>
                          {new Date(h.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls for Call History */}
          {filteredHistory.length > HISTORY_PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)' }}>
              <div>
                Showing {Math.min(filteredHistory.length, (historyPage - 1) * HISTORY_PAGE_SIZE + 1)} to {Math.min(filteredHistory.length, historyPage * HISTORY_PAGE_SIZE)} of {filteredHistory.length} call logs
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))}>
                  <Icon name="chevronLeft" size={14} /> Prev
                </Button>
                <span style={{ padding: '0 8px', fontWeight: 600, color: 'var(--ink)' }}>Page {historyPage} of {totalHistoryPages}</span>
                <Button variant="outline" size="sm" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}>
                  Next <Icon name="chevronRight" size={14} />
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Incoming Call Prompt Modal */}
      {callState === 'incoming' && peer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 20, padding: 32, width: 360, textAlign: 'center', boxShadow: 'var(--elev-lg)', border: '1px solid var(--border)' }}>
            <div style={{ margin: '0 auto 16px' }}>
              <PersonAvatar name={peer.name} size={64} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{peer.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4, marginBottom: 24 }}>
              Incoming WebRTC {kind === 'VIDEO' ? 'Video' : 'Voice'} Call…
            </div>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
              <Button variant="destructive" style={{ borderRadius: 30, padding: '12px 24px' }} onClick={declineCall}>
                Decline
              </Button>
              <Button variant="default" style={{ borderRadius: 30, padding: '12px 24px', background: 'var(--green)', color: '#fff' }} onClick={acceptCall}>
                Accept Call
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Fullscreen Stage */}
      {inCall && peer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0b0b0f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video ref={remoteVideo} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#0b0b0f' }} />
            {callState === 'calling' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 12 }}>
                <PersonAvatar name={peer.name} size={84} />
                <div style={{ fontSize: 22, fontWeight: 800 }}>{peer.name}</div>
                <div style={{ fontSize: 14, opacity: 0.7 }}>Ringing WebRTC peer…</div>
              </div>
            )}
            {callState === 'in-call' && (
              <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
                {peer.name} • {fmtDur(elapsed)}
              </div>
            )}
            <video ref={localVideo} autoPlay playsInline muted style={{ position: 'absolute', bottom: 90, right: 20, width: 160, height: 210, objectFit: 'cover', borderRadius: 14, border: '2px solid rgba(255,255,255,0.3)', background: '#111', display: kind === 'VIDEO' ? 'block' : 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 30px', background: '#0b0b0f' }}>
            <Button variant="outline" style={{ borderRadius: '50%', width: 52, height: 52, padding: 0 }} onClick={toggleMute}>
              <Icon name="volume2" size={20} />
            </Button>
            {kind === 'VIDEO' && (
              <Button variant="outline" style={{ borderRadius: '50%', width: 52, height: 52, padding: 0 }} onClick={toggleCam}>
                <Icon name="camera" size={20} />
              </Button>
            )}
            <Button variant="destructive" style={{ borderRadius: '50%', width: 52, height: 52, padding: 0 }} onClick={hangup}>
              <Icon name="x" size={20} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

