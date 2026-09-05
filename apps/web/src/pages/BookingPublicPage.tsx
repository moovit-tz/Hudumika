import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageLoading } from '../components/ui/spinner.js';

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
          <PageLoading />
        )}

        {page === null && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>This booking page isn't available</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink3)' }}>The link may be incorrect, or the page has been turned off.</div>
          </div>
        )}

        {page_ && !confirmed && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', minHeight: 480 }}>
            {/* Left Column: Host & Event Details */}
            <div style={{ padding: '32px 28px', borderRight: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>
                  {page_.hostName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{page_.hostName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Verified Host</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{page_.title}</div>
                {page_.description && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.5 }}>{page_.description}</div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
                  <Icon name="clock" size={15} color="var(--teal)" />
                  <span>{page_.durationMinutes} minutes</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
                  <Icon name="video" size={15} color="var(--teal)" />
                  <span>Bliss WebRTC Video Link</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
                  <Icon name="globe" size={15} color="var(--ink3)" />
                  <span>{page_.timezone}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Date & Slot Picker */}
            <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--white)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))}
                  disabled={formatISODate(selectedDate) <= formatISODate(new Date())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: 'var(--ink3)', opacity: formatISODate(selectedDate) <= formatISODate(new Date()) ? 0.3 : 1 }}
                >
                  <Icon name="chevronLeft" size={18} />
                </button>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <button type="button" onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: 'var(--ink3)' }}>
                  <Icon name="chevronRight" size={18} />
                </button>
              </div>

              {!page_.workingDays.includes(selectedDate.getDay()) && (
                <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '32px 0' }}>
                  Not available on {WEEKDAY_SHORT[selectedDate.getDay()]}s — pick another day above.
                </div>
              )}

              {page_.workingDays.includes(selectedDate.getDay()) && (
                <>
                  {slotsLoading && <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '32px 0' }}>Checking slot availability…</div>}
                  {!slotsLoading && slots && slots.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '32px 0' }}>No open time slots on this day.</div>
                  )}
                  {!slotsLoading && slots && slots.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                      {slots.map(s => {
                        const d = new Date(s);
                        const sel = selectedSlot === s;
                        return (
                          <button
                            key={s} type="button" onClick={() => setSelectedSlot(s)}
                            style={{
                              padding: '10px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              border: `1px solid ${sel ? 'var(--teal)' : 'var(--border)'}`,
                              background: sel ? 'var(--teal)' : 'var(--white)', color: sel ? '#ffffff' : 'var(--ink)',
                              transition: 'all 0.15s ease', boxShadow: sel ? '0 2px 8px rgba(13,148,136,0.25)' : 'none',
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="checkCircle" size={15} color="var(--teal)" />
                    <span>{new Date(selectedSlot).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }} />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Your email address" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }} />
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Share anything that will help prepare for our meeting (optional)" rows={2} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5, resize: 'none' }} />
                  {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
                  <button
                    type="button" onClick={handleBook} disabled={submitting || !name.trim() || !email.trim()}
                    style={{
                      padding: '12px 20px', border: 'none', borderRadius: 10, cursor: submitting ? 'default' : 'pointer',
                      fontWeight: 700, fontSize: 14, background: 'var(--teal)', color: '#ffffff',
                      opacity: (submitting || !name.trim() || !email.trim()) ? 0.6 : 1, transition: 'all 0.15s ease',
                      boxShadow: '0 2px 8px rgba(13,148,136,0.3)',
                    }}
                  >
                    {submitting ? 'Confirming Booking…' : 'Confirm Meeting Booking'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {page_ && confirmed && (
          <div style={{ padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Icon name="check" size={26} color="var(--green)" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>You're all scheduled!</div>
            <div style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <strong>{page_.title}</strong> with {page_.hostName}<br />
              <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{new Date(confirmed.start).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 16 }}>A calendar invitation with Bliss video link has been sent to <strong>{email}</strong>.</div>
          </div>
        )}
      </div>
    </div>
  );
}
