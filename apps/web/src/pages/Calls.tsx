import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Tip } from '../components/ui/tooltip.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';

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

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function Calls() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

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

  // ── Tabs State ──
  const [tab, setTab] = useState<'directory' | 'history' | 'dialpad'>('directory');

  // ── Filter & Pagination States - Directory ──
  const [searchStaff, setSearchStaff] = useState('');
  const [presenceFilter, setPresenceFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [dirPage, setDirPage] = useState(1);
  const DIR_PAGE_SIZE = 8;

  // ── Filter & Pagination States - History Log ──
  const [searchHistory, setSearchHistory] = useState('');
  const [directionFilter, setDirectionFilter] = useState<string | null>(null);
  const [historyKindFilter, setHistoryKindFilter] = useState<string | null>(null);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  // ── Dialpad State ──
  const [dialpadNumber, setDialpadNumber] = useState('');

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

  // Deep-link entry point — Chat.tsx's "Start Voice/Video Call" buttons (a
  // DM's header and its details drawer) navigate here with ?call=<userId>
  // instead of just landing on the generic directory, so clicking one
  // actually rings that specific person via the same real WebRTC signaling
  // the directory's own call buttons use. Runs once staff has loaded (so
  // the id can resolve to a name) and consumes the param either way so
  // returning to this URL later doesn't immediately redial.
  useEffect(() => {
    const targetId = searchParams.get('call');
    if (!targetId || staff.length === 0) return;
    const person = staff.find(s => s.id === targetId);
    if (person && callState === 'idle') {
      startCall(person, searchParams.get('kind') === 'VOICE' ? 'VOICE' : 'VIDEO');
    } else if (!person) {
      showAlert('That person is not in your staff directory.');
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('call'); next.delete('kind'); return next; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff]);

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
  const availableRoles = useMemo(() => Array.from(new Set(staff.map(s => s.role).filter(Boolean))), [staff]);
  
  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const isOnline = online.has(s.id);
      const matchesSearch = s.name.toLowerCase().includes(searchStaff.toLowerCase()) ||
        (s.role && s.role.toLowerCase().includes(searchStaff.toLowerCase())) ||
        (s.department && s.department.toLowerCase().includes(searchStaff.toLowerCase())) ||
        (s.email && s.email.toLowerCase().includes(searchStaff.toLowerCase()));
      const matchesPresence = !presenceFilter || presenceFilter === 'ALL' || (presenceFilter === 'ONLINE' && isOnline) || (presenceFilter === 'OFFLINE' && !isOnline);
      const matchesRole = !roleFilter || roleFilter === 'ALL' || s.role === roleFilter;
      return matchesSearch && matchesPresence && matchesRole;
    });
  }, [staff, online, searchStaff, presenceFilter, roleFilter]);

  const totalDirPages = Math.max(1, Math.ceil(filteredStaff.length / DIR_PAGE_SIZE));
  const paginatedStaff = filteredStaff.slice((dirPage - 1) * DIR_PAGE_SIZE, dirPage * DIR_PAGE_SIZE);

  // ── Filtering Logic: History ──
  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const outgoing = h.caller_id === user?.id;
      const other = outgoing ? h.callee_name : h.caller_name;
      const missed = h.status === 'MISSED' || h.status === 'DECLINED';

      const matchesSearch = other.toLowerCase().includes(searchHistory.toLowerCase());
      const matchesDirection = !directionFilter || directionFilter === 'ALL' || (directionFilter === 'OUTBOUND' && outgoing) || (directionFilter === 'INBOUND' && !outgoing);
      const matchesKind = !historyKindFilter || historyKindFilter === 'ALL' || h.kind === historyKindFilter;
      const matchesStatus = !historyStatusFilter || historyStatusFilter === 'ALL' ||
        (historyStatusFilter === 'CONNECTED' && !missed) ||
        (historyStatusFilter === 'MISSED' && h.status === 'MISSED') ||
        (historyStatusFilter === 'DECLINED' && h.status === 'DECLINED');

      return matchesSearch && matchesDirection && matchesKind && matchesStatus;
    });
  }, [history, user?.id, searchHistory, directionFilter, historyKindFilter, historyStatusFilter]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  function exportHistoryCSV() {
    if (filteredHistory.length === 0) {
      showAlert('No call records to export.');
      return;
    }
    const headers = ['Direction', 'Contact', 'Mode', 'Duration (seconds)', 'Status', 'Date Time'];
    const rows = filteredHistory.map(h => [
      h.caller_id === user?.id ? 'OUTBOUND' : 'INBOUND',
      `"${(h.caller_id === user?.id ? h.callee_name : h.caller_name || '').replace(/"/g, '""')}"`,
      h.kind,
      h.duration_seconds,
      h.status,
      h.started_at,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `call-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('Call history exported to CSV.');
  }

  // Dialpad press digit
  function pressDialpad(digit: string) {
    setDialpadNumber(prev => (prev.length < 15 ? prev + digit : prev));
  }

  // Find staff from dialpad
  const dialpadMatchedStaff = useMemo(() => {
    if (!dialpadNumber.trim()) return [];
    return staff.filter(s => s.name.toLowerCase().includes(dialpadNumber.toLowerCase()) || (s.email && s.email.toLowerCase().includes(dialpadNumber.toLowerCase())));
  }, [staff, dialpadNumber]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? 14 : 20,
      padding: isMobile ? '14px 16px' : '22px 28px',
      background: 'var(--bg)',
      minHeight: '100%',
    }}>
      {/* ── Standard PageHeader ── */}
      <PageHeader
        crumbs={['Bliss', 'Calls']}
        titlePlain="Call"
        titleEm="center"
        subtitle="Direct WebRTC voice and HD video calling, team presence directory, and complete communication logs."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="default" size="sm" onClick={() => navigate('/bliss/meetings')}>
              <Icon name="camera" size={14} /> Meeting Center
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/calls/reports')}>
              <Icon name="barChart" size={14} /> Call Reports
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/telephony')}>
              <Icon name="settings" size={14} /> Telephony Settings
            </Button>
          </div>
        }
      />

      {error && <Banner variant="error">{error}</Banner>}

      {/* ── Top Metrics Ribbon (Responsive Grid) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 14,
        alignItems: 'stretch',
      }}>
        {/* Metric 1: Colleagues Online */}
        <div style={{
          background: 'var(--card)',
          padding: '14px 16px',
          borderRadius: 'var(--r, 14px)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <FeaturedIcon variant="success" size="md">
            <Icon name="users" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {online.size} Online
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 1 }}>Colleagues Available</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Live WebRTC presence</div>
          </div>
        </div>

        {/* Metric 2: Recent Direct Log */}
        <div style={{
          background: 'var(--card)',
          padding: '14px 16px',
          borderRadius: 'var(--r, 14px)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <FeaturedIcon variant="brand" size="md">
            <Icon name="phone" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {history.length} Calls
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 1 }}>Recent Direct Log</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>P2P peer communication</div>
          </div>
        </div>

        {/* Metric 3: Signaling Gateway */}
        <div style={{
          background: 'var(--card)',
          padding: '14px 16px',
          borderRadius: 'var(--r, 14px)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <FeaturedIcon variant={wsConnected ? 'info' : 'error'} size="md">
            <Icon name="globe" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {wsConnected ? 'Connected' : 'Offline'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 1 }}>Signaling Gateway</div>
            <div style={{ fontSize: 10.5, color: wsConnected ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
              {wsConnected ? 'Ready for incoming/outgoing' : 'Reconnecting gateway…'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Segmented Navigation Tabs Bar ──
          Wraps instead of scrolling: nowrap + overflow-x:auto + a hidden
          scrollbar let the Export button silently scroll off-screen with no
          visible way to reach it whenever the row didn't fit — same defect
          fixed in MeetingCenter.tsx's toolbar. Wrapping can never hide a
          control. ── */}
      <div style={{
        background: 'var(--card)',
        borderRadius: 'var(--r, 14px)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--elev-sm)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        rowGap: 8,
        flexWrap: 'wrap',
      }}>
        {/* Left: Tab Switcher (Hudumika Design System Outline Tabs) */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          variant="outline"
          style={{ flexShrink: 0 }}
        >
          <TabsList>
            <TabsTrigger value="directory" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="users" size={14} />
              <span>Colleague Directory ({filteredStaff.length})</span>
            </TabsTrigger>
            <TabsTrigger value="history" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="phone" size={14} />
              <span>Call History ({filteredHistory.length})</span>
            </TabsTrigger>
            <TabsTrigger value="dialpad" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="grid" size={14} />
              <span>Quick Dialpad</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Right side quick info / export */}
        {tab === 'history' && (
          <div style={{ flexShrink: 0 }}>
            <Tip label="Export call logs to CSV">
              <Button variant="outline" size="sm" onClick={exportHistoryCSV}>
                <Icon name="download" size={13} />
                {!isMobile && <span>Export CSV</span>}
              </Button>
            </Tip>
          </div>
        )}
      </div>

      {/* ── TAB 1: COLLEAGUE DIRECTORY ── */}
      {tab === 'directory' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1fr 340px',
          gap: 18,
          alignItems: 'start',
        }}>
          {/* Main Directory Column */}
          <div style={{
            background: 'var(--card)',
            borderRadius: 'var(--r, 16px)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Single Row Filter Bar — wraps rather than a hidden-scrollbar overflow (see Calls tab bar above) */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              rowGap: 8,
              flexWrap: 'wrap',
            }}>
              <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? 140 : 200 }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: 9.5, color: 'var(--ink3)' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 28, fontSize: 12, height: 32, borderRadius: 20, width: '100%' }}
                  placeholder="Search colleagues..."
                  value={searchStaff}
                  onChange={e => { setSearchStaff(e.target.value); setDirPage(1); }}
                />
                {searchStaff && (
                  <button
                    type="button"
                    onClick={() => { setSearchStaff(''); setDirPage(1); }}
                    style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2 }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>

              <SingleSelectFilter
                label="Status"
                icon={<Icon name="users" size={13} />}
                value={presenceFilter}
                onChange={v => { setPresenceFilter(v); setDirPage(1); }}
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'ONLINE', label: 'Online Only' },
                  { value: 'OFFLINE', label: 'Offline Only' },
                ]}
              />

              {availableRoles.length > 0 && (
                <SingleSelectFilter
                  label="Role"
                  icon={<Icon name="filter" size={13} />}
                  value={roleFilter}
                  onChange={v => { setRoleFilter(v); setDirPage(1); }}
                  options={[
                    { value: 'ALL', label: 'All Roles' },
                    ...availableRoles.map(r => ({ value: r, label: r })),
                  ]}
                />
              )}
            </div>

            {/* Colleague Cards List */}
            <div style={{ padding: isMobile ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredStaff.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  <Icon name="users" size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>No colleagues found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing search keywords or active presence filters.</div>
                </div>
              ) : (
                paginatedStaff.map(p => {
                  const isOnline = online.has(p.id);
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        padding: isMobile ? '12px 14px' : '14px 18px',
                        borderRadius: 'var(--r, 12px)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        boxShadow: 'var(--elev-sm)',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: isMobile ? 12 : 14,
                        transition: 'border-color 0.15s ease',
                      }}
                    >
                      {/* Identity & Department */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <PersonAvatar userId={p.id} name={p.name} size={40} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{p.name}</span>
                            <Badge variant={isOnline ? 'success' : 'gray'}>
                              {isOnline ? 'Online' : 'Offline'}
                            </Badge>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                            {p.role || 'Staff Member'}
                            {p.department && ` • ${p.department}`}
                          </div>
                        </div>
                      </div>

                      {/* Direct Action Buttons */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: isMobile ? '100%' : 'auto',
                        justifyContent: isMobile ? 'flex-end' : 'initial',
                      }}>
                        <Tip label="Start direct voice call">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isOnline || callState !== 'idle'}
                            onClick={() => startCall(p, 'VOICE')}
                            style={{ flex: isMobile ? 1 : 'none', justifyContent: 'center' }}
                          >
                            <Icon name="phone" size={13} color="var(--green)" />
                            <span>Voice Call</span>
                          </Button>
                        </Tip>

                        <Tip label="Start direct video call">
                          <Button
                            variant="default"
                            size="sm"
                            disabled={!isOnline || callState !== 'idle'}
                            onClick={() => startCall(p, 'VIDEO')}
                            style={{ flex: isMobile ? 1 : 'none', justifyContent: 'center' }}
                          >
                            <Icon name="camera" size={13} />
                            <span>Video Call</span>
                          </Button>
                        </Tip>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {filteredStaff.length > DIR_PAGE_SIZE && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid var(--border)',
                fontSize: 12,
                color: 'var(--ink3)',
                flexWrap: 'wrap',
                gap: 10,
              }}>
                <div>
                  Showing {Math.min(filteredStaff.length, (dirPage - 1) * DIR_PAGE_SIZE + 1)}–{Math.min(filteredStaff.length, dirPage * DIR_PAGE_SIZE)} of {filteredStaff.length} team members
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Button variant="outline" size="sm" disabled={dirPage <= 1} onClick={() => setDirPage(p => Math.max(1, p - 1))}>
                    <Icon name="chevronLeft" size={14} />
                  </Button>
                  <span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--ink)' }}>{dirPage} / {totalDirPages}</span>
                  <Button variant="outline" size="sm" disabled={dirPage >= totalDirPages} onClick={() => setDirPage(p => Math.min(totalDirPages, p + 1))}>
                    <Icon name="chevronRight" size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Recent Activity Feed */}
          <div style={{
            background: 'var(--card)',
            borderRadius: 'var(--r, 16px)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span>Recent Direct Activity</span>
              <Badge variant="brand">{history.length}</Badge>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                  No recent direct call logs.
                </div>
              ) : (
                history.slice(0, 7).map(h => {
                  const outgoing = h.caller_id === user?.id;
                  const other = outgoing ? h.callee_name : h.caller_name;
                  const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                  return (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: 'var(--r-sm, 8px)',
                        border: '1px solid var(--border)',
                        background: 'var(--card-sunken)',
                        fontSize: 12,
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <FeaturedIcon variant={missed ? 'error' : 'brand'} size="sm">
                          <Icon name={h.kind === 'VOICE' ? 'phone' : 'camera'} size={14} />
                        </FeaturedIcon>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {other}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                            {outgoing ? 'Outgoing' : 'Incoming'} • {fmtDate(h.started_at)}
                          </div>
                        </div>
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        <Badge variant={missed ? 'error' : 'success'}>
                          {missed ? h.status.toLowerCase() : fmtDur(h.duration_seconds)}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CALL LOGS & HISTORY (Hybrid Desktop Table + Mobile Cards) ── */}
      {tab === 'history' && (
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r, 16px)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Single Row Filter Bar — wraps rather than a hidden-scrollbar overflow (see Calls tab bar above) */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            rowGap: 8,
            flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? 140 : 200 }}>
              <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: 9.5, color: 'var(--ink3)' }} />
              <input
                className="input-field"
                style={{ paddingLeft: 28, fontSize: 12, height: 32, borderRadius: 20, width: '100%' }}
                placeholder="Search contact name..."
                value={searchHistory}
                onChange={e => { setSearchHistory(e.target.value); setHistoryPage(1); }}
              />
              {searchHistory && (
                <button
                  type="button"
                  onClick={() => { setSearchHistory(''); setHistoryPage(1); }}
                  style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2 }}
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>

            <SingleSelectFilter
              label="Direction"
              icon={<Icon name="phone" size={13} />}
              value={directionFilter}
              onChange={v => { setDirectionFilter(v); setHistoryPage(1); }}
              options={[
                { value: 'ALL', label: 'All Directions' },
                { value: 'OUTBOUND', label: 'Outbound' },
                { value: 'INBOUND', label: 'Inbound' },
              ]}
            />

            <SingleSelectFilter
              label="Mode"
              icon={<Icon name="camera" size={13} />}
              value={historyKindFilter}
              onChange={v => { setHistoryKindFilter(v); setHistoryPage(1); }}
              options={[
                { value: 'ALL', label: 'All Modes' },
                { value: 'VIDEO', label: 'HD Video' },
                { value: 'VOICE', label: 'Voice Only' },
              ]}
            />

            <SingleSelectFilter
              label="Status"
              icon={<Icon name="activity" size={13} />}
              value={historyStatusFilter}
              onChange={v => { setHistoryStatusFilter(v); setHistoryPage(1); }}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'CONNECTED', label: 'Connected' },
                { value: 'MISSED', label: 'Missed' },
                { value: 'DECLINED', label: 'Declined' },
              ]}
            />
          </div>

          {/* Data Presentation (Table on Desktop, Card Feed on Mobile) */}
          {filteredHistory.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              <Icon name="phone" size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>No call history records found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>No calls match your active search or direction filters.</div>
            </div>
          ) : isMobile ? (
            /* Mobile Card View */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {paginatedHistory.map(h => {
                const outgoing = h.caller_id === user?.id;
                const other = outgoing ? h.callee_name : h.caller_name;
                const otherId = outgoing ? h.callee_id : h.caller_id;
                const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                const matchedPerson = staff.find(s => s.id === otherId);

                return (
                  <div
                    key={h.id}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PersonAvatar userId={otherId} name={other} size={36} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{other}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{fmtDate(h.started_at)}</div>
                        </div>
                      </div>
                      <Badge variant={missed ? 'error' : 'success'}>
                        {h.status}
                      </Badge>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant={outgoing ? 'brand' : 'info'}>
                          {outgoing ? 'OUTBOUND' : 'INBOUND'}
                        </Badge>
                        <span>{h.kind}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>
                        {missed ? '0s' : fmtDur(h.duration_seconds)}
                      </div>
                    </div>

                    {matchedPerson && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startCall(matchedPerson, 'VOICE')}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          <Icon name="phone" size={12} /> Call Voice
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => startCall(matchedPerson, 'VIDEO')}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          <Icon name="camera" size={12} /> Call Video
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop Table View */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--card-sunken)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    {['Direction', 'Colleague / Contact', 'Mode', 'Duration', 'Status', 'Date & Time', ''].map(h => (
                      <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map(h => {
                    const outgoing = h.caller_id === user?.id;
                    const other = outgoing ? h.callee_name : h.caller_name;
                    const otherId = outgoing ? h.callee_id : h.caller_id;
                    const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                    const matchedPerson = staff.find(s => s.id === otherId);

                    return (
                      <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--bg)]">
                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={outgoing ? 'brand' : 'info'}>
                            {outgoing ? 'OUTBOUND' : 'INBOUND'}
                          </Badge>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <PersonAvatar userId={otherId} name={other} size={26} />
                            <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{other}</span>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px', color: 'var(--ink2)', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Icon name={h.kind === 'VOICE' ? 'phone' : 'camera'} size={13} color="var(--ink3)" />
                            {h.kind}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                          {missed ? '0s' : fmtDur(h.duration_seconds)}
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={missed ? 'error' : 'success'}>
                            {h.status}
                          </Badge>
                        </td>

                        <td style={{ padding: '12px 16px', color: 'var(--ink3)', fontSize: 12 }}>
                          {fmtDate(h.started_at)}
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {matchedPerson && (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <Tip label="Call back">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => startCall(matchedPerson, h.kind === 'VOICE' ? 'VOICE' : 'VIDEO')}
                                >
                                  <Icon name={h.kind === 'VOICE' ? 'phone' : 'camera'} size={13} />
                                  <span>Redial</span>
                                </Button>
                              </Tip>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {filteredHistory.length > HISTORY_PAGE_SIZE && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--ink3)',
              flexWrap: 'wrap',
              gap: 10,
            }}>
              <div>
                Showing {Math.min(filteredHistory.length, (historyPage - 1) * HISTORY_PAGE_SIZE + 1)}–{Math.min(filteredHistory.length, historyPage * HISTORY_PAGE_SIZE)} of {filteredHistory.length} records
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))}>
                  <Icon name="chevronLeft" size={14} />
                </Button>
                <span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--ink)' }}>{historyPage} / {totalHistoryPages}</span>
                <Button variant="outline" size="sm" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}>
                  <Icon name="chevronRight" size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: QUICK DIALPAD & EXTENSION CALLER ── */}
      {tab === 'dialpad' && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: isMobile ? '8px 0' : '16px 0',
        }}>
          <div style={{
            background: 'var(--card)',
            borderRadius: 'var(--r, 20px)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--elev-sm)',
            padding: isMobile ? 20 : 28,
            width: '100%',
            maxWidth: 380,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Direct Dialpad</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                Enter colleague name, extension or number
              </div>
            </div>

            {/* Display Input */}
            <div style={{
              background: 'var(--card-sunken)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r, 12px)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 48,
            }}>
              <input
                value={dialpadNumber}
                onChange={e => setDialpadNumber(e.target.value)}
                placeholder="Type name or digits..."
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  width: '100%',
                  fontFamily: 'var(--mono)',
                  letterSpacing: '0.05em',
                }}
              />
              {dialpadNumber && (
                <button
                  type="button"
                  onClick={() => setDialpadNumber('')}
                  style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 4 }}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>

            {/* Matched Colleague Auto-Suggest */}
            {dialpadMatchedStaff.length > 0 && (
              <div style={{
                maxHeight: 120,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: 'var(--card-sunken)',
                padding: 6,
                borderRadius: 'var(--r-sm, 8px)',
              }}>
                {dialpadMatchedStaff.slice(0, 3).map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => startCall(s, 'VOICE')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--teal)' }}>Call Now ↗</span>
                  </button>
                ))}
              </div>
            )}

            {/* Numeric Keypad Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { digit: '1', sub: '' },
                { digit: '2', sub: 'ABC' },
                { digit: '3', sub: 'DEF' },
                { digit: '4', sub: 'GHI' },
                { digit: '5', sub: 'JKL' },
                { digit: '6', sub: 'MNO' },
                { digit: '7', sub: 'PQRS' },
                { digit: '8', sub: 'TUV' },
                { digit: '9', sub: 'WXYZ' },
                { digit: '*', sub: '' },
                { digit: '0', sub: '+' },
                { digit: '#', sub: '' },
              ].map(k => (
                <button
                  key={k.digit}
                  type="button"
                  onClick={() => pressDialpad(k.digit)}
                  style={{
                    height: 52,
                    borderRadius: 'var(--r, 12px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card-sunken)',
                    color: 'var(--ink)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                  className="active:scale-95 hover:border-[var(--teal)]"
                >
                  <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{k.digit}</span>
                  {k.sub && <span style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: '0.1em', marginTop: 2 }}>{k.sub}</span>}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
              <Button
                variant="outline"
                size="default"
                disabled={!dialpadNumber.trim() || dialpadMatchedStaff.length === 0}
                onClick={() => dialpadMatchedStaff[0] && startCall(dialpadMatchedStaff[0], 'VOICE')}
                style={{ justifyContent: 'center' }}
              >
                <Icon name="phone" size={16} color="var(--green)" />
                <span>Voice Call</span>
              </Button>

              <Button
                variant="default"
                size="default"
                disabled={!dialpadNumber.trim() || dialpadMatchedStaff.length === 0}
                onClick={() => dialpadMatchedStaff[0] && startCall(dialpadMatchedStaff[0], 'VIDEO')}
                style={{ justifyContent: 'center' }}
              >
                <Icon name="camera" size={16} />
                <span>Video Call</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── INCOMING CALL PROMPT MODAL ── */}
      {callState === 'incoming' && peer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: 'var(--card)',
            borderRadius: 'var(--r, 24px)',
            padding: 32,
            width: '100%',
            maxWidth: 380,
            textAlign: 'center',
            boxShadow: 'var(--elev-lg)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <PersonAvatar userId={peer.id} name={peer.name} size={72} />
              <span style={{
                position: 'absolute',
                inset: -6,
                borderRadius: '50%',
                border: '2px solid var(--teal)',
                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                pointerEvents: 'none',
              }} />
            </div>

            <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--ink)' }}>{peer.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={14} color="var(--teal)" />
              <span>Incoming WebRTC {kind === 'VIDEO' ? 'Video' : 'Voice'} Call…</span>
            </div>

            <div style={{ display: 'flex', gap: 14, width: '100%', justifyContent: 'center' }}>
              <Button
                variant="destructive"
                style={{ flex: 1, borderRadius: 30, padding: '12px 20px', justifyContent: 'center' }}
                onClick={declineCall}
              >
                <Icon name="x" size={16} />
                <span>Decline</span>
              </Button>
              <Button
                variant="default"
                style={{ flex: 1, borderRadius: 30, padding: '12px 20px', background: 'var(--green)', color: '#ffffff', justifyContent: 'center' }}
                onClick={acceptCall}
              >
                <Icon name="phone" size={16} />
                <span>Accept</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVE FULLSCREEN CALL STAGE ── */}
      {inCall && peer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: '#090b0e',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Main Video Viewport */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: '#090b0e',
                display: kind === 'VIDEO' ? 'block' : 'none',
              }}
            />

            {/* Voice Call Avatar Screen (or Ringing State) */}
            {(kind === 'VOICE' || callState === 'calling') && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                gap: 14,
                textAlign: 'center',
                padding: 20,
              }}>
                <div style={{ position: 'relative' }}>
                  <PersonAvatar userId={peer.id} name={peer.name} size={96} />
                  {callState === 'calling' && (
                    <span style={{
                      position: 'absolute',
                      inset: -8,
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.4)',
                      animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                    }} />
                  )}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em' }}>{peer.name}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={15} />
                  <span>{callState === 'calling' ? 'Ringing WebRTC peer…' : `In Voice Call • ${fmtDur(elapsed)}`}</span>
                </div>
              </div>
            )}

            {/* Top Floating Info Chip */}
            {callState === 'in-call' && (
              <div style={{
                position: 'absolute',
                top: 20,
                left: 20,
                background: 'rgba(0,0,0,0.65)',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: 24,
                fontSize: 13,
                fontWeight: 700,
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                <span>{peer.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>•</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmtDur(elapsed)}</span>
              </div>
            )}

            {/* Local Video Picture-in-Picture */}
            <video
              ref={localVideo}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute',
                bottom: isMobile ? 100 : 30,
                right: 20,
                width: isMobile ? 110 : 160,
                height: isMobile ? 150 : 210,
                objectFit: 'cover',
                borderRadius: 'var(--r, 14px)',
                border: '2px solid rgba(255,255,255,0.3)',
                background: '#14171d',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                display: kind === 'VIDEO' && !camOff ? 'block' : 'none',
              }}
            />
          </div>

          {/* Bottom Floating Glass Control Bar */}
          <div style={{
            display: 'flex',
            gap: 16,
            justifyContent: 'center',
            alignItems: 'center',
            padding: isMobile ? '16px 20px 24px' : '20px 0 32px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
          }}>
            <button
              type="button"
              onClick={toggleMute}
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                border: 'none',
                background: muted ? 'var(--red)' : 'rgba(255,255,255,0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon name="volume2" size={20} />
            </button>

            {kind === 'VIDEO' && (
              <button
                type="button"
                onClick={toggleCam}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  border: 'none',
                  background: camOff ? 'var(--red)' : 'rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon name="camera" size={20} />
              </button>
            )}

            <button
              type="button"
              onClick={hangup}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: 'none',
                background: 'var(--red)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(239,68,68,0.5)',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon name="x" size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
