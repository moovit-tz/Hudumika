import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon.js';
import { useBranding } from '../hooks/useBranding.js';
import { LauncherAppSvg } from './LauncherApps.js';
import { useLocale } from '../hooks/useLocale.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { LAUNCHER_APPS, INTERNAL_APP_IDS } from './LauncherApps.js';
import { useAuth } from '../hooks/useAuth.js';
import { getRecentApps, recordRecentApp } from '../lib/recentApps.js';
import './AppLauncher.css';

export const LAUNCHER_APP_META: Record<string, { icon: IconName; color: string; label?: string }> = {
  calendar:     { icon: 'calendar',      color: '#059669', label: 'Calendar' },
  email:        { icon: 'mail',          color: '#16a34a', label: 'Email' },
  chat:         { icon: 'message',       color: '#334155', label: 'Chat' },
  tasks:        { icon: 'clipboardList', color: '#d97706', label: 'To Do' },
  cloud:        { icon: 'folder',        color: '#dc2626', label: 'Files' },
  notes:        { icon: 'fileText',      color: '#475569', label: 'Notes' },
  crm:          { icon: 'phone',         color: '#d97706', label: 'Call' },
  contacts:     { icon: 'contact',       color: '#1a73e8', label: 'Contacts' },
  finops:       { icon: 'invoice',       color: '#059669', label: 'Invoices' },
  petti:        { icon: 'wallet',        color: '#16a34a', label: 'Petti' },
  bliss:        { icon: 'ticket',        color: '#b91c1c', label: 'Tickets' },
  clearos:      { icon: 'ship',          color: '#ea580c', label: 'ClearOS' },
  complyos:     { icon: 'shield',        color: '#059669', label: 'ComplyOS' },
  nexushr:      { icon: 'users',         color: '#0d9488', label: 'NexusHR' },
  seal:         { icon: 'shield',        color: '#0f766e', label: 'SEAL' },
  sign:         { icon: 'edit',          color: '#2563eb', label: 'eSign' },
  store:        { icon: 'shoppingCart',  color: '#8b5cf6', label: 'Store' },
  studio:       { icon: 'zap',           color: '#4361ee', label: 'Studio' },
  sms:          { icon: 'message',       color: '#1257c6', label: 'SMS' },
  projects:     { icon: 'columns',       color: '#f59e0b', label: 'Projects' },
  developer:    { icon: 'terminal',      color: '#0f766e', label: 'Developer' },
  hudubi:       { icon: 'barChart',      color: '#18181b', label: 'HuduBI' },
  onesite:      { icon: 'globe',         color: '#06b6d4', label: 'CMS' },
  onsite:       { icon: 'server',        color: '#0f172a', label: 'Onsite' },
  tracking:     { icon: 'truck',         color: '#0891b2', label: 'Tracking' },
  cargotracker: { icon: 'package',       color: '#4f46e5', label: 'Cargo' },
  ondi:         { icon: 'userCheck',     color: '#4253d1', label: 'Account' },
  workspace:    { icon: 'settings',      color: '#64748b', label: 'Settings' },
  lens:         { icon: 'eye',           color: '#475569', label: 'Lens' },
};

interface AppLauncherProps {
  renderTrigger?: (opts: { open: boolean; onClick: () => void }) => React.ReactNode;
  variant?: 'icon' | 'pill';
}

