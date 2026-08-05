import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyCalendar, useComplyAgencyDirectory } from '../hooks/useComply.js';
import { apiFetch } from '../lib/api.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const COLOR_LABELS: Record<string, string> = {
  green: 'Renewal / Certificate Issued',
  blue:  'Obligation Due',
  amber: 'Reminder / Approaching',
  red:   'Urgent / Overdue',
};

const NONE_AGENCY = '__none__';
const REMINDER_STEPS = ['What', 'When'];

export function ComplyCalendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { events, deleteReminder } = useComplyCalendar(year, month);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const firstDow  = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const prevDays  = new Date(year, month, 0).getDate();

  const cells: { day: number; thisMonth: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, thisMonth: false });
  for (let d = 1; d <= daysCount; d++) cells.push({ day: d, thisMonth: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysCount - firstDow + 1, thisMonth: false });

  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const dayStr = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const eventsForDay = (d: number) => events.filter(e => e.date === dayStr(d));

  const upcoming = events
    .map(e => ({ ...e, daysLeft: Math.ceil((new Date(e.date).getTime() - Date.now()) / 86400000) }))
    .filter(e => e.daysLeft >= -7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8);

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Compliance Calendar']}
        titlePlain="Compliance"
        titleEm="calendar"
        subtitle="Renewal windows, filing deadlines, and penalty dates"
      />
      <div className="comply-page-hdr">
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="comply-btn-secondary" onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}>
            Today
          </button>
          <button type="button" className="comply-btn-primary" onClick={() => navigate('/complyos/calendar/new-reminder')}>
            <Icon name="plus" size={14} /> Add Reminder
          </button>
        </div>
      </div>

      <div className="comply-cal-grid">
        {/* Calendar */}
        <div>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={prevMonth}>
              <Icon name="chevronLeft" size={13} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
              {MONTHS[month]} {year}
            </span>
            <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={nextMonth}>
              <Icon name="chevronRight" size={13} />
            </button>
          </div>

          <div className="comply-month-grid">
            {DAYS.map(d => (
              <div key={d} className="comply-month-day-header">{d}</div>
            ))}
            {cells.map((cell, i) => (
              <div key={i} className={`comply-month-day${!cell.thisMonth ? ' comply-month-day--other' : ''}${cell.thisMonth && isToday(cell.day) ? ' comply-month-day--today' : ''}`}>
                <div className="comply-day-num">{cell.day}</div>
                {cell.thisMonth && eventsForDay(cell.day).map((ev, j) => (
                  <div key={j} className={`comply-cal-event comply-cal-event--${ev.severity}`} title={`${ev.title}${ev.agency_code ? ' — ' + ev.agency_code : ''}`}>
                    {ev.agency_code ?? ev.title}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
            {Object.entries(COLOR_LABELS).map(([c, label]) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)' }}>
                <span className={`comply-cal-event comply-cal-event--${c}`} style={{ padding: '1px 7px', margin: 0 }}>&nbsp;</span>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming deadlines panel */}
        <div>
          <div className="comply-card">
            <div className="comply-card-hdr">
              <h3 className="comply-card-title">Upcoming Deadlines</h3>
            </div>
            <div className="comply-deadline-list">
              {upcoming.length === 0 && (
                <div className="comply-empty" style={{ padding: '20px 16px' }}>No upcoming deadlines this month.</div>
              )}
              {upcoming.map(d => (
                <div key={`${d.source}-${d.source_id}`} className="comply-deadline-row">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.severity === 'green' ? 'var(--comply)' : d.severity === 'blue' ? 'var(--gov)' : d.severity === 'amber' ? 'var(--legal)' : 'var(--red)', flexShrink: 0 }} />
                  <div className="comply-deadline-info">
                    <div className="comply-deadline-name">{d.title}</div>
                    <div className="comply-deadline-agency">{d.agency_code ?? '—'} · {d.date}</div>
                  </div>
                  <div className={`comply-deadline-days comply-deadline-days--${d.daysLeft <= 3 ? 'urgent' : d.daysLeft <= 30 ? 'soon' : 'ok'}`}>
                    {d.daysLeft <= 0 ? 'Overdue' : d.daysLeft === 1 ? 'Tomorrow' : `${d.daysLeft}d`}
                  </div>
                  {d.source === 'reminder' && (
                    <button type="button" title="Delete reminder" onClick={() => deleteReminder(d.source_id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, marginLeft: 2, flexShrink: 0 }}>
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Add Reminder page ────────────────────────────────────────────────────────

export function AddReminderPage() {
  const navigate = useNavigate();
  const { agencies } = useComplyAgencyDirectory();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [agencyCode, setAgencyCode] = useState(NONE_AGENCY);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!date) { setError('Please pick a date.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/comply/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          agency_code: agencyCode === NONE_AGENCY ? undefined : agencyCode,
          remind_date: toDateOnlyString(date),
          notes: notes.trim() || undefined,
        }),
      });
      navigate('/complyos/calendar');
    } catch (e: any) {
      setError(e.message || 'Could not save reminder.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ComplyWizardPage
      title="Add Reminder"
      steps={REMINDER_STEPS}
      step={step}
      backTo="/complyos/calendar"
      busy={saving}
      onBack={() => setStep(0)}
      nextDisabled={step === 0 && !title.trim()}
      nextLabel={step === 1 ? (saving ? 'Saving…' : 'Save Reminder') : undefined}
      onNext={() => { if (step === 0) setStep(1); else handleSave(); }}
    >
      {step === 0 && (
        <>
          <WizardField label="Title">
            <input className="input-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Renew TBS conformity certificate" autoFocus />
          </WizardField>
          <WizardField label="Agency (optional)">
            <Select value={agencyCode} onValueChange={setAgencyCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_AGENCY}>None</SelectItem>
                {agencies.map(a => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
        </>
      )}
      {step === 1 && (
        <>
          <WizardField label="Date">
            <DatePicker date={date} onChange={setDate} />
          </WizardField>
          <WizardField label="Notes (optional)">
            <textarea className="input-field" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </WizardField>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </>
      )}
    </ComplyWizardPage>
  );
}
