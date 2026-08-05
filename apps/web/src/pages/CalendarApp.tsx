import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import {
  useEvents, addEvent, updateEvent, deleteEvent, CalendarEvent,
  useTodos, updateTodo, Todo,
  useAppSettings, updateAppSettings,
} from '../data/calendarStore.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '../components/ui/dropdown-menu.js';
import { Switch } from '../components/ui/switch.js';

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

const CATEGORY_MAP = {
  work:     { color: '#1a73e8', label: 'Work Sync' },
  personal: { color: '#0f9d58', label: 'Client / Social' },
  customs:  { color: '#ea580c', label: 'Customs Deadline' },
  todo:     { color: 'var(--purple)', label: 'Scheduled Todo' },
} as const;

type Category = keyof typeof CATEGORY_MAP;

const formatISO = (d: Date) => d.toISOString().split('T')[0];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM – 8 PM

export const CalendarApp: React.FC = () => {
  const allEvents = useEvents();
  const allTodos = useTodos();
  const appSettings = useAppSettings();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const viewMode = appSettings.calendarDefaultView;
  function setViewMode(mode: ViewMode) { updateAppSettings({ calendarDefaultView: mode }); }

  const [activeCategories, setActiveCategories] = useState<Record<string, boolean>>({
    work: true, personal: true, customs: true, todo: true,
  });

  const [popover, setPopover] = useState<{ event: CalendarEvent; x: number; y: number } | null>(null);

  // ── Modal state ──────────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventTitle, setEventTitle]     = useState('');
  const [eventStart, setEventStart]     = useState('');
  const [eventEnd, setEventEnd]         = useState('');
  const [eventCategory, setEventCategory] = useState<Category>('work');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation]       = useState('');
  const [eventGuests, setEventGuests]           = useState<string[]>([]);
  const [guestInput, setGuestInput]             = useState('');
  const [draggingEventId, setDraggingEventId]   = useState<string | null>(null);

  function addGuest() {
    const v = guestInput.trim();
    if (v && !eventGuests.includes(v)) setEventGuests(g => [...g, v]);
    setGuestInput('');
  }
  function removeGuest(g: string) {
    setEventGuests(gs => gs.filter(x => x !== g));
  }

  const filteredEvents = allEvents.filter(e => activeCategories[e.category]);

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
      updateEvent(ev.id, { start: newStart, end: newEndStr });
      return;
    }

    const todoId = e.dataTransfer.getData('todoId');
    if (!todoId) return;

    const todo = allTodos.find(t => t.id === todoId);
    if (!todo) return;

    const hh = hourStr || '09:00';
    const [h, m] = hh.split(':').map(Number);
    const endH = String(h + 1).padStart(2, '0');

    addEvent({
      title: todo.title,
      start: `${dateStr}T${hh}`,
      end: `${dateStr}T${endH}:${String(m).padStart(2, '0')}`,
      category: 'todo',
      description: 'Imported from Todos',
    });

    // Optionally mark the dragged Todo as scheduled/completed
    updateTodo(todoId, { completed: true });
  }

  // ── Modal helpers ────────────────────────────────────────────
  function openCreate(dateStr?: string, hourStr?: string) {
    const hh   = hourStr || '09:00';
    const base = dateStr || formatISO(new Date());
    const [h, m] = hh.split(':').map(Number);
    const endH   = String(h + 1).padStart(2, '0');
    setEditingEvent(null);
    setEventTitle(''); setEventDescription(''); setEventLocation('');
    setEventCategory('work');
    setEventGuests([]); setGuestInput('');
    setEventStart(`${base}T${hh}`);
    setEventEnd(`${base}T${endH}:${String(m).padStart(2, '0')}`);
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
    setEventGuests(ev.guests || []); setGuestInput('');
    setShowModal(true);
  }

  function handleSave() {
    if (!eventTitle.trim() || !eventStart || !eventEnd) return;
    const payload = {
      title: eventTitle.trim(), start: eventStart, end: eventEnd,
      category: eventCategory,
      description: eventDescription.trim() || undefined,
      location:    eventLocation.trim()    || undefined,
      guests:      eventGuests.length > 0 ? eventGuests : undefined,
    };
    editingEvent ? updateEvent(editingEvent.id, payload) : addEvent(payload);
    setShowModal(false);
  }

  function handleDelete() {
    if (editingEvent) { deleteEvent(editingEvent.id); setShowModal(false); }
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

  // ── Toolbar label ─────────────────────────────────────────────
  let label = '';
  if (viewMode === 'month')  label = `${MONTH_NAMES[month]} ${year}`;
  else if (viewMode === 'week') label = `${MONTH_NAMES[startOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`;
  else if (viewMode === 'day')  label = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  else label = 'Agenda';

  const isMobile = useIsMobile();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* ── Top Toolbar ─────────────────────────────────────── */}
      <div style={{
        minHeight: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap',
        padding: isMobile ? '10px 12px' : '0 24px', background: 'var(--white)', borderBottom: '1px solid var(--border)', zIndex: 2,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex' }} onClick={handlePrev}><Icon name="chevronLeft"  size={18} /></button>
          <button onClick={handleToday} style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', margin: '0 8px', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Today</button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex' }} onClick={handleNext}><Icon name="chevronRight" size={18} /></button>
        </div>

        <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 500, color: 'var(--ink)', marginLeft: isMobile ? 0 : 16, order: isMobile ? 3 : 0, width: isMobile ? '100%' : 'auto' }}>{label}</span>

        {!isMobile && <div style={{ flex: 1 }} />}

        {/* Category filter — toggling was already fully wired (filteredEvents),
            it just had no control to actually drive it. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', order: isMobile ? 4 : 0, width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
          {(Object.keys(CATEGORY_MAP) as Category[]).map(cat => {
            const on = activeCategories[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                title={on ? `Hide ${CATEGORY_MAP[cat].label}` : `Show ${CATEGORY_MAP[cat].label}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none',
                  cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 6px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600,
                  color: on ? 'var(--ink2)' : 'var(--ink3)', opacity: on ? 1 : 0.5, whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: CATEGORY_MAP[cat].color, flexShrink: 0 }} />
                {!isMobile && CATEGORY_MAP[cat].label}
              </button>
            );
          })}
        </div>

        {/* View switcher */}
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 4, marginLeft: isMobile ? 'auto' : 0, overflowX: 'auto' }}>
          {(['month','week','day','agenda'] as const).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              style={{
                padding: isMobile ? '6px 10px' : '6px 16px', border: 'none', borderRadius: 'var(--r)',
                cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                background: viewMode === m ? 'var(--white)' : 'transparent',
                color:      viewMode === m ? 'var(--ink)'   : 'var(--ink2)',
                boxShadow:  viewMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {isMobile ? m.charAt(0).toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Calendar settings" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', marginLeft: 4 }}>
              <Icon name="settings" size={17} color="var(--ink3)" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-3 w-56">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Week starts Monday</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Applies to the week view</div>
              </div>
              <Switch checked={appSettings.weekStartsMonday} onCheckedChange={v => updateAppSettings({ weekStartsMonday: v })} />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
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
                  const cellEvents = filteredEvents.filter(e => e.start.startsWith(dateStr));
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
                        {cellEvents.map(ev => {
                          const cfg = CATEGORY_MAP[ev.category as Category] || { color: 'var(--purple)' };
                          return (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={e => handleEventDragStart(e, ev)}
                              onDragEnd={() => setDraggingEventId(null)}
                              onClick={e => openPopover(ev, e)}
                              title="Drag to reschedule"
                              style={{
                                fontSize: 12, fontWeight: 500, color: '#fff',
                                background: cfg.color, padding: '4px 8px', borderRadius: 6,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                cursor: 'grab', opacity: draggingEventId === ev.id ? 0.4 : 1,
                              }}
                            >
                              {ev.title}
                            </div>
                          );
                        })}
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
              <div style={{ position: 'relative', flex: 1 }}>
                {HOURS.map(hour => {
                  const displayHour = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                  return (
                    <div key={hour} style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', height: 80, borderBottom: '1px solid var(--border2)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'right', paddingRight: 10, paddingTop: 6, userSelect: 'none' }}>
                        {displayHour}
                      </div>
                      {weekDays.map((wd, i) => (
                        <div
                          key={i}
                          onDragOver={handleDragOver}
                          onDrop={e => handleDrop(e, formatISO(wd), `${String(hour).padStart(2,'0')}:00`)}
                          onClick={() => openCreate(formatISO(wd), `${String(hour).padStart(2,'0')}:00`)}
                          style={{ borderLeft: '1px solid var(--border2)', cursor: 'pointer', position: 'relative' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        />
                      ))}
                    </div>
                  );
                })}
                {/* Events overlay */}
                {filteredEvents.map(ev => {
                  const evDate    = new Date(ev.start);
                  const evEndDate = new Date(ev.end);
                  const dayIdx    = weekDays.findIndex(wd => formatISO(wd) === formatISO(evDate));
                  if (dayIdx === -1) return null;

                  const startH = evDate.getHours() + evDate.getMinutes() / 60;
                  const endH   = evEndDate.getHours() + evEndDate.getMinutes() / 60;
                  if (startH > 20 || endH < 8) return null;

                  const top    = (Math.max(8, startH) - 8) * 80;
                  const height = (Math.min(20, endH) - Math.max(8, startH)) * 80;
                  const cfg    = CATEGORY_MAP[ev.category as Category] || { color: 'var(--purple)' };
                  const left   = `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 4px)`;
                  const width  = `calc((100% - 60px) / 7 - 8px)`;

                  return (
                    <div
                      key={ev.id}
                      draggable
                      onDragStart={e => handleEventDragStart(e, ev)}
                      onDragEnd={() => setDraggingEventId(null)}
                      onClick={e => openPopover(ev, e)}
                      title="Drag to reschedule"
                      style={{
                        position: 'absolute', top: top + 2, left, width, height: height - 4,
                        background: cfg.color, borderRadius: 6, padding: '6px 8px',
                        fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'grab', zIndex: 10,
                        opacity: draggingEventId === ev.id ? 0.4 : 1,
                        overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      <div style={{ fontSize: 10, opacity: .9 }}>
                        {evDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </div>
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
              <div style={{ position: 'relative' }}>
                {HOURS.map(hour => {
                  const displayHour = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                  return (
                    <div key={hour} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', height: 80, borderBottom: '1px solid var(--border2)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'right', paddingRight: 10, paddingTop: 6, userSelect: 'none' }}>
                        {displayHour}
                      </div>
                      <div
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, formatISO(currentDate), `${String(hour).padStart(2,'0')}:00`)}
                        onClick={() => openCreate(formatISO(currentDate), `${String(hour).padStart(2,'0')}:00`)}
                        style={{ borderLeft: '1px solid var(--border2)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      />
                    </div>
                  );
                })}
                {filteredEvents
                  .filter(ev => ev.start.startsWith(formatISO(currentDate)))
                  .map(ev => {
                    const evDate    = new Date(ev.start);
                    const evEndDate = new Date(ev.end);
                    const startH    = evDate.getHours() + evDate.getMinutes() / 60;
                    const endH      = evEndDate.getHours() + evEndDate.getMinutes() / 60;
                    const top       = (Math.max(8, startH) - 8) * 80;
                    const height    = (Math.min(20, endH) - Math.max(8, startH)) * 80;
                    const cfg       = CATEGORY_MAP[ev.category as Category] || { color: 'var(--purple)' };
                    return (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={e => handleEventDragStart(e, ev)}
                        onDragEnd={() => setDraggingEventId(null)}
                        onClick={e => openPopover(ev, e)}
                        title="Drag to reschedule"
                        style={{
                          position: 'absolute', top: top + 2, left: 64, right: 16, height: height - 4,
                          background: cfg.color, borderRadius: 8, padding: '12px 16px',
                          fontSize: 14, color: '#fff', cursor: 'grab', zIndex: 10,
                          opacity: draggingEventId === ev.id ? 0.4 : 1,
                          display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{ev.title}</div>
                        {ev.description && <div style={{ fontSize: 12, opacity: .9 }}>{ev.description}</div>}
                        <div style={{ fontSize: 11, opacity: .8, marginTop: 4 }}>
                          {evDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {' – '}
                          {evEndDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
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
                    const cfg    = CATEGORY_MAP[ev.category as Category] || { color: 'var(--purple)' };
                    return (
                      <div
                        key={ev.id}
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
                          width: 56, height: 56, background: cfg.color + '18', borderRadius: 10, flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase' }}>
                            {evDate.toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                          <span style={{ fontSize: 20, fontWeight: 700, color: cfg.color }}>{evDate.getDate()}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
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
      
      {/* Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}>
          <div style={{ background: 'var(--white)', borderRadius: 16, width: 'min(440px, 92vw)', padding: isMobile ? 18 : 24, boxShadow: '0 12px 40px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{editingEvent ? 'Edit Event' : 'Create Event'}</h2>
              {editingEvent && (
                <button onClick={handleDelete} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Icon name="trash" size={18} /></button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input value={eventTitle} onChange={e => setEventTitle(e.target.value)} placeholder="Event title" style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                <input type="datetime-local" value={eventStart} onChange={e => setEventStart(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }} />
                <input type="datetime-local" value={eventEnd} onChange={e => setEventEnd(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }} />
              </div>
              <textarea value={eventDescription} onChange={e => setEventDescription(e.target.value)} placeholder="Description" rows={3} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, resize: 'none' }} />
              <div>
                <input
                  value={guestInput}
                  onChange={e => setGuestInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addGuest(); } }}
                  onBlur={addGuest}
                  placeholder="Add guest email, press Enter"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
                />
                {eventGuests.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {eventGuests.map(g => (
                      <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, padding: '4px 6px 4px 10px', borderRadius: 20, background: 'var(--bg)', color: 'var(--ink2)' }}>
                        {g}
                        <button type="button" onClick={() => removeGuest(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 2 }}>
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: 'var(--ds-btn-py) 18px', border: '1px solid var(--border)', background: 'transparent', borderRadius: 'var(--r)', cursor: 'pointer', fontWeight: 500, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
                <button onClick={handleSave} style={{ padding: 'var(--ds-btn-py) 18px', border: 'none', background: 'var(--teal)', color: '#fff', borderRadius: 'var(--r)', cursor: 'pointer', fontWeight: 600, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid var(--border)'
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
              {ev.description && <div style={{ fontSize: 13, color: 'var(--ink2)', marginLeft: 24, marginBottom: 12 }}>{ev.description}</div>}
              {ev.guests && ev.guests.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginLeft: 24, marginBottom: 12, fontSize: 12.5, color: 'var(--ink3)' }}>
                  <Icon name="users" size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{ev.guests.join(', ')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => openEdit(ev)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>Edit</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};