export function AppLauncher({ renderTrigger, variant = 'icon' }: AppLauncherProps) {
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

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    if (!launcherOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLauncherOpen(false); setEditMode(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launcherOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!launcherOpen || !el) return;
    const measure = () => setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
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
    const ids = getRecentApps(); // no fallback — only genuinely visited apps
    const allowed = LAUNCHER_APPS
      .filter(a => isAppEnabled(a.id, enabledApps))
      .filter(a => canSeeInternal || !INTERNAL_APP_IDS.has(a.id));

    const fromRecent = ids
      .map(id => allowed.find(a => a.id === id))
      .filter((a): a is (typeof LAUNCHER_APPS)[0] => Boolean(a));

    setRecentApps(fromRecent.slice(0, 4));
  }, [launcherOpen, enabledApps, canSeeInternal]);

  const orderedApps = useMemo(() => {
    const ordered = appOrder
      .map(id => LAUNCHER_APPS.find(a => a.id === id))
      .filter((a): a is (typeof LAUNCHER_APPS)[0] => Boolean(a));
    const extras = LAUNCHER_APPS.filter(a => !appOrder.includes(a.id));
    return [...ordered, ...extras]
      .filter(a => isAppEnabled(a.id, enabledApps))
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
    : variant === 'pill' ? (
      <button
        type="button"
        className={`ah-header-pill-btn${launcherOpen ? ' is-active' : ''}`}
        onClick={() => setLauncherOpen(d => !d)}
        title={t('header.allApps')}
        aria-expanded={launcherOpen}
      >
        <Icon name="grid" size={14} style={{ color: 'var(--teal)' }} />
        <span>Apps</span>
        <Icon name="chevronDown" size={11} className="ah-pill-chevron" />
      </button>
    ) : (
      <button
        type="button"
        className={`app-header-icon-btn${launcherOpen ? ' app-header-icon-btn--open' : ''}`}
        onClick={() => setLauncherOpen(d => !d)}
        title={t('header.allApps')}
      >
        <Icon name="grid" size={17} />
      </button>
    );

  const overlay = (
    <>
      {launcherOpen && (
        <div className="app-lnch-backdrop" onClick={closeLauncher} />
      )}

      <div className={`app-lnch-panel${launcherOpen ? ' app-lnch-panel--open' : ''}`}>
        {/* Dreams Core Header */}
        <div className="app-lnch-panel-hdr">
          <div className="app-lnch-hdr-text">
            <span className="app-lnch-panel-title">Apps</span>
          </div>
          <div className="app-lnch-panel-hdr-btns">
            <Link
              to="/workspace"
              className="app-lnch-settings-btn"
              onClick={closeLauncher}
              title="Manage workspace apps & settings"
            >
              <Icon name="settings" size={15} />
            </Link>
            <button
              type="button"
              className={`app-lnch-edit-toggle${editMode ? ' app-lnch-edit-toggle--active' : ''}`}
              onClick={() => setEditMode(m => !m)}
              title={editMode ? t('launcher.done') : t('launcher.rearrange')}
            >
              <Icon name={editMode ? 'check' : 'edit'} size={13} />
            </button>
            <button type="button" className="app-lnch-panel-close" onClick={closeLauncher} title={t('launcher.close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        {editMode && (
          <p className="app-lnch-edit-hint">{t('launcher.dragHint')}</p>
        )}

        <div className="app-lnch-panel-scroll" ref={scrollRef} data-more-below={moreBelow || undefined}>
          {/* Recently visited row */}
          {!editMode && recentApps.length > 0 && (
            <>
              <div className="app-lnch-section-label">Recent</div>
              <div className="app-lnch-panel-grid app-lnch-panel-grid--recent">
                {recentApps.map(app => {
                  const meta = LAUNCHER_APP_META[app.id] ?? { icon: 'grid', color: app.color, label: app.name };
                  const appColor = branding.getAppColor(app.id, meta.color || app.color);
                  const appLabel = branding.getAppName(app.id, meta.label || app.name);
                  return (
                    <Link
                      key={app.id}
                      to={app.path}
                      className="app-lnch-panel-item"
                      onClick={() => { recordRecentApp(app.id); closeLauncher(); }}
                    >
                      <LauncherAppSvg
                        id={app.id}
                        color={appColor}
                        logoUrl={branding.getAppLogo(app.id) || undefined}
                        size={40}
                      />
                      <span className="app-lnch-panel-name">{appLabel}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="app-lnch-section-label">All apps</div>
            </>
          )}

          {/* 4-Column Apps Grid */}
          <div className={`app-lnch-panel-grid${editMode ? ' app-lnch-panel-grid--edit' : ''}`}>
            {orderedApps.map(app => {
              const meta = LAUNCHER_APP_META[app.id] ?? { icon: 'grid', color: app.color, label: app.name };
              const appColor = branding.getAppColor(app.id, meta.color || app.color);
              const appLabel = branding.getAppName(app.id, meta.label || app.name);
              return (
                <Link
                  key={app.id}
                  to={app.path}
                  className={`app-lnch-panel-item${dragOverId === app.id ? ' app-lnch-panel-item--over' : ''}`}
                  draggable={editMode}
                  onDragStart={editMode ? e => handleDragStart(e, app.id) : undefined}
                  onDragOver={editMode ? e => handleDragOver(e, app.id) : undefined}
                  onDrop={editMode ? e => handleDrop(e, app.id) : undefined}
                  onDragEnd={editMode ? handleDragEnd : undefined}
                  onClick={e => { if (editMode) { e.preventDefault(); return; } recordRecentApp(app.id); closeLauncher(); }}
                >
                  <LauncherAppSvg
                    id={app.id}
                    color={appColor}
                    logoUrl={branding.getAppLogo(app.id) || undefined}
                    size={40}
                  />
                  <span className="app-lnch-panel-name">{appLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom card footer */}
        <div className="app-lnch-adobe-footer-card">
          <Link to="/" className="app-lnch-adobe-footer-item" onClick={closeLauncher}>
            <div className="app-lnch-adobe-brand-icon">
              <img src={branding.favicon || branding.logoLight || '/favicon.png'} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
            </div>
            <span className="app-lnch-adobe-footer-label">hudumika.tz</span>
          </Link>

          <div className="app-lnch-adobe-footer-divider" />

          <Link to="/" className="app-lnch-adobe-footer-item" onClick={closeLauncher}>
            <Icon name="grid" size={15} style={{ color: 'var(--ink2)' }} />
            <span className="app-lnch-adobe-footer-label">All modules</span>
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
