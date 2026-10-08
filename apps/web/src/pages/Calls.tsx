import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { CallsMetrics } from './calls/CallsMetrics.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';
import './Calls.css';

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
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
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
  const [activeTab, setActiveTab] = useState<'overview' | 'directory' | 'history' | 'dialpad' | 'reports'>('overview');

  // ── Timeframe & Filter States ──
  const [timeframe, setTimeframe] = useState<'1d' | '5d' | '1m' | '6m' | '1y'>('1d');
  const [performanceHoverIndex, setPerformanceHoverIndex] = useState<number | null>(null);

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
      if (Array.isArray(s)) {
        const filtered = s.filter((x: any) => x.id !== user?.id);
        setStaff(
          filtered.map((item: any) => ({
            id: item.id,
            name: item.name || item.full_name || item.display_name || 'Staff Member',
            role: item.role || item.job_title || '',
            email: item.email,
            department: item.department,
          }))
        );
      }
    } catch {
      /* fallback */
    }
    try {
      const p = await apiFetch('/v1/calls/presence');
      if (p?.online) setOnline(new Set(p.online));
    } catch {
      /* */
    }
    try {
      const h = await apiFetch('/v1/calls/direct');
      if (Array.isArray(h)) setHistory(h);
    } catch {
      /* */
    }
    try {
      const cfg = await apiFetch('/v1/calls/config');
      if (cfg?.iceServers) iceServers.current = cfg.iceServers;
    } catch {
      /* */
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Alias for consistent naming across the tab sections
  const combinedStaff = staff;

  // ── WebRTC Signaling Socket ──
  const send = (m: any) => {
    try {
      wsRef.current?.send(JSON.stringify(m));
    } catch {
      /* */
    }
  };

  const cleanup = useCallback(
    (logStatus?: string) => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      pcRef.current?.close();
      pcRef.current = null;
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      if (remoteVideo.current) remoteVideo.current.srcObject = null;
      if (logStatus && callId.current) {
        const dur = answeredAt.current ? Math.round((Date.now() - answeredAt.current) / 1000) : 0;
        apiFetch(`/v1/calls/direct/${callId.current}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: logStatus, duration_seconds: dur }),
        })
          .then(load)
          .catch(() => {});
      }
      callId.current = null;
      answeredAt.current = null;
      setElapsed(0);
      setMuted(false);
      setCamOff(false);
      setCallState('idle');
      setPeer(null);
    },
    [load]
  );

  const newPeerConnection = useCallback((remoteId: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers.current });
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'ice', to: remoteId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        /* peer gone */
      }
    };
    localStream.current?.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));
    pcRef.current = pc;
    return pc;
  }, []);

  const startTimer = () => {
    answeredAt.current = Date.now();
    timer.current = setInterval(
      () => setElapsed(Math.round((Date.now() - (answeredAt.current || Date.now())) / 1000)),
      1000
    );
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
      let m: any;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.type) {
        case 'ready':
          setOnline(new Set(m.online || []));
          break;
        case 'presence':
          setOnline((prev) => {
            const s = new Set(prev);
            if (m.online) s.add(m.userId);
            else s.delete(m.userId);
            return s;
          });
          break;
        case 'ring': {
          if (callState !== 'idle') {
            send({ type: 'decline', to: m.from });
            return;
          }
          callId.current = m.callId || null;
          setPeer({ id: m.from, name: m.fromName || 'Caller', role: '' });
          setKind(m.kind === 'VOICE' ? 'VOICE' : 'VIDEO');
          setCallState('incoming');
          break;
        }
        case 'accept': {
          try {
            const pc = newPeerConnection(m.from);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: 'offer', to: m.from, sdp: offer });
            if (callId.current)
              apiFetch(`/v1/calls/direct/${callId.current}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'ONGOING' }),
              }).catch(() => {});
            setCallState('in-call');
            startTimer();
          } catch {
            setError('Could not start the call.');
            cleanup('ENDED');
          }
          break;
        }
        case 'offer': {
          try {
            const pc = pcRef.current || newPeerConnection(m.from);
            await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            send({ type: 'answer', to: m.from, sdp: answer });
          } catch {
            setError('Could not connect.');
            cleanup('ENDED');
          }
          break;
        }
        case 'answer': {
          try {
            await pcRef.current?.setRemoteDescription(new RTCSessionDescription(m.sdp));
          } catch {
            /* */
          }
          break;
        }
        case 'ice': {
          try {
            await pcRef.current?.addIceCandidate(new RTCIceCandidate(m.candidate));
          } catch {
            /* */
          }
          break;
        }
        case 'decline':
          cleanup('DECLINED');
          setError('Call declined.');
          break;
        case 'cancel':
          cleanup('MISSED');
          break;
        case 'hangup':
          cleanup('ENDED');
          break;
      }
    };
    return () => {
      try {
        ws.close();
      } catch {
        /* */
      }
    };
  }, [callState, newPeerConnection, cleanup]);

  // ── Actions ──
  const startCall = async (person: Staff, k: 'VIDEO' | 'VOICE') => {
    setError(null);
    setKind(k);
    setPeer(person);
    try {
      await getMedia(k === 'VIDEO');
      const rec = await apiFetch('/v1/calls/direct', {
        method: 'POST',
        body: JSON.stringify({ callee_id: person.id, kind: k }),
      });
      callId.current = rec?.id || null;
      send({ type: 'ring', to: person.id, kind: k, callId: callId.current });
      setCallState('calling');
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera/microphone permission denied.'
          : e?.message || 'Could not start the call.'
      );
      cleanup();
    }
  };

  useEffect(() => {
    const targetId = searchParams.get('call');
    if (!targetId || combinedStaff.length === 0) return;
    const person = combinedStaff.find((s) => s.id === targetId);
    if (person && callState === 'idle') {
      startCall(person, searchParams.get('kind') === 'VOICE' ? 'VOICE' : 'VIDEO');
    } else if (!person) {
      showAlert('That person is not in your staff directory.');
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('call');
        next.delete('kind');
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedStaff]);

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

  const declineCall = () => {
    if (peer) send({ type: 'decline', to: peer.id });
    cleanup('DECLINED');
  };
  const hangup = () => {
    if (peer) send({ type: callState === 'calling' ? 'cancel' : 'hangup', to: peer.id });
    cleanup(callState === 'calling' ? 'MISSED' : 'ENDED');
  };
  const toggleMute = () => {
    const t = localStream.current?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setMuted(!t.enabled);
    }
  };
  const toggleCam = () => {
    const t = localStream.current?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setCamOff(!t.enabled);
    }
  };

  const inCall = callState === 'in-call' || callState === 'calling';

  // ── Filtering Logic: Directory ──
  const availableRoles = useMemo(
    () => Array.from(new Set(combinedStaff.map((s) => s.role).filter(Boolean))),
    [combinedStaff]
  );

  const filteredStaff = useMemo(() => {
    return combinedStaff.filter((s) => {
      const isOnline = online.has(s.id);
      const matchesSearch =
        s.name.toLowerCase().includes(searchStaff.toLowerCase()) ||
        (s.role && s.role.toLowerCase().includes(searchStaff.toLowerCase())) ||
        (s.department && s.department.toLowerCase().includes(searchStaff.toLowerCase())) ||
        (s.email && s.email.toLowerCase().includes(searchStaff.toLowerCase()));
      const matchesPresence =
        !presenceFilter ||
        presenceFilter === 'ALL' ||
        (presenceFilter === 'ONLINE' && isOnline) ||
        (presenceFilter === 'OFFLINE' && !isOnline);
      const matchesRole = !roleFilter || roleFilter === 'ALL' || s.role === roleFilter;
      return matchesSearch && matchesPresence && matchesRole;
    });
  }, [combinedStaff, online, searchStaff, presenceFilter, roleFilter]);

  const totalDirPages = Math.max(1, Math.ceil(filteredStaff.length / DIR_PAGE_SIZE));
  const paginatedStaff = filteredStaff.slice((dirPage - 1) * DIR_PAGE_SIZE, dirPage * DIR_PAGE_SIZE);

  // ── Filtering Logic: History ──
  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      const outgoing = h.caller_id === user?.id;
      const other = outgoing ? h.callee_name : h.caller_name;
      const missed = h.status === 'MISSED' || h.status === 'DECLINED';

      const matchesSearch = other.toLowerCase().includes(searchHistory.toLowerCase());
      const matchesDirection =
        !directionFilter ||
        directionFilter === 'ALL' ||
        (directionFilter === 'OUTBOUND' && outgoing) ||
        (directionFilter === 'INBOUND' && !outgoing);
      const matchesKind = !historyKindFilter || historyKindFilter === 'ALL' || h.kind === historyKindFilter;
      const matchesStatus =
        !historyStatusFilter ||
        historyStatusFilter === 'ALL' ||
        (historyStatusFilter === 'CONNECTED' && !missed) ||
        (historyStatusFilter === 'MISSED' && h.status === 'MISSED') ||
        (historyStatusFilter === 'DECLINED' && h.status === 'DECLINED');

      return matchesSearch && matchesDirection && matchesKind && matchesStatus;
    });
  }, [history, user?.id, searchHistory, directionFilter, historyKindFilter, historyStatusFilter]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );

  function exportHistoryCSV() {
    if (filteredHistory.length === 0) {
      showAlert('No call records to export.');
      return;
    }
    const headers = ['Direction', 'Contact', 'Mode', 'Duration (seconds)', 'Status', 'Date Time'];
    const rows = filteredHistory.map((h) => [
      h.caller_id === user?.id ? 'OUTBOUND' : 'INBOUND',
      `"${(h.caller_id === user?.id ? h.callee_name : h.caller_name || '').replace(/"/g, '""')}"`,
      h.kind,
      h.duration_seconds,
      h.status,
      h.started_at,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `call-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('Call history exported to CSV.', { variant: 'success' });
  }

  // Dialpad
  function pressDialpad(digit: string) {
    setDialpadNumber((prev) => (prev.length < 15 ? prev + digit : prev));
  }

  const dialpadMatchedStaff = useMemo(() => {
    if (!dialpadNumber.trim()) return [];
    return combinedStaff.filter(
      (s) =>
        s.name.toLowerCase().includes(dialpadNumber.toLowerCase()) ||
        (s.email && s.email.toLowerCase().includes(dialpadNumber.toLowerCase()))
    );
  }, [combinedStaff, dialpadNumber]);

  return (
    <div className="cc-container">
      {/* ── Standard PageHeader ── */}
      <PageHeader
        crumbs={['Bliss', 'Comms', 'Call Center']}
        titlePlain="Call"
        titleEm="center"
        subtitle="Make calls, hold video meetings, and review team call activity."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11.5,
                fontWeight: 700,
                background: wsConnected ? 'var(--green-l, #ecfdf5)' : 'var(--red-l, #fef2f2)',
                color: wsConnected ? 'var(--green, #059669)' : 'var(--red, #dc2626)',
                border: wsConnected ? '1px solid #a7f3d0' : '1px solid #fecaca',
                marginRight: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: wsConnected ? 'var(--green)' : 'var(--red)',
                  animation: wsConnected ? 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' : 'none',
                }}
              />
              <span>{wsConnected ? 'WebRTC Gateway Active' : 'Gateway Offline'}</span>
            </div>

            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/meetings')}>
              <Icon name="camera" size={14} />
              <span>Meeting Center</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/telephony')}>
              <Icon name="sliders" size={14} />
              <span>Telephony</span>
            </Button>
          </div>
        }
      />

      {error && <Banner variant="error">{error}</Banner>}

      {/* ── Tab Navigation Strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', minHeight: 48, padding: '0 6px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }} data-ds-tabstrip="">
          {([
            { key: 'overview',   label: 'Overview',            icon: 'activity' as const },
            { key: 'directory',  label: `Directory (${filteredStaff.length})`, icon: 'users' as const },
            { key: 'history',    label: `History (${filteredHistory.length})`, icon: 'phone' as const },
            { key: 'dialpad',    label: 'Dialpad',             icon: 'smartphone' as const },
            { key: 'reports',    label: 'Reports & Analytics', icon: 'barChart2' as const },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key as any)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 14px',
                fontSize: 13, fontWeight: activeTab === t.key ? 700 : 600,
                color: activeTab === t.key ? 'var(--teal)' : 'var(--ink2)',
                background: 'transparent', border: 'none',
                borderBottom: activeTab === t.key ? '2px solid var(--teal)' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)',
                transition: 'all 120ms ease',
              }}
             data-ds-selected={activeTab === t.key as any} data-ui-native-button="" aria-pressed={activeTab === t.key as any}>
              <Icon name={t.icon} size={14} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {activeTab === 'history' && (
          <Button variant="outline" size="sm" onClick={exportHistoryCSV} style={{ flexShrink: 0, marginRight: 6 }}>
            <Icon name="download" size={13} />
            <span>Export CSV</span>
          </Button>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         TAB 1: OVERVIEW — real data via CallsMetrics
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <CallsMetrics />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         TAB 2: COLLEAGUE DIRECTORY
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'directory' && (
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 340px', gap: 18, alignItems: 'start' }}>
          {/* Main Directory Column */}
          <div className="cc-card">
            {/* Search Toolbar */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <SearchToolbar
                search={searchStaff}
                onSearch={(v) => {
                  setSearchStaff(v);
                  setDirPage(1);
                }}
                placeholder="Search colleagues by name, role or department…"
                quickFilter={{
                  value: presenceFilter === 'ALL' ? null : presenceFilter,
                  onChange: (v) => {
                    setPresenceFilter(v);
                    setDirPage(1);
                  },
                  allLabel: 'All Statuses',
                  options: [
                    { value: 'ONLINE', label: 'Online Only', icon: <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} /> },
                    { value: 'OFFLINE', label: 'Offline Only', icon: <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} /> },
                  ],
                }}
                activeFilterCount={(presenceFilter && presenceFilter !== 'ALL' ? 1 : 0) + (roleFilter && roleFilter !== 'ALL' ? 1 : 0)}
                filterContent={(close) => (
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Filter Directory</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchStaff('');
                          setPresenceFilter(null);
                          setRoleFilter(null);
                        }}
                        style={{ fontSize: 12, color: 'hsl(var(--primary))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                       data-ui-native-button="">
                        Reset
                      </button>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Roles
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setRoleFilter(null)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: !roleFilter ? 700 : 500,
                            background: !roleFilter ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                            color: !roleFilter ? 'hsl(var(--primary))' : 'var(--ink2)',
                            border: !roleFilter ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                          }}
                         data-ui-native-button="">
                          All Roles
                        </button>
                        {availableRoles.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setRoleFilter(r)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: roleFilter === r ? 700 : 500,
                              background: roleFilter === r ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                              color: roleFilter === r ? 'hsl(var(--primary))' : 'var(--ink2)',
                              border: roleFilter === r ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                            }}
                           data-ui-native-button="">
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                      <Button variant="default" size="sm" onClick={close}>
                        Apply
                      </Button>
                    </div>
                  </div>
                )}
              />
            </div>

            {/* List of Colleague Cards */}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredStaff.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  <Icon name="users" size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>No colleagues found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing keywords or presence filter.</div>
                </div>
              ) : (
                paginatedStaff.map((p) => {
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
                        background: 'var(--card-bg, var(--white))',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: isMobile ? 12 : 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <PersonAvatar userId={p.id} name={p.name} size={40} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isOnline || callState !== 'idle'}
                          onClick={() => startCall(p, 'VOICE')}
                          style={{ flex: isMobile ? 1 : 'none' }}
                        >
                          <Icon name="phone" size={13} style={{ color: 'var(--green)' }} />
                          <span>Voice</span>
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={!isOnline || callState !== 'idle'}
                          onClick={() => startCall(p, 'VIDEO')}
                          style={{ flex: isMobile ? 1 : 'none' }}
                        >
                          <Icon name="camera" size={13} />
                          <span>Video</span>
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {filteredStaff.length > DIR_PAGE_SIZE && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderTop: '1px solid var(--border)',
                  fontSize: 12,
                  color: 'var(--ink3)',
                }}
              >
                <div>
                  Showing {Math.min(filteredStaff.length, (dirPage - 1) * DIR_PAGE_SIZE + 1)}–
                  {Math.min(filteredStaff.length, dirPage * DIR_PAGE_SIZE)} of {filteredStaff.length}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dirPage <= 1}
                    onClick={() => setDirPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{dirPage} / {totalDirPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dirPage >= totalDirPages}
                    onClick={() => setDirPage((p) => Math.min(totalDirPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Activity Feed */}
          <div className="cc-card">
            <div className="cc-card-header">
              <div className="cc-card-title">Recent Calls</div>
              <Badge variant="brand">{history.length}</Badge>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                  No recent direct calls.
                </div>
              ) : (
                history.slice(0, 6).map((h) => {
                  const outgoing = h.caller_id === user?.id;
                  const other = outgoing ? h.callee_name : h.caller_name;
                  const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                  return (
                    <div key={h.id} className="cc-activity-row">
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
                      <Badge variant={missed ? 'error' : 'success'}>
                        {missed ? h.status.toLowerCase() : fmtDur(h.duration_seconds)}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         TAB 3: CALL HISTORY & TELEMETRY LOGS
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="cc-card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <SearchToolbar
              search={searchHistory}
              onSearch={(v) => {
                setSearchHistory(v);
                setHistoryPage(1);
              }}
              placeholder="Search contact name..."
              quickFilter={{
                value: directionFilter === 'ALL' ? null : directionFilter,
                onChange: (v) => {
                  setDirectionFilter(v);
                  setHistoryPage(1);
                },
                allLabel: 'All Directions',
                options: [
                  { value: 'OUTBOUND', label: 'Outbound' },
                  { value: 'INBOUND', label: 'Inbound' },
                ],
              }}
              activeFilterCount={
                (directionFilter && directionFilter !== 'ALL' ? 1 : 0) +
                (historyKindFilter && historyKindFilter !== 'ALL' ? 1 : 0) +
                (historyStatusFilter && historyStatusFilter !== 'ALL' ? 1 : 0)
              }
              filterContent={(close) => (
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Filter Call Logs</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchHistory('');
                        setDirectionFilter(null);
                        setHistoryKindFilter(null);
                        setHistoryStatusFilter(null);
                      }}
                      style={{ fontSize: 12, color: 'hsl(var(--primary))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                     data-ui-native-button="">
                      Reset
                    </button>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                      Call Mode
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['ALL', 'VIDEO', 'VOICE'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setHistoryKindFilter(m === 'ALL' ? null : m)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: (m === 'ALL' && !historyKindFilter) || historyKindFilter === m ? 700 : 500,
                            background:
                              (m === 'ALL' && !historyKindFilter) || historyKindFilter === m
                                ? 'hsl(var(--primary) / 0.1)'
                                : 'var(--bg)',
                            color:
                              (m === 'ALL' && !historyKindFilter) || historyKindFilter === m
                                ? 'hsl(var(--primary))'
                                : 'var(--ink2)',
                            border:
                              (m === 'ALL' && !historyKindFilter) || historyKindFilter === m
                                ? '1px solid hsl(var(--primary))'
                                : '1px solid var(--border)',
                          }}
                         data-ui-native-button="">
                          {m === 'ALL' ? 'All Modes' : m === 'VIDEO' ? 'HD Video' : 'Voice'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                    <Button variant="default" size="sm" onClick={close}>
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Contact</th>
                  <th>Mode</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Date & Time</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--ink3)' }}>
                      No call records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((h) => {
                    const outgoing = h.caller_id === user?.id;
                    const other = outgoing ? h.callee_name : h.caller_name;
                    const otherId = outgoing ? h.callee_id : h.caller_id;
                    const missed = h.status === 'MISSED' || h.status === 'DECLINED';
                    const matchedPerson = combinedStaff.find((s) => s.id === otherId);

                    return (
                      <tr key={h.id}>
                        <td>
                          <Badge variant={outgoing ? 'brand' : 'info'}>
                            {outgoing ? 'OUTBOUND' : 'INBOUND'}
                          </Badge>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <PersonAvatar userId={otherId} name={other} size={28} />
                            <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{other}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                            <Icon name={h.kind === 'VOICE' ? 'phone' : 'camera'} size={13} style={{ color: 'var(--ink3)' }} />
                            {h.kind}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font)' }}>
                          {missed ? '0s' : fmtDur(h.duration_seconds)}
                        </td>
                        <td>
                          <Badge variant={missed ? 'error' : 'success'}>{h.status}</Badge>
                        </td>
                        <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmtDate(h.started_at)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {matchedPerson && (
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                              onClick={() => startCall(matchedPerson, h.kind === 'VOICE' ? 'VOICE' : 'VIDEO')}
                            >
                              Redial
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredHistory.length > HISTORY_PAGE_SIZE && (
            <PaginationBar
              page={historyPage}
              pageSize={HISTORY_PAGE_SIZE}
              total={filteredHistory.length}
              onPageChange={setHistoryPage}
              itemLabel="call"
              bordered={false}
            />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         TAB 4: QUICK DIALPAD
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dialpad' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <div
            className="cc-card"
            style={{
              padding: isMobile ? 20 : 28,
              width: '100%',
              maxWidth: 380,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Direct Dialpad</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                Enter colleague name, extension or digits
              </div>
            </div>

            {/* Display Input */}
            <div
              style={{
                background: 'var(--card-sunken)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r, 12px)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 48,
              }}
            >
              <input
                value={dialpadNumber}
                onChange={(e) => setDialpadNumber(e.target.value)}
                placeholder="Type name or number..."
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  width: '100%',
                  fontFamily: 'var(--font)',
                }}
              />
              {dialpadNumber && (
                <button
                  type="button"
                  onClick={() => setDialpadNumber('')}
                  style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 4 }}
                 data-ui-native-button="">
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>

            {/* Auto-Match Colleague */}
            {dialpadMatchedStaff.length > 0 && (
              <div
                style={{
                  maxHeight: 120,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  background: 'var(--card-sunken)',
                  padding: 6,
                  borderRadius: 'var(--r-sm, 8px)',
                }}
              >
                {dialpadMatchedStaff.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => startCall(s, 'VOICE')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'var(--card-bg, var(--white))',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                   data-ui-native-button="">
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'hsl(var(--primary))' }}>Call Now ↗</span>
                  </button>
                ))}
              </div>
            )}

            {/* Keypad */}
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
              ].map((k) => (
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
                 data-ui-native-button="">
                  <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{k.digit}</span>
                  {k.sub && (
                    <span style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: '0.1em', marginTop: 2 }}>
                      {k.sub}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Call Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
              <Button
                variant="outline"
                disabled={!dialpadNumber.trim() || dialpadMatchedStaff.length === 0}
                onClick={() => dialpadMatchedStaff[0] && startCall(dialpadMatchedStaff[0], 'VOICE')}
                style={{ justifyContent: 'center' }}
              >
                <Icon name="phone" size={15} style={{ color: 'var(--green)' }} />
                <span>Voice Call</span>
              </Button>

              <Button
                variant="default"
                disabled={!dialpadNumber.trim() || dialpadMatchedStaff.length === 0}
                onClick={() => dialpadMatchedStaff[0] && startCall(dialpadMatchedStaff[0], 'VIDEO')}
                style={{ justifyContent: 'center' }}
              >
                <Icon name="camera" size={15} />
                <span>Video Call</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
         TAB 5: REPORTS & ANALYTICS (real API data via CallsMetrics)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <CallsMetrics />
        </div>
      )}

      {/* ── INCOMING CALL PROMPT MODAL ── */}
      {callState === 'incoming' && peer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, var(--white))',
              borderRadius: 'var(--r, 24px)',
              padding: 32,
              width: '100%',
              maxWidth: 380,
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <PersonAvatar userId={peer.id} name={peer.name} size={72} />
              <span
                style={{
                  position: 'absolute',
                  inset: -6,
                  borderRadius: '50%',
                  border: '2px solid hsl(var(--primary))',
                  animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--ink)' }}>{peer.name}</div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--ink2)',
                marginTop: 4,
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={14} />
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
                style={{
                  flex: 1,
                  borderRadius: 30,
                  padding: '12px 20px',
                  background: 'var(--green)',
                  color: '#ffffff',
                  justifyContent: 'center',
                }}
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
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: '#090b0e',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Main Video Viewport */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
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

            {(kind === 'VOICE' || callState === 'calling') && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  gap: 14,
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                <div style={{ position: 'relative' }}>
                  <PersonAvatar userId={peer.id} name={peer.name} size={96} />
                  {callState === 'calling' && (
                    <span
                      style={{
                        position: 'absolute',
                        inset: -8,
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.4)',
                        animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                      }}
                    />
                  )}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em' }}>{peer.name}</div>
                <div
                  style={{
                    fontSize: 14,
                    color: 'rgba(255,255,255,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={15} />
                  <span>
                    {callState === 'calling' ? 'Ringing WebRTC peer…' : `In Voice Call • ${fmtDur(elapsed)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Top Info Chip */}
            {callState === 'in-call' && (
              <div
                style={{
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
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                <span>{peer.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>•</span>
                <span style={{ fontFamily: 'var(--font)' }}>{fmtDur(elapsed)}</span>
              </div>
            )}

            {/* Local PiP Video */}
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
                borderRadius: 'var(--r)',
                border: '2px solid rgba(255,255,255,0.3)',
                background: '#14171d',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                display: kind === 'VIDEO' && !camOff ? 'block' : 'none',
              }}
            />
          </div>

          {/* Control Bar */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              alignItems: 'center',
              padding: isMobile ? '16px 20px 24px' : '20px 0 32px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            }}
          >
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
             data-ui-native-button="">
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
               data-ui-native-button="">
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
                boxShadow: '0 4px 18px rgba(239,68,68,0.4)',
                transition: 'all 0.15s ease',
              }}
             data-ui-native-button="">
              <Icon name="x" size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
