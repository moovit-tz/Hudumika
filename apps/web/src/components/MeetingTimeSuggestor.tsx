import React, { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
import { Icon } from './Icon.js';
import { Checkbox } from './ui/checkbox.js';
import { Button } from './ui/button.js';
import {
  ensureMeetingBookingPage, suggestUpcomingSlots, formatSlotRange, timezoneLabel,
  buildMeetingSuggestionText, type MeetingDaySlots, type MeetingBookingPage,
} from '../lib/meetingSuggest.js';
import './MeetingTimeSuggestor.css';

/** "Suggest a time" — the calendar-plus button in a reply/compose toolbar
 *  that offers real open slots from the sender's own calendar (via a real
 *  booking page, same one Calendar → Booking Pages manages) plus the real,
 *  clickable link for the recipient to self-schedule one. Only ever reflects
 *  the SENDER's calendar — there's no way to see an external recipient's,
 *  the same limit every mail client with this feature has. */
export function MeetingTimeSuggestor({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<MeetingBookingPage | null>(null);
  const [days, setDays] = useState<MeetingDaySlots[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const pg = await ensureMeetingBookingPage();
      setPage(pg);
      const found = await suggestUpcomingSlots(pg);
      setDays(found);
      setExcluded(new Set());
      if (found.length === 0) setError("No open slots in the next two weeks — check Calendar for what's booked.");
    } catch (err: any) {
      setError(err?.message || 'Could not load your availability.');
    } finally {
      setLoading(false);
    }
  }

  function toggle(key: string) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function insert() {
    if (!page) return;
    const chosen = days
      .map(d => ({ ...d, slots: d.slots.filter(s => !excluded.has(s.start)) }))
      .filter(d => d.slots.length > 0);
    if (chosen.length === 0) return;
    const url = `${window.location.origin}/book/${page.slug}`;
    onInsert(buildMeetingSuggestionText(chosen, url, page.timezone));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o && days.length === 0 && !loading) load(); }}>
      {/* Not wrapped in Tip: nesting it around another Radix Trigger's own
          `asChild` (rather than a plain element) is an untested composition
          in this codebase — see EmailApp.tsx's DropdownMenuTrigger buttons
          for the same reasoning. A native title is the safe equivalent. */}
      <PopoverTrigger asChild>
        <button type="button" className="em-icon-btn em-icon-btn--ghost" aria-label="Suggest a meeting time" title="Suggest a time">
          <Icon name="calendar" size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="mts-panel">
        {page && <div className="mts-tz">{timezoneLabel(page.timezone)}</div>}
        {loading ? (
          <div className="mts-loading"><Icon name="refresh" size={14} /> Checking your calendar…</div>
        ) : error ? (
          <div className="mts-error">{error}</div>
        ) : (
          <>
            {days.map(day => (
              <div key={day.date} className="mts-day">
                <div className="mts-day-label">{day.label}</div>
                <div className="mts-slots">
                  {day.slots.map(slot => (
                    <label key={slot.start} className="mts-slot">
                      <Checkbox checked={!excluded.has(slot.start)} onCheckedChange={() => toggle(slot.start)} />
                      <span>{formatSlotRange(slot, page?.timezone)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p className="mts-hint">
              Adds these times plus a link the recipient can use to book one directly on your calendar.
            </p>
            <Button size="sm" onClick={insert} disabled={days.length === 0}>Insert into message</Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
