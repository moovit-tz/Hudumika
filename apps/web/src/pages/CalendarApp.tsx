import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import {
  useEvents, addEvent, updateEvent, deleteEvent, CalendarEvent, CalendarGuest, RecurrenceRule, MeetingSettings, GuestPermissions,
  useTodos, updateTodo, Todo,
  useAppSettings, updateAppSettings,
  useCurrentCalendarDate, setCurrentCalendarDate,
  exportCalendarICS, importCalendarICS,
  useMeetWithPeople, fetchFreeBusy, BusyBlock, MEET_WITH_COLORS,
  fetchBookingPages, createBookingPage, updateBookingPage as updateBookingPageApi, deleteBookingPage as deleteBookingPageApi,
  BookingPage, BookingPageInput,
  fetchCalendarSyncConnections, getCalendarSyncAuthorizeUrl, disconnectCalendarSync, CalendarSyncConnection,
  fetchCalendarSyncCredentials, saveCalendarSyncCredentials,
} from '../data/calendarStore.js';
import { useAuth } from '../hooks/useAuth.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { Switch } from '../components/ui/switch.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';
import { fetchPeople, type Person } from '../lib/identity.js';
import './CalendarApp.css';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

const TODAY = new Date();
const isToday = (d: Date) =>
  d.getDate() === TODAY.getDate() &&
  d.getMonth() === TODAY.getMonth() &&
  d.getFullYear() === TODAY.getFullYear();

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// 'holiday' events are synthetic, server-merged rows from the tenant's own
// working calendar (hr_holidays via calendar-events.service.ts's listEvents)
// — they used to be fetched correctly but were invisible: activeCategories'
// default state (below) never had a 'holiday' key, so
// filteredEvents.filter(e => activeCategories[e.category]) silently
// excluded every one of them. Real, verified bug, not a hypothetical.
const CATEGORY_MAP = {
  work:     { color: '#1a73e8', label: 'Work Sync' },
  personal: { color: '#0f9d58', label: 'Client / Social' },
  customs:  { color: '#ea580c', label: 'Customs Deadline' },
  todo:     { color: 'var(--purple)', label: 'Scheduled Todo' },
  holiday:  { color: '#16a34a', label: 'Holidays' },
} as const;

type Category = keyof typeof CATEGORY_MAP;

const EVENT_COLOR_OPTIONS = [
  { id: null, label: 'Category color', hex: null },
  { id: 'tomato', label: 'Tomato', hex: '#dc2626' },
  { id: 'flamingo', label: 'Flamingo', hex: '#ea580c' },
  { id: 'banana', label: 'Banana', hex: '#d97706' },
  { id: 'sage', label: 'Sage', hex: '#16a34a' },
  { id: 'peacock', label: 'Peacock', hex: '#0891b2' },
  { id: 'blueberry', label: 'Blueberry', hex: '#2563eb' },
  { id: 'grape', label: 'Grape', hex: '#7c3aed' },
] as const;

const REMINDER_OFFSET_OPTIONS = [
  { minutes: 0, label: 'At time of event' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 10080, label: '1 week before' },
];

/** A real, joinable Jitsi Meet room (meet.jit.si — free, open-source, no
 *  API key needed) instead of the old mockup's fake https://meet.hudumika.tz
 *  string, which pointed nowhere. crypto.randomUUID() (already this
 *  codebase's own convention for client-generated row ids — see
 *  calendarStore.ts's own comment) rather than Math.random().toString(36),
 *  which is both weak (an 8-char slug is brute-forceable) and not what a
 *  server-verified room id should ever be built from. */
function newMeetingUrl(): string {
  return `https://meet.jit.si/Hudumika-${crypto.randomUUID()}`;
}

/** Jitsi reads join-time preferences from its own documented URL hash
 *  config (https://meet.jit.si/RoomName#config.startWithVideoMuted=true) —
 *  real, stable behaviour, not a fabricated setting. Applied at join time
 *  rather than baked into the stored meetingUrl so the shareable room link
 *  itself stays a clean, stable identifier. */
