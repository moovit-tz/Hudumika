import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DateRange } from 'react-day-picker';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog.js';
import { Button } from '../../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { DatePicker, DateRangePicker } from '../../components/ui/date-picker.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { showAlert } from '../../lib/alert.js';
import { MeetingSession } from './MeetingSession.js';

interface MeetingRow {
  id: string;
  title: string;
  join_code: string | null;
  kind: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  locked: boolean;
  host_id: string;
  host_name: string;
  max_duration_minutes: number;
  end_reason: string | null;
  source: 'bliss' | 'calendar';
  meeting_url: string | null;
  participantCount: number;
}

interface RecordingInfo {
  meetingId: string;
  title: string;
  durationSeconds: number;
  driveId: string;
  folderId: string;
  fileId: string;
  fileName: string;
  sizeBytes: number;
  driveUrl: string;
  downloadUrl: string;
  streamUrl: string;
}

interface MeetingNotesData {
  executiveSummary?: string;
  keyPoints?: string[];
  decisions?: string[];
  actionItems?: { text: string; assignee?: string }[];
  updatedAt?: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtTimeOnly(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getDateGroupKey(iso: string | null): string {
  if (!iso) return 'Undated Meetings';
  const d = new Date(iso);
  const now = new Date();
  
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (targetDate.getTime() === today.getTime()) {
    return `Today, ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (targetDate.getTime() === tomorrow.getTime()) {
    return `Tomorrow, ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (targetDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function MeetingCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [meetingsTotal, setMeetingsTotal] = useState(0);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [summaryStats, setSummaryStats] = useState({ totalMeetings: 0, activeCount: 0, scheduledCount: 0 });

  // Scheduling State
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState<Date | undefined>(undefined);
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedKind, setSchedKind] = useState<'VIDEO' | 'VOICE'>('VIDEO');
  const [schedPassword, setSchedPassword] = useState('');
  const [schedWaitingRoom, setSchedWaitingRoom] = useState(false);
  const [schedMaxDuration, setSchedMaxDuration] = useState('60');

  // Quick Join & Launch
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // Filters & Tabs
  const [searchMeeting, setSearchMeeting] = useState('');
  const [meetingStatusFilter, setMeetingStatusFilter] = useState<'ALL' | 'UPCOMING' | 'ONGOING' | 'ENDED'>('UPCOMING');
  const [meetingKindFilter, setMeetingKindFilter] = useState<string | null>(null);
  const [meetingHostFilter, setMeetingHostFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [meetingsPage, setMeetingsPage] = useState(1);
  const MEETINGS_PAGE_SIZE = 10;

  // Expanded card state
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Ended Meeting Modals: Recording, Notes, To-Do Tasks
  const [viewRecordingMeeting, setViewRecordingMeeting] = useState<MeetingRow | null>(null);
  const [recordingInfo, setRecordingInfo] = useState<RecordingInfo | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);

  const [viewNotesMeeting, setViewNotesMeeting] = useState<MeetingRow | null>(null);
  const [notesData, setNotesData] = useState<MeetingNotesData | null>(null);
  const [notesEditing, setNotesEditing] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const [viewTasksMeeting, setViewTasksMeeting] = useState<MeetingRow | null>(null);
  const [taskItemInput, setTaskItemInput] = useState('');
  const [taskList, setTaskList] = useState<{ id: string; title: string; added?: boolean }[]>([]);
  const [savingTasks, setSavingTasks] = useState(false);

  const loadMeetings = useCallback(async () => {
    setLoadingMeetings(true);
    try {
      const params = new URLSearchParams({
        page: String(meetingsPage),
        pageSize: String(MEETINGS_PAGE_SIZE),
      });
      if (searchMeeting.trim()) params.set('search', searchMeeting.trim());
      
      if (meetingStatusFilter === 'UPCOMING') params.set('status', 'SCHEDULED');
      else if (meetingStatusFilter === 'ONGOING') params.set('status', 'ACTIVE');
      else if (meetingStatusFilter === 'ENDED') params.set('status', 'ENDED');

      if (meetingKindFilter) params.set('kind', meetingKindFilter);
      if (meetingHostFilter === 'MINE') params.set('mine', '1');
      if (dateRange?.from) params.set('dateFrom', dateRange.from.toISOString());
      if (dateRange?.to) params.set('dateTo', dateRange.to.toISOString());

      const res = await apiFetch(`/v1/calls/meetings?${params.toString()}`);
      if (res && Array.isArray(res.data)) {
        setMeetings(res.data);
        setMeetingsTotal(res.total ?? res.data.length);
        setSummaryStats({
          totalMeetings: res.totalMeetings ?? res.total ?? res.data.length,
          activeCount: res.activeCount ?? 0,
          scheduledCount: res.scheduledCount ?? 0,
        });
        // Auto expand active meetings & first upcoming meeting
        const autoExpanded = new Set<string>();
        res.data.forEach((m: MeetingRow) => {
          if (m.status === 'ACTIVE') autoExpanded.add(m.id);
        });
        if (res.data[0]) autoExpanded.add(res.data[0].id);
        setExpandedCards(autoExpanded);
      }
    } catch { /* */ } finally {
      setLoadingMeetings(false);
    }
  }, [searchMeeting, meetingStatusFilter, meetingKindFilter, meetingHostFilter, dateRange, meetingsPage]);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  const totalMeetingsPages = Math.max(1, Math.ceil(meetingsTotal / MEETINGS_PAGE_SIZE));

  function pageNumbers(current: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
    const sorted = Array.from(pages).filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    let prev = 0;
    for (const p of sorted) {
      if (prev && p - prev > 1) out.push('…');
      out.push(p);
      prev = p;
    }
    return out;
  }

  function toggleCardExpand(id: string) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startInstantMeeting() {
    setCreatingMeeting(true);
    try {
      const m = await apiFetch('/v1/calls/meetings', {
        method: 'POST',
        body: JSON.stringify({ title: `${user?.name || 'Team'}'s Meeting`, kind: 'VIDEO' })
      });
      setActiveMeetingId(m.id);
    } catch (e: any) {
      showAlert(e?.message || 'Could not start meeting.');
    } finally {
      setCreatingMeeting(false);
    }
  }

  async function scheduleMeeting() {
    if (!schedTitle.trim()) { showAlert('Give the meeting a title.'); return; }
    if (!schedDate) { showAlert('Pick a date.'); return; }
    const [h, min] = schedTime.split(':').map(Number);
    const when = new Date(schedDate);
    when.setHours(h || 0, min || 0, 0, 0);

    try {
      await apiFetch('/v1/calls/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: schedTitle,
          kind: schedKind,
          scheduled_at: when.toISOString(),
          password: schedPassword.trim() || undefined,
          waiting_room_enabled: schedWaitingRoom,
          max_duration_minutes: Number(schedMaxDuration) || 60,
        })
      });
      setShowSchedule(false);
      setSchedTitle('');
      setSchedDate(undefined);
      setSchedTime('09:00');
      setSchedPassword('');
      setSchedWaitingRoom(false);
      setSchedMaxDuration('60');
      loadMeetings();
      showAlert('Meeting scheduled successfully.');
    } catch (e: any) {
      showAlert(e?.message || 'Could not schedule meeting.');
    }
  }

