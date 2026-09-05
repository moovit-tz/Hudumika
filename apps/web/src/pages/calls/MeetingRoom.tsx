// ─── MeetingRoom.tsx — Perfected Google Meet Stage ──────────────────
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, BASE_URL } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { useMediaDevices } from '../../hooks/useMediaDevices.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { Tip } from '../../components/ui/tooltip.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';

interface ParticipantState {
  name: string;
  stream: MediaStream | null;
  audioMuted: boolean;
  videoOff: boolean;
  handRaised?: boolean;
}
interface ChatMsg { from: string; fromName: string; text: string; ts: number; }
interface QualityStat { kbpsUp: number; kbpsDown: number; packetLoss: number; rttMs: number }
interface PollRow { id: string; question: string; options: string[]; tally: number[]; totalVotes: number; myVote: number | null; closed_at: string | null; created_by_name: string; }
interface QuestionRow { id: string; text: string; user_name: string; upvoteCount: number; myUpvote: boolean; answered: boolean; created_at: string; }
interface TranscriptLine { id: string; user_name: string; text: string; created_at?: string; }
interface AiTurn { role: 'user' | 'assistant'; text: string; }
// user_id is null for a guest row (migration 368) — user_name already
// carries their typed display name either way, so nothing downstream needs
// a separate guest_name fallback; id (the row's own key, not user_id) is
// what admit/reject actually act on, since a guest has no user_id to key by.
interface WaitingRow { id: string; user_id: string | null; user_name: string; requested_at: string; }
interface BreakoutRoom { id: string; name: string; assignments: { user_id: string; user_name: string }[]; liveCount: number; }
interface MeetingSummary { executiveSummary: string; keyPoints: string[]; decisions: string[]; actionItems: { text: string; assignee: string | null }[]; questions: string[]; followUps: string[]; }
interface Stroke { id: string; points: { x: number; y: number }[]; color: string; }

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

  // Core Meeting States
  const [muted, setMuted] = useState(!initialAudioEnabled);
  const [camOff, setCamOff] = useState(!initialVideoEnabled || kind !== 'VIDEO');
  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [participants, setParticipants] = useState<Record<string, ParticipantState>>({});
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [reactions, setReactions] = useState<{ id: number; from: string; emoji: string }[]>([]);
  const [panel, setPanel] = useState<'none' | 'chat' | 'participants' | 'tools' | 'settings' | 'host'>('none');
  const [chatDraft, setChatDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [spotlightUser, setSpotlightUser] = useState<string | null>(null);

  // Google Meet Specific Enhanced States
  const [handRaised, setHandRaised] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [meetingToolsTab, setMeetingToolsTab] = useState<'tools' | 'addons'>('tools');
  const [showAskAssistant, setShowAskAssistant] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [subPanel, setSubPanel] = useState<'none' | 'recording' | 'polls' | 'qanda' | 'timer' | 'transcript' | 'breakout' | 'summary'>('none');

  // ── Host controls & waiting room — real, server-enforced (password/lock
  // checked at /join; per-participant nudges relayed live over the existing
  // signaling socket) ──
  const [myRole, setMyRole] = useState<'HOST' | 'CO_HOST' | 'PARTICIPANT'>(isHost ? 'HOST' : 'PARTICIPANT');
  const canModerate = myRole === 'HOST' || myRole === 'CO_HOST';
  const [hostSettings, setHostSettings] = useState({ locked: false, chatDisabled: false, screenShareDisabled: false, hasPassword: false, waitingRoomEnabled: false, guestJoinEnabled: false });
  const [hostPasswordInput, setHostPasswordInput] = useState('');
  const [waitingRoomList, setWaitingRoomList] = useState<WaitingRow[]>([]);
  const [chatBlocked, setChatBlocked] = useState(false);

  // ── Breakout rooms — reuse the exact same mesh signaling as the main
  // room, just under a different room key (see calls.routes.ts's own
  // comment on this). Nothing here duplicates the WebRTC logic above. ──
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoom[]>([]);
  const [breakoutCount, setBreakoutCount] = useState(2);
  const [myBreakoutRoom, setMyBreakoutRoom] = useState<{ id: string; name: string } | null>(null);
  const [breakoutAssignedBanner, setBreakoutAssignedBanner] = useState<{ roomId: string; roomName: string } | null>(null);
  const [breakoutBroadcastText, setBreakoutBroadcastText] = useState('');
  const [breakoutMessage, setBreakoutMessage] = useState<string | null>(null);
  const currentRoomKeyRef = useRef(meetingId);

  // ── AI meeting summary + meeting-to-tasks ──
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [tasksCreated, setTasksCreated] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);

  // ── Screen-share annotation — the presenter draws persistent strokes;
  // any viewer can drop an ephemeral laser point. Normalized 0..1
  // coordinates so a stroke maps correctly regardless of each viewer's own
  // window size. ──
  const [annotationTool, setAnnotationTool] = useState<'pen' | 'laser' | null>(null);
  const [annotationColor, setAnnotationColor] = useState('#ef4444');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [laserDots, setLaserDots] = useState<{ id: number; x: number; y: number; name: string }[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const laserIdRef = useRef(0);

  // Real meeting-tools state — every one of these is backed by a genuine
  // capability (Web Speech API, MediaRecorder + canvas.captureStream(),
  // real DB-backed polls/Q&A, the platform's own /v1/ai/chat), not a
  // hardcoded placeholder. Speech translation and breakout rooms aren't
  // here — see the "Unavailable or Premium" section in the render below for
  // why each is honestly excluded rather than faked.
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [showNewPoll, setShowNewPoll] = useState(false);
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [newPollOptions, setNewPollOptions] = useState(['', '']);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [liveCaption, setLiveCaption] = useState<{ name: string; text: string } | null>(null);
  const [timerEndAt, setTimerEndAt] = useState<number | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerMinutesInput, setTimerMinutesInput] = useState(5);
  const [aiTurns, setAiTurns] = useState<AiTurn[]>([]);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<any>(null);
  const reactionIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // `meetingId` is the default room key; a caller can override it (breakout
  // rooms send with their own room key) since an explicit `m.meetingId`
  // wins over the spread-in default.
  const send = (m: any) => { try { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ meetingId, ...m })); } catch { /* */ } };

  const broadcastStatus = useCallback(() => {
    send({ type: 'room-status', audioMuted: muted, videoOff: camOff, handRaised });
  }, [muted, camOff, handRaised]);

  useEffect(() => { broadcastStatus(); }, [broadcastStatus]);

  useEffect(() => {
    apiFetch(`/v1/calls/meetings/${meetingId}`).then(m => {
      setHostSettings({ locked: !!m.locked, chatDisabled: !!m.chat_disabled, screenShareDisabled: !!m.screen_share_disabled, hasPassword: !!m.hasPassword, waitingRoomEnabled: !!m.waiting_room_enabled, guestJoinEnabled: !!m.guest_join_enabled });
    }).catch(() => { /* */ });
  }, [meetingId]);

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

  // Move between the main room and a breakout room: leave whichever room
  // key we're currently registered under, tear down every mesh peer
  // connection (they belonged to that room's roster), then join the new
  // room key — the exact same join-room/room-peers/offer dance the main
  // room already uses, since the server's room registry doesn't
  // distinguish a breakout room from the main one at all.
  function switchRoom(newRoomKey: string) {
    send({ type: 'leave-room', meetingId: currentRoomKeyRef.current });
    pcMapRef.current.forEach(pc => pc.close());
    pcMapRef.current.clear();
    setParticipants({});
    currentRoomKeyRef.current = newRoomKey;
    send({ type: 'join-room', meetingId: newRoomKey });
  }

  // Update Clock Time
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTimeStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // WebRTC Signal Channel & Elapsed Timer Setup
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

    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/v1/calls/signal';
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
        case 'room-status': setParticipants(prev => prev[m.from] ? { ...prev, [m.from]: { ...prev[m.from], audioMuted: !!m.audioMuted, videoOff: !!m.videoOff, handRaised: !!m.handRaised } } : prev); break;
        case 'host-mute-request': { const t = localStreamRef.current?.getAudioTracks()[0]; if (t) t.enabled = false; setMuted(true); break; }
        case 'host-camera-off-request': { const t = localStreamRef.current?.getVideoTracks()[0]; if (t) t.enabled = false; setCamOff(true); break; }
        case 'host-chat-disable': setChatBlocked(true); break;
        case 'host-chat-enable': setChatBlocked(false); break;
        case 'host-remove': onEndedByHost(); break;
        // Meeting tools — real, DB-backed data; these WS messages are just
        // "go re-fetch" pings so every open panel updates live.
        case 'poll-created': case 'poll-voted': case 'poll-closed': loadPolls(); break;
        case 'question-asked': case 'question-upvoted': case 'question-answered': loadQuestions(); break;
        case 'transcript-line': {
          setTranscriptLines(prev => [...prev, { id: m.lineId, user_name: m.userName, text: m.text }]);
          setLiveCaption({ name: m.userName, text: m.text });
          setTimeout(() => setLiveCaption(cur => (cur?.text === m.text ? null : cur)), 4000);
          break;
        }
        case 'timer-start': setTimerEndAt(m.endAt); break;
        case 'timer-stop': setTimerEndAt(null); break;
        // Host controls
        case 'waiting-room-update': loadWaitingRoom(); break;
        case 'meeting-settings-changed': {
          if (m.locked !== undefined) setHostSettings(prev => ({ ...prev, locked: !!m.locked, chatDisabled: !!m.chatDisabled, screenShareDisabled: !!m.screenShareDisabled }));
          if (m.coHostChanged?.userId === myUserId) setMyRole(m.coHostChanged.coHost ? 'CO_HOST' : 'PARTICIPANT');
          if (m.summaryReady) loadSummary();
          break;
        }
        case 'host-spotlight': setSpotlightUser(m.targetUserId || null); break;
        // Breakout rooms
        case 'breakout-assigned': {
          const mine = (m.assignments || []).find((a: any) => a.userId === myUserId);
          if (mine) setBreakoutAssignedBanner({ roomId: mine.roomId, roomName: mine.roomName });
          break;
        }
        case 'breakout-broadcast': setBreakoutMessage(`${m.from}: ${m.text}`); break;
        case 'breakout-closed': {
          setMyBreakoutRoom(null);
          setBreakoutAssignedBanner(null);
          switchRoom(meetingId);
          break;
        }
        // Screen-share annotation
        case 'annotation-draw': {
          if (m.tool === 'laser') {
            const lid = ++laserIdRef.current;
            setLaserDots(prev => [...prev, { id: lid, x: m.x, y: m.y, name: m.fromName || 'Guest' }]);
            setTimeout(() => setLaserDots(prev => prev.filter(d => d.id !== lid)), 1500);
          } else {
            setStrokes(prev => {
              const idx = prev.findIndex(s => s.id === m.strokeId);
              if (idx === -1) return [...prev, { id: m.strokeId, points: [{ x: m.x, y: m.y }], color: m.color || '#ef4444' }];
              const next = [...prev];
              next[idx] = { ...next[idx], points: [...next[idx].points, { x: m.x, y: m.y }] };
              return next;
            });
          }
          break;
        }
        case 'annotation-clear': setStrokes([]); break;
      }
    };

    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      try { send({ type: 'leave-room', meetingId: currentRoomKeyRef.current }); } catch { /* */ }
      try { ws.close(); } catch { /* */ }
      pcMapRef.current.forEach(pc => pc.close());
      pcMapRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // Media controls
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
    const url = `${window.location.origin}/bliss/calls/meeting/${meetingId}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Real call to the platform's own AI integration (whatever provider the
  // tenant configured in Settings > Integrations > AI) — not a hardcoded
  // "Gemini" reply. Honestly surfaces the backend's own "not configured"
  // message rather than pretending to answer when there's no model behind it.
  const askAssistant = async () => {
    const q = aiInput.trim();
    if (!q || aiBusy) return;
    setAiTurns(prev => [...prev, { role: 'user', text: q }]);
    setAiInput('');
    setAiBusy(true);
    try {
      const res = await apiFetch('/v1/ai/chat', { method: 'POST', body: JSON.stringify({ message: q, conversation_id: aiConversationId }) });
      setAiConversationId(res.conversation_id ?? null);
      setAiTurns(prev => [...prev, { role: 'assistant', text: res.reply || '(no reply)' }]);
    } catch (e: any) {
      setAiTurns(prev => [...prev, { role: 'assistant', text: e?.message || 'AI is not configured for this workspace.' }]);
    } finally {
      setAiBusy(false);
    }
  };

  // ── Polls (real, DB-backed) ──
  const loadPolls = useCallback(async () => {
    try { const p = await apiFetch(`/v1/calls/meetings/${meetingId}/polls`); if (Array.isArray(p)) setPolls(p); } catch { /* */ }
  }, [meetingId]);
  useEffect(() => { loadPolls(); }, [loadPolls]);

  const createPoll = async () => {
    const opts = newPollOptions.map(o => o.trim()).filter(Boolean);
    if (!newPollQuestion.trim()) { setError('Give the poll a question.'); return; }
    if (opts.length < 2) { setError('A poll needs at least two options.'); return; }
    try {
      await apiFetch(`/v1/calls/meetings/${meetingId}/polls`, { method: 'POST', body: JSON.stringify({ question: newPollQuestion.trim(), options: opts }) });
      setNewPollQuestion(''); setNewPollOptions(['', '']); setShowNewPoll(false);
      loadPolls();
    } catch (e: any) { setError(e?.message || 'Could not create poll.'); }
  };
  const votePoll = async (pollId: string, optionIndex: number) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ option_index: optionIndex }) }); loadPolls(); } catch { /* */ }
  };
  const closePoll = async (pollId: string) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/polls/${pollId}/close`, { method: 'POST' }); loadPolls(); } catch { /* */ }
  };

  // ── Q&A (real, DB-backed) ──
  const loadQuestions = useCallback(async () => {
    try { const q = await apiFetch(`/v1/calls/meetings/${meetingId}/questions`); if (Array.isArray(q)) setQuestions(q); } catch { /* */ }
  }, [meetingId]);
  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const askQuestion = async () => {
    if (!newQuestionText.trim()) return;
    try {
      await apiFetch(`/v1/calls/meetings/${meetingId}/questions`, { method: 'POST', body: JSON.stringify({ text: newQuestionText.trim() }) });
      setNewQuestionText('');
      loadQuestions();
    } catch (e: any) { setError(e?.message || 'Could not post question.'); }
  };
  const upvoteQuestion = async (qId: string) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/questions/${qId}/upvote`, { method: 'POST' }); loadQuestions(); } catch { /* */ }
  };
  const answerQuestion = async (qId: string) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/questions/${qId}/answer`, { method: 'POST' }); loadQuestions(); } catch { /* */ }
  };

  // ── Timer (WS-only — nothing to persist for a countdown) ──
  const startTimerFn = (minutes: number) => {
    const endAt = Date.now() + minutes * 60000;
    send({ type: 'timer-start', endAt });
    setTimerEndAt(endAt);
  };
  const stopTimerFn = () => {
    send({ type: 'timer-stop' });
    setTimerEndAt(null);
  };
  useEffect(() => {
    if (timerEndAt == null) { setTimerRemaining(null); return; }
    const tick = () => setTimerRemaining(Math.max(0, Math.round((timerEndAt - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [timerEndAt]);

  // ── Live transcription (real Web Speech API — browser-native, free; not
  // available in every browser, and honestly reports that rather than
  // silently doing nothing) ──
  const loadTranscript = useCallback(async () => {
    try { const t = await apiFetch(`/v1/calls/meetings/${meetingId}/transcript`); if (Array.isArray(t)) setTranscriptLines(t); } catch { /* */ }
  }, [meetingId]);
  useEffect(() => { loadTranscript(); }, [loadTranscript]);

  const toggleTranscribe = () => {
    if (transcribing) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setTranscribing(false);
      return;
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { setError('Live transcription needs a browser with speech recognition support (Chrome/Edge).'); return; }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) {
          setLiveCaption(null);
          apiFetch(`/v1/calls/meetings/${meetingId}/transcript`, { method: 'POST', body: JSON.stringify({ text }) })
            .then(line => setTranscriptLines(prev => [...prev, line]))
            .catch(() => { /* */ });
        } else {
          setLiveCaption({ name: myName, text });
        }
      }
    };
    recognition.onerror = () => setTranscribing(false);
    recognition.onend = () => setTranscribing(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setTranscribing(true); } catch { setError('Could not start transcription.'); }
  };

  // ── Host controls & waiting room (real: server checks the password/lock
  // at /join, and enforces who may admit/moderate — this UI just drives
  // those REST calls) ──
  const loadWaitingRoom = useCallback(async () => {
    if (!canModerate) return;
    try { const w = await apiFetch(`/v1/calls/meetings/${meetingId}/waiting-room`); if (Array.isArray(w)) setWaitingRoomList(w); } catch { /* */ }
  }, [meetingId, canModerate]);
  useEffect(() => { loadWaitingRoom(); }, [loadWaitingRoom]);

  const admitWaiting = async (userId: string) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/waiting-room/${userId}/admit`, { method: 'POST' }); loadWaitingRoom(); } catch { /* */ }
  };
  const rejectWaiting = async (userId: string) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/waiting-room/${userId}/reject`, { method: 'POST' }); loadWaitingRoom(); } catch { /* */ }
  };
  const admitAllWaiting = async () => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/waiting-room/admit-all`, { method: 'POST' }); loadWaitingRoom(); } catch { /* */ }
  };

  const updateHostSetting = async (patch: Record<string, unknown>) => {
    try {
      const updated = await apiFetch(`/v1/calls/meetings/${meetingId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setHostSettings(prev => ({ ...prev, locked: !!updated.locked, chatDisabled: !!updated.chat_disabled, screenShareDisabled: !!updated.screen_share_disabled, hasPassword: !!updated.hasPassword, guestJoinEnabled: !!updated.guest_join_enabled }));
    } catch (e: any) { setError(e?.message || 'Could not update meeting settings.'); }
  };

  // Per-participant nudges — same "signal, not an enforced action" shape as
  // the existing host-mute-request: WebRTC gives no way to reach into
  // another device, so the receiving client complies on its own.
  const muteParticipant = (userId: string) => send({ type: 'host-mute-request', to: userId });
  const cameraOffParticipant = (userId: string) => send({ type: 'host-camera-off-request', to: userId });
  const removeParticipant = (userId: string) => send({ type: 'host-remove', to: userId });
  const disableChatFor = (userId: string) => send({ type: 'host-chat-disable', to: userId });
  const enableChatFor = (userId: string) => send({ type: 'host-chat-enable', to: userId });
  const spotlightParticipant = (userId: string | null) => { setSpotlightUser(userId); send({ type: 'host-spotlight', targetUserId: userId }); };
  const toggleCoHost = async (userId: string, coHost: boolean) => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/participants/${userId}/co-host`, { method: 'POST', body: JSON.stringify({ coHost }) }); } catch { /* */ }
  };

  // ── Breakout rooms — reuses switchRoom() (defined above, next to the
  // main mesh setup) for the actual leave-one-room/join-another mechanics.
  const loadBreakoutRooms = useCallback(async () => {
    try { const r = await apiFetch(`/v1/calls/meetings/${meetingId}/breakout-rooms`); if (Array.isArray(r)) setBreakoutRooms(r); } catch { /* */ }
  }, [meetingId]);
  useEffect(() => { loadBreakoutRooms(); }, [loadBreakoutRooms]);

  const createBreakoutRooms = async () => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/breakout-rooms`, { method: 'POST', body: JSON.stringify({ count: breakoutCount }) }); loadBreakoutRooms(); } catch (e: any) { setError(e?.message || 'Could not create breakout rooms.'); }
  };
  const autoAssignBreakout = async () => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/breakout-rooms/assign`, { method: 'POST', body: JSON.stringify({ auto: true }) }); loadBreakoutRooms(); } catch (e: any) { setError(e?.message || 'Could not assign breakout rooms.'); }
  };
  const joinAssignedBreakoutRoom = () => {
    if (!breakoutAssignedBanner) return;
    setMyBreakoutRoom({ id: breakoutAssignedBanner.roomId, name: breakoutAssignedBanner.roomName });
    switchRoom(breakoutRoomKeyOf(breakoutAssignedBanner.roomId));
    setBreakoutAssignedBanner(null);
  };
  const returnToMainRoom = () => {
    setMyBreakoutRoom(null);
    switchRoom(meetingId);
  };
  const broadcastToBreakouts = async () => {
    if (!breakoutBroadcastText.trim()) return;
    try {
      await apiFetch(`/v1/calls/meetings/${meetingId}/breakout-rooms/broadcast`, { method: 'POST', body: JSON.stringify({ text: breakoutBroadcastText.trim() }) });
      setBreakoutBroadcastText('');
    } catch { /* */ }
  };
  const closeAllBreakouts = async () => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/breakout-rooms/close`, { method: 'POST' }); loadBreakoutRooms(); } catch { /* */ }
  };
  function breakoutRoomKeyOf(roomId: string) { return `${meetingId}::bo::${roomId}`; }

  // ── AI meeting summary + meeting-to-tasks (real: reads the actual
  // persisted transcript, calls the platform's own configured AI provider —
  // never a hardcoded summary) ──
  const loadSummary = useCallback(async () => {
    try { const s = await apiFetch(`/v1/calls/meetings/${meetingId}/summary`); setSummary(s.summary_json); } catch { /* no summary yet */ }
  }, [meetingId]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const row = await apiFetch(`/v1/calls/meetings/${meetingId}/summarize`, { method: 'POST' });
      setSummary(row.summary_json);
    } catch (e: any) {
      setSummaryError(e?.message || 'Could not generate a summary.');
    } finally {
      setSummaryLoading(false);
    }
  };
  const createTasksFromSummary = async () => {
    if (!summary?.actionItems?.length) return;
    setCreatingTasks(true);
    try {
      await apiFetch(`/v1/calls/meetings/${meetingId}/create-tasks`, {
        method: 'POST',
        body: JSON.stringify({ items: summary.actionItems.map(a => ({ title: a.text })) }),
      });
      setTasksCreated(true);
    } catch (e: any) {
      setSummaryError(e?.message || 'Could not create tasks.');
    } finally {
      setCreatingTasks(false);
    }
  };

  // ── Screen-share annotation — persistent pen strokes broadcast in
  // normalized 0..1 coordinates (so they map correctly on every viewer's
  // own window size); the ephemeral laser pointer is available to anyone,
  // the pen is presenter-only. ──
  function stagePoint(e: React.MouseEvent): { x: number; y: number } | null {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }
  const onStageMouseDown = (e: React.MouseEvent) => {
    if (!annotationTool) return;
    const p = stagePoint(e);
    if (!p) return;
    if (annotationTool === 'laser') {
      send({ type: 'annotation-draw', tool: 'laser', x: p.x, y: p.y });
      const lid = ++laserIdRef.current;
      setLaserDots(prev => [...prev, { id: lid, x: p.x, y: p.y, name: 'You' }]);
      setTimeout(() => setLaserDots(prev => prev.filter(d => d.id !== lid)), 1500);
      return;
    }
    const strokeId = crypto.randomUUID();
    currentStrokeRef.current = { id: strokeId, points: [p], color: annotationColor };
    setStrokes(prev => [...prev, currentStrokeRef.current!]);
    send({ type: 'annotation-draw', tool: 'pen', strokeId, x: p.x, y: p.y, color: annotationColor });
  };
  const onStageMouseMove = (e: React.MouseEvent) => {
    if (annotationTool !== 'pen' || !currentStrokeRef.current) return;
    const p = stagePoint(e);
    if (!p) return;
    const strokeId = currentStrokeRef.current.id;
    currentStrokeRef.current.points.push(p);
    setStrokes(prev => prev.map(s => s.id === strokeId ? { ...s, points: [...s.points, p] } : s));
    send({ type: 'annotation-draw', tool: 'pen', strokeId, x: p.x, y: p.y, color: annotationColor });
  };
  const onStageMouseUp = () => { currentStrokeRef.current = null; };
  const clearAnnotations = () => { setStrokes([]); send({ type: 'annotation-clear' }); };

  // ── Recording (real: MediaRecorder over your own camera/screen-share
  // track, mixed with every participant's real audio via AudioContext, so
  // the saved file has full meeting audio even though the video only shows
  // your own view — no server-side compositor exists to record everyone's
  // video in one file without one) ──
  const startRecording = () => {
    if (recording || !localStreamRef.current) return;
    try {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      const localAudioTracks = localStreamRef.current.getAudioTracks();
      if (localAudioTracks.length) audioCtx.createMediaStreamSource(new MediaStream(localAudioTracks)).connect(dest);
      for (const p of Object.values(participants)) {
        const remoteAudio = p.stream?.getAudioTracks() || [];
        if (remoteAudio.length) { try { audioCtx.createMediaStreamSource(new MediaStream(remoteAudio)).connect(dest); } catch { /* */ } }
      }
      const tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()];
      if (videoTrack) tracks.unshift(videoTrack.clone());
      const combined = new MediaStream(tracks);
      const recorder = new MediaRecorder(combined, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^\w-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        audioCtx.close().catch(() => { });
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch {
      setError('Could not start recording — this browser may not support it.');
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const leave = async () => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/leave`, { method: 'POST' }); } catch { /* */ }
    onLeave();
  };

  const endForEveryone = async () => {
    try { await apiFetch(`/v1/calls/meetings/${meetingId}/end`, { method: 'POST' }); } catch { /* */ }
    onLeave();
  };

  const participantList = Object.entries(participants);
  const totalCount = participantList.length + 1;
  const activeSpotlight = spotlightUser ? participants[spotlightUser] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#202124', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'Inter, Roboto, sans-serif' }}>
      
      {/* ─── GOOGLE MEET TOP BAR HEADER ────────────────────────────────────── */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10 }}>
        {/* Left: Clock | Meeting code | Info icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#f1f5f9' }}>
          <span>{currentTimeStr || '12:30 AM'}</span>
          <span style={{ color: '#5f6368' }}>|</span>
          <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{meetingId.substring(0, 12)}</span>
          <Tip label="Meeting details">
            <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <Icon name="info" size={15} />
            </button>
          </Tip>
        </div>

        {/* Right: Participants list / hosting settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tip label="People">
            <button
              onClick={() => setPanel(p => p === 'participants' ? 'none' : 'participants')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: panel === 'participants' ? 'var(--teal)' : '#3c4043', padding: '2px 10px', borderRadius: 20, fontSize: 13, border: 'none', cursor: 'pointer', color: panel === 'participants' ? 'hsl(var(--primary-foreground))' : '#fff' }}
            >
              <PersonAvatar name={myName} size={20} />
              <span style={{ fontWeight: 600 }}>{totalCount}</span>
            </button>
          </Tip>
          {canModerate && (
            <Tip label="Host controls">
              <button onClick={() => setPanel(p => p === 'host' ? 'none' : 'host')} style={{ position: 'relative', background: panel === 'host' ? '#3c4043' : 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 4, borderRadius: '50%', display: 'flex' }}>
                <Icon name="lock" size={15} />
                {waitingRoomList.length > 0 && (
                  <span style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: '50%', background: 'var(--red)', color: 'hsl(var(--red-foreground))', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{waitingRoomList.length}</span>
                )}
              </button>
            </Tip>
          )}
        </div>
      </div>

      {/* Breakout-room banner: shown to a normal participant once the host
          assigns them somewhere, and while inside one so they can return. */}
      {breakoutAssignedBanner && (
        <div style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: '#2d2f31', border: '1px solid #8ab4f8', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <span style={{ fontSize: 12.5, color: '#f1f5f9' }}>You've been placed in <strong>{breakoutAssignedBanner.roomName}</strong></span>
          <button onClick={joinAssignedBreakoutRoom} style={{ height: 30, padding: '0 14px', borderRadius: 15, background: '#8ab4f8', color: '#202124', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Join room</button>
          <button onClick={() => setBreakoutAssignedBanner(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}><Icon name="close" size={14} /></button>
        </div>
      )}
      {myBreakoutRoom && (
        <div style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>In breakout room: <strong style={{ color: '#f1f5f9' }}>{myBreakoutRoom.name}</strong></span>
          <button onClick={returnToMainRoom} style={{ height: 28, padding: '0 12px', borderRadius: 14, background: '#3c4043', color: '#fff', border: 'none', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>Return to main room</button>
        </div>
      )}
      {breakoutMessage && (
        <div style={{ position: 'absolute', top: myBreakoutRoom || breakoutAssignedBanner ? 96 : 54, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(138,180,248,0.15)', border: '1px solid #8ab4f8', borderRadius: 10, padding: '6px 14px', fontSize: 12, color: '#f1f5f9' }}>
          📢 {breakoutMessage}
        </div>
      )}

      {/* ─── VIDEO SCREEN GRID STAGE ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', padding: '0 16px 8px 16px' }}>
        
        {/* Animated reaction badges */}
        <div style={{ position: 'absolute', bottom: 20, left: 30, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', zIndex: 50 }}>
          {reactions.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3c4043', border: '1px solid #5f6368', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', animation: 'slideIn 0.2s' }}>
              <span>{r.emoji}</span>
              <span style={{ fontWeight: 600 }}>{r.from}</span>
            </div>
          ))}
        </div>

        {/* Main video canvas wrapper */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          
          {/* Main Speaker Stage */}
          <div
            ref={stageRef}
            onMouseDown={onStageMouseDown}
            onMouseMove={onStageMouseMove}
            onMouseUp={onStageMouseUp}
            onMouseLeave={onStageMouseUp}
            style={{ flex: 1, background: '#111214', borderRadius: 16, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #3c4043', cursor: annotationTool ? 'crosshair' : 'default' }}
          >
            {/* Screen-share annotation overlay — real strokes broadcast live
                (normalized coordinates), not a decorative drawing demo. */}
            {(strokes.length > 0 || laserDots.length > 0 || annotationTool) && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 45, pointerEvents: 'none' }}>
                {strokes.map(s => (
                  <polyline
                    key={s.id}
                    points={s.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="none" stroke={s.color} strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round"
                  />
                ))}
                {laserDots.map(d => (
                  <circle key={d.id} cx={d.x * 100} cy={d.y * 100} r={1.2} fill="#ea4335" opacity={0.85} />
                ))}
              </svg>
            )}
            {annotationTool && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 55, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(32,33,36,0.9)', backdropFilter: 'blur(8px)', borderRadius: 24, padding: '6px 10px', border: '1px solid #3c4043' }}>
                <button onClick={() => setAnnotationTool('pen')} title="Pen" style={{ width: 30, height: 30, borderRadius: '50%', background: annotationTool === 'pen' ? '#8ab4f8' : 'transparent', border: 'none', color: annotationTool === 'pen' ? '#202124' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="edit" size={14} /></button>
                <button onClick={() => setAnnotationTool('laser')} title="Laser pointer" style={{ width: 30, height: 30, borderRadius: '50%', background: annotationTool === 'laser' ? '#8ab4f8' : 'transparent', border: 'none', color: annotationTool === 'laser' ? '#202124' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="target" size={14} /></button>
                {['#ef4444', '#8ab4f8', '#facc15', '#34d399'].map(c => (
                  <button key={c} onClick={() => setAnnotationColor(c)} title={c} style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: annotationColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                ))}
                {sharing && <button onClick={clearAnnotations} title="Clear drawings" style={{ fontSize: 11, background: 'none', border: '1px solid #5f6368', borderRadius: 12, padding: '3px 10px', color: '#cbd5e1', cursor: 'pointer' }}>Clear</button>}
                <button onClick={() => setAnnotationTool(null)} title="Close" style={{ width: 26, height: 26, borderRadius: '50%', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={13} /></button>
              </div>
            )}

            {activeSpotlight && activeSpotlight.stream && !activeSpotlight.videoOff ? (
              <video
                autoPlay
                playsInline
                ref={el => { if (el && el.srcObject !== activeSpotlight.stream) el.srcObject = activeSpotlight.stream; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
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
                    <div style={{ width: 90, height: 90, borderRadius: '50%', background: '#3c4043', color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700 }}>
                      {ini(myName)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{myName}</div>
                  </div>
                )}
              </>
            )}

            {/* Spotlight Speaker name tag */}
            <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(32,33,36,0.75)', backdropFilter: 'blur(8px)', borderRadius: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeSpotlight && activeSpotlight.handRaised && <span style={{ color: '#f59e0b' }}>✋</span>}
              <span>{activeSpotlight ? activeSpotlight.name : myName}</span>
              {activeSpotlight ? (activeSpotlight.audioMuted && <span style={{ color: '#ef4444' }}>🔇</span>) : (muted && <span style={{ color: '#ef4444' }}>🔇</span>)}
            </div>

            {/* Live caption bar — real speech recognized by whoever has
                Transcribe running (their own browser's Web Speech API),
                broadcast to the room. Empty until someone actually speaks
                with transcription on; never a placeholder sentence. Shown
                to everyone with captions toggled on, not just the speaker. */}
            {captionsEnabled && liveCaption && (
              <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', padding: '6px 16px', borderRadius: 8, fontSize: 14, color: '#fff', textAlign: 'center', maxWidth: '75%', zIndex: 40 }}>
                <strong>{liveCaption.name}:</strong> {liveCaption.text}
              </div>
            )}
          </div>

          {/* Participant Thumbnail Bar (2+ participants) */}
          {participantList.length > 0 && (
            <div style={{ height: 96, display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
              {/* Local Thumbnail */}
              <div
                onClick={() => setSpotlightUser(null)}
                style={{ width: 140, height: '100%', borderRadius: 12, background: '#111214', overflow: 'hidden', position: 'relative', cursor: 'pointer', border: spotlightUser === null ? '2px solid #8ab4f8' : '1px solid #3c4043', flexShrink: 0 }}
              >
                {!camOff ? (
                  <video ref={el => { if (el && localStreamRef.current) el.srcObject = localStreamRef.current; }} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3c4043', color: '#fff', fontWeight: 600 }}>{ini(myName)}</div>
                )}
                <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.65)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#fff' }}>You</div>
              </div>

              {/* Remote Thumbnails */}
              {participantList.map(([id, p]) => (
                <div
                  key={id}
                  onClick={() => setSpotlightUser(id)}
                  style={{ width: 140, height: '100%', borderRadius: 12, background: '#111214', overflow: 'hidden', position: 'relative', cursor: 'pointer', border: spotlightUser === id ? '2px solid #8ab4f8' : '1px solid #3c4043', flexShrink: 0 }}
                >
                  {p.stream && !p.videoOff ? (
                    <video autoPlay playsInline ref={el => { if (el && el.srcObject !== p.stream) el.srcObject = p.stream; }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3c4043', color: '#fff', fontWeight: 600 }}>{ini(p.name)}</div>
                  )}
                  <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.65)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {p.handRaised && <span>✋</span>}
                    <span>{p.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── GOOGLE MEET SIDEBAR DRAWER (TOOLS & ADD-ONS / CHAT / DETAILS) ── */}
        {panel !== 'none' && (
          <div style={{ width: 340, background: '#1e2022', borderLeft: '1px solid #3c4043', borderRadius: 16, display: 'flex', flexDirection: 'column', marginLeft: 16, overflow: 'hidden', zIndex: 20 }}>
            {/* Sidebar Header (only if subPanel is 'none') */}
            {subPanel === 'none' && (
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                  {panel === 'chat' ? 'In-call messages' : panel === 'participants' ? `People` : panel === 'tools' ? 'Meeting tools' : panel === 'host' ? 'Host controls' : 'Settings'}
                </div>
                <button type="button" onClick={() => setPanel('none')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}

            {/* Host Controls Panel — waiting room admission queue + meeting-wide
                toggles. Real, server-enforced state (password/lock checked at
                /join on the API side), not decorative switches. */}
            {panel === 'host' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {waitingRoomList.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Waiting room ({waitingRoomList.length})</div>
                      <button onClick={admitAllWaiting} style={{ fontSize: 11, fontWeight: 700, background: 'none', border: '1px solid #3c4043', borderRadius: 12, padding: '3px 10px', color: '#8ab4f8', cursor: 'pointer' }}>Admit all</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {waitingRoomList.map(w => (
                        <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2d2f31', borderRadius: 10, padding: '8px 10px' }}>
                          <PersonAvatar name={w.user_name} size={26} userId={w.user_id} />
                          <span style={{ flex: 1, fontSize: 12.5, color: '#f1f5f9', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.user_name}</span>
                          {!w.user_id && <span style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', background: 'rgba(147,197,253,0.12)', border: '1px solid rgba(147,197,253,0.3)', borderRadius: 6, padding: '1px 6px' }}>GUEST</span>}
                          <button onClick={() => admitWaiting(w.id)} title="Admit" style={{ width: 26, height: 26, borderRadius: '50%', background: '#10b981', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={13} /></button>
                          <button onClick={() => rejectWaiting(w.id)} title="Reject" style={{ width: 26, height: 26, borderRadius: '50%', background: '#3c4043', border: 'none', color: '#fca5a5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={13} /></button>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: '#3c4043', margin: '14px 0' }} />
                  </div>
                )}

                {isHost ? (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span style={{ fontSize: 12.5, color: '#f1f5f9' }}>Lock meeting</span>
                      <input type="checkbox" checked={hostSettings.locked} onChange={e => updateHostSetting({ locked: e.target.checked })} style={{ accentColor: '#8ab4f8' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span style={{ fontSize: 12.5, color: '#f1f5f9' }}>Enable waiting room</span>
                      <input type="checkbox" checked={hostSettings.waitingRoomEnabled} onChange={e => updateHostSetting({ waiting_room_enabled: e.target.checked })} style={{ accentColor: '#8ab4f8' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span style={{ fontSize: 12.5, color: '#f1f5f9' }}>Disable chat for everyone</span>
                      <input type="checkbox" checked={hostSettings.chatDisabled} onChange={e => updateHostSetting({ chat_disabled: e.target.checked })} style={{ accentColor: '#8ab4f8' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span style={{ fontSize: 12.5, color: '#f1f5f9' }}>Disable screen sharing for everyone</span>
                      <input type="checkbox" checked={hostSettings.screenShareDisabled} onChange={e => updateHostSetting({ screen_share_disabled: e.target.checked })} style={{ accentColor: '#8ab4f8' }} />
                    </label>
                    <div>
                      <div style={{ fontSize: 12.5, color: '#f1f5f9', marginBottom: 6 }}>Meeting password {hostSettings.hasPassword && <span style={{ color: '#10b981', fontSize: 11 }}>(set)</span>}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={hostPasswordInput} onChange={e => setHostPasswordInput(e.target.value)} placeholder="New password" style={{ flex: 1, height: 32, background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 8, padding: '0 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                        <button onClick={() => updateHostSetting({ password: hostPasswordInput })} style={{ fontSize: 11.5, fontWeight: 700, background: '#8ab4f8', color: '#202124', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>Set</button>
                        {hostSettings.hasPassword && <button onClick={() => { setHostPasswordInput(''); updateHostSetting({ password: '' }); }} style={{ fontSize: 11.5, background: 'none', border: '1px solid #3c4043', borderRadius: 8, padding: '0 10px', color: '#cbd5e1', cursor: 'pointer' }}>Clear</button>}
                      </div>
                    </div>

                    <div style={{ height: 1, background: '#3c4043', margin: '2px 0' }} />

                    {/* Guest ("join like Zoom/Meet/Teams") access — off by
                        default; the meeting's own password/waiting-room
                        controls above are what actually locks it once on. */}
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span style={{ fontSize: 12.5, color: '#f1f5f9' }}>Allow guests without an account</span>
                      <input type="checkbox" checked={hostSettings.guestJoinEnabled} onChange={e => updateHostSetting({ guest_join_enabled: e.target.checked })} style={{ accentColor: '#8ab4f8' }} />
                    </label>
                    {hostSettings.guestJoinEnabled && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          readOnly value={`${window.location.origin}/meet/${meetingId}`}
                          style={{ flex: 1, height: 32, background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 8, padding: '0 10px', color: '#cbd5e1', fontSize: 11.5, outline: 'none' }}
                        />
                        <button
                          onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/meet/${meetingId}`); }}
                          style={{ fontSize: 11.5, fontWeight: 700, background: '#8ab4f8', color: '#202124', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >Copy guest link</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Meeting-wide settings (lock, password, chat/screen-share disable) can only be changed by the host. As a co-host you can still admit the waiting room and moderate participants.</div>
                )}
              </div>
            )}

            {/* Tools Panel */}
            {panel === 'tools' && subPanel === 'none' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {/* Tools Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #3c4043', padding: '0 16px' }}>
                  <button onClick={() => setMeetingToolsTab('tools')} style={{ flex: 1, padding: '12px 0', border: 'none', background: 'transparent', color: meetingToolsTab === 'tools' ? '#8ab4f8' : '#94a3b8', borderBottom: meetingToolsTab === 'tools' ? '2px solid #8ab4f8' : '2px solid transparent', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Tools</button>
                  <button onClick={() => setMeetingToolsTab('addons')} style={{ flex: 1, padding: '12px 0', border: 'none', background: 'transparent', color: meetingToolsTab === 'addons' ? '#8ab4f8' : '#94a3b8', borderBottom: meetingToolsTab === 'addons' ? '2px solid #8ab4f8' : '2px solid transparent', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add-ons</button>
                </div>

                {meetingToolsTab === 'tools' ? (
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { icon: 'circle', title: 'Record', desc: 'Capture your view + full meeting audio', action: () => setSubPanel('recording'), badge: recording ? 'Recording' : '' },
                      { icon: 'fileText', title: 'Transcribe', desc: 'Live captions, real speech-to-text', action: () => setSubPanel('transcript'), badge: transcribing ? 'Live' : '' },
                      { icon: 'barChart', title: 'Polls', desc: 'Send polls to the audience', action: () => setSubPanel('polls'), badge: polls.some(p => !p.closed_at) ? String(polls.filter(p => !p.closed_at).length) : '' },
                      { icon: 'helpCircle', title: 'Q&A', desc: 'Ask and answer questions', action: () => setSubPanel('qanda'), badge: questions.filter(q => !q.answered).length ? String(questions.filter(q => !q.answered).length) : '' },
                      { icon: 'timer', title: 'Timer', desc: 'Show a countdown timer', action: () => setSubPanel('timer'), badge: timerRemaining != null ? fmtDur(timerRemaining) : '' },
                      { icon: 'sparkle', title: 'Summary', desc: 'AI-generated notes, decisions & action items', action: () => setSubPanel('summary'), badge: summary ? 'Ready' : '' },
                      ...(canModerate ? [{ icon: 'users', title: 'Breakout rooms', desc: 'Split into smaller group discussions', action: () => setSubPanel('breakout'), badge: breakoutRooms.length ? String(breakoutRooms.length) : '' }] : []),
                    ].map((tool, idx) => (
                      <div key={idx} onClick={tool.action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, background: '#2d2f31', cursor: 'pointer' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#3c4043', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8ab4f8' }}>
                          <Icon name={tool.icon as IconName} size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{tool.title}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{tool.desc}</div>
                        </div>
                        {tool.badge && (
                          <span style={{ fontSize: 10, background: '#8ab4f820', color: '#8ab4f8', padding: '2px 8px', borderRadius: 12, fontWeight: 800 }}>{tool.badge}</span>
                        )}
                      </div>
                    ))}

                    {/* Speech translation is honestly listed here rather than
                        faked: it needs a real translation API this platform
                        doesn't have configured — same category as Live
                        streaming, which even Google's own product gates
                        behind infrastructure it doesn't always have either. */}
                    <div style={{ height: 1, background: '#3c4043', margin: '12px 0' }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Unavailable or Premium</div>
                    {[
                      { icon: 'translate', title: 'Speech translation', desc: 'Requires a translation service — not configured' },
                      { icon: 'monitor', title: 'Live streaming', desc: 'Stream to view-only users' },
                    ].map((tool, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, background: '#252627', opacity: 0.6 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#3c4043', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                          <Icon name={tool.icon as IconName} size={16} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>{tool.title}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{tool.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>No add-ons currently installed in this call.</div>
                )}
              </div>
            )}

            {/* Polls Sub-panel — real, DB-backed */}
            {panel === 'tools' && subPanel === 'polls' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Polls</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {isHost && !showNewPoll && (
                    <button onClick={() => setShowNewPoll(true)} style={{ height: 38, borderRadius: 19, background: '#8ab4f8', color: '#202124', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ New poll</button>
                  )}
                  {isHost && showNewPoll && (
                    <div style={{ background: '#2d2f31', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input value={newPollQuestion} onChange={e => setNewPollQuestion(e.target.value)} placeholder="Ask a question…" style={{ height: 34, background: '#1e2022', border: '1px solid #3c4043', borderRadius: 8, padding: '0 10px', color: '#fff', fontSize: 12.5, outline: 'none' }} />
                      {newPollOptions.map((opt, i) => (
                        <input key={i} value={opt} onChange={e => setNewPollOptions(prev => prev.map((o, oi) => oi === i ? e.target.value : o))} placeholder={`Option ${i + 1}`} style={{ height: 32, background: '#1e2022', border: '1px solid #3c4043', borderRadius: 8, padding: '0 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                      ))}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setNewPollOptions(prev => [...prev, ''])} style={{ fontSize: 11.5, background: 'none', border: '1px solid #3c4043', borderRadius: 14, padding: '4px 10px', color: '#cbd5e1', cursor: 'pointer' }}>+ Option</button>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => setShowNewPoll(false)} style={{ fontSize: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={createPoll} style={{ fontSize: 12, fontWeight: 700, background: '#8ab4f8', color: '#202124', border: 'none', borderRadius: 14, padding: '5px 14px', cursor: 'pointer' }}>Launch</button>
                      </div>
                    </div>
                  )}
                  {polls.length === 0 && <div style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No polls yet.</div>}
                  {polls.map(p => (
                    <div key={p.id} style={{ background: '#2d2f31', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>{p.question}{p.closed_at && <span style={{ marginLeft: 8, fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>CLOSED</span>}</div>
                      {p.options.map((opt, i) => {
                        const pct = p.totalVotes > 0 ? Math.round((p.tally[i] / p.totalVotes) * 100) : 0;
                        return (
                          <button key={i} disabled={!!p.closed_at} onClick={() => votePoll(p.id, i)} style={{ width: '100%', textAlign: 'left', position: 'relative', height: 32, borderRadius: 6, border: p.myVote === i ? '1px solid #8ab4f8' : '1px solid #3c4043', background: '#1e2022', overflow: 'hidden', marginBottom: 6, cursor: p.closed_at ? 'default' : 'pointer' }}>
                            <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'rgba(138,180,248,0.18)' }} />
                            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '0 10px', height: '100%', alignItems: 'center', fontSize: 12, color: '#f1f5f9' }}>
                              <span>{opt}{p.myVote === i ? ' ✓' : ''}</span>
                              <span style={{ color: '#94a3b8' }}>{pct}% ({p.tally[i]})</span>
                            </div>
                          </button>
                        );
                      })}
                      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>{p.totalVotes} vote{p.totalVotes === 1 ? '' : 's'} · by {p.created_by_name}</div>
                      {isHost && !p.closed_at && <button onClick={() => closePoll(p.id)} style={{ marginTop: 6, fontSize: 11, background: 'none', border: '1px solid #3c4043', borderRadius: 12, padding: '3px 10px', color: '#cbd5e1', cursor: 'pointer' }}>Close poll</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Q&A Sub-panel — real, DB-backed */}
            {panel === 'tools' && subPanel === 'qanda' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Q&amp;A</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {questions.length === 0 && <div style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No questions yet.</div>}
                  {questions.map(q => (
                    <div key={q.id} style={{ background: '#2d2f31', borderRadius: 10, padding: 10, opacity: q.answered ? 0.55 : 1 }}>
                      <div style={{ fontSize: 12.5, color: '#f1f5f9' }}>{q.text}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{ fontSize: 10.5, color: '#94a3b8', flex: 1 }}>{q.user_name}{q.answered ? ' · answered' : ''}</span>
                        <button onClick={() => upvoteQuestion(q.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid #3c4043', borderRadius: 12, padding: '3px 8px', color: q.myUpvote ? '#8ab4f8' : '#cbd5e1', cursor: 'pointer', fontSize: 11 }}>
                          ▲ {q.upvoteCount}
                        </button>
                        {isHost && !q.answered && <button onClick={() => answerQuestion(q.id)} style={{ fontSize: 10.5, background: 'none', border: '1px solid #3c4043', borderRadius: 12, padding: '3px 8px', color: '#cbd5e1', cursor: 'pointer' }}>Mark answered</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #3c4043' }}>
                  <input value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)} onKeyDown={e => e.key === 'Enter' && askQuestion()} placeholder="Ask a question…" style={{ flex: 1, height: 34, background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 17, padding: '0 12px', color: '#fff', fontSize: 12.5, outline: 'none' }} />
                  <button onClick={askQuestion} aria-label="Send" style={{ width: 34, height: 34, borderRadius: '50%', background: '#8ab4f8', color: '#202124', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={13} /></button>
                </div>
              </div>
            )}

            {/* Timer Sub-panel — real, WS-synced across every participant */}
            {panel === 'tools' && subPanel === 'timer' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Timer</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div style={{ padding: 24, textAlign: 'center' }}>
                  {timerRemaining != null ? (
                    <>
                      <div style={{ fontSize: 42, fontWeight: 800, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>{fmtDur(timerRemaining)}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 16px' }}>visible to everyone in the meeting</div>
                      {isHost && <button onClick={stopTimerFn} style={{ height: 36, padding: '0 20px', borderRadius: 18, background: '#3c4043', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Stop timer</button>}
                    </>
                  ) : isHost ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
                        <input type="number" min={1} max={180} value={timerMinutesInput} onChange={e => setTimerMinutesInput(Math.max(1, Number(e.target.value) || 1))} style={{ width: 64, height: 38, textAlign: 'center', background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 8, color: '#fff', fontSize: 16 }} />
                        <span style={{ fontSize: 13, color: '#cbd5e1' }}>minutes</span>
                      </div>
                      <button onClick={() => startTimerFn(timerMinutesInput)} style={{ height: 38, padding: '0 24px', borderRadius: 19, background: '#8ab4f8', color: '#202124', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Start timer</button>
                    </>
                  ) : (
                    <div style={{ fontSize: 12.5, color: '#94a3b8' }}>No timer running.</div>
                  )}
                </div>
              </div>
            )}

            {/* Summary Sub-panel — real AI-generated summary from the actual
                persisted transcript */}
            {panel === 'tools' && subPanel === 'summary' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Summary</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {canModerate && (
                    <button onClick={generateSummary} disabled={summaryLoading} style={{ height: 38, borderRadius: 19, background: '#8ab4f8', color: '#202124', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                      {summaryLoading ? 'Generating…' : summary ? 'Regenerate summary' : 'Generate summary'}
                    </button>
                  )}
                  {summaryError && <div style={{ fontSize: 12, color: '#fca5a5' }}>{summaryError}</div>}
                  {!summary && !summaryLoading && (
                    <div style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                      No summary yet. {canModerate ? 'Generate one from the transcript so far — turn on Transcribe first if it\'s empty.' : 'Ask the host to generate one.'}
                    </div>
                  )}
                  {summary && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Executive summary</div>
                        <div style={{ fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.5 }}>{summary.executiveSummary}</div>
                      </div>
                      {summary.keyPoints?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Key points</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.6 }}>{summary.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
                        </div>
                      )}
                      {summary.decisions?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Decisions</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.6 }}>{summary.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                        </div>
                      )}
                      {summary.actionItems?.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Action items</div>
                            <button onClick={createTasksFromSummary} disabled={creatingTasks || tasksCreated} style={{ fontSize: 10.5, fontWeight: 700, background: 'none', border: '1px solid #3c4043', borderRadius: 12, padding: '3px 10px', color: tasksCreated ? '#10b981' : '#8ab4f8', cursor: tasksCreated ? 'default' : 'pointer' }}>
                              {tasksCreated ? 'Tasks created ✓' : creatingTasks ? 'Creating…' : 'Create tasks'}
                            </button>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.6 }}>
                            {summary.actionItems.map((a, i) => <li key={i}>{a.text}{a.assignee ? <span style={{ color: '#94a3b8' }}> — {a.assignee}</span> : null}</li>)}
                          </ul>
                        </div>
                      )}
                      {summary.questions?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Unresolved questions</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.6 }}>{summary.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                        </div>
                      )}
                      {summary.followUps?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Follow-ups</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.6 }}>{summary.followUps.map((f, i) => <li key={i}>{f}</li>)}</ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Breakout Rooms Sub-panel — host/co-host only (see the Tools
                list gating above); reuses switchRoom() for the actual mesh
                move, defined next to the main room's own WebRTC setup. */}
            {panel === 'tools' && subPanel === 'breakout' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Breakout rooms</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {breakoutRooms.length === 0 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="number" min={1} max={20} value={breakoutCount} onChange={e => setBreakoutCount(Math.max(1, Number(e.target.value) || 1))} style={{ width: 56, height: 36, textAlign: 'center', background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 8, color: '#fff', fontSize: 14 }} />
                        <span style={{ fontSize: 12.5, color: '#cbd5e1' }}>rooms</span>
                        <button onClick={createBreakoutRooms} style={{ marginLeft: 'auto', height: 36, padding: '0 16px', borderRadius: 18, background: '#8ab4f8', color: '#202124', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>Create</button>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8' }}>Everyone currently in the main room can be auto-distributed evenly once rooms exist.</div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={autoAssignBreakout} style={{ flex: 1, height: 34, borderRadius: 17, background: '#8ab4f8', color: '#202124', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Auto-assign everyone</button>
                        <button onClick={closeAllBreakouts} style={{ height: 34, padding: '0 14px', borderRadius: 17, background: '#3c4043', color: '#fca5a5', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Close all</button>
                      </div>
                      {breakoutRooms.map(r => (
                        <div key={r.id} style={{ background: '#2d2f31', borderRadius: 10, padding: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9' }}>{r.name}</span>
                            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.liveCount} live</span>
                          </div>
                          {r.assignments.length > 0 && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{r.assignments.map(a => a.user_name).join(', ')}</div>
                          )}
                        </div>
                      ))}
                      <div style={{ height: 1, background: '#3c4043', margin: '4px 0' }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={breakoutBroadcastText} onChange={e => setBreakoutBroadcastText(e.target.value)} onKeyDown={e => e.key === 'Enter' && broadcastToBreakouts()} placeholder="Message all rooms…" style={{ flex: 1, height: 34, background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 17, padding: '0 12px', color: '#fff', fontSize: 12, outline: 'none' }} />
                        <button onClick={broadcastToBreakouts} aria-label="Send" style={{ width: 34, height: 34, borderRadius: '50%', background: '#8ab4f8', color: '#202124', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={13} /></button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Transcript Sub-panel — toggles real Web Speech API transcription */}
            {panel === 'tools' && subPanel === 'transcript' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Transcribe</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 14 }}>
                    Real speech-to-text, run by your own browser (Web Speech API) — captures what you say and shares it live as captions and a saved transcript. Each participant who wants to be transcribed turns this on themselves.
                  </div>
                  <button onClick={toggleTranscribe} style={{ width: '100%', height: 40, borderRadius: 20, background: transcribing ? '#ef4444' : '#8ab4f8', color: transcribing ? '#fff' : '#202124', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                    {transcribing ? 'Stop transcribing' : 'Start transcribing my speech'}
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer', margin: '10px 0 16px' }}>
                    <input type="checkbox" checked={captionsEnabled} onChange={e => setCaptionsEnabled(e.target.checked)} style={{ accentColor: '#8ab4f8' }} />
                    Show live captions on screen
                  </label>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Transcript ({transcriptLines.length})</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {transcriptLines.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>Nothing recorded yet.</div>}
                    {transcriptLines.map(l => (
                      <div key={l.id} style={{ fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: '#8ab4f8' }}>{l.user_name}: </span>
                        <span style={{ color: '#e2e8f0' }}>{l.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recording Sub-panel */}
            {panel === 'tools' && subPanel === 'recording' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c4043', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setSubPanel('none')} title="Back" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', flex: 1 }}>Recording</div>
                  <button type="button" onClick={() => { setSubPanel('none'); setPanel('none'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <div style={{ padding: '16px 24px' }}>
                  <svg viewBox="0 0 240 125" width="100%" height="96" style={{ margin: '0 auto 12px auto', display: 'block' }}>
                    <rect x="20" y="5" width="65" height="42" rx="6" fill="#3c4043" stroke="#5f6368" strokeWidth="1.5" />
                    <rect x="95" y="5" width="65" height="42" rx="6" fill="#3c4043" stroke="#5f6368" strokeWidth="1.5" />
                    <rect x="95" y="52" width="65" height="42" rx="6" fill="#3c4043" stroke="#5f6368" strokeWidth="1.5" />
                    <g transform="translate(20, 5)">
                      <path d="M15 38 c5 -10, 25 -10, 30 0" fill="#8ab4f8" opacity="0.15" />
                      <circle cx="30" cy="22" r="7" fill="#8ab4f8" />
                    </g>
                    <g transform="translate(95, 5)">
                      <path d="M15 38 c5 -10, 25 -10, 30 0" fill="#a7f3d0" opacity="0.15" />
                      <circle cx="30" cy="22" r="7" fill="#a7f3d0" />
                    </g>
                    <circle cx="40" cy="80" r="7" fill="#ea4335" />
                    <circle cx="40" cy="80" r="3" fill="#fff" />
                    <path d="M55 80 h95" stroke="#8ab4f8" strokeWidth="3.5" strokeLinecap="round" />
                    <path d="M65 72 v16 M80 67 v26 M95 73 v14 M110 68 v24 M125 72 v16 M140 76 v8" stroke="#8ab4f8" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>

                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', textAlign: 'center', marginBottom: 12 }}>Record your view of this call</div>

                  <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 16 }}>
                    Records your own camera or screen-share, mixed with everyone's real audio, entirely in this browser tab — nothing is uploaded anywhere. When you stop, the file downloads straight to your device as a .webm video.
                  </div>

                  {recording && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fca5a5', marginBottom: 16, justifyContent: 'center' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea4335', display: 'inline-block' }} />
                      Recording — {fmtDur(elapsed)}
                    </div>
                  )}

                  <button
                    onClick={() => (recording ? stopRecording() : startRecording())}
                    style={{ width: '100%', height: 40, borderRadius: 20, background: recording ? '#ea4335' : '#8ab4f8', color: recording ? '#fff' : '#202124', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                  >
                    {recording ? 'Stop recording (downloads the file)' : 'Start recording'}
                  </button>
                </div>
              </div>
            )}

            {/* Chat Panel */}
            {panel === 'chat' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: m.from === myUserId ? '#8ab4f8' : '#94a3b8' }}>
                        {m.from === myUserId ? 'You' : m.fromName}
                      </div>
                      <div style={{ background: '#2d2f31', padding: '8px 12px', borderRadius: 8, fontSize: 13, color: '#f1f5f9' }}>{m.text}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                {(chatBlocked || (hostSettings.chatDisabled && !isHost)) ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                    {hostSettings.chatDisabled ? 'The host has disabled chat for this meeting.' : 'The host has disabled your chat.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Send a message to everyone" style={{ flex: 1, height: 36, background: '#2d2f31', border: '1px solid #3c4043', borderRadius: 18, padding: '0 14px', color: '#fff', fontSize: 13, outline: 'none' }} />
                    <button onClick={sendChat} style={{ width: 36, height: 36, borderRadius: '50%', background: '#8ab4f8', color: '#202124', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="send" size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* People/Participants list — with real host-moderation actions
                when I'm the host or a co-host: mute, camera off, remove,
                spotlight, chat lock, and co-host toggle. */}
            {panel === 'participants' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#2d2f31', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{myName} (You)</span>
                  <span style={{ fontSize: 10, background: '#8ab4f820', color: '#8ab4f8', padding: '2px 8px', borderRadius: 4 }}>{myRole === 'HOST' ? 'Host' : myRole === 'CO_HOST' ? 'Co-host' : ''}</span>
                </div>
                {participantList.map(([id, p]) => (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#2d2f31', borderRadius: 8, gap: 8 }}>
                    <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <Icon name="volume2" size={14} color={p.audioMuted ? '#ef4444' : '#10b981'} />
                    {canModerate && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2, display: 'flex' }} title="Manage participant">
                            <Icon name="moreVertical" size={15} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" side="bottom" className="w-52 bg-slate-800 border-slate-700 p-1.5 rounded-lg">
                          {[
                            { label: 'Mute', onClick: () => muteParticipant(id) },
                            { label: 'Turn off camera', onClick: () => cameraOffParticipant(id) },
                            { label: 'Spotlight for everyone', onClick: () => spotlightParticipant(id) },
                            { label: 'Disable their chat', onClick: () => disableChatFor(id) },
                            { label: 'Enable their chat', onClick: () => enableChatFor(id) },
                            ...(isHost ? [{ label: 'Make co-host', onClick: () => toggleCoHost(id, true) }, { label: 'Remove co-host', onClick: () => toggleCoHost(id, false) }] : []),
                            { label: 'Remove from meeting', onClick: () => removeParticipant(id), danger: true },
                          ].map((a, i) => (
                            <button key={i} onClick={a.onClick} className="w-full text-left" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '7px 10px', borderRadius: 6, fontSize: 12, color: (a as any).danger ? '#fca5a5' : '#e2e8f0', cursor: 'pointer' }}>
                              {a.label}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── GOOGLE MEET BOTTOM CONTROLS DOCK ───────────────────────────────── */}
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#202124', borderTop: '1px solid #3c4043', zIndex: 10 }}>
        
        {/* Left Control Column: Ask Assistant — a real call to the platform's
            own /v1/ai/chat (whatever provider the tenant configured), not a
            hardcoded reply pretending to be a specific vendor's model. */}
        <div style={{ width: 240, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Popover open={showAskAssistant} onOpenChange={setShowAskAssistant}>
              <PopoverTrigger asChild>
                <div style={{ display: 'flex', alignItems: 'center', background: '#3c4043', borderRadius: 24, height: 40, padding: '0 12px 0 36px', width: '100%', cursor: 'pointer' }}>
                  <Icon name="sparkle" size={16} color="var(--teal)" style={{ position: 'absolute', left: 12 }} />
                  <input
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && askAssistant()}
                    placeholder="Ask Assistant…"
                    style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 13, width: '100%' }}
                  />
                  <button onClick={askAssistant} disabled={aiBusy} style={{ background: 'none', border: 'none', color: 'var(--teal)', padding: 2, display: 'flex', cursor: 'pointer' }}>
                    <Icon name="arrowUp" size={14} />
                  </button>
                </div>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-80 bg-slate-800 border-slate-700 text-slate-100 p-3 rounded-xl shadow-2xl">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-700 pb-1">
                  <Icon name="sparkle" size={14} color="var(--teal)" /> Assistant
                </div>
                <div className="max-h-48 overflow-y-auto mb-2 flex flex-col gap-2">
                  {aiTurns.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-2">Ask anything — answered by this workspace's configured AI provider.</div>
                  ) : (
                    aiTurns.map((t, i) => (
                      <div key={i} className={`text-xs p-2 rounded-lg ${t.role === 'user' ? 'text-slate-100 bg-slate-700' : 'text-slate-200 bg-slate-750'}`}>
                        <span className="font-bold">{t.role === 'user' ? 'You: ' : ''}</span>{t.text}
                      </div>
                    ))
                  )}
                  {aiBusy && <div className="text-xs text-slate-400">Thinking…</div>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Center Control Column: Meeting Control Capsule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Microphone Mute */}
          <Tip label={muted ? 'Unmute microphone' : 'Mute microphone'}>
            <button
              type="button"
              onClick={toggleMute}
              style={{ width: 40, height: 40, borderRadius: '50%', background: muted ? 'var(--red)' : '#3c4043', border: 'none', color: muted ? 'hsl(var(--red-foreground))' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={muted ? 'micOff' : 'mic'} size={18} />
            </button>
          </Tip>

          {/* Camera toggle */}
          {kind === 'VIDEO' && (
            <Tip label={camOff ? 'Turn on camera' : 'Turn off camera'}>
              <button
                type="button"
                onClick={toggleCam}
                style={{ width: 40, height: 40, borderRadius: '50%', background: camOff ? 'var(--red)' : '#3c4043', border: 'none', color: camOff ? 'hsl(var(--red-foreground))' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="camera" size={18} />
              </button>
            </Tip>
          )}

          {/* Screen Present */}
          {kind === 'VIDEO' && (!hostSettings.screenShareDisabled || canModerate) && (
            <Tip label={sharing ? 'Stop screen share' : 'Present screen'}>
              <button
                type="button"
                onClick={toggleScreenShare}
                style={{ width: 40, height: 40, borderRadius: '50%', background: sharing ? 'var(--teal)' : '#3c4043', border: 'none', color: sharing ? 'hsl(var(--primary-foreground))' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="monitor" size={18} />
              </button>
            </Tip>
          )}

          {/* Annotate / laser pointer — pen tools for whoever is presenting,
              a laser pointer for anyone (real, broadcast live, not local-only) */}
          {kind === 'VIDEO' && (
            <Tip label={annotationTool ? 'Close annotation tools' : sharing ? 'Draw on your shared screen' : 'Laser pointer'}>
              <button
                type="button"
                onClick={() => setAnnotationTool(t => t ? null : (sharing ? 'pen' : 'laser'))}
                style={{ width: 40, height: 40, borderRadius: '50%', background: annotationTool ? 'var(--teal)' : '#3c4043', border: 'none', color: annotationTool ? 'hsl(var(--primary-foreground))' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="target" size={18} />
              </button>
            </Tip>
          )}

          {/* Emoji Reactions Popover */}
          <Popover>
            <Tip label="Send reaction">
              <PopoverTrigger asChild>
                <button type="button" style={{ width: 40, height: 40, borderRadius: '50%', background: '#3c4043', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="smile" size={18} />
                </button>
              </PopoverTrigger>
            </Tip>
            <PopoverContent align="center" side="top" className="w-auto p-2">
              <div style={{ display: 'flex', gap: 6 }}>
                {['👍', '❤️', '😄', '🎉', '🚀', '👀'].map(em => (
                  <button key={em} onClick={() => sendReaction(em)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4 }}>{em}</button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Closed Captions CC — shows real live captions (Web Speech API
              transcript broadcasts) when someone has Transcribe running;
              this button only controls whether YOU see them. */}
          <Tip label={captionsEnabled ? 'Turn off captions' : 'Turn on captions'}>
            <button
              type="button"
              onClick={() => setCaptionsEnabled(v => !v)}
              style={{ width: 40, height: 40, borderRadius: '50%', background: captionsEnabled ? 'var(--teal)' : '#3c4043', border: 'none', color: captionsEnabled ? 'hsl(var(--primary-foreground))' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="closedCaptions" size={18} />
            </button>
          </Tip>

          {/* Hand Raise */}
          <Tip label="Raise hand">
            <button
              type="button"
              onClick={() => { setHandRaised(v => !v); send({ type: 'room-status', audioMuted: muted, videoOff: camOff, handRaised: !handRaised }); }}
              style={{ width: 40, height: 40, borderRadius: '50%', background: handRaised ? 'var(--teal)' : '#3c4043', border: 'none', color: handRaised ? 'hsl(var(--primary-foreground))' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="hand" size={18} />
            </button>
          </Tip>

          {/* Settings / More Options */}
          <Tip label="More options">
            <button
              type="button"
              onClick={() => setPanel(p => p === 'settings' ? 'none' : 'settings')}
              style={{ width: 40, height: 40, borderRadius: '50%', background: '#3c4043', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="moreVertical" size={18} />
            </button>
          </Tip>

          {/* End Call / Leave Red Capsule Handset Button */}
          <Tip label={isHost ? 'End call for everyone' : 'Leave meeting'}>
            <button
              type="button"
              onClick={isHost ? endForEveryone : leave}
              style={{ width: 64, height: 40, borderRadius: 20, background: 'var(--red)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="phone" size={18} color="#fff" style={{ transform: 'rotate(135deg)' }} />
            </button>
          </Tip>
        </div>

        {/* Right Control Column: transcripts, chat, tools widgets */}
        <div style={{ width: 240, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {/* Recording indicator/control — jumps straight to the real
              Record tool rather than duplicating its own start/stop logic
              (a second control toggling the same state independently was
              how this used to drift out of sync with the Tools panel). */}
          {recording && (
            <Tip label="Recording — open recording controls">
              <button
                type="button"
                onClick={() => { setPanel('tools'); setSubPanel('recording'); }}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 17,
                  background: 'var(--red)', border: 'none',
                  color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                REC {fmtDur(elapsed)}
              </button>
            </Tip>
          )}

          {/* Chat toggle */}
          <Tip label="Meeting chat">
            <button
              type="button"
              onClick={() => setPanel(p => p === 'chat' ? 'none' : 'chat')}
              style={{ width: 40, height: 40, borderRadius: '50%', background: panel === 'chat' ? '#3c4043' : 'transparent', border: 'none', color: panel === 'chat' ? 'var(--teal)' : '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="messageSquare" size={18} />
            </button>
          </Tip>

          {/* Tools panel toggle */}
          <Tip label="Meeting tools">
            <button
              type="button"
              onClick={() => setPanel(p => p === 'tools' ? 'none' : 'tools')}
              style={{ width: 40, height: 40, borderRadius: '50%', background: panel === 'tools' ? '#3c4043' : 'transparent', border: 'none', color: panel === 'tools' ? 'var(--teal)' : '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="activities" size={18} />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  );
}
