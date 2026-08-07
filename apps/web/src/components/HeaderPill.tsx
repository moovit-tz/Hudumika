import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';

/**
 * The header's resting state: one unread notification at a time, swapped on a
 * timer, in the space the search box used to occupy on its own.
 *
 * It rotates rather than scrolls. A continuous marquee is the obvious reading
 * of "ticker", but horizontally moving text is genuinely hard to read — the
 * eye cannot track it — and it cannot be scanned. Showing one item at a time
 * and swapping it keeps every frame readable, and matches the reference
 * design, which is a single pill rather than a scroll.
 *
 * Search is not replaced: the magnifier on the left expands this back into the
 * full search box, and so does pressing "/". The pill only appears when there
 * is something unread to show, so a quiet workspace still gets a plain search
 * box rather than an empty ornament.
 */

export interface PillItem {
  id: string;
  title: string;
  message?: string | null;
  link?: string | null;
  app?: string | null;
  /** Announcements choose their own word — NEW, MAINTENANCE, RELEASE. A
   *  notification has no author to choose one, so it falls back to NEW. */
  badge?: string | null;
  kind?: 'announcement' | 'notification';
  created_at?: string;
}

interface Props {
  items: PillItem[];
  /** Navigate to the item and mark it read. */
  onOpen: (item: PillItem) => void;
  /** Mark read without navigating — the × on the right. */
  onDismiss: (item: PillItem) => void;
  /** Hand the space back to the search box. */
  onExpandSearch: () => void;
}

const ROTATE_MS = 5000;

/** Live, not read once: someone can turn reduced motion on mid-session, and a
 *  component that only checked at mount would keep animating at them. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export const HeaderPill: React.FC<Props> = ({ items, onOpen, onDismiss, onExpandSearch }) => {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  /** The explicit pause control. WCAG 2.2.2 wants a way to stop moving content
   *  that does not depend on hovering — keyboard and touch users have none. */
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const reducedMotion = usePrefersReducedMotion();
  const liveRef = useRef<HTMLDivElement>(null);

  // Fewer items than before (something was read elsewhere) must not leave the
  // index pointing past the end.
  useEffect(() => { setIndex(i => (items.length === 0 ? 0 : i % items.length)); }, [items.length]);

  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Reduced motion stops the rotation outright rather than merely shortening
  // it: the request is "don't move things at me", and a slower carousel is
  // still a carousel. The arrows below remain, so nothing becomes unreachable.
  const frozen = reducedMotion || paused || hovered || focused || tabHidden || items.length < 2;

  useEffect(() => {
    if (frozen) return;
    const t = setInterval(() => setIndex(i => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [frozen, items.length]);

  const go = useCallback((delta: number) => {
    setIndex(i => (i + delta + items.length) % items.length);
  }, [items.length]);

  if (items.length === 0) return null;
  const item = items[Math.min(index, items.length - 1)];
  if (!item) return null;

  const showControls = items.length > 1;

  return (
    <div
      className="app-header-pill desktop-search"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      {/* Search is one click away, in the place the magnifier has always been. */}
      <button
        type="button"
        className="app-header-pill-search"
        onClick={onExpandSearch}
        title="Search (/)"
        aria-label="Search"
      >
        <Icon name="search" size={15} />
      </button>

      {/*
        aria-live is deliberately off. The rotation is decorative repetition of
        things already listed in the notification centre, and announcing every
        five seconds would talk over whatever the user is actually doing. The
        bell, with its count, is the accessible surface.
      */}
      <button
        // Keyed so React replaces the node on every swap, which restarts the
        // enter animation. Without it the text would change with no transition.
        key={item.id}
        type="button"
        className="app-header-pill-body"
        onClick={() => onOpen(item)}
        title={item.message ? `${item.title} — ${item.message}` : item.title}
      >
        <span className="app-header-pill-badge">{item.badge || 'NEW'}</span>
        <span className="app-header-pill-title">{item.title}</span>
        {item.message && <span className="app-header-pill-sub">{item.message}</span>}
      </button>

      <div ref={liveRef} className="app-header-pill-controls">
        {showControls && (
          <>
            <span className="app-header-pill-count">{index + 1}/{items.length}</span>
            <button
              type="button"
              className="app-header-pill-icon"
              onClick={() => setPaused(p => !p)}
              title={paused ? 'Resume' : 'Pause'}
              aria-pressed={paused}
            >
              <Icon name={paused ? 'play' : 'pause'} size={12} />
            </button>
            <button type="button" className="app-header-pill-icon" onClick={() => go(-1)} title="Previous" aria-label="Previous notification">
              <Icon name="chevronLeft" size={13} />
            </button>
            <button type="button" className="app-header-pill-icon" onClick={() => go(1)} title="Next" aria-label="Next notification">
              <Icon name="chevronRight" size={13} />
            </button>
          </>
        )}
        <button
          type="button"
          className="app-header-pill-icon"
          onClick={() => onDismiss(item)}
          title="Dismiss"
          aria-label="Dismiss notification"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
};