function buildJoinUrl(meetingUrl: string, settings: MeetingSettings): string {
  const params: string[] = [];
  if (settings.startWithVideoMuted) params.push('config.startWithVideoMuted=true');
  if (settings.startWithAudioMuted) params.push('config.startWithAudioMuted=true');
  return params.length ? `${meetingUrl}#${params.join('&')}` : meetingUrl;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const formatISO = (d: Date) => d.toISOString().split('T')[0];

/** An event's own color (Google-style per-event override) if set, else
 *  falls back to its category's color. */
function resolveEventColor(ev: { category: string; color?: string | null }): string {
  if (ev.color) {
    const custom = EVENT_COLOR_OPTIONS.find(c => c.id === ev.color)?.hex;
    if (custom) return custom;
  }
  return (CATEGORY_MAP as Record<string, { color: string }>)[ev.category]?.color ?? 'var(--purple)';
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM – 8 PM
const HOUR_ROW_PX = 80;

export const CalendarApp: React.FC = () => {
  const allEvents = useEvents();
  const allTodos = useTodos();
  const appSettings = useAppSettings();
  const meetWithPeople = useMeetWithPeople();
  const [meetWithBusy, setMeetWithBusy] = useState<Record<string, BusyBlock[]>>({});

  // Real-time clock for Google Calendar red indicator line
  const [nowDate, setNowDate] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Listen for sidebar "+ Create" button event
  useEffect(() => {
    function handleOpenCreate(e: Event) {
      const detail = (e as CustomEvent).detail;
      openCreate(detail?.dateStr, detail?.hourStr);
    }
    window.addEventListener('calendar:open-create', handleOpenCreate);
    return () => window.removeEventListener('calendar:open-create', handleOpenCreate);
  }, []);

  // Shared with CalendarShell's sidebar mini month-picker (calendarStore.ts)
  // — either one navigating moves both in step.
  const currentDate = useCurrentCalendarDate();
  const setCurrentDate = setCurrentCalendarDate;
  const viewMode = appSettings.calendarDefaultView;
  function setViewMode(mode: ViewMode) { updateAppSettings({ calendarDefaultView: mode }); }

  const [activeCategories, setActiveCategories] = useState<Record<string, boolean>>({
    work: true, personal: true, customs: true, todo: true, holiday: true,
  });
  const [searchQuery, setSearchQuery] = useState('');

  const [popover, setPopover] = useState<{ event: CalendarEvent; x: number; y: number } | null>(null);

  // ── Extended Google Calendar Modal State ─────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventTitle, setEventTitle]     = useState('');
  const [eventStart, setEventStart]     = useState('');
  const [eventEnd, setEventEnd]         = useState('');
  const [eventCategory, setEventCategory] = useState<Category>('work');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation]       = useState('');
  const [eventGuests, setEventGuests]           = useState<CalendarGuest[]>([]);
  const [eventAllDay, setEventAllDay]           = useState(false);
  const [eventColorChoice, setEventColorChoice] = useState<string | null>(null);
  const [eventRecurrence, setEventRecurrence]   = useState<RecurrenceRule | null>(null);
  const [eventReminderOffsets, setEventReminderOffsets] = useState<number[]>([]);
  const [draggingEventId, setDraggingEventId]   = useState<string | null>(null);

  // Google Calendar extra options
  const [eventTimezone, setEventTimezone] = useState('GMT+03:00 (East Africa Time)');
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [eventMeetingUrl, setEventMeetingUrl] = useState('');
  const [showMeetingOptionsModal, setShowMeetingOptionsModal] = useState(false);
  const [eventMeetingSettings, setEventMeetingSettings] = useState<MeetingSettings>({});
  const [eventGuestPermissions, setEventGuestPermissions] = useState<GuestPermissions>({
    modifyEvent: false, inviteOthers: true, seeGuestList: true
  });
  const [eventVisibility, setEventVisibility] = useState<'default' | 'public' | 'private'>('default');
  const [eventBusyStatus, setEventBusyStatus] = useState<'busy' | 'free'>('busy');

  const [icsImporting, setIcsImporting]         = useState(false);
  const icsFileInputRef = useRef<HTMLInputElement>(null);
  const [bookingPagesOpen, setBookingPagesOpen] = useState(false);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);

  // Landed back here from calendar-sync.routes.ts's OAuth callback
  // (?calendarSync=success|error&provider=...&msg=...) — surface the
  // result and reopen the panel the connect button was clicked from,
  // rather than leaving the query string sitting in the address bar.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const result = qs.get('calendarSync');
    if (!result) return;
    const provider = qs.get('provider') === 'outlook' ? 'Outlook' : 'Google';
    if (result === 'success') showAlert(`${provider} Calendar connected — your events will start syncing in.`, { variant: 'success' });
    else showAlert(qs.get('msg') || `Couldn't connect ${provider} Calendar.`);
    setCalendarSyncOpen(true);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const [dragCreate, setDragCreate] = useState<{ dateStr: string; startHour: number; endHour: number } | null>(null);
  const dragCreateActive = useRef(false);
  const [resizeState, setResizeState] = useState<{ id: string; occurrenceDate: string; isRecurring: boolean; origEndMs: number; previewEndMs: number } | null>(null);
  const [editScope, setEditScope] = useState<'all' | 'this'>('all');

  function addGuest(person: Person) {
    setEventGuests(g => g.some(x => x.userId === person.id) ? g : [...g, { userId: person.id, email: person.email || '', name: person.name, status: 'pending' }]);
  }
  function removeGuest(userId: string | null, email: string) {
    setEventGuests(gs => gs.filter(x => (userId ? x.userId !== userId : x.email !== email)));
  }

  const filteredEvents = allEvents.filter(e => {
    if (!activeCategories[e.category]) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return e.title.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ── Navigation ───────────────────────────────────────────────
  function handlePrev() {
    if (viewMode === 'month') setCurrentDate(new Date(year, month - 1, 1));
    else if (viewMode === 'week') setCurrentDate(new Date(currentDate.getTime() - 7 * 86400000));
    else setCurrentDate(new Date(currentDate.getTime() - 86400000));
  }
  function handleNext() {
    if (viewMode === 'month') setCurrentDate(new Date(year, month + 1, 1));
    else if (viewMode === 'week') setCurrentDate(new Date(currentDate.getTime() + 7 * 86400000));
    else setCurrentDate(new Date(currentDate.getTime() + 86400000));
  }
  function handleToday() { setCurrentDate(new Date()); }

  // ── Drag & Drop Handlers ─────────────────────────────────────
  function handleDragStart(e: React.DragEvent, todo: Todo) {
    e.dataTransfer.setData('todoId', todo.id);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleEventDragStart(e: React.DragEvent, ev: CalendarEvent) {
    // Holidays are synthetic rows merged in from hr_holidays, not a real
    // calendar_events row — dragging one to "reschedule" would try to PATCH
    // an id that table doesn't have.
    if (ev.category === 'holiday') { e.preventDefault(); return; }
    e.stopPropagation();
    e.dataTransfer.setData('eventId', ev.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingEventId(ev.id);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingEventId ? 'move' : 'copy';
  }

  function handleDrop(e: React.DragEvent, dateStr: string, hourStr?: string) {
    e.preventDefault();
    setDraggingEventId(null);

    const droppedEventId = e.dataTransfer.getData('eventId');
    if (droppedEventId) {
      // Reschedule an existing event to the new day/time, keeping its
      // original duration — only its start/end shift, nothing else.
      const ev = allEvents.find(x => x.id === droppedEventId);
      if (!ev) return;
      const durationMs = new Date(ev.end).getTime() - new Date(ev.start).getTime();
      const hh = hourStr || ev.start.slice(11, 16);
      const newStart = `${dateStr}T${hh}`;
      const newEnd = new Date(new Date(newStart).getTime() + durationMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      const newEndStr = `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`;
      // Dragging one occurrence of a recurring event reschedules just that
      // occurrence (a server-side override), never the whole series — the
      // same "drag one instance" behaviour Google Calendar has.
      updateEvent(ev.id, { start: newStart, end: newEndStr }, ev.isRecurring ? { scope: 'this', occurrenceDate: ev.occurrenceDate } : undefined);
      return;
    }

    const todoId = e.dataTransfer.getData('todoId');
    if (!todoId) return;

    const todo = allTodos.find(t => t.id === todoId);
    if (!todo) return;

    const hh = hourStr || '09:00';
    const [h, m] = hh.split(':').map(Number);
    const endH = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    addEvent({
      title: todo.title,
      start: `${dateStr}T${hh}`,
      end: `${dateStr}T${endH}`,
      allDay: !hourStr,
      guests: [],
      reminderOffsets: [10],
      category: 'todo',
      description: 'Imported from Todos',
    });

    // Optionally mark the dragged Todo as scheduled/completed
    updateTodo(todoId, { completed: true });
  }

  // ── Drag-to-create (week/day view) ────────────────────────────
  function beginDragCreate(dateStr: string, hour: number) {
    dragCreateActive.current = true;
    setDragCreate({ dateStr, startHour: hour, endHour: hour });
  }
  function extendDragCreate(dateStr: string, hour: number) {
    if (!dragCreateActive.current) return;
    setDragCreate(s => (s && s.dateStr === dateStr) ? { ...s, endHour: hour } : s);
  }
  useEffect(() => {
    function onUp() {
      if (!dragCreateActive.current) return;
      dragCreateActive.current = false;
      setDragCreate(s => {
        if (s) {
          const lo = Math.min(s.startHour, s.endHour);
          const hi = Math.max(s.startHour, s.endHour);
          openCreate(s.dateStr, `${String(lo).padStart(2, '0')}:00`, `${String(hi + 1).padStart(2, '0')}:00`);
        }
        return null;
      });
    }
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag-to-resize an existing event's duration (week/day view) ──
  function startEventResize(e: React.MouseEvent, ev: CalendarEvent) {
    if (ev.category === 'holiday') return; // synthetic row — nothing to resize
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const origEndMs = new Date(ev.end).getTime();
    const minEndMs = new Date(ev.start).getTime() + 15 * 60000;
    setResizeState({ id: ev.id, occurrenceDate: ev.occurrenceDate, isRecurring: ev.isRecurring, origEndMs, previewEndMs: origEndMs });

    const onMove = (moveEv: MouseEvent) => {
      const deltaY = moveEv.clientY - startY;
      const deltaMs = Math.round(deltaY / HOUR_ROW_PX * 4) * 15 * 60000; // snap to 15-minute increments
      const newEndMs = Math.max(minEndMs, origEndMs + deltaMs);
      setResizeState(s => (s && s.id === ev.id && s.occurrenceDate === ev.occurrenceDate) ? { ...s, previewEndMs: newEndMs } : s);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setResizeState(s => {
        if (s && s.previewEndMs !== s.origEndMs) {
          const d = new Date(s.previewEndMs);
          const pad = (n: number) => String(n).padStart(2, '0');
          const newEndStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          updateEvent(s.id, { end: newEndStr }, s.isRecurring ? { scope: 'this', occurrenceDate: s.occurrenceDate } : undefined);
        }
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Modal helpers ────────────────────────────────────────────
  function openCreate(dateStr?: string, hourStr?: string, endHourStr?: string) {
    const hh   = hourStr || '09:00';
    const base = dateStr || formatISO(new Date());
    const [h, m] = hh.split(':').map(Number);
    const endH   = endHourStr ?? `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setEditingEvent(null);
    setEventTitle(''); setEventDescription(''); setEventLocation('');
    setEventCategory('work');
    setEventGuests([]);
    setEventAllDay(false); setEventColorChoice(null); setEventRecurrence(null); setEventReminderOffsets([]);
    setEventTimezone('GMT+03:00 (East Africa Time)');
    setEventMeetingUrl('');
    setEventMeetingSettings({});
    setEventGuestPermissions({ modifyEvent: false, inviteOthers: true, seeGuestList: true });
    setEventVisibility('default');
    setEventBusyStatus('busy');
    setEditScope('all');
    setEventStart(`${base}T${hh}`);
    setEventEnd(`${base}T${endH}`);
    setShowModal(true);
  }

  function openPopover(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ event: ev, x: rect.right + 10, y: rect.top });
  }

  function openEdit(ev: CalendarEvent) {
    setPopover(null);
    setEditingEvent(ev);
    setEventTitle(ev.title);
    setEventStart(ev.start);
    setEventEnd(ev.end);
    setEventCategory(ev.category as Category);
    setEventDescription(ev.description || '');
    setEventLocation(ev.location || '');
    setEventGuests(ev.guests || []);
    setEventAllDay(ev.allDay); setEventColorChoice(ev.color ?? null); setEventRecurrence(ev.recurrence ?? null);
    setEventReminderOffsets(ev.reminderOffsets || []);
    setEventTimezone(ev.timezone || 'GMT+03:00 (East Africa Time)');
    setEventMeetingUrl(ev.meetingUrl || '');
    setEventMeetingSettings(ev.meetingSettings || {});
    setEventGuestPermissions(ev.guestPermissions || { modifyEvent: false, inviteOthers: true, seeGuestList: true });
    setEventVisibility(ev.visibility || 'default');
    setEventBusyStatus(ev.busyStatus || 'busy');
    setEditScope('all');
    setShowModal(true);
  }

  function handleSave() {
    if (!eventTitle.trim() || !eventStart || !eventEnd) return;
    const payload = {
      title: eventTitle.trim(), start: eventStart, end: eventEnd,
      category: eventCategory,
      description: eventDescription.trim() || undefined,
      location:    eventLocation.trim()    || undefined,
      guests:      eventGuests,
      allDay: eventAllDay, color: eventColorChoice, recurrence: eventRecurrence, reminderOffsets: eventReminderOffsets,
      timezone: eventTimezone,
      meetingUrl: eventMeetingUrl || null,
      meetingSettings: eventMeetingSettings,
      guestPermissions: eventGuestPermissions,
      visibility: eventVisibility,
      busyStatus: eventBusyStatus,
    };
    if (editingEvent) {
      updateEvent(editingEvent.id, payload, editingEvent.isRecurring ? { scope: editScope, occurrenceDate: editingEvent.occurrenceDate } : undefined);
    } else {
      addEvent(payload);
    }
    setShowModal(false);
  }

  function handleDelete() {
    if (!editingEvent) return;
    deleteEvent(editingEvent.id, editingEvent.isRecurring ? { scope: editScope, occurrenceDate: editingEvent.occurrenceDate } : undefined);
    setShowModal(false);
  }

  async function handleExportICS() {
    try {
      await exportCalendarICS();
    } catch (err: any) {
      showAlert(err?.message || 'Could not export the calendar. Try again.', { variant: 'error' });
    }
  }

  async function handleImportICSFile(file: File) {
    setIcsImporting(true);
    try {
      const result = await importCalendarICS(file);
      showAlert(`Imported ${result.imported} event${result.imported === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} skipped — missing title or dates)` : ''}.`);
    } catch (err: any) {
      showAlert(err?.message || 'Could not import that file. Make sure it\'s a valid .ics calendar file.', { variant: 'error' });
    } finally {
      setIcsImporting(false);
    }
  }

  // ── Month grid ───────────────────────────────────────────────
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const monthGrid: (Date | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) monthGrid.push(null);
  for (let d = 1; d <= daysInMonth; d++)  monthGrid.push(new Date(year, month, d));
  while (monthGrid.length % 7 !== 0)       monthGrid.push(null);

  // ── Week days ─────────────────────────────────────────────────
  const weekStartOffset = appSettings.weekStartsMonday ? (currentDate.getDay() + 6) % 7 : currentDate.getDay();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - weekStartOffset);
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  // ── "Meet with…" busy overlay — only meaningful on the hour-level
  // week/day grid (month/agenda have no time-of-day axis to paint it on).
  // Re-fetches whenever the selected people or the visible range changes.
  useEffect(() => {
    if (meetWithPeople.length === 0 || (viewMode !== 'week' && viewMode !== 'day')) { setMeetWithBusy({}); return; }
    const rangeStart = viewMode === 'day' ? currentDate : weekDays[0];
    const rangeEndDay = viewMode === 'day' ? currentDate : weekDays[6];
    const from = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const to = new Date(rangeEndDay.getFullYear(), rangeEndDay.getMonth(), rangeEndDay.getDate() + 1);
    let alive = true;
    fetchFreeBusy(meetWithPeople.map(p => p.userId), { from, to }).then(data => { if (alive) setMeetWithBusy(data); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetWithPeople, viewMode, currentDate.toDateString()]);

  // ── Toolbar label ─────────────────────────────────────────────
  let label = '';
  if (viewMode === 'month')  label = `${MONTH_NAMES[month]} ${year}`;
  else if (viewMode === 'week') label = `${MONTH_NAMES[startOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`;
  else if (viewMode === 'day')  label = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  else label = 'Agenda';

  const isMobile = useIsMobile();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* ── Top Toolbar (Device Responsive & Google Calendar Styled) ─────────────────────────────────────── */}
      <div className="cal-topbar-root">
        {/* Left Section: Today, Prev/Next, Month/Year label */}
        <div className="cal-topbar-left">
          <button onClick={handleToday} className="cal-topbar-today-btn">
            Today
          </button>

          <div className="cal-topbar-nav-group">
            <button onClick={handlePrev} title="Previous" className="cal-topbar-nav-btn">
              <Icon name="chevronLeft" size={18} />
            </button>

            <button onClick={handleNext} title="Next" className="cal-topbar-nav-btn">
              <Icon name="chevronRight" size={18} />
            </button>
          </div>

          <span className="cal-topbar-title">
            {label}
          </span>
        </div>

        {/* Middle Section: Responsive Search & Category Filter Chips */}
        <div className="cal-topbar-center">
          <div className="cal-topbar-search-box">
            <Icon name="search" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="cal-topbar-search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events"
            />
          </div>


        </div>

        {/* Right Section: Google Calendar Exact Top Layer Controls (Image 3) */}
        <div className="cal-topbar-right">
          {/* 1. Help & Support */}
          <button
            type="button"
            className="cal-topbar-nav-btn"
            title="Support & Keyboard Shortcuts"
            onClick={() => showAlert('Google Calendar Help & Shortcuts: Press D (Day), W (Week), M (Month), A (Schedule)')}
          >
            <Icon name="helpCircle" size={18} />
          </button>

          {/* 2. Calendar Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cal-topbar-nav-btn"
                title="Calendar settings"
              >
                <Icon name="settings" size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-3 w-64">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Week starts Monday</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Applies to the week view</div>
                </div>
                <Switch checked={appSettings.weekStartsMonday} onCheckedChange={v => updateAppSettings({ weekStartsMonday: v })} />
              </div>
              <button
                type="button"
                onClick={handleExportICS}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 6px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Icon name="download" size={15} color="var(--ink3)" /> Export calendar (.ics)
              </button>
              <button
                type="button"
                onClick={() => icsFileInputRef.current?.click()}
                disabled={icsImporting}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 6px', border: 'none', background: 'none', cursor: icsImporting ? 'default' : 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--ink)', fontWeight: 500, opacity: icsImporting ? 0.6 : 1 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Icon name="upload" size={15} color="var(--ink3)" /> {icsImporting ? 'Importing…' : 'Import calendar (.ics)'}
              </button>
              <DropdownMenuItem asChild onSelect={() => setBookingPagesOpen(true)}>
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 6px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Icon name="link" size={15} color="var(--ink3)" /> Booking pages…
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={() => setCalendarSyncOpen(true)}>
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 6px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Icon name="globe" size={15} color="var(--ink3)" /> Google/Outlook sync…
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 3. Google Calendar Top-Down Dropdown View Switcher (Image 3) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cal-topbar-view-dropdown-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)',
                  fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
              >
                <span>{viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}</span>
                <Icon name="chevronDown" size={14} color="var(--ink3)" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1">
              <DropdownMenuItem onClick={() => setViewMode('day')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Day</span> <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>D</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('week')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Week</span> <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>W</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('month')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Month</span> <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>M</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('agenda')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Schedule / Agenda</span> <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>A</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 4. Dual View Switcher Pill: Calendar vs Tasks (Image 3) */}
          <div className="ds-tabs-list" data-variant="segmented">
            <button
              type="button"
              className="ds-tabs-trigger"
              data-variant="segmented"
              data-state={viewMode !== 'agenda' ? 'active' : 'inactive'}
              onClick={() => setViewMode('month')}
              title="Calendar View"
            >
              <Icon name="calendar" size={16} />
            </button>
            <button
              type="button"
              className="ds-tabs-trigger"
              data-variant="segmented"
              data-state={viewMode === 'agenda' ? 'active' : 'inactive'}
              onClick={() => setViewMode('agenda')}
              title="Tasks & Schedule View"
            >
              <Icon name="tasks" size={16} />
            </button>
          </div>



          <input
            ref={icsFileInputRef}
            type="file"
            accept=".ics,text/calendar"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleImportICSFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ── Main Calendar Area ───────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* ── MONTH VIEW ── */}
          {viewMode === 'month' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                  <div key={i} style={{ padding: '12px 4px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ink3)' }}>{d}</div>
                ))}
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr', background: 'var(--border)', gap: 1, overflow: 'auto' }}>
                {monthGrid.map((d, i) => {
                  if (!d) return <div key={i} style={{ background: 'var(--bg)' }} />;
                  const dateStr    = formatISO(d);
                  // Spans every day between start and end (inclusive), not
                  // just its start date — an all-day/multi-day event used
                  // to only ever render on the one day it started.
                  const cellEvents = filteredEvents.filter(e => e.start.slice(0, 10) <= dateStr && e.end.slice(0, 10) >= dateStr);
                  const isTod      = isToday(d);
                  return (
                    <div
                      key={i}
                      onDragOver={handleDragOver}
                      onDrop={e => handleDrop(e, dateStr)}
                      onClick={() => openCreate(dateStr)}
                      style={{ background: 'var(--white)', padding: '6px', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', minHeight: 100 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}
                    >
                      <span style={{
                        alignSelf: 'flex-start', fontSize: 13, fontWeight: isTod ? 700 : 500,
                        width: 26, height: 26, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isTod ? '#fff' : 'var(--ink)',
                        background: isTod ? 'var(--teal)' : 'transparent',
                      }}>
                        {d.getDate()}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                        {cellEvents.map(ev => (
                          <div
                            key={ev.id + ev.occurrenceDate}
                            draggable
                            onDragStart={e => handleEventDragStart(e, ev)}
                            onDragEnd={() => setDraggingEventId(null)}
                            onClick={e => openPopover(ev, e)}
                            title="Drag to reschedule"
                            style={{
                              fontSize: 12, fontWeight: 500, color: '#fff',
                              background: resolveEventColor(ev), padding: '4px 8px', borderRadius: 6,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              cursor: 'grab', opacity: draggingEventId === ev.id ? 0.4 : 1,
                            }}
                          >
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── WEEK VIEW ── */}
          {viewMode === 'week' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 1 }}>
                <div />
                {weekDays.map((wd, i) => {
                  const isTod = isToday(wd);
                  return (
                    <div key={i} style={{ padding: '12px 4px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                        {wd.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div style={{
                        fontSize: 24, fontWeight: 500, width: 44, height: 44, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 0',
                        background: isTod ? 'var(--teal)' : 'transparent',
                        color: isTod ? '#fff' : 'var(--ink)',
                      }}>
                        {wd.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All-day / multi-day row — Google Calendar puts these above
                  the hour grid rather than inside it (they have no real
                  time-of-day to place on the hour axis). */}
              {(() => {
                const weekAllDay = filteredEvents.filter(e => e.allDay);
                if (weekAllDay.length === 0) return null;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '4px 0' }}>
                    <div />
                    {weekDays.map((wd, i) => {
                      const dateStr = formatISO(wd);
                      const dayEvents = weekAllDay.filter(e => e.start.slice(0, 10) <= dateStr && e.end.slice(0, 10) >= dateStr);
                      return (
                        <div key={i} style={{ borderLeft: '1px solid var(--border2)', padding: '2px 3px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {dayEvents.map(ev => (
                            <div
                              key={ev.id + ev.occurrenceDate}
                              onClick={e => openPopover(ev, e)}
                              style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: resolveEventColor(ev), borderRadius: 4, padding: '2px 6px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {ev.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div style={{ position: 'relative', flex: 1 }}>
                {HOURS.map(hour => {
                  const displayHour = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                  return (
                    <div key={hour} style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', height: 80, borderBottom: '1px solid var(--border2)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'right', paddingRight: 10, paddingTop: 6, userSelect: 'none' }}>
                        {displayHour}
                      </div>
                      {weekDays.map((wd, i) => {
                        const cellDateStr = formatISO(wd);
                        const inDragRange = dragCreate?.dateStr === cellDateStr && hour >= Math.min(dragCreate.startHour, dragCreate.endHour) && hour <= Math.max(dragCreate.startHour, dragCreate.endHour);
                        return (
                          <div
                            key={i}
                            onDragOver={handleDragOver}
                            onDrop={e => handleDrop(e, cellDateStr, `${String(hour).padStart(2,'0')}:00`)}
                            onMouseDown={() => beginDragCreate(cellDateStr, hour)}
                            onMouseEnter={e => { extendDragCreate(cellDateStr, hour); if (!inDragRange) e.currentTarget.style.background = 'var(--bg)'; }}
                            onMouseLeave={e => { if (!inDragRange) e.currentTarget.style.background = 'none'; }}
                            style={{ borderLeft: '1px solid var(--border2)', cursor: 'pointer', position: 'relative', background: inDragRange ? 'var(--teal-l, rgba(13,148,136,0.12))' : undefined }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
                {/* Google Calendar red current-time indicator line */}
                {(() => {
                  const nowH = nowDate.getHours() + nowDate.getMinutes() / 60;
                  if (nowH < 8 || nowH > 20) return null;
                  const todayISO = formatISO(nowDate);
                  const dayIdx = weekDays.findIndex(wd => formatISO(wd) === todayISO);
                  if (dayIdx === -1) return null;
                  const top = (nowH - 8) * HOUR_ROW_PX;
                  const left = `calc(60px + ${dayIdx} * ((100% - 60px) / 7))`;
                  const width = `calc((100% - 60px) / 7)`;
                  return (
                    <div style={{ position: 'absolute', top, left, width, height: 2, background: '#ea4335', zIndex: 15, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ea4335', marginLeft: -4 }} />
                    </div>
                  );
                })()}

                {/* "Meet with…" busy overlay — thin per-person strips along
                    the left edge of each day column, underneath the real
                    event blocks. Colors match the sidebar panel's dots
                    (calendarStore.ts's MEET_WITH_COLORS, indexed the same). */}
                {meetWithPeople.map((p, pi) => (meetWithBusy[p.userId] ?? []).map((b, bi) => {
                  const bStart = new Date(b.start);
                  const bEnd = new Date(b.end);
                  const dayIdx = weekDays.findIndex(wd => formatISO(wd) === formatISO(bStart));
                  if (dayIdx === -1) return null;
                  const startH = bStart.getHours() + bStart.getMinutes() / 60;
                  const endH = bEnd.getHours() + bEnd.getMinutes() / 60;
                  if (startH > 20 || endH < 8) return null;
                  const top = (Math.max(8, startH) - 8) * HOUR_ROW_PX;
                  const height = Math.max(4, (Math.min(20, endH) - Math.max(8, startH)) * HOUR_ROW_PX);
                  const left = `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 2px + ${pi * 6}px)`;
                  return (
                    <div
                      key={`busy-${p.userId}-${bi}`}
                      title={`${p.name} is busy ${bStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${bEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                      style={{ position: 'absolute', top, left, width: 5, height, background: MEET_WITH_COLORS[pi % MEET_WITH_COLORS.length], borderRadius: 2, zIndex: 5, opacity: 0.85 }}
                    />
                  );
                }))}
                {/* Events overlay — all-day events render in their own row
                    above instead (they have no time-of-day to place here). */}
                {filteredEvents.filter(ev => !ev.allDay).map(ev => {
                  const evDate    = new Date(ev.start);
                  const isResizingThis = resizeState?.id === ev.id && resizeState?.occurrenceDate === ev.occurrenceDate;
                  const evEndDate = isResizingThis ? new Date(resizeState.previewEndMs) : new Date(ev.end);
                  const dayIdx    = weekDays.findIndex(wd => formatISO(wd) === formatISO(evDate));
                  if (dayIdx === -1) return null;

                  const startH = evDate.getHours() + evDate.getMinutes() / 60;
                  const endH   = evEndDate.getHours() + evEndDate.getMinutes() / 60;
                  if (startH > 20 || endH < 8) return null;

                  const top    = (Math.max(8, startH) - 8) * HOUR_ROW_PX;
                  const height = (Math.min(20, endH) - Math.max(8, startH)) * HOUR_ROW_PX;
                  const left   = `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 4px)`;
                  const width  = `calc((100% - 60px) / 7 - 8px)`;

                  return (
                    <div
                      key={ev.id + ev.occurrenceDate}
                      draggable
                      onDragStart={e => handleEventDragStart(e, ev)}
                      onDragEnd={() => setDraggingEventId(null)}
                      onClick={e => openPopover(ev, e)}
                      title="Drag to reschedule"
                      style={{
                        position: 'absolute', top: top + 2, left, width, height: height - 4,
                        background: resolveEventColor(ev), borderRadius: 6, padding: '6px 8px',
                        fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'grab', zIndex: isResizingThis ? 20 : 10,
                        opacity: draggingEventId === ev.id ? 0.4 : 1,
                        overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2,
                        boxShadow: 'var(--elev)'
                      }}
                    >
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      <div style={{ fontSize: 10, opacity: .9 }}>
                        {evDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        {' – '}
                        {evEndDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </div>
                      {/* Drag-resize handle — bottom edge, changes duration only. */}
                      <div
                        onMouseDown={e => startEventResize(e, ev)}
                        title="Drag to resize"
                        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'ns-resize' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── DAY VIEW ── */}
          {viewMode === 'day' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 0', flexShrink: 0, position: 'sticky', top: 0, zIndex: 1 }}>
                <div />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                    {currentDate.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div style={{
                    fontSize: 28, fontWeight: 400, width: 48, height: 48, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isToday(currentDate) ? 'var(--teal)' : 'transparent',
                    color: isToday(currentDate) ? '#fff' : 'var(--ink)',
                  }}>
                    {currentDate.getDate()}
                  </div>
                </div>
              </div>
              {/* All-day / multi-day row — same reasoning as week view's. */}
              {(() => {
                const dateStr = formatISO(currentDate);
                const dayAllDay = filteredEvents.filter(e => e.allDay && e.start.slice(0, 10) <= dateStr && e.end.slice(0, 10) >= dateStr);
                if (dayAllDay.length === 0) return null;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '4px 0' }}>
                    <div />
                    <div style={{ padding: '2px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayAllDay.map(ev => (
                        <div
                          key={ev.id + ev.occurrenceDate}
                          onClick={e => openPopover(ev, e)}
                          style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: resolveEventColor(ev), borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                        >
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ position: 'relative' }}>
                {HOURS.map(hour => {
                  const displayHour = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                  const cellDateStr = formatISO(currentDate);
                  const inDragRange = dragCreate?.dateStr === cellDateStr && hour >= Math.min(dragCreate.startHour, dragCreate.endHour) && hour <= Math.max(dragCreate.startHour, dragCreate.endHour);
                  return (
                    <div key={hour} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', height: HOUR_ROW_PX, borderBottom: '1px solid var(--border2)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'right', paddingRight: 10, paddingTop: 6, userSelect: 'none' }}>
                        {displayHour}
                      </div>
                      <div
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, cellDateStr, `${String(hour).padStart(2,'0')}:00`)}
                        onMouseDown={() => beginDragCreate(cellDateStr, hour)}
                        onMouseEnter={e => { extendDragCreate(cellDateStr, hour); if (!inDragRange) e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={e => { if (!inDragRange) e.currentTarget.style.background = 'none'; }}
                        style={{ borderLeft: '1px solid var(--border2)', cursor: 'pointer', background: inDragRange ? 'var(--teal-l, rgba(13,148,136,0.12))' : undefined }}
                      />
                    </div>
                  );
                })}
                {/* Google Calendar red current-time indicator line for Day view */}
                {(() => {
                  const nowH = nowDate.getHours() + nowDate.getMinutes() / 60;
                  if (nowH < 8 || nowH > 20 || formatISO(nowDate) !== formatISO(currentDate)) return null;
                  const top = (nowH - 8) * HOUR_ROW_PX;
                  return (
                    <div style={{ position: 'absolute', top, left: 60, right: 0, height: 2, background: '#ea4335', zIndex: 15, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ea4335', marginLeft: -4 }} />
                    </div>
                  );
                })()}

                {meetWithPeople.map((p, pi) => (meetWithBusy[p.userId] ?? []).map((b, bi) => {
                  const bStart = new Date(b.start);
                  const bEnd = new Date(b.end);
                  if (formatISO(bStart) !== formatISO(currentDate)) return null;
                  const startH = bStart.getHours() + bStart.getMinutes() / 60;
                  const endH = bEnd.getHours() + bEnd.getMinutes() / 60;
                  if (startH > 20 || endH < 8) return null;
                  const top = (Math.max(8, startH) - 8) * HOUR_ROW_PX;
                  const height = Math.max(4, (Math.min(20, endH) - Math.max(8, startH)) * HOUR_ROW_PX);
                  return (
                    <div
                      key={`busy-${p.userId}-${bi}`}
                      title={`${p.name} is busy ${bStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${bEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                      style={{ position: 'absolute', top, left: 60 + 4 + pi * 7, width: 5, height, background: MEET_WITH_COLORS[pi % MEET_WITH_COLORS.length], borderRadius: 2, zIndex: 5, opacity: 0.85 }}
                    />
                  );
                }))}
                {filteredEvents
                  .filter(ev => !ev.allDay && ev.start.startsWith(formatISO(currentDate)))
                  .map(ev => {
                    const evDate    = new Date(ev.start);
                    const isResizingThis = resizeState?.id === ev.id && resizeState?.occurrenceDate === ev.occurrenceDate;
                    const evEndDate = isResizingThis ? new Date(resizeState.previewEndMs) : new Date(ev.end);
                    const startH    = evDate.getHours() + evDate.getMinutes() / 60;
                    const endH      = evEndDate.getHours() + evEndDate.getMinutes() / 60;
                    const top       = (Math.max(8, startH) - 8) * HOUR_ROW_PX;
                    const height    = (Math.min(20, endH) - Math.max(8, startH)) * HOUR_ROW_PX;
                    return (
                      <div
                        key={ev.id + ev.occurrenceDate}
                        draggable
                        onDragStart={e => handleEventDragStart(e, ev)}
                        onDragEnd={() => setDraggingEventId(null)}
                        onClick={e => openPopover(ev, e)}
                        title="Drag to reschedule"
                        style={{
                          position: 'absolute', top: top + 2, left: 64, right: 16, height: height - 4,
                          background: resolveEventColor(ev), borderRadius: 8, padding: '12px 16px',
                          fontSize: 14, color: '#fff', cursor: 'grab', zIndex: isResizingThis ? 20 : 10,
                          opacity: draggingEventId === ev.id ? 0.4 : 1,
                          display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden',
                          boxShadow: 'var(--elev)'
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{ev.title}</div>
                        {ev.description && <div style={{ fontSize: 12, opacity: .9 }}>{ev.description}</div>}
                        <div style={{ fontSize: 11, opacity: .8, marginTop: 4 }}>
                          {evDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {' – '}
                          {evEndDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <div
                          onMouseDown={e => startEventResize(e, ev)}
                          title="Drag to resize"
                          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'ns-resize' }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── AGENDA VIEW ── */}
          {viewMode === 'agenda' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', fontSize: 15 }}>No events scheduled</div>
              ) : (
                [...filteredEvents]
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map(ev => {
                    const evDate = new Date(ev.start);
                    const color  = resolveEventColor(ev);
                    return (
                      <div
                        key={ev.id + ev.occurrenceDate}
                        onClick={e => openPopover(ev, e)}
                        style={{
                          display: 'flex', gap: 16, background: 'var(--white)', padding: 16,
                          borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer',
                          transition: 'box-shadow .15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.05)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                      >
                        <div style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          width: 56, height: 56, background: color.startsWith('#') ? color + '18' : 'var(--bg)', borderRadius: 10, flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' }}>
                            {evDate.toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                          <span style={{ fontSize: 20, fontWeight: 700, color }}>{evDate.getDate()}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{ev.title}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', paddingLeft: 18 }}>
                            {evDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {ev.location && ` · ${ev.location}`}
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}

        </div>
      </div>
      
      {/* ── Google Calendar Style Event Editor Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', padding: 16 }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, width: 'min(860px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--elev-lg)', overflow: 'hidden' }}>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)' }}>
              <input
                value={eventTitle}
                onChange={e => setEventTitle(e.target.value)}
                placeholder="Add title"
                style={{ flex: 1, fontSize: 20, fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--ink)', outline: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 16 }}>
                <Button variant="default" onClick={handleSave} style={{ fontWeight: 600, padding: '6px 20px', borderRadius: 6 }}>
                  Save
                </Button>
                {editingEvent && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" style={{ borderRadius: 6 }}>
                        More actions <Icon name="chevronDown" size={13} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 p-1">
                      <button onClick={handleDelete} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 13, fontWeight: 500, borderRadius: 6 }}>
                        <Icon name="trash" size={14} /> Delete event
                      </button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--ink3)', borderRadius: 6 }}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            {/* Editor Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Date & Time & Timezone Row */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type={eventAllDay ? 'date' : 'datetime-local'}
                    value={eventAllDay ? eventStart.slice(0, 10) : eventStart}
                    onChange={e => setEventStart(eventAllDay ? `${e.target.value}T00:00` : e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--card-bg)', color: 'var(--ink)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--ink3)' }}>to</span>
                  <input
                    type={eventAllDay ? 'date' : 'datetime-local'}
                    value={eventAllDay ? eventEnd.slice(0, 10) : eventEnd}
                    onChange={e => setEventEnd(eventAllDay ? `${e.target.value}T23:59` : e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--card-bg)', color: 'var(--ink)' }}
                  />
                  <Button variant="ghost" size="xs" onClick={() => setShowTimezoneModal(true)} style={{ color: 'var(--teal)', fontWeight: 600 }}>
                    <Icon name="globe" size={13} /> {eventTimezone || 'Time zone'}
                  </Button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
                    <Switch checked={eventAllDay} onCheckedChange={setEventAllDay} /> All day
                  </label>
                  <EventRecurrencePicker value={eventRecurrence} onChange={setEventRecurrence} />
                </div>
              </div>

              {/* 2-Column Content Layout */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 24 }}>
                {/* Left Column — Details & Video Call */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Video Call Integration */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="video" size={16} style={{ color: 'var(--teal)' }} />
                        {eventMeetingUrl ? 'Hudumika Meet Video Call' : 'Add Hudumika Meet Video Conference'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {eventMeetingUrl || 'Click to generate a 1-click video meeting link'}
                      </div>
                    </div>
                    {eventMeetingUrl ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Tip label="Join this video call now">
                          <Button variant="default" size="xs" onClick={() => window.open(buildJoinUrl(eventMeetingUrl, eventMeetingSettings), '_blank', 'noopener')} style={{ background: 'var(--teal)', color: '#fff' }}>
                            <Icon name="video" size={12} /> Join
                          </Button>
                        </Tip>
                        <Button variant="outline" size="xs" onClick={() => navigator.clipboard?.writeText(eventMeetingUrl)}>
                          <Icon name="copy" size={12} />
                        </Button>
                        <Button variant="outline" size="xs" onClick={() => setShowMeetingOptionsModal(true)}>
                          <Icon name="settings" size={12} />
                        </Button>
                        <Button variant="outline" size="xs" onClick={() => setEventMeetingUrl('')} style={{ color: 'var(--red)' }}>
                          <Icon name="close" size={12} />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="default" size="xs" onClick={() => setEventMeetingUrl(newMeetingUrl())}>
                        Add Video Call
                      </Button>
                    )}
                  </div>

                  {/* Location Input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon name="mapPin" size={16} color="var(--ink3)" />
                    <input
                      value={eventLocation}
                      onChange={e => setEventLocation(e.target.value)}
                      placeholder="Add location"
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13.5, background: 'var(--bg)', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* Notifications / Reminders */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Icon name="bell" size={16} color="var(--ink3)" style={{ marginTop: 8 }} />
                    <div style={{ flex: 1 }}>
                      <EventReminderPicker value={eventReminderOffsets} onChange={setEventReminderOffsets} />
                    </div>
                  </div>

                  {/* Category, Color, Visibility, Availability */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <Select value={eventCategory} onValueChange={v => setEventCategory(v as Category)}>
                      <SelectTrigger style={{ width: 'auto', minHeight: 32, fontSize: 13 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORY_MAP) as Category[]).filter(c => c !== 'holiday').map(c => (
                          <SelectItem key={c} value={c}>{CATEGORY_MAP[c].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {EVENT_COLOR_OPTIONS.map(c => (
                        <button
                          key={c.label}
                          type="button"
                          title={c.label}
                          onClick={() => setEventColorChoice(c.id)}
                          style={{
                            width: 18, height: 18, borderRadius: '50%', cursor: 'pointer',
                            background: c.hex ?? CATEGORY_MAP[eventCategory].color,
                            border: eventColorChoice === c.id ? '2px solid var(--ink)' : '2px solid transparent',
                          }}
                        />
                      ))}
                    </div>

                    <Select value={eventBusyStatus} onValueChange={v => setEventBusyStatus(v as 'busy' | 'free')}>
                      <SelectTrigger style={{ width: 'auto', minHeight: 32, fontSize: 13 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="busy">Busy</SelectItem>
                        <SelectItem value="free">Free</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={eventVisibility} onValueChange={v => setEventVisibility(v as 'default' | 'public' | 'private')}>
                      <SelectTrigger style={{ width: 'auto', minHeight: 32, fontSize: 13 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default visibility</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description & Rich Text Toolbar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description &amp; Notes</div>
                      <Button variant="ghost" size="xs" onClick={() => setEventDescription(d => d + '\n• Action item 1\n• Action item 2')} style={{ color: 'var(--teal)' }}>
                        + Create meeting notes
                      </Button>
                    </div>
                    <textarea
                      value={eventDescription}
                      onChange={e => setEventDescription(e.target.value)}
                      placeholder="Add description or agenda items"
                      rows={4}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13.5, background: 'var(--bg)', color: 'var(--ink)', resize: 'vertical' }}
                    />
                  </div>
                </div>

                {/* Right Column — Guests & Permissions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, borderLeft: isMobile ? 'none' : '1px solid var(--border)', paddingLeft: isMobile ? 0 : 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Guests</div>

                  <EventGuestPicker guests={eventGuests} onAdd={addGuest} onRemove={removeGuest} />

                  {/* Guest Permissions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em' }}>Guest permissions</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={eventGuestPermissions.modifyEvent}
                        onChange={e => setEventGuestPermissions(p => ({ ...p, modifyEvent: e.target.checked }))}
                      />
                      Modify event
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={eventGuestPermissions.inviteOthers}
                        onChange={e => setEventGuestPermissions(p => ({ ...p, inviteOthers: e.target.checked }))}
                      />
                      Invite others
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={eventGuestPermissions.seeGuestList}
                        onChange={e => setEventGuestPermissions(p => ({ ...p, seeGuestList: e.target.checked }))}
                      />
                      See guest list
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTimezoneModal && (
        <TimezoneModal
          value={eventTimezone}
          onClose={() => setShowTimezoneModal(false)}
          onSelect={tz => setEventTimezone(tz)}
        />
      )}

      {showMeetingOptionsModal && (
        <MeetingOptionsModal
          meetingUrl={eventMeetingUrl}
          settings={eventMeetingSettings}
          onClose={() => setShowMeetingOptionsModal(false)}
          onSave={st => setEventMeetingSettings(st)}
        />
      )}

      {bookingPagesOpen && <BookingPagesPanel isMobile={isMobile} onClose={() => setBookingPagesOpen(false)} />}
      {calendarSyncOpen && <CalendarSyncPanel isMobile={isMobile} onClose={() => setCalendarSyncOpen(false)} />}

      {/* Popover */}
      {popover && (() => {
        const ev = popover.event;
        const cfg = CATEGORY_MAP[ev.category as Category] || { color: 'var(--purple)' };
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 900 }} onClick={() => setPopover(null)} />
            <div style={{
              position: 'fixed', top: Math.min(popover.y, window.innerHeight - 200), left: Math.min(popover.x, window.innerWidth - 300),
              width: 280, background: 'var(--white)', borderRadius: 12, padding: 16, zIndex: 901,
              boxShadow: 'var(--elev-lg)', border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: cfg.color, marginTop: 4 }} />
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                    {new Date(ev.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              {ev.location && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginLeft: 24, marginBottom: 8, fontSize: 12.5, color: 'var(--ink3)' }}>
                  <Icon name="mapPin" size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{ev.location}</span>
                </div>
              )}
              {ev.description && <div style={{ fontSize: 13, color: 'var(--ink2)', marginLeft: 24, marginBottom: 12 }}>{ev.description}</div>}
              {ev.guests && ev.guests.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginLeft: 24, marginBottom: 12, fontSize: 12.5, color: 'var(--ink3)' }}>
                  <Icon name="users" size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{ev.guests.map(g => g.name || g.email).join(', ')}</span>
                </div>
              )}
              {ev.isRecurring && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 24, marginBottom: 12, fontSize: 12.5, color: 'var(--ink3)' }}>
                  <Icon name="refresh" size={12} style={{ flexShrink: 0 }} />
                  <span>Repeats {ev.recurrence?.freq}{ev.isOverridden ? ' · edited for this date' : ''}</span>
                </div>
              )}
              {/* Holidays are synthetic rows merged in from the tenant's
                  working calendar (hr_holidays), not a real calendar_events
                  row — there's nothing to PATCH/DELETE by this id, so no
                  Edit action for them. */}
              {ev.category !== 'holiday' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(ev)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>Edit</button>
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
};

/* ── Recurrence picker — "Does not repeat" / Daily / Weekly / Monthly /
   Yearly, plus interval, weekday selection (weekly only), and an optional
   end (never / on a date / after N occurrences). ── */
const EventRecurrencePicker: React.FC<{ value: RecurrenceRule | null; onChange: (v: RecurrenceRule | null) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RecurrenceRule>(value ?? { freq: 'weekly', interval: 1 });
  const [endMode, setEndMode] = useState<'never' | 'until' | 'count'>(value?.until ? 'until' : value?.count ? 'count' : 'never');

  useEffect(() => {
    if (open) {
      setDraft(value ?? { freq: 'weekly', interval: 1 });
      setEndMode(value?.until ? 'until' : value?.count ? 'count' : 'never');
    }
  }, [open, value]);

  function toggleWeekday(day: number) {
    setDraft(d => {
      const cur = d.byWeekday ?? [];
      const next = cur.includes(day) ? cur.filter(x => x !== day) : [...cur, day].sort();
      return { ...d, byWeekday: next };
    });
  }

  function apply() {
    const rule: RecurrenceRule = { freq: draft.freq, interval: Math.max(1, draft.interval || 1) };
    if (draft.freq === 'weekly' && draft.byWeekday?.length) rule.byWeekday = draft.byWeekday;
    if (endMode === 'until' && draft.until) rule.until = draft.until;
    if (endMode === 'count' && draft.count) rule.count = draft.count;
    onChange(rule);
    setOpen(false);
  }

  const summary = value
    ? `${value.interval > 1 ? `Every ${value.interval} ${value.freq.replace('ly', 's')}` : `${value.freq.charAt(0).toUpperCase()}${value.freq.slice(1)}`}${value.until ? ` until ${value.until}` : value.count ? `, ${value.count}×` : ''}`
    : 'Does not repeat';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${value ? 'var(--teal)' : 'var(--border)'}`, background: value ? 'var(--teal-l, rgba(13,148,136,0.08))' : 'var(--white)',
            color: value ? 'var(--teal)' : 'var(--ink2)',
          }}
        >
          <Icon name="refresh" size={13} /> {summary}
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-72 p-3">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>Repeat every</span>
            <input
              type="number" min={1} max={365} value={draft.interval}
              onChange={e => setDraft(d => ({ ...d, interval: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              style={{ width: 52, padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 }}
            />
            <Select value={draft.freq} onValueChange={v => setDraft(d => ({ ...d, freq: v as RecurrenceRule['freq'] }))}>
              <SelectTrigger style={{ minHeight: 28, fontSize: 12.5, flex: 1 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">day(s)</SelectItem>
                <SelectItem value="weekly">week(s)</SelectItem>
                <SelectItem value="monthly">month(s)</SelectItem>
                <SelectItem value="yearly">year(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {draft.freq === 'weekly' && (
            <div style={{ display: 'flex', gap: 4 }}>
              {WEEKDAY_LABELS.map((lbl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: draft.byWeekday?.includes(i) ? 'var(--teal)' : 'var(--bg)',
                    color: draft.byWeekday?.includes(i) ? '#fff' : 'var(--ink2)',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Ends</span>
            {(['never', 'until', 'count'] as const).map(mode => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="radio" name="recur-end" checked={endMode === mode} onChange={() => setEndMode(mode)} />
                {mode === 'never' && 'Never'}
                {mode === 'until' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    On
                    <DatePicker
                      date={parseDateOnly(draft.until)}
                      onChange={d => { setDraft(prev => ({ ...prev, until: toDateOnlyString(d) })); setEndMode('until'); }}
                      placeholder="Select date"
                      triggerClassName="min-h-7 px-2 py-1 text-xs"
                    />
                  </span>
                )}
                {mode === 'count' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    After
                    <input
                      type="number" min={1} max={1000} value={draft.count ?? 10}
                      onChange={e => setDraft(d => ({ ...d, count: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      onFocus={() => setEndMode('count')}
                      style={{ width: 52, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                    />
                    occurrences
                  </span>
                )}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {value ? <Button size="xs" variant="ghost" onClick={() => { onChange(null); setOpen(false); }}>Remove</Button> : <span />}
            <Button size="xs" onClick={apply}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Reminder picker — multi-select common lead times, same shape as
   Google's own reminder chooser. ── */
const EventReminderPicker: React.FC<{ value: number[]; onChange: (v: number[]) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  function toggle(minutes: number) {
    onChange(value.includes(minutes) ? value.filter(m => m !== minutes) : [...value, minutes].sort((a, b) => a - b));
  }

  const label = value.length === 0 ? 'No reminder' : value.length === 1
    ? REMINDER_OFFSET_OPTIONS.find(o => o.minutes === value[0])?.label ?? `${value[0]} min before`
    : `${value.length} reminders`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${value.length ? 'var(--teal)' : 'var(--border)'}`, background: value.length ? 'var(--teal-l, rgba(13,148,136,0.08))' : 'var(--white)',
            color: value.length ? 'var(--teal)' : 'var(--ink2)',
          }}
        >
          <Icon name="bell" size={13} /> {label}
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-56 p-2">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 6px 6px' }}>Notify me</div>
        {REMINDER_OFFSET_OPTIONS.map(opt => (
          <label key={opt.minutes} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={value.includes(opt.minutes)} onChange={() => toggle(opt.minutes)} />
            {opt.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
};

/* ── Guest picker — real people search (fetchPeople), same pattern as
   Notes' SharePanel — replaces the old free-text "type an email" input,
   which had no way to notify anyone or know who they were. ── */
const EventGuestPicker: React.FC<{ guests: CalendarGuest[]; onAdd: (p: Person) => void; onRemove: (userId: string | null, email: string) => void }> = ({ guests, onAdd, onRemove }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetchPeople({ q: query.trim(), limit: 8 }).then(people => {
        if (alive) setResults(people.filter(p => !guests.some(g => g.userId === p.id)));
      }).finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Add guests"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
        />
        {(results.length > 0 || searching) && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 20, maxHeight: 200, overflowY: 'auto' }}>
            {searching && <div style={{ padding: 8, fontSize: 12.5, color: 'var(--ink3)' }}>Searching…</div>}
            {!searching && results.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onAdd(p); setQuery(''); setResults([]); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <PersonAvatar userId={p.id} name={p.name} size={20} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                  {p.email && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{p.email}</span>}
                </div>
              </button>
            ))}
            {!searching && results.length === 0 && <div style={{ padding: 8, fontSize: 12.5, color: 'var(--ink3)' }}>No matches.</div>}
          </div>
        )}
      </div>
      {guests.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {guests.map(g => (
            <span key={g.userId ?? g.email} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, padding: '4px 6px 4px 10px', borderRadius: 20, background: 'var(--bg)', color: 'var(--ink2)' }}>
              {g.name || g.email}
              <button type="button" onClick={() => onRemove(g.userId, g.email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 2 }}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const BOOKING_WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const emptyBookingForm = (): BookingPageInput => ({
  title: '30 Minute Meeting', slug: '', durationMinutes: 30, bufferMinutes: 0,
  workingDays: [1, 2, 3, 4, 5], workingStartTime: '09:00', workingEndTime: '17:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, bookingWindowDays: 30, active: true,
});

/* ── Booking pages (Calendly-style scheduling links) — single-step settings
   form, same modal-overlay presentation the event Create/Edit dialog above
   already uses in this app (not a wizard, so the "no popup forms" rule for
   multi-step flows doesn't apply here). ── */
const BookingPagesPanel: React.FC<{ isMobile: boolean; onClose: () => void }> = ({ isMobile, onClose }) => {
  const [pages, setPages] = useState<BookingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BookingPage | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BookingPageInput>(emptyBookingForm());
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetchBookingPages().then(setPages).catch(err => showAlert(err?.message || 'Could not load booking pages.')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function startCreate() {
    setForm(emptyBookingForm());
    setEditing(null);
    setCreating(true);
  }
  function startEdit(p: BookingPage) {
    setForm({
      title: p.title, slug: p.slug, description: p.description ?? undefined, durationMinutes: p.durationMinutes,
      bufferMinutes: p.bufferMinutes, workingDays: p.workingDays, workingStartTime: p.workingStartTime,
      workingEndTime: p.workingEndTime, timezone: p.timezone, bookingWindowDays: p.bookingWindowDays, active: p.active,
    });
    setEditing(p);
    setCreating(true);
  }
  function toggleDay(d: number) {
    setForm(f => {
      const days = f.workingDays ?? [];
      return { ...f, workingDays: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() };
    });
  }
  async function handleSaveForm() {
    if (!form.title?.trim()) { showAlert('Give this booking page a title.'); return; }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateBookingPageApi(editing.id, form);
        setPages(ps => ps.map(p => p.id === updated.id ? updated : p));
      } else {
        const created = await createBookingPage(form);
        setPages(ps => [...ps, created]);
      }
      setCreating(false);
      setEditing(null);
    } catch (err: any) {
      showAlert(err?.message || 'Could not save this booking page.');
    } finally {
      setSaving(false);
    }
  }
  async function handleDeletePage(p: BookingPage) {
    if (!window.confirm(`Delete "${p.title}"? Its public link will stop working.`)) return;
    const prev = pages;
    setPages(ps => ps.filter(x => x.id !== p.id));
    try { await deleteBookingPageApi(p.id); } catch (err: any) { setPages(prev); showAlert(err?.message || 'Could not delete this booking page.'); }
  }
  async function handleToggleActive(p: BookingPage) {
    const prev = pages;
    setPages(ps => ps.map(x => x.id === p.id ? { ...x, active: !x.active } : x));
    try { await updateBookingPageApi(p.id, { active: !p.active }); } catch (err: any) { setPages(prev); showAlert(err?.message || 'Could not update this booking page.'); }
  }
  function copyLink(p: BookingPage) {
    const url = `${window.location.origin}/book/${p.slug}`;
    navigator.clipboard?.writeText(url).then(() => { setCopiedId(p.id); setTimeout(() => setCopiedId(null), 1500); });
  }

  const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }} onClick={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: 'min(560px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: isMobile ? 18 : 24, boxShadow: 'var(--elev-lg)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{creating ? (editing ? 'Edit booking page' : 'New booking page') : 'Booking pages'}</h2>
          <button onClick={creating ? () => setCreating(false) : onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--ink3)' }}>
            <Icon name={creating ? 'chevronLeft' : 'x'} size={18} />
          </button>
        </div>

        {!creating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0' }}>Loading…</div>}
            {!loading && pages.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0' }}>
                No booking pages yet — create one to let people schedule time with you without going back and forth.
              </div>
            )}
            {pages.map(p => (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{p.durationMinutes} min · /book/{p.slug}</div>
                  </div>
                  <Switch checked={p.active} onCheckedChange={() => handleToggleActive(p)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => copyLink(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--white)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: 'var(--ink2)' }}>
                    <Icon name={copiedId === p.id ? 'check' : 'link'} size={13} /> {copiedId === p.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" onClick={() => startEdit(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--white)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: 'var(--ink2)' }}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  <button type="button" onClick={() => handleDeletePage(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: 'none', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: 'var(--red)', marginLeft: 'auto' }}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button" onClick={startCreate}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', border: '1px dashed var(--border2)', borderRadius: 10, background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--teal)', marginTop: 4 }}
            >
              <Icon name="plus" size={14} /> New booking page
            </button>
          </div>
        )}

        {creating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title (e.g. 30 Minute Meeting)" style={inputStyle} />
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Link</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>/book/</span>
                <input value={form.slug ?? ''} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="auto-generated if left blank" style={inputStyle} />
              </div>
            </div>
            <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (shown to the person booking)" rows={2} style={{ ...inputStyle, resize: 'none' }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Duration (min)</div>
                <input type="number" min={5} max={480} value={form.durationMinutes ?? 30} onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} style={inputStyle} />
              </label>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Buffer between meetings (min)</div>
                <input type="number" min={0} max={120} value={form.bufferMinutes ?? 0} onChange={e => setForm(f => ({ ...f, bufferMinutes: Number(e.target.value) }))} style={inputStyle} />
              </label>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 6 }}>Working days</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {BOOKING_WEEKDAY_LABELS.map((label, d) => {
                  const on = (form.workingDays ?? []).includes(d);
                  return (
                    <button
                      key={d} type="button" onClick={() => toggleDay(d)}
                      style={{
                        width: 34, height: 34, borderRadius: '50%', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${on ? 'var(--teal)' : 'var(--border)'}`,
                        background: on ? 'hsl(var(--primary))' : 'var(--white)', color: on ? 'hsl(var(--primary-foreground))' : 'var(--ink3)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Working hours start</div>
                <input type="time" value={form.workingStartTime ?? '09:00'} onChange={e => setForm(f => ({ ...f, workingStartTime: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Working hours end</div>
                <input type="time" value={form.workingEndTime ?? '17:00'} onChange={e => setForm(f => ({ ...f, workingEndTime: e.target.value }))} style={inputStyle} />
              </label>
            </div>
            <label>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>How far ahead people can book (days)</div>
              <input type="number" min={1} max={365} value={form.bookingWindowDays ?? 30} onChange={e => setForm(f => ({ ...f, bookingWindowDays: Number(e.target.value) }))} style={inputStyle} />
            </label>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Timezone: {form.timezone}</div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setCreating(false)} style={{ padding: 'var(--ds-btn-py) 18px', border: '1px solid var(--border)', background: 'transparent', borderRadius: 'var(--r)', cursor: 'pointer', fontWeight: 500, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>Cancel</button>
              <button onClick={handleSaveForm} disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 'var(--r)', cursor: saving ? 'default' : 'pointer', fontWeight: 600, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PROVIDER_META: Record<'google' | 'outlook', { label: string }> = {
  google: { label: 'Google Calendar' },
  outlook: { label: 'Outlook Calendar' },
};

/* ── Google/Outlook sync — connect/disconnect (any user) + app-credential
   config (tenant admins only). Same modal-overlay presentation as the other
   settings panels in this file; inert end-to-end until an admin saves real
   OAuth credentials (calendar-sync.routes.ts 400s /authorize until then). ── */
const CalendarSyncPanel: React.FC<{ isMobile: boolean; onClose: () => void }> = ({ isMobile, onClose }) => {
  const { user } = useAuth();
  const isAdmin = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
  const [connections, setConnections] = useState<CalendarSyncConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [credsLoaded, setCredsLoaded] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);

  function load() {
    setLoading(true);
    fetchCalendarSyncConnections().then(setConnections).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function statusFor(provider: 'google' | 'outlook'): CalendarSyncConnection | undefined {
    return connections.find(c => c.provider === provider);
  }

  async function handleConnect(provider: 'google' | 'outlook') {
    setConnecting(provider);
    try {
      const url = await getCalendarSyncAuthorizeUrl(provider);
      window.location.href = url;
    } catch (err: any) {
      showAlert(err?.message || `Could not start ${PROVIDER_META[provider].label} sign-in.`);
      setConnecting(null);
    }
  }
  async function handleDisconnect(provider: 'google' | 'outlook') {
    if (!window.confirm(`Disconnect ${PROVIDER_META[provider].label}? Events already imported stay on your calendar, but new ones will stop coming in.`)) return;
    try {
      await disconnectCalendarSync(provider);
      load();
    } catch (err: any) {
      showAlert(err?.message || 'Could not disconnect.');
    }
  }

  function openConfig() {
    if (!credsLoaded) {
      fetchCalendarSyncCredentials().then(c => { setCreds(c); setCredsLoaded(true); }).catch(() => setCredsLoaded(true));
    }
    setConfigOpen(o => !o);
  }
  async function handleSaveCreds() {
    setSavingCreds(true);
    try {
      await saveCalendarSyncCredentials(creds);
      showAlert('Saved. Anyone in this workspace can now connect their calendar.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message || 'Could not save credentials.');
    } finally {
      setSavingCreds(false);
    }
  }

  const inputStyle: React.CSSProperties = { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }} onClick={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: 'min(520px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: isMobile ? 18 : 24, boxShadow: 'var(--elev-lg)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Google/Outlook sync</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--ink3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 18 }}>
          One-way import — events on your Google or Outlook calendar show up here. Nothing is ever written back.
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['google', 'outlook'] as const).map(provider => {
              const conn = statusFor(provider);
              const status = conn?.status ?? 'disconnected';
              return (
                <div key={provider} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="calendar" size={17} color="var(--ink3)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{PROVIDER_META[provider].label}</div>
                    <div style={{ fontSize: 12, color: status === 'authorized' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--ink3)' }}>
                      {status === 'authorized' && `Connected${conn?.lastSyncedAt ? ` · last synced ${new Date(conn.lastSyncedAt).toLocaleString()}` : ' · syncing soon'}`}
                      {status === 'error' && (conn?.lastError || 'Connection error — try reconnecting')}
                      {status === 'disconnected' && 'Not connected'}
                    </div>
                  </div>
                  {status === 'authorized' ? (
                    <Button variant="outline" size="sm" onClick={() => handleDisconnect(provider)}>Disconnect</Button>
                  ) : (
                    <Button size="sm" onClick={() => handleConnect(provider)} disabled={connecting === provider}>
                      {connecting === provider ? 'Redirecting…' : 'Connect'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button
              type="button" onClick={openConfig}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', padding: 0 }}
            >
              <Icon name={configOpen ? 'chevronUp' : 'chevronDown'} size={13} color="var(--ink4)" />
              App credentials (admin)
            </button>
            {configOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Create an OAuth app in Google Cloud Console / Azure AD with redirect URI ending in <code>/v1/tasks/calendar-sync/{'{provider}'}/callback</code>, then paste its Client ID/Secret here. One app registration covers everyone in this workspace — each person still connects their own account above.
                </div>
                <label>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Google Client ID</div>
                  <input value={creds.googleClientId ?? ''} onChange={e => setCreds(c => ({ ...c, googleClientId: e.target.value }))} style={inputStyle} />
                </label>
                <label>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Google Client Secret</div>
                  <input type="password" value={creds.googleClientSecret ?? ''} onChange={e => setCreds(c => ({ ...c, googleClientSecret: e.target.value }))} style={inputStyle} />
                </label>
                <label>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Outlook (Azure AD) Application ID</div>
                  <input value={creds.outlookClientId ?? ''} onChange={e => setCreds(c => ({ ...c, outlookClientId: e.target.value }))} style={inputStyle} />
                </label>
                <label>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Outlook Client Secret</div>
                  <input type="password" value={creds.outlookClientSecret ?? ''} onChange={e => setCreds(c => ({ ...c, outlookClientSecret: e.target.value }))} style={inputStyle} />
                </label>
                <Button size="sm" onClick={handleSaveCreds} disabled={savingCreds} style={{ alignSelf: 'flex-end' }}>
                  {savingCreds ? 'Saving…' : 'Save credentials'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Timezone Modal Component ── */
const TimezoneModal: React.FC<{ value: string; onClose: () => void; onSelect: (tz: string) => void }> = ({ value, onClose, onSelect }) => {
  const [selected, setSelected] = useState(value || 'GMT+03:00 (East Africa Time)');
  const timezones = [
    'GMT+03:00 (East Africa Time - Nairobi, Dar es Salaam)',
    'GMT+00:00 (Greenwich Mean Time - London, UTC)',
    'GMT-05:00 (Eastern Time - New York)',
    'GMT-08:00 (Pacific Time - Los Angeles)',
    'GMT+01:00 (Central European Time - Paris, Berlin)',
    'GMT+04:00 (Gulf Standard Time - Dubai)',
    'GMT+08:00 (Singapore Standard Time - Singapore)',
    'GMT+09:00 (Japan Standard Time - Tokyo)',
  ];

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-120 p-6">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700 }}>Event time zone</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 12px' }}>
          A repeated event has to start and end in the same time zone.
        </p>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger style={{ width: '100%', minHeight: 40, fontSize: 13 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {timezones.map(tz => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="ghost" size="sm" onClick={() => onSelect(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
            Use current time zone
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" onClick={() => { onSelect(selected); onClose(); }}>
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Meeting Options Modal Component ── */
// Only two real, verifiable options — Jitsi's own documented URL hash
// config (#config.startWithVideoMuted=true&config.startWithAudioMuted=true),
// applied at join time via buildJoinUrl. The original five toggles (host
// management, screen-share/reactions/chat permissions) had no mechanism
// behind any of them on the public meet.jit.si instance for anonymous
// participants — dropped rather than left as switches that silently did
// nothing, which is exactly the mockup problem this replaces.
const MeetingOptionsModal: React.FC<{ meetingUrl: string; settings: MeetingSettings; onClose: () => void; onSave: (st: MeetingSettings) => void }> = ({ meetingUrl, settings, onClose, onSave }) => {
  const [draft, setDraft] = useState<MeetingSettings>(settings);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-140 p-6">
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}>
            <Icon name="video" size={18} style={{ color: 'var(--teal)' }} />
            Hudumika Meet — Video call options
          </DialogTitle>
        </DialogHeader>

        <div style={{ fontSize: 12, color: 'var(--ink3)', margin: '2px 0 16px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {meetingUrl}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Join with camera off</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>You can still turn it on once you're in the call</div>
            </div>
            <Switch checked={!!draft.startWithVideoMuted} onCheckedChange={v => setDraft(d => ({ ...d, startWithVideoMuted: v }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Join with microphone off</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>You can still unmute once you're in the call</div>
            </div>
            <Switch checked={!!draft.startWithAudioMuted} onCheckedChange={v => setDraft(d => ({ ...d, startWithAudioMuted: v }))} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Applies whenever anyone joins from this link.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="default" size="sm" onClick={() => { onSave(draft); onClose(); }}>
              Save Options
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
