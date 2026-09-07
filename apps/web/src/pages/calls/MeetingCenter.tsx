import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Icon } from '../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Button } from '../../components/ui/button.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Badge } from '../../components/ui/badge.js';
import { DatePicker } from '../../components/ui/date-picker.js';
import { showAlert } from '../../lib/alert.js';
import { MeetingSession } from './MeetingSession.js';

interface MeetingRow {
  id: string;
  title: string;
  join_code: string;
  kind: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  locked: boolean;
  host_id: string;
  host_name: string;
}

/** Scheduled/instant video & voice meetings — split out of Calls.tsx (now
 *  Call Center) since a multi-party meeting room (MeetingSession.tsx /
 *  MeetingRoom.tsx, its own independent WebRTC mesh) has nothing to do with
 *  Call Center's 1:1 direct-call signaling (wsRef/pcRef in that file) beyond
 *  having shared a tab bar. Two different jobs, two pages. */
export function MeetingCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState<Date | undefined>(undefined);
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedKind, setSchedKind] = useState<'VIDEO' | 'VOICE'>('VIDEO');
  const [schedPassword, setSchedPassword] = useState('');
  const [schedWaitingRoom, setSchedWaitingRoom] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const [searchMeeting, setSearchMeeting] = useState('');
  const [meetingStatusFilter, setMeetingStatusFilter] = useState('ALL');
  const [meetingKindFilter, setMeetingKindFilter] = useState('ALL');
  const [meetingsPage, setMeetingsPage] = useState(1);
  const MEETINGS_PAGE_SIZE = 6;

  const loadMeetings = useCallback(async () => {
    try {
      const m = await apiFetch('/v1/calls/meetings');
      if (Array.isArray(m)) setMeetings(m);
    } catch { /* */ }
  }, []);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

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
          waiting_room_enabled: schedWaitingRoom
        })
      });
      setShowSchedule(false);
      setSchedTitle('');
      setSchedDate(undefined);
      setSchedTime('09:00');
      setSchedPassword('');
      setSchedWaitingRoom(false);
      loadMeetings();
    } catch (e: any) {
      showAlert(e?.message || 'Could not schedule meeting.');
    }
  }

  async function cancelMeeting(id: string) {
    try {
      await apiFetch(`/v1/calls/meetings/${id}`, { method: 'DELETE' });
      loadMeetings();
    } catch (e: any) {
      showAlert(e?.message || 'Could not cancel meeting.');
    }
  }

  function copyJoinLink(m: MeetingRow) {
    const url = `${window.location.origin}/bliss/calls/meeting/${m.id}`;
    navigator.clipboard?.writeText(url);
    showAlert('Meeting join link copied to clipboard!');
  }

  async function joinByCode() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    try {
      const m = await apiFetch(`/v1/calls/meetings/by-code/${encodeURIComponent(code)}`);
      setActiveMeetingId(m.id);
      setJoinCodeInput('');
    } catch {
      showAlert('No meeting found for that code.');
    }
  }

  const filteredMeetings = meetings.filter(m => {
    const matchesSearch = m.title.toLowerCase().includes(searchMeeting.toLowerCase()) ||
      m.host_name.toLowerCase().includes(searchMeeting.toLowerCase()) ||
      m.join_code.toLowerCase().includes(searchMeeting.toLowerCase());
    const matchesStatus = meetingStatusFilter === 'ALL' || m.status === meetingStatusFilter;
    const matchesKind = meetingKindFilter === 'ALL' || m.kind === meetingKindFilter;
    return matchesSearch && matchesStatus && matchesKind;
  });

  const totalMeetingsPages = Math.max(1, Math.ceil(filteredMeetings.length / MEETINGS_PAGE_SIZE));
  const paginatedMeetings = filteredMeetings.slice((meetingsPage - 1) * MEETINGS_PAGE_SIZE, meetingsPage * MEETINGS_PAGE_SIZE);

  const activeCount = meetings.filter(m => m.status === 'ACTIVE').length;
  const scheduledCount = meetings.filter(m => m.status === 'SCHEDULED').length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      <PageHeader
        crumbs={['Bliss', 'Meeting Center']}
        titlePlain="Meeting"
        titleEm="Center"
        subtitle="Start or schedule multi-party video and voice meetings, and join by room code."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="default" size="sm" onClick={startInstantMeeting} disabled={creatingMeeting}>
              <Icon name="camera" size={14} /> {creatingMeeting ? 'Starting…' : 'New Instant Meeting'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/calls/reports')}>
              <Icon name="barChart" size={14} /> Call Reports & Analytics
            </Button>
            {/* Same STUN/TURN connectivity settings Call Center links to —
                meetings use the same WebRTC infrastructure. */}
            <Button variant="outline" size="sm" onClick={() => navigate('/bliss/telephony')}>
              <Icon name="settings" size={14} /> Settings
            </Button>
          </div>
        }
      />

      {/* Top Metrics Summary Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--purple-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)' }}>
            <Icon name="camera" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{meetings.length} Meetings</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Scheduled & Active</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
            <Icon name="activity" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{activeCount} Active</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Happening right now</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
            <Icon name="calendar" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{scheduledCount} Scheduled</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Upcoming</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)' }}>
        <Button variant="default" onClick={startInstantMeeting} disabled={creatingMeeting}>
          <Icon name="camera" size={14} /> {creatingMeeting ? 'Starting…' : 'Start Instant Meeting'}
        </Button>
        <Button variant="outline" onClick={() => setShowSchedule(v => !v)}>
          <Icon name="calendar" size={14} /> Schedule Future Meeting
        </Button>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <input
            value={joinCodeInput}
            onChange={e => setJoinCodeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinByCode()}
            placeholder="Enter Meeting Code (e.g. BLISS-901)"
            style={{ height: 34, borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: '0 12px', fontSize: 12.5, width: 220, fontFamily: 'var(--mono)' }}
          />
          <Button variant="default" size="sm" onClick={joinByCode}>Join Room</Button>
        </div>
      </div>

      {showSchedule && (
        <SectionCard title="Schedule a New Video Meeting">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input
                value={schedTitle}
                onChange={e => setSchedTitle(e.target.value)}
                placeholder="Meeting Title (e.g. Port Customs Clearance Alignment)"
                className="input-field"
                style={{ gridColumn: '1 / -1' }}
              />
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>DATE</label>
                <DatePicker date={schedDate} onChange={setSchedDate} placeholder="Select Date" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>TIME</label>
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="input-field" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>MEETING MODE</label>
                <Select value={schedKind} onValueChange={v => setSchedKind(v as 'VIDEO' | 'VOICE')}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIDEO">Video + Screen Share</SelectItem>
                    <SelectItem value="VOICE">Voice Only Conference</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>PASSWORD (OPTIONAL)</label>
                <input value={schedPassword} onChange={e => setSchedPassword(e.target.value)} placeholder="Passcode" className="input-field" />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer' }}>
              <Checkbox checked={schedWaitingRoom} onCheckedChange={c => setSchedWaitingRoom(c === true)} />
              Enable waiting room (host must manually admit each participant)
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="default" size="sm" onClick={scheduleMeeting}>Save Scheduled Meeting</Button>
              <Button variant="outline" size="sm" onClick={() => setShowSchedule(false)}>Cancel</Button>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Active & Scheduled Meetings">
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink3)' }} />
            <input
              className="input-field"
              style={{ paddingLeft: 30, fontSize: 12.5 }}
              placeholder="Search by title, host name or join code..."
              value={searchMeeting}
              onChange={e => { setSearchMeeting(e.target.value); setMeetingsPage(1); }}
            />
          </div>

          <div style={{ width: 140 }}>
            <Select value={meetingStatusFilter} onValueChange={v => { setMeetingStatusFilter(v); setMeetingsPage(1); }}>
              <SelectTrigger className="input-field"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">🟢 Active</SelectItem>
                <SelectItem value="SCHEDULED">🔵 Scheduled</SelectItem>
                <SelectItem value="ENDED">⚪ Ended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div style={{ width: 140 }}>
            <Select value={meetingKindFilter} onValueChange={v => { setMeetingKindFilter(v); setMeetingsPage(1); }}>
              <SelectTrigger className="input-field"><SelectValue placeholder="Kind" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Modes</SelectItem>
                <SelectItem value="VIDEO">Video</SelectItem>
                <SelectItem value="VOICE">Voice</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredMeetings.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No meetings found matching selected filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paginatedMeetings.map(m => {
              const isPast = m.status === 'ENDED' || m.status === 'CANCELLED';
              const isMine = m.host_id === user?.id;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--white)', boxShadow: 'var(--elev)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: m.kind === 'VIDEO' ? 'var(--purple-l)' : 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.kind === 'VIDEO' ? 'var(--purple)' : 'var(--teal)' }}>
                      <Icon name={m.kind === 'VOICE' ? 'phone' : 'camera'} size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.title}
                        {m.locked && <Badge variant="warning">Locked</Badge>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                        Hosted by <strong>{isMine ? 'You' : m.host_name}</strong> • Code: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{m.join_code}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Badge variant={m.status === 'ACTIVE' ? 'success' : m.status === 'SCHEDULED' ? 'info' : 'gray'}>
                      {m.status}
                    </Badge>
                    {!isPast && (
                      <>
                        <Tip label="Copy join link">
                          <Button variant="outline" size="sm" onClick={() => copyJoinLink(m)}>
                            <Icon name="copy" size={13} /> Link
                          </Button>
                        </Tip>
                        {isMine && m.status === 'SCHEDULED' && (
                          <Tip label="Cancel Meeting">
                            <Button variant="ghost" size="sm" onClick={() => cancelMeeting(m.id)}>
                              <Icon name="x" size={13} style={{ color: 'var(--red)' }} />
                            </Button>
                          </Tip>
                        )}
                        <Button variant="default" size="sm" onClick={() => setActiveMeetingId(m.id)}>
                          Join Room
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredMeetings.length > MEETINGS_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)' }}>
            <div>
              Showing {Math.min(filteredMeetings.length, (meetingsPage - 1) * MEETINGS_PAGE_SIZE + 1)} to {Math.min(filteredMeetings.length, meetingsPage * MEETINGS_PAGE_SIZE)} of {filteredMeetings.length} meetings
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Button variant="outline" size="sm" disabled={meetingsPage <= 1} onClick={() => setMeetingsPage(p => Math.max(1, p - 1))}>
                <Icon name="chevronLeft" size={14} /> Prev
              </Button>
              <span style={{ padding: '0 8px', fontWeight: 600, color: 'var(--ink)' }}>Page {meetingsPage} of {totalMeetingsPages}</span>
              <Button variant="outline" size="sm" disabled={meetingsPage >= totalMeetingsPages} onClick={() => setMeetingsPage(p => Math.min(totalMeetingsPages, p + 1))}>
                Next <Icon name="chevronRight" size={14} />
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {activeMeetingId && (
        <MeetingSession meetingId={activeMeetingId} onExit={() => { setActiveMeetingId(null); loadMeetings(); }} />
      )}
    </div>
  );
}
