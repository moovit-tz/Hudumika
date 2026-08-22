import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';

interface PublicBookingPage {
  id: string; title: string; description: string | null; hostName: string;
  durationMinutes: number; bufferMinutes: number; workingDays: number[];
  workingStartTime: string; workingEndTime: string; timezone: string; bookingWindowDays: number;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Public, unauthenticated scheduling page — reachable at /book/:slug with
 *  no Hudumika account, the same way sign/public/:token and site/:tenantSlug
 *  work (see App.tsx). Resolves everything through the tenant-less
 *  booking-public API (booking.routes.ts), which looks up the owning tenant
 *  from the slug server-side. */
export function BookingPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicBookingPage | null | undefined>(undefined); // undefined = loading, null = not found
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ start: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/v1/booking-public/${slug}`).then(res => setPage(res.data)).catch(() => setPage(null));
  }, [slug]);

  useEffect(() => {
    if (!slug || !page) return;
    setSlotsLoading(true);
    setSlots(null);
    setSelectedSlot(null);
    apiFetch(`/v1/booking-public/${slug}/slots?date=${formatISODate(selectedDate)}`)
      .then(res => setSlots(res.data || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [slug, page, selectedDate]);

  async function handleBook() {
    if (!slug || !selectedSlot || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/booking-public/${slug}`, {
        method: 'POST',
        body: JSON.stringify({ slotStart: selectedSlot, name: name.trim(), email: email.trim(), notes: notes.trim() || undefined }),
      });
      setConfirmed({ start: res.data.start });
    } catch (err: any) {
      setError(err?.message || 'That slot is no longer available — pick another.');
      setSelectedSlot(null);
      // Re-fetch so the just-taken slot disappears from the list.
      apiFetch(`/v1/booking-public/${slug}/slots?date=${formatISODate(selectedDate)}`).then(res => setSlots(res.data || [])).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  const page_ = page; // narrow for TS below

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', boxSizing: 'border-box' }}>
      <div style={{ width: 'min(720px, 100%)', background: 'var(--white)', borderRadius: 16, boxShadow: 'var(--elev-lg)', overflow: 'hidden' }}>
        {page === undefined && (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>
        )}

        {page === null && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>This booking page isn't available</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink3)' }}>The link may be incorrect, or the page has been turned off.</div>
          </div>
        )}

        {page_ && !confirmed && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{page_.hostName}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{page_.title}</div>
              {page_.description && <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.5 }}>{page_.description}</div>}
              <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12.5, color: 'var(--ink3)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={13} /> {page_.durationMinutes} min</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="globe" size={13} /> {page_.timezone}</span>
              </div>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))}
                  disabled={formatISODate(selectedDate) <= formatISODate(new Date())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: 'var(--ink3)', opacity: formatISODate(selectedDate) <= formatISODate(new Date()) ? 0.3 : 1 }}
                >
                  <Icon name="chevronLeft" size={16} />
                </button>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <button type="button" onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: 'var(--ink3)' }}>
                  <Icon name="chevronRight" size={16} />
                </button>
              </div>

              {!page_.workingDays.includes(selectedDate.getDay()) && (
                <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '20px 0' }}>
                  Not available on {WEEKDAY_SHORT[selectedDate.getDay()]}s — try another day.
                </div>
              )}

              {page_.workingDays.includes(selectedDate.getDay()) && (
                <>
                  {slotsLoading && <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '20px 0' }}>Loading times…</div>}
                  {!slotsLoading && slots && slots.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '20px 0' }}>No open times this day — try another.</div>
                  )}
                  {!slotsLoading && slots && slots.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                      {slots.map(s => {
                        const d = new Date(s);
                        const sel = selectedSlot === s;
                        return (
                          <button
                            key={s} type="button" onClick={() => setSelectedSlot(s)}
                            style={{
                              padding: '9px 6px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              border: `1px solid ${sel ? 'var(--teal)' : 'var(--border)'}`,
                              background: sel ? 'var(--teal)' : 'var(--white)', color: sel ? '#fff' : 'var(--ink)',
                            }}
                          >
                            {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {selectedSlot && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {new Date(selectedSlot).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }} />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Your email" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }} />
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything you'd like to share (optional)" rows={2} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5, resize: 'none' }} />
                  {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
                  <button
                    type="button" onClick={handleBook} disabled={submitting || !name.trim() || !email.trim()}
                    style={{
                      padding: '11px 18px', border: 'none', borderRadius: 10, cursor: submitting ? 'default' : 'pointer',
                      fontWeight: 600, fontSize: 14, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
                      opacity: (submitting || !name.trim() || !email.trim()) ? 0.6 : 1,
                    }}
                  >
                    {submitting ? 'Booking…' : 'Confirm booking'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {page_ && confirmed && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="check" size={22} color="var(--green)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>You're booked!</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>
              {page_.title} with {page_.hostName}<br />
              {new Date(confirmed.start).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 12 }}>A confirmation has been sent to {email}.</div>
          </div>
        )}
      </div>
    </div>
  );
}
