import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import { useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { LAUNCHER_APPS, LauncherAppSvg, INTERNAL_APP_IDS } from './LauncherApps.js';
import { useAuth } from '../hooks/useAuth.js';
import './AppLauncher.css';

interface AppLauncherProps {
  renderTrigger?: (opts: { open: boolean; onClick: () => void }) => React.ReactNode;
}

export function AppLauncher({ renderTrigger }: AppLauncherProps) {
  const branding = useBranding();
  const { t } = useLocale();
  const enabledApps = useEnabledApps();

  const [launcherOpen, setLauncherOpen] = useState(false);
  const { user } = useAuth();
  const canSeeInternal = user?.role === 'SUPER_ADMIN';

  const [editMode, setEditMode] = useState(false);
  const [appOrder, setAppOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hudumika_launcher_order');
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return LAUNCHER_APPS.map(a => a.id);
  });
  const dragItemId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [recentApps, setRecentApps] = useState<(typeof LAUNCHER_APPS)[0][]>([]);

  // The app list is taller than any laptop viewport, so it has to scroll. Left
  // unmarked, the row the scroll edge cuts through looks like the footer card
  // is painting over it. `moreBelow` drives a fade on the bottom edge — but it
  // has to switch off once you reach the end, or the fade eats the last row,
  // which is why this is measured rather than a static CSS mask.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!launcherOpen || !el) return;
    const measure = () => setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // The tile count changes with entitlements and role, and the panel is
    // capped to the viewport — both change whether anything is below the fold.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [launcherOpen, recentApps.length]);

  useEffect(() => {
    if (!launcherOpen) return;
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('hudumika_recently_viewed') ?? '[]');
      setRecentApps(
        ids.slice(0, 4)
          .map(id => LAUNCHER_APPS.find(a => a.id === id))
          .filter((a): a is (typeof LAUNCHER_APPS)[0] => Boolean(a))
          .filter(a => isAppEnabled(a.id, enabledApps))
          .filter(a => canSeeInternal || !INTERNAL_APP_IDS.has(a.id))
      );
    } catch { setRecentApps([]); }
  }, [launcherOpen, enabledApps]);

  const orderedApps = useMemo(() => {
    const ordered = appOrder
      .map(id => LAUNCHER_APPS.find(a => a.id === id))
      .filter((a): a is (typeof LAUNCHER_APPS)[0] => Boolean(a));
    const extras = LAUNCHER_APPS.filter(a => !appOrder.includes(a.id));
    return [...ordered, ...extras]
      .filter(a => isAppEnabled(a.id, enabledApps))
      // Internal tooling is not entitlement-gated — a tenant could be granted
      // every feature and must still never see it. Role is the gate.
      .filter(a => canSeeInternal || !INTERNAL_APP_IDS.has(a.id));
  }, [appOrder, enabledApps]);

  function closeLauncher() { setLauncherOpen(false); setEditMode(false); }

  function handleDragStart(e: React.DragEvent, id: string) {
    dragItemId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragItemId.current !== id) setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const fromId = dragItemId.current;
    if (!fromId || fromId === targetId) { setDragOverId(null); return; }
    setAppOrder(prev => {
      const base = LAUNCHER_APPS.map(a => a.id);
      const next = [...new Set([...prev, ...base])];
      const fi = next.indexOf(fromId);
      const ti = next.indexOf(targetId);
      if (fi === -1 || ti === -1) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, fromId);
      localStorage.setItem('hudumika_launcher_order', JSON.stringify(next));
      return next;
    });
    setDragOverId(null);
    dragItemId.current = null;
  }

  function handleDragEnd() { setDragOverId(null); dragItemId.current = null; }

  const trigger = renderTrigger
    ? renderTrigger({ open: launcherOpen, onClick: () => setLauncherOpen(d => !d) })
    : (
      <button
        type="button"
        className={`app-header-icon-btn${launcherOpen ? ' app-header-icon-btn--open' : ''}`}
        onClick={() => setLauncherOpen(d => !d)}
        title={t('header.allApps')}
      >
        <Icon name="grid" size={17} />
      </button>
    );

  /**
   * The overlay is portalled to document.body, not rendered where the trigger
   * sits.
   *
   * Its `z-index: 1001` was fiction. The panel lives inside <header
   * class="app-header">, which is `position: relative; z-index: 10` — a
   * stacking context — so 1001 only ordered the panel *within the header*, and
   * the header as a whole competed against the page at 10. `.cust-header`, the
   * sticky company row in the ClearOS list, is also z-index 10 and comes later
   * in the DOM, so it won the tie and painted its risk badges straight over the
   * open launcher.
   *
   * Raising one number or lowering the other would only move the collision to
   * the next element that declares a z-index. Out here in the root stacking
   * context 1001 means what it says, which is also how every Radix overlay in
   * this app already behaves.
   */
  const overlay = (
    <>
      {launcherOpen && (
        <div className="app-lnch-backdrop" onClick={closeLauncher} />
      )}

      <div className={`app-lnch-panel${launcherOpen ? ' app-lnch-panel--open' : ''}`}>
        {/* Header matching Adobe Web Apps Launcher */}
        <div className="app-lnch-panel-hdr">
          <span className="app-lnch-panel-title">Web Apps</span>
          <div className="app-lnch-panel-hdr-btns">
            <button
              type="button"
              className={`app-lnch-edit-toggle${editMode ? ' app-lnch-edit-toggle--active' : ''}`}
              onClick={() => setEditMode(m => !m)}
              title={editMode ? t('launcher.done') : t('launcher.rearrange')}
            >
              {editMode ? (
                <span>{t('launcher.done')}</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
            </button>
            <button type="button" className="app-lnch-panel-close" onClick={closeLauncher} title={t('launcher.close')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {editMode && (
          <p className="app-lnch-edit-hint">{t('launcher.dragHint')}</p>
        )}

        <div className="app-lnch-panel-scroll" ref={scrollRef} data-more-below={moreBelow || undefined}>
          {/* Recently viewed */}
          {recentApps.length > 0 && !editMode && (
            <>
              <p className="app-lnch-section-label">{t('launcher.recentlyViewed')}</p>
              <div className="app-lnch-recent-row">
                {recentApps.map(app => (
                  <Link
                    key={app.id}
                    to={app.path}
                    className="app-lnch-panel-item app-lnch-panel-item--recent"
                    onClick={() => closeLauncher()}
                  >
                    <LauncherAppSvg id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={42} />
                    <span className="app-lnch-panel-name">{branding.getAppName(app.id, app.name)}</span>
                  </Link>
                ))}
              </div>
              <div className="app-lnch-section-divider" />
            </>
          )}

          {/* 3-Column Apps Grid */}
          <div className={`app-lnch-panel-grid${editMode ? ' app-lnch-panel-grid--edit' : ''}`}>
            {orderedApps.map(app => (
              <Link
                key={app.id}
                to={app.path}
                className={`app-lnch-panel-item${dragOverId === app.id ? ' app-lnch-panel-item--over' : ''}`}
                draggable={editMode}
                onDragStart={editMode ? e => handleDragStart(e, app.id) : undefined}
                onDragOver={editMode ? e => handleDragOver(e, app.id) : undefined}
                onDrop={editMode ? e => handleDrop(e, app.id) : undefined}
                onDragEnd={editMode ? handleDragEnd : undefined}
                onClick={e => { if (editMode) { e.preventDefault(); return; } closeLauncher(); }}
              >
                <LauncherAppSvg id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={46} />
                <span className="app-lnch-panel-name">{branding.getAppName(app.id, app.name)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Adobe-Style Bottom Card Footer */}
        <div className="app-lnch-adobe-footer-card">
          <Link to="/" className="app-lnch-adobe-footer-item" onClick={closeLauncher}>
            <div className="app-lnch-adobe-brand-icon">
              <img src={branding.favicon || branding.logoLight || '/favicon.png'} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />
            </div>
            <span className="app-lnch-adobe-footer-label">hudumika.tz</span>
          </Link>

          <div className="app-lnch-adobe-footer-divider" />

          <Link to="/" className="app-lnch-adobe-footer-item" onClick={closeLauncher}>
            <Icon name="grid" size={17} style={{ color: 'var(--ink2)' }} />
            <span className="app-lnch-adobe-footer-label">All apps</span>
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <>
      {trigger}
      {createPortal(overlay, document.body)}
    </>
  );
}