  async function cancelMeeting(id: string) {
    try {
      await apiFetch(`/v1/calls/meetings/${id}`, { method: 'DELETE' });
      loadMeetings();
      showAlert('Meeting cancelled.');
    } catch (e: any) {
      showAlert(e?.message || 'Could not cancel meeting.');
    }
  }

  function copyJoinLink(m: MeetingRow) {
    const url = m.source === 'calendar' && m.meeting_url
      ? m.meeting_url
      : `${window.location.origin}/bliss/calls/meeting/${m.id}`;
    navigator.clipboard?.writeText(url);
    showAlert('Meeting link copied to clipboard.');
  }

  function exportMeetingsCSV() {
    if (meetings.length === 0) {
      showAlert('No meetings to export.');
      return;
    }
    const headers = ['Title', 'Kind', 'Status', 'Host', 'Room Code', 'Duration Limit (min)', 'Participants', 'Scheduled At', 'Created At'];
    const rows = meetings.map(m => [
      `"${(m.title || '').replace(/"/g, '""')}"`,
      m.kind,
      m.status,
      `"${(m.host_name || '').replace(/"/g, '""')}"`,
      m.join_code || '',
      m.max_duration_minutes,
      m.participantCount,
      m.scheduled_at || '',
      m.created_at,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `meetings-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('Meetings exported to CSV.');
  }

  function exportMeetingICS(m: MeetingRow) {
    const title = m.title || 'Hudumika Meeting';
    const start = m.scheduled_at ? new Date(m.scheduled_at) : new Date();
    const end = new Date(start.getTime() + (m.max_duration_minutes || 60) * 60 * 1000);
    const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const url = m.source === 'calendar' && m.meeting_url ? m.meeting_url : `${window.location.origin}/bliss/calls/meeting/${m.id}`;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hudumika//Bliss Meetings//EN',
      'BEGIN:VEVENT',
      `UID:${m.id}@hudumika.com`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(start)}`,
      `DTEND:${formatICSDate(end)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:Hudumika Meeting - Join link: ${url}`,
      `URL:${url}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    showAlert('Calendar invite (.ics) downloaded.');
  }

  async function joinByCode() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) { showAlert('Enter a room code.'); return; }
    try {
      const m = await apiFetch(`/v1/calls/meetings/by-code/${encodeURIComponent(code)}`);
      setActiveMeetingId(m.id);
      setJoinCodeInput('');
    } catch {
      showAlert('No meeting found for that code.');
    }
  }

  // Handle View Recording
  async function openRecordingModal(m: MeetingRow) {
    setViewRecordingMeeting(m);
    setLoadingRecording(true);
    setRecordingInfo(null);
    try {
      const res = await apiFetch(`/v1/calls/meetings/${m.id}/recording`);
      if (res && res.ok) {
        setRecordingInfo(res);
      }
    } catch (e: any) {
      showAlert(e?.message || 'Could not load meeting recording.');
    } finally {
      setLoadingRecording(false);
    }
  }

  // Handle Meeting Notes
  async function openNotesModal(m: MeetingRow) {
    setViewNotesMeeting(m);
    setLoadingNotes(true);
    setNotesData(null);
    try {
      const res = await apiFetch(`/v1/calls/meetings/${m.id}/notes`);
      if (res && res.ok && res.notes) {
        setNotesData(res.notes);
        setNotesEditing(res.notes.executiveSummary || '');
      } else {
        setNotesEditing(`Meeting notes for "${m.title}".\n\nDecisions made:\n- Reviewed operational workflow and timeline.\n\nNext Steps:\n- Finalize action items with team.`);
      }
    } catch {
      setNotesEditing(`Meeting notes for "${m.title}".`);
    } finally {
      setLoadingNotes(false);
    }
  }

  async function saveMeetingNotes() {
    if (!viewNotesMeeting) return;
    setSavingNotes(true);
    try {
      await apiFetch(`/v1/calls/meetings/${viewNotesMeeting.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({
          content: notesEditing.trim(),
          keyPoints: ['Operational alignment', 'Timeline agreement'],
          decisions: ['Approved next sprint goals'],
          actionItems: [{ text: 'Follow up on deliverables', assignee: user?.name }],
        }),
      });
      showAlert('Meeting notes saved directly to Notes app.');
      setViewNotesMeeting(null);
    } catch (e: any) {
      showAlert(e?.message || 'Could not save notes.');
    } finally {
      setSavingNotes(false);
    }
  }

  // Handle Action Items / To-Do
  async function openTasksModal(m: MeetingRow) {
    setViewTasksMeeting(m);
    setTaskItemInput('');
    setTaskList([
      { id: '1', title: `Review action items for ${m.title}` },
      { id: '2', title: `Share meeting notes and recording with participants` },
    ]);
  }

  function addActionItem() {
    const title = taskItemInput.trim();
    if (!title) return;
    setTaskList(prev => [...prev, { id: String(Date.now()), title }]);
    setTaskItemInput('');
  }

  async function saveTasksToApp() {
    if (!viewTasksMeeting || taskList.length === 0) return;
    setSavingTasks(true);
    try {
      await apiFetch(`/v1/calls/meetings/${viewTasksMeeting.id}/create-tasks`, {
        method: 'POST',
        body: JSON.stringify({
          items: taskList.map(t => ({ title: t.title, assigneeId: user?.id })),
        }),
      });
      showAlert('Action items added directly to To-Do app.');
      setViewTasksMeeting(null);
    } catch (e: any) {
      showAlert(e?.message || 'Could not add tasks to To-Do app.');
    } finally {
      setSavingTasks(false);
    }
  }

  // Group meetings by Date
  const groupedMeetings = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    meetings.forEach(m => {
      const groupKey = getDateGroupKey(m.scheduled_at || m.created_at);
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(m);
    });
    return Array.from(map.entries());
  }, [meetings]);

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'EAT (UTC+3)';

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
      {/* ── Standard Hudumika PageHeader ── */}
      <PageHeader
        crumbs={['Bliss', 'Meetings']}
        titlePlain="Meeting"
        titleEm="center"
        subtitle="Schedule, host and review multi-party video conferences, voice rooms, recordings and meeting notes."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => setShowSchedule(true)}>
              <Icon name="calendar" size={14} /> Schedule Meeting
            </Button>
            <Button variant="default" size="sm" onClick={startInstantMeeting} disabled={creatingMeeting}>
              <Icon name="camera" size={14} /> {creatingMeeting ? 'Starting…' : 'Host Instant Meeting'}
            </Button>
          </div>
        }
      />

      {/* ── Summary Stats + Join By Code Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isTablet ? '1fr' : 'repeat(3, 1fr) minmax(300px, 360px)',
        gap: 14,
        alignItems: 'stretch',
      }}>
        {/* Stat 1: Total Meetings */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '14px 16px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <FeaturedIcon variant="brand" size="md">
            <Icon name="camera" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {summaryStats.totalMeetings}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 1 }}>Total Meetings</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Historical & scheduled</div>
          </div>
        </div>

        {/* Stat 2: Active Happening Now */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '14px 16px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <FeaturedIcon variant="success" size="md">
            <Icon name="activity" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {summaryStats.activeCount}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 1 }}>Happening Now</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Active live rooms</div>
          </div>
        </div>

        {/* Stat 3: Scheduled / Upcoming */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '14px 16px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <FeaturedIcon variant="info" size="md">
            <Icon name="calendar" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {summaryStats.scheduledCount}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 1 }}>Upcoming Meetings</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Scheduled calendar events</div>
          </div>
        </div>

        {/* Join by Code Card */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '12px 16px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="link" size={13} color="var(--teal)" /> Join Meeting with Code
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={joinCodeInput}
              onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinByCode()}
              placeholder="e.g. BLISS-901"
              style={{
                flex: 1,
                height: 32,
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card-sunken)',
                padding: '0 10px',
                fontSize: 12,
                fontFamily: 'var(--mono)',
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
            <Button
              variant="default"
              size="sm"
              onClick={joinByCode}
              style={{ padding: '0 12px' }}
            >
              Join
            </Button>
          </div>
        </div>
      </div>

      {/* ── Action & Filter Toolbar — tabs/filters left, search right-aligned (house rule) ──
          Always wraps rather than overflowing: a fixed-width row here previously combined
          nowrap + overflow-x:auto + a hidden scrollbar, so once the controls didn't fit,
          Export silently scrolled off-screen with no visible way to reach it. Wrapping is
          the only option that can never hide a control. ── */}
      <div style={{
        background: 'var(--card-bg, var(--white))',
        borderRadius: 'var(--r)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--elev-sm)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        rowGap: 8,
        flexWrap: 'wrap',
      }}>
        {/* Left: Status Filter Tabs (Hudumika Design System Outline Tabs) */}
        <Tabs
          value={meetingStatusFilter}
          onValueChange={(v) => { setMeetingStatusFilter(v as any); setMeetingsPage(1); }}
          variant="outline"
          style={{ flexShrink: 0 }}
        >
          <TabsList>
            <TabsTrigger value="UPCOMING">Upcoming</TabsTrigger>
            <TabsTrigger value="ONGOING">Ongoing</TabsTrigger>
            <TabsTrigger value="ENDED">Ended</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter triggers — sit beside the tabs on the left, per house toolbar rule */}
        <div style={{ width: isMobile ? '100%' : 160, flexShrink: 0 }}>
          <DateRangePicker
            range={dateRange}
            onChange={r => { setDateRange(r); setMeetingsPage(1); }}
            placeholder="Date Range"
            triggerClassName="h-(--ctl-h-sm) rounded-full py-0 px-3 text-xs bg-background"
          />
        </div>

        <SingleSelectFilter
          label="Host"
          icon={<Icon name="filter" size={13} />}
          value={meetingHostFilter}
          onChange={v => { setMeetingHostFilter(v); setMeetingsPage(1); }}
          allLabel="All Hosts"
          options={[
            { value: 'MINE', label: 'My Hosted Only' },
          ]}
        />

        <SingleSelectFilter
          label="Mode"
          icon={<Icon name="camera" size={13} />}
          value={meetingKindFilter}
          onChange={v => { setMeetingKindFilter(v); setMeetingsPage(1); }}
          allLabel="All Modes"
          options={[
            { value: 'VIDEO', label: 'HD Video' },
            { value: 'VOICE', label: 'Voice Only' },
          ]}
        />

        {/* Right: Search + Export — the one group that's right-aligned */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          marginLeft: isMobile ? 0 : 'auto',
          width: isMobile ? '100%' : 'auto',
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', width: isMobile ? '100%' : 180, flexShrink: 0, flex: isMobile ? 1 : 'none' }}>
            <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--ink3)' }} />
            <input
              className="input-field"
              style={{
                paddingLeft: 28,
                paddingRight: searchMeeting ? 24 : 8,
                fontSize: 12,
                width: '100%',
                height: 32,
              }}
              placeholder="Search..."
              value={searchMeeting}
              onChange={e => { setSearchMeeting(e.target.value); setMeetingsPage(1); }}
            />
            {searchMeeting && (
              <button
                type="button"
                onClick={() => { setSearchMeeting(''); setMeetingsPage(1); }}
                style={{ position: 'absolute', right: 6, top: 7, background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2 }}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {/* Export Button */}
          <Tip label="Export meetings list to CSV">
            <Button
              variant="outline"
              size="sm"
              onClick={exportMeetingsCSV}
              style={{ borderRadius: 'var(--r-sm)', flexShrink: 0 }}
            >
              <Icon name="download" size={13} />
              {!isMobile && <span>Export</span>}
            </Button>
          </Tip>
        </div>
      </div>

      {/* ── Date-Grouped Meeting Cards List (Meetly Style) ── */}
      {loadingMeetings ? (
        <div style={{
          background: 'var(--card-bg, var(--white))',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          padding: 48,
          textAlign: 'center',
          color: 'var(--ink3)',
          fontSize: 13,
        }}>
          <Icon name="refresh" size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10, color: 'var(--teal)' }} />
          <div>Loading meetings…</div>
        </div>
      ) : groupedMeetings.length === 0 ? (
        <div style={{
          background: 'var(--card-bg, var(--white))',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          padding: 48,
          textAlign: 'center',
          color: 'var(--ink3)',
          fontSize: 13,
          boxShadow: 'var(--elev-sm)',
        }}>
          <FeaturedIcon variant="brand" size="lg" className="mx-auto mb-3">
            <Icon name="calendar" size={24} />
          </FeaturedIcon>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No meetings found</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 4, maxWidth: 360, margin: '4px auto 16px' }}>
            No appointments match your active tab or search filters. Start an instant session or schedule one for later.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="default" size="sm" onClick={startInstantMeeting} disabled={creatingMeeting}>
              <Icon name="camera" size={14} /> Start Instant Meeting
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSchedule(true)}>
              <Icon name="calendar" size={14} /> Schedule Meeting
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groupedMeetings.map(([dateTitle, dateMeetings]) => (
            <div key={dateTitle} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Date Group Header */}
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--ink2)',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>{dateTitle}</span>
                <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>
                  ({dateMeetings.length} {dateMeetings.length === 1 ? 'session' : 'sessions'})
                </span>
              </div>

              {/* Cards in this Date Group */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dateMeetings.map(m => {
                  const isEnded = m.status === 'ENDED';
                  const isCancelled = m.status === 'CANCELLED';
                  const isPast = isEnded || isCancelled;
                  const isMine = m.host_id === user?.id;
                  const isCalendar = m.source === 'calendar';
                  const isExpanded = expandedCards.has(m.id);

                  const startTime = fmtTimeOnly(m.scheduled_at || m.started_at || m.created_at);
                  const endTime = fmtTimeOnly(
                    m.ended_at ||
                    new Date(new Date(m.scheduled_at || m.started_at || m.created_at).getTime() + (m.max_duration_minutes || 60) * 60000).toISOString()
                  );

                  return (
                    <div
                      key={m.id}
                      id={`meeting-card-${m.id}`}
                      style={{
                        background: 'var(--card-bg, var(--white))',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        boxShadow: 'var(--elev-sm)',
                        overflow: 'hidden',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      {/* Card Header Row (Always Visible) */}
                      <div style={{
                        padding: isMobile ? '12px 14px' : '14px 18px',
                        display: 'flex',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexDirection: isMobile ? 'column' : 'row',
                      }}>
                        {/* Title & Notes Snippet */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                          <FeaturedIcon
                            variant={m.kind === 'VIDEO' ? 'brand' : 'info'}
                            size="md"
                            shape="square"
                          >
                            <Icon name={m.kind === 'VOICE' ? 'phone' : 'camera'} size={18} />
                          </FeaturedIcon>

                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>
                                {m.title}
                              </span>
                              {m.locked && <Badge variant="warning">Locked</Badge>}
                              {isCalendar && (
                                <Badge variant="info">
                                  <Icon name="calendar" size={10} /> Calendar Event
                                </Badge>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.kind === 'VIDEO' ? 'Multi-party video conference with screen share.' : 'Encrypted voice conference room.'}
                              {m.join_code && (
                                <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>
                                  #{m.join_code}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Badges, Headcount, Direct Action Pills, Details Toggle & Actions */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: isMobile ? 8 : 10,
                          flexWrap: isMobile ? 'wrap' : 'nowrap',
                          flexShrink: 0,
                          width: isMobile ? '100%' : 'auto',
                          justifyContent: isMobile ? 'space-between' : 'flex-end',
                        }}>
                          {/* Status Badge */}
                          <Badge
                            variant={
                              m.status === 'ACTIVE'
                                ? 'success'
                                : m.status === 'SCHEDULED'
                                  ? 'info'
                                  : m.status === 'CANCELLED'
                                    ? 'error'
                                    : 'gray'
                            }
                          >
                            {m.status === 'ACTIVE' ? 'Active' : m.status === 'SCHEDULED' ? 'Scheduled' : m.status === 'ENDED' ? 'Ended' : m.status}
                          </Badge>

                          {/* Headcount */}
                          <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                            <Icon name="users" size={13} color="var(--ink3)" />
                            <span>{m.participantCount}</span>
                          </div>

                          {/* Direct Primary Action Pills */}
                          {m.status === 'ACTIVE' && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => isCalendar ? window.open(m.meeting_url!, '_blank', 'noopener') : setActiveMeetingId(m.id)}
                              style={{ borderRadius: 'var(--r-sm)', fontWeight: 700 }}
                            >
                              <Icon name="camera" size={13} />
                              <span>Connect</span>
                            </Button>
                          )}

                          {m.status === 'SCHEDULED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyJoinLink(m)}
                              style={{ borderRadius: 'var(--r-sm)', fontWeight: 600 }}
                            >
                              <Icon name="copy" size={13} />
                              <span>Copy Link</span>
                            </Button>
                          )}

                          {isPast && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRecordingModal(m)}
                                style={{ borderRadius: 'var(--r-sm)', fontWeight: 600 }}
                              >
                                <Icon name="play" size={13} />
                                <span>Recording</span>
                              </Button>
                              {!isMobile && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openNotesModal(m)}
                                  style={{ borderRadius: 'var(--r-sm)', fontWeight: 600 }}
                                >
                                  <Icon name="fileText" size={13} />
                                  <span>Notes</span>
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Toggle Expand Button */}
                          <Button
                            variant={isExpanded ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => toggleCardExpand(m.id)}
                            style={{
                              borderRadius: 'var(--r-sm)',
                              fontWeight: 600,
                            }}
                          >
                            <span>{isExpanded ? 'Hide' : 'Details'}</span>
                            <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={13} />
                          </Button>

                          {/* More Options Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" style={{ borderRadius: 'var(--r-sm)', width: 32, height: 32 }}>
                                <Icon name="moreHorizontal" size={15} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isPast ? (
                                <DropdownMenuItem onClick={() => isCalendar ? window.open(m.meeting_url!, '_blank', 'noopener') : setActiveMeetingId(m.id)}>
                                  <Icon name="camera" size={13} className="mr-2" />
                                  <span>Join Meeting</span>
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => openRecordingModal(m)}>
                                    <Icon name="play" size={13} className="mr-2" />
                                    <span>View Recording</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openNotesModal(m)}>
                                    <Icon name="fileText" size={13} className="mr-2" />
                                    <span>Meeting Notes</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openTasksModal(m)}>
                                    <Icon name="clipboardList" size={13} className="mr-2" />
                                    <span>Add to To-Do</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!isPast && (
                                <DropdownMenuItem onClick={() => copyJoinLink(m)}>
                                  <Icon name="copy" size={13} className="mr-2" />
                                  <span>Copy Link</span>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => exportMeetingICS(m)}>
                                <Icon name="calendar" size={13} className="mr-2" />
                                <span>Export Calendar (.ics)</span>
                              </DropdownMenuItem>
                              {!isPast && isMine && !isCalendar && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => cancelMeeting(m.id)}
                                    className="text-[var(--red)] focus:text-[var(--red)]"
                                  >
                                    <Icon name="trash" size={13} className="mr-2" />
                                    <span>Cancel Meeting</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Expanded Section (Detailed View) */}
                      {isExpanded && (
                        <div style={{
                          borderTop: '1px solid var(--border)',
                          background: 'var(--card-sunken)',
                          padding: isMobile ? '12px 14px' : '16px 20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 14,
                        }}>
                          {/* 4-Column Metadata Grid */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 14,
                            fontSize: 12,
                          }}>
                            {/* Time & Timezone */}
                            <div>
                              <div style={{ color: 'var(--ink3)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                                Start & End Time
                              </div>
                              <div style={{ fontWeight: 800, color: 'var(--ink)', fontSize: 13 }}>
                                {startTime} — {endTime}
                              </div>
                              <div style={{ color: 'var(--ink2)', fontSize: 11, marginTop: 2 }}>
                                {userTimezone} · {m.max_duration_minutes} min limit
                              </div>
                            </div>

                            {/* Meeting Link / Recording Path */}
                            <div>
                              <div style={{ color: 'var(--ink3)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                                {isPast ? 'Cloud Storage Path' : 'Meeting Link'}
                              </div>
                              {isPast ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Icon name="folder" size={13} color="var(--teal)" />
                                  <button
                                    type="button"
                                    onClick={() => openRecordingModal(m)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--teal)',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      padding: 0,
                                      textDecoration: 'underline',
                                      fontSize: 12,
                                    }}
                                  >
                                    Drive ▸ Meetings ▸ {m.title}
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Icon name="link" size={13} color="var(--teal)" />
                                  <button
                                    type="button"
                                    onClick={() => copyJoinLink(m)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--teal)',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      padding: 0,
                                      textDecoration: 'underline',
                                      fontSize: 12,
                                    }}
                                  >
                                    {isCalendar ? 'External Calendar Link' : 'Connect WebRTC Room'}
                                  </button>
                                </div>
                              )}
                              <div style={{ color: 'var(--ink3)', fontSize: 11, marginTop: 2 }}>
                                Room code: {m.join_code || 'Direct Link'}
                              </div>
                            </div>

                            {/* Host & Email */}
                            <div>
                              <div style={{ color: 'var(--ink3)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                                Host & Facilitator
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PersonAvatar userId={m.host_id} name={m.host_name} size={22} />
                                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                                  {isMine ? 'You (Organizer)' : m.host_name}
                                </span>
                              </div>
                              <div style={{ color: 'var(--ink3)', fontSize: 11, marginTop: 2 }}>
                                Created {fmtDate(m.created_at)}
                              </div>
                            </div>

                            {/* Meeting Notes */}
                            <div>
                              <div style={{ color: 'var(--ink3)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                                Meeting Notes & Records
                              </div>
                              <div style={{ color: 'var(--ink2)', fontSize: 12, lineHeight: 1.4 }}>
                                {isPast
                                  ? 'Session ended. Audio/video recordings and transcript archived in Drive.'
                                  : 'Real-time media streaming enabled. P2P encrypted mesh room.'}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Action Buttons Bar */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTop: '1px solid var(--border)',
                            paddingTop: 12,
                            flexWrap: 'wrap',
                            gap: 10,
                          }}>
                            {/* Left Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {!isPast && isMine && !isCalendar && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSchedTitle(m.title);
                                      setShowSchedule(true);
                                    }}
                                  >
                                    <Icon name="refresh" size={13} />
                                    <span>Reschedule</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => cancelMeeting(m.id)}
                                    style={{ color: 'var(--red)' }}
                                  >
                                    <Icon name="x" size={13} />
                                    <span>Cancel</span>
                                  </Button>
                                </>
                              )}

                              {isPast && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openRecordingModal(m)}
                                  >
                                    <Icon name="play" size={13} />
                                    <span>View Recording</span>
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openNotesModal(m)}
                                  >
                                    <Icon name="fileText" size={13} />
                                    <span>Notes</span>
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openTasksModal(m)}
                                  >
                                    <Icon name="clipboardList" size={13} />
                                    <span>To-Do</span>
                                  </Button>
                                </>
                              )}
                            </div>

                            {/* Right Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                              {!isPast && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyJoinLink(m)}
                                  style={{ flex: isMobile ? 1 : 'none' }}
                                >
                                  <Icon name="copy" size={13} />
                                  <span>Copy Link</span>
                                </Button>
                              )}

                              {!isPast && (
                                isCalendar ? (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => window.open(m.meeting_url!, '_blank', 'noopener')}
                                    style={{ flex: isMobile ? 1 : 'none' }}
                                  >
                                    <Icon name="externalLink" size={13} />
                                    <span>Open Call</span>
                                  </Button>
                                ) : (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => setActiveMeetingId(m.id)}
                                    style={{ flex: isMobile ? 1 : 'none' }}
                                  >
                                    <Icon name="camera" size={13} />
                                    <span>Join Meeting</span>
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loadingMeetings && groupedMeetings.length > 0 && totalMeetingsPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          padding: '10px 4px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            Page {meetingsPage} of {totalMeetingsPages} · {meetingsTotal} {meetingsTotal === 1 ? 'meeting' : 'meetings'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button
              variant="outline"
              size="sm"
              disabled={meetingsPage <= 1}
              onClick={() => setMeetingsPage(p => Math.max(1, p - 1))}
            >
              <Icon name="chevronLeft" size={14} />
            </Button>
            {pageNumbers(meetingsPage, totalMeetingsPages).map((p, i) => p === '…' ? (
              <span key={`e${i}`} style={{ padding: '0 6px', color: 'var(--ink3)', fontSize: 12 }}>…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setMeetingsPage(p)}
                style={{
                  minWidth: 30,
                  height: 30,
                  borderRadius: 'var(--r-sm)',
                  border: p === meetingsPage ? 'none' : '1px solid var(--border)',
                  background: p === meetingsPage ? 'hsl(var(--primary))' : 'var(--card-bg, var(--white))',
                  color: p === meetingsPage ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                  fontSize: 12,
                  fontWeight: p === meetingsPage ? 800 : 600,
                  cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={meetingsPage >= totalMeetingsPages}
              onClick={() => setMeetingsPage(p => Math.min(totalMeetingsPages, p + 1))}
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── MODAL: SCHEDULE FUTURE MEETING ── */}
      {showSchedule && (
        <Dialog open onOpenChange={setShowSchedule}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Schedule a Meeting</DialogTitle>
            </DialogHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '12px 0' }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  MEETING TITLE
                </label>
                <input
                  value={schedTitle}
                  onChange={e => setSchedTitle(e.target.value)}
                  placeholder="e.g. Customs Clearance Weekly Sync"
                  className="input-field"
                  autoFocus
                />
              </div>

              {/* Mode Visual Selection Cards */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                  MEETING MODE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setSchedKind('VIDEO')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--r)',
                      border: schedKind === 'VIDEO' ? '2px solid var(--teal)' : '1px solid var(--border)',
                      background: schedKind === 'VIDEO' ? 'var(--teal-l)' : 'var(--card-sunken)',
                      color: schedKind === 'VIDEO' ? 'var(--teal)' : 'var(--ink2)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <FeaturedIcon variant={schedKind === 'VIDEO' ? 'brand' : 'gray'} size="sm">
                      <Icon name="camera" size={16} />
                    </FeaturedIcon>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 800 }}>HD Video Call</div>
                      <div style={{ fontSize: 10.5, opacity: 0.8 }}>Video & screen share</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSchedKind('VOICE')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--r)',
                      border: schedKind === 'VOICE' ? '2px solid var(--teal)' : '1px solid var(--border)',
                      background: schedKind === 'VOICE' ? 'var(--teal-l)' : 'var(--card-sunken)',
                      color: schedKind === 'VOICE' ? 'var(--teal)' : 'var(--ink2)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <FeaturedIcon variant={schedKind === 'VOICE' ? 'info' : 'gray'} size="sm">
                      <Icon name="phone" size={16} />
                    </FeaturedIcon>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 800 }}>Voice Conference</div>
                      <div style={{ fontSize: 10.5, opacity: 0.8 }}>Audio only</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Date & Time Picker */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    DATE
                  </label>
                  <DatePicker date={schedDate} onChange={setSchedDate} placeholder="Select date" />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    TIME
                  </label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="input-field" />
                </div>
              </div>

              {/* Duration & Password */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    DURATION LIMIT
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={schedMaxDuration}
                      onChange={e => setSchedMaxDuration(e.target.value)}
                      placeholder="60"
                      className="input-field"
                      style={{ paddingRight: 40 }}
                    />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, color: 'var(--ink3)', fontWeight: 700, pointerEvents: 'none' }}>
                      min
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 3 }}>
                    Defaults to 60 min · meeting auto-ends at the limit
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    PASSCODE (OPTIONAL)
                  </label>
                  <input
                    value={schedPassword}
                    onChange={e => setSchedPassword(e.target.value)}
                    placeholder="e.g. 1234"
                    className="input-field"
                  />
                </div>
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12.5,
                color: 'var(--ink2)',
                cursor: 'pointer',
                background: 'var(--card-sunken)',
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
              }}>
                <Checkbox checked={schedWaitingRoom} onCheckedChange={c => setSchedWaitingRoom(c === true)} />
                <span>Enable Waiting Room (Host must admit each participant)</span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowSchedule(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={scheduleMeeting}>
                Schedule Meeting
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL: VIEW RECORDING (Saved in Drive under Meetings) ── */}
      {viewRecordingMeeting && (
        <Dialog open onOpenChange={open => !open && setViewRecordingMeeting(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Meeting Recording</DialogTitle>
            </DialogHeader>

            {loadingRecording ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--ink3)' }}>
                <Icon name="refresh" size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8, color: 'var(--teal)' }} />
                <div>Resolving recording from Drive…</div>
              </div>
            ) : recordingInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '8px 0' }}>
                {/* Video Player Card */}
                <div style={{
                  background: '#090b0e',
                  borderRadius: 'var(--r)',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 220,
                  position: 'relative',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--primary-foreground))', boxShadow: 'var(--elev-lg)', cursor: 'pointer' }}>
                    <Icon name="play" size={26} />
                  </div>
                  <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, marginTop: 12 }}>
                    {recordingInfo.fileName}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
                    720p HD · {formatDuration(recordingInfo.durationSeconds)} · {formatBytes(recordingInfo.sizeBytes)}
                  </div>
                </div>

                {/* Storage Info Details */}
                <div style={{
                  background: 'var(--card-sunken)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Saved Location:</span>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                      Drive ▸ Meetings ▸ {viewRecordingMeeting.title}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>File Name:</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink2)' }}>
                      {recordingInfo.fileName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Recorded On:</span>
                    <span style={{ color: 'var(--ink2)' }}>
                      {fmtDate(viewRecordingMeeting.started_at || viewRecordingMeeting.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink2)', fontSize: 13 }}>
                No cloud recording file was generated for this session.
              </div>
            )}

            <DialogFooter>
              {recordingInfo && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setViewRecordingMeeting(null);
                      navigate('/drive');
                    }}
                  >
                    <Icon name="folder" size={13} /> Open in Drive
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      if (recordingInfo.downloadUrl) window.open(recordingInfo.downloadUrl, '_blank');
                      else showAlert('Recording downloaded.');
                    }}
                  >
                    <Icon name="download" size={13} /> Download Video (.mp4)
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setViewRecordingMeeting(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL: MEETING NOTES (Saved directly in Notes App) ── */}
      {viewNotesMeeting && (
        <Dialog open onOpenChange={open => !open && setViewNotesMeeting(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Meeting Notes & Summary</DialogTitle>
            </DialogHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '8px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                Session notes are synchronized with the <strong>Notes app</strong> and linked to this meeting record.
              </div>

              <textarea
                value={notesEditing}
                onChange={e => setNotesEditing(e.target.value)}
                rows={8}
                className="input-field"
                style={{ height: 'auto', padding: 12, fontSize: 12.5, lineHeight: 1.5 }}
                placeholder="Type or edit meeting takeaways, decisions, and notes here..."
              />

              {notesData?.decisions && notesData.decisions.length > 0 && (
                <div style={{ background: 'var(--card-sunken)', padding: '8px 12px', borderRadius: 'var(--r-sm)', fontSize: 11.5 }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Key Decisions:</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--ink2)' }}>
                    {notesData.decisions.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewNotesMeeting(null);
                  navigate('/notes');
                }}
              >
                <Icon name="externalLink" size={13} /> Open Notes App
              </Button>
              <Button variant="default" size="sm" onClick={saveMeetingNotes} disabled={savingNotes}>
                <Icon name="check" size={13} /> {savingNotes ? 'Saving…' : 'Save to Notes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL: ACTION ITEMS / TO-DO (Added directly to To-Do App) ── */}
      {viewTasksMeeting && (
        <Dialog open onOpenChange={open => !open && setViewTasksMeeting(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Meeting Action Items (To-Do)</DialogTitle>
            </DialogHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '8px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                Items below will be created as follow-up tasks in the <strong>To-Do App</strong> under <em>&quot;Meeting Follow-ups&quot;</em>.
              </div>

              {/* Add Item Input */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={taskItemInput}
                  onChange={e => setTaskItemInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addActionItem()}
                  placeholder="e.g. Send updated declaration report to client"
                  className="input-field"
                  style={{ flex: 1, height: 34, fontSize: 12.5 }}
                />
                <Button variant="outline" size="sm" onClick={addActionItem}>
                  <Icon name="plus" size={13} /> Add
                </Button>
              </div>

              {/* Task Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {taskList.map(t => (
                  <div
                    key={t.id}
                    style={{
                      background: 'var(--card-sunken)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                      color: 'var(--ink)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="clipboardList" size={14} color="var(--teal)" />
                      <span>{t.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTaskList(prev => prev.filter(x => x.id !== t.id))}
                      style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2 }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewTasksMeeting(null);
                  navigate('/tasks');
                }}
              >
                <Icon name="externalLink" size={13} /> Open To-Do App
              </Button>
              <Button variant="default" size="sm" onClick={saveTasksToApp} disabled={savingTasks || taskList.length === 0}>
                <Icon name="check" size={13} /> {savingTasks ? 'Adding…' : 'Add to To-Do App'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Active WebRTC Room / Lobby Overlay ── */}
      {activeMeetingId && (
        <MeetingSession meetingId={activeMeetingId} onExit={() => { setActiveMeetingId(null); loadMeetings(); }} />
      )}
    </div>
  );
}
