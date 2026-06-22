import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCompany } from '../data/companyStore.js';
import { Icon } from './Icon.js';
import { getJobs, updateJob, STAGES } from '../pages/clearanceData.js';
import type { Stage, TimeEntry } from '../pages/clearanceData.js';
import { useClockIn } from '../contexts/ClockInContext.jsx';
import { apiFetch } from '../lib/api.js';

/* ── AI Search Modal ── */
const QUICK_CHIPS = [
  { label: 'Overdue invoices', q: 'Show overdue invoices' },
  { label: 'At-risk shipments', q: 'Shipments at risk of demurrage' },
  { label: 'Top customers', q: 'Top customers by revenue this month' },
  { label: 'Cash flow summary', q: 'Cash flow summary this quarter' },
];

const SUGGESTIONS = [
  { icon: 'invoice'     as const, label: 'Invoices',            path: '/billing' },
  { icon: 'ship'        as const, label: 'Shipments',           path: '/shipments' },
  { icon: 'users'       as const, label: 'Customers',           path: '/customers' },
  { icon: 'barChart'    as const, label: 'Finance Dashboard',   path: '/finance' },
  { icon: 'settings'   as const, label: 'Settings',             path: '/settings' },
];

function AISearchModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  function handleChip(q: string) { setQuery(q); inputRef.current?.focus(); }

  function handleSuggestion(path: string) { navigate(path); onClose(); }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 80,
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 600,
        background: 'var(--white)', borderRadius: 9,
        border: '1px solid var(--border)',
        boxShadow: '0 24px 64px rgba(0,0,0,.22)',
        overflow: 'hidden',
      }}>
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed 0%, var(--teal) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="sparkle" size={16} color="#fff" strokeWidth={1.8} />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask anything — search shipments, invoices, customers…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, fontFamily: 'var(--font)', color: 'var(--ink)',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim()) {
                navigate(`/?search=${encodeURIComponent(query.trim())}`);
                onClose();
              }
            }}
          />
          {query && (
            <button type="button" title="Clear" onClick={() => setQuery('')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
              <Icon name="x" size={14} />
            </button>
          )}
          <kbd style={{
            fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink3)',
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '2px 6px', flexShrink: 0,
          }}>ESC</kbd>
        </div>

        {/* Quick chips */}
        <div style={{ padding: '12px 18px 8px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Try</span>
          {QUICK_CHIPS.map(c => (
            <button key={c.q} type="button" onClick={() => handleChip(c.q)}
              style={{
                fontSize: 11.5, padding: '5px 11px', borderRadius: 20, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink2)',
                fontFamily: 'var(--font)',
              }}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Quick nav */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0 10px' }}>
          <div style={{ padding: '4px 18px 6px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Quick Navigation
          </div>
          {SUGGESTIONS.map(s => (
            <button key={s.path} type="button" onClick={() => handleSuggestion(s.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '9px 18px', border: 'none',
                background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                color: 'var(--ink)', fontSize: 13.5, textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={s.icon} size={14} color="var(--teal)" strokeWidth={2} />
              </div>
              {s.label}
              <Icon name="arrowUpRight" size={13} color="var(--ink3)" style={{ marginLeft: 'auto' }} />
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          borderTop: '1px solid var(--border)', padding: '10px 18px',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink3)',
        }}>
          <span><kbd style={{ fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> to search</span>
          <span><kbd style={{ fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>ESC</kbd> to close</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="sparkle" size={12} color="var(--teal)" strokeWidth={2} />
            AI-powered search
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Clock-In Multi-Step Modal ── */
interface ClockInRef { jobId: string; jobTitle: string; bl?: string; steps: Stage[] }

function ClockInModal({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (ref: ClockInRef) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [jobSearch, setJobSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedSteps, setSelectedSteps] = useState<Stage[]>([]);

  const jobs = getJobs();
  const filtered = jobs.filter(j =>
    !jobSearch ||
    j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    (j.bl || '').toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.customer.toLowerCase().includes(jobSearch.toLowerCase())
  );
  const chosenJob = jobs.find(j => j.id === selectedJobId);

  function toggleStep(s: Stage) {
    setSelectedSteps(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : prev.length < 3 ? [...prev, s] : prev
    );
  }

  function handleConfirm() {
    if (!chosenJob || selectedSteps.length === 0) return;
    onConfirm({ jobId: chosenJob.id, jobTitle: chosenJob.title, bl: chosenJob.bl, steps: selectedSteps });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 520, background: 'var(--white)', borderRadius: 9, boxShadow: '0 24px 64px rgba(0,0,0,.22)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--teal)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Clock In</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
              {step === 1 ? 'Select the shipment you are working on' : 'Select up to 3 steps to work on'}
            </div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 9, cursor: 'pointer', padding: 6, display: 'flex' }}>
            <Icon name="x" size={16} color="#fff" />
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', padding: '12px 20px', gap: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          {[1, 2].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step >= n ? 'var(--teal)' : 'var(--border)', color: step >= n ? '#fff' : 'var(--ink3)' }}>{n}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: step >= n ? 'var(--ink)' : 'var(--ink3)' }}>{n === 1 ? 'Select Shipment' : 'Select Steps'}</span>
              {n < 2 && <Icon name="chevronRight" size={14} color="var(--ink3)" />}
            </div>
          ))}
        </div>

        <div style={{ padding: 20 }}>

          {/* ── Step 1: Select Job ── */}
          {step === 1 && (
            <>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={jobSearch} onChange={e => setJobSearch(e.target.value)}
                  placeholder="Search by BL, shipment title or customer…"
                  style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 9, fontFamily: 'var(--font)', fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink3)', fontSize: 13 }}>No active shipments found.</div>}
                {filtered.map(j => {
                  const stageLabel = STAGES.find(s => s.id === j.stage)?.label || j.stage;
                  const selected = selectedJobId === j.id;
                  return (
                    <button key={j.id} type="button" onClick={() => setSelectedJobId(j.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 9, border: `1.5px solid ${selected ? 'var(--teal)' : 'var(--border)'}`, background: selected ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all .12s' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 9, background: selected ? 'var(--teal)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="ship" size={18} color={selected ? '#fff' : 'var(--ink3)'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: selected ? 'var(--teal)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
                          {j.bl && <span style={{ fontFamily: 'var(--mono)', marginRight: 8 }}>BL: {j.bl}</span>}
                          {j.customer}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: selected ? 'var(--teal)' : 'var(--bg)', color: selected ? '#fff' : 'var(--ink3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{stageLabel}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" disabled={!selectedJobId} onClick={() => setStep(2)}
                  style={{ padding: '9px 20px', background: selectedJobId ? 'var(--teal)' : 'var(--border)', color: selectedJobId ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: selectedJobId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7 }}>
                  Next <Icon name="arrowRight" size={14} color={selectedJobId ? '#fff' : 'var(--ink3)'} />
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Select Steps ── */}
          {step === 2 && chosenJob && (
            <>
              <div style={{ padding: '10px 14px', background: 'var(--teal-l)', borderRadius: 9, marginBottom: 14, fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
                Working on: <span style={{ fontFamily: 'var(--mono)' }}>{chosenJob.bl || chosenJob.id}</span> — {chosenJob.customer}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select up to 3 steps {selectedSteps.length > 0 && <span style={{ color: 'var(--teal)' }}>({selectedSteps.length} selected)</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 250, overflowY: 'auto', marginBottom: 16 }}>
                {STAGES.map(s => {
                  const on = selectedSteps.includes(s.id);
                  const disabled = !on && selectedSteps.length >= 3;
                  return (
                    <button key={s.id} type="button" onClick={() => !disabled && toggleStep(s.id)}
                      style={{ padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? 'var(--teal-l)' : disabled ? 'var(--bg)' : 'var(--white)', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? 'var(--teal)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {on && <Icon name="check" size={10} color="#fff" />}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: on ? 'var(--teal)' : disabled ? 'var(--ink3)' : 'var(--ink)', lineHeight: 1.3 }}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              {selectedSteps.length >= 3 && (
                <div style={{ fontSize: 12, color: '#ca8a04', background: '#fef9c3', padding: '7px 12px', borderRadius: 7, marginBottom: 12 }}>
                  Maximum 3 steps selected. Deselect one to change.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setStep(1)}
                  style={{ padding: '9px 16px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>Back</button>
                <button type="button" disabled={selectedSteps.length === 0} onClick={handleConfirm}
                  style={{ padding: '9px 20px', background: selectedSteps.length > 0 ? 'var(--teal)' : 'var(--border)', color: selectedSteps.length > 0 ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: selectedSteps.length > 0 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="clock" size={14} color={selectedSteps.length > 0 ? '#fff' : 'var(--ink3)'} /> Clock In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Moovit logo ── */
function MoovitLogo({ isDark }: { isDark?: boolean }) {
  const co = useCompany();
  if (co.logoUrl) return <img src={co.logoUrl} alt={co.name} style={{ height: 31, objectFit: 'contain' }} />;
  return (
    <img src={isDark ? "/logo-dark.png" : "/logo-light.png"} alt="Moovit" style={{ height: 31, objectFit: 'contain' }} />
  );
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', TENANT_ADMIN: 'Admin',
  MANAGER: 'Manager', FINANCE: 'Finance', SALES: 'Sales Officer',
  SENIOR: 'Senior Officer', JUNIOR: 'Junior Officer', OFFICER: 'Officer', CUSTOMER: 'Customer',
};
function initials(n: string) {
  return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function relTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `Just ${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hrs ago`;
  return `${Math.floor(hr / 24)} days ago`;
}

const NOTIF_TYPE_CFG: Record<string, { icon: 'check' | 'bell' | 'shield' | 'info' | 'messageSquare' | 'alertTriangle'; bg: string; fg: string }> = {
  task:         { icon: 'check',         bg: '#ccfbf1', fg: '#0d9488' },
  tag:          { icon: 'bell',          bg: '#dbeafe', fg: '#2563eb' },
  security:     { icon: 'shield',        bg: '#fee2e2', fg: '#dc2626' },
  announcement: { icon: 'bell',          bg: '#fef3c7', fg: '#d97706' },
  support:      { icon: 'messageSquare', bg: '#fce7f3', fg: '#db2777' },
  info:         { icon: 'info',          bg: '#f1f5f9', fg: '#64748b' },
};

export interface TopBarProps {
  navCollapsed: boolean;
  onToggleNav: () => void;
  onMobileNavOpen?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ navCollapsed, onToggleNav, onMobileNavOpen, isDark, onToggleTheme, isExpanded, onToggleExpand }) => {
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const { isCheckedIn, currentEntry, triggerOpen } = useClockIn();
  const [clockOpen, setClockOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);

  const openAI = useCallback(() => setAiOpen(true), []);
  const closeAI = useCallback(() => setAiOpen(false), []);

  /* ── Notifications ── */
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifTab, setNotifTab] = useState<'all' | 'messages' | 'alerts'>('all');
  const [checkedNotifs, setCheckedNotifs] = useState<Set<string>>(new Set());
  const notifRef = useRef<HTMLDivElement>(null);

  const loadNotifs = useCallback(() => {
    apiFetch('/v1/notifications')
      .then((d: any) => { setNotifs(d.notifications ?? []); setUnreadCount(d.unread_count ?? 0); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  useEffect(() => {
    const t = setInterval(loadNotifs, 30000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markRead = async (id: string, link?: string) => {
    await apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x));
    setUnreadCount(c => Math.max(0, c - 1));
    if (link) navigate(link);
    setNotifOpen(false);
  };

  const markAllRead = async () => {
    await apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).catch(() => {});
    setNotifs(n => n.map(x => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  const filteredNotifs = notifs.filter(n => {
    if (notifTab === 'messages') return ['tag', 'support', 'announcement'].includes(n.type);
    if (notifTab === 'alerts') return ['security', 'task', 'info'].includes(n.type);
    return true;
  });

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCheckedNotifs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setAiOpen(true); }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);


  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    if (profileOpen) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [profileOpen]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (clockRef.current && !clockRef.current.contains(e.target as Node))
        setClockOpen(false);
    };
    if (clockOpen) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [clockOpen]);

  function clockDuration() {
    if (!isCheckedIn || !currentEntry?.started_at) return '';
    const ms = Date.now() - new Date(currentEntry.started_at).getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /* ── icon button style helper ── */
  function ibStyle(active = false): React.CSSProperties {
    return {
      width: 36, height: 36, borderRadius: 9, border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: active ? 'var(--teal-l)' : 'transparent',
      color: active ? 'var(--teal)' : 'var(--ink2)', transition: 'background .15s',
    };
  }

  return (
    <header className="top-bar">
      <div className="top-bar-inner">

      {/* ── Left: toggle + brand ── */}
      <div className="top-bar-left">
        <button
          onClick={onToggleNav}
          className="top-bar-icon-btn"
          title="Toggle navigation"
          style={ibStyle()}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon name="menu" size={18} color="var(--ink2)" />
        </button>

        {!isMobile && (
          <div
            className="top-bar-brand"
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
          >
            <MoovitLogo isDark={isDark} />
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              background: 'var(--teal-l)', color: 'var(--teal)',
              padding: '2px 6px', borderRadius: 4, flexShrink: 0,
            }}>
              ClearOS
            </span>
          </div>
        )}
      </div>

      {/* ── Center: AI search trigger ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
        <button
          type="button"
          title="AI Search (⌘K)"
          onClick={openAI}
          className="top-bar-search-trigger"
          style={{
            position: 'relative', width: '100%', maxWidth: 380, height: 36,
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid var(--border)', borderRadius: 9,
            background: 'var(--bg)', cursor: 'pointer', padding: '0 10px 0 12px',
            fontFamily: 'var(--font)',
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed 0%, var(--teal) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="sparkle" size={11} color="#fff" strokeWidth={1.8} />
          </div>
          <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--ink3)' }}>
            Ask anything…
          </span>
          <kbd style={{
            fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink3)',
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px', flexShrink: 0,
          }}>⌘K</kbd>
        </button>
      </div>

      {aiOpen && <AISearchModal onClose={closeAI} />}

      {/* ── Right: action icons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

        {/* Expand / collapse layout */}
        <button style={ibStyle(isExpanded)} title={isExpanded ? 'Collapse layout' : 'Expand layout'}
          onClick={onToggleExpand}
          onMouseEnter={e => (e.currentTarget.style.background = isExpanded ? 'var(--teal-l)' : 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = isExpanded ? 'var(--teal-l)' : 'transparent')}>
          <Icon name={isExpanded ? 'minimize' : 'maximize'} size={16} color={isExpanded ? 'var(--teal)' : 'var(--ink2)'} />
        </button>

        {/* Dark / Light mode */}
        <button style={ibStyle()} title={isDark ? 'Light mode' : 'Dark mode'}
          onClick={onToggleTheme}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <Icon name={isDark ? 'sun' : 'moon'} size={16} color="var(--ink2)" />
        </button>

        {/* Settings — purple */}
        <button style={{ ...ibStyle(), background: '#ede9fe' }} title="Settings"
          onClick={() => navigate('/settings')}
          onMouseEnter={e => (e.currentTarget.style.background = '#ede9fe')}
          onMouseLeave={e => (e.currentTarget.style.background = '#ede9fe')}>
          <Icon name="settings" size={15} color="#7c3aed" />
        </button>

        {/* Clock In / Out */}
        <div ref={clockRef} style={{ position: 'relative' }}>
          <button
            type="button"
            title={isCheckedIn ? 'Session active — click to manage' : 'Clock In'}
            onClick={() => isCheckedIn ? setClockOpen(o => !o) : triggerOpen()}
            style={{ ...ibStyle(isCheckedIn), position: 'relative' }}
            onMouseEnter={e => { if (!isCheckedIn) e.currentTarget.style.background = 'var(--bg)'; }}
            onMouseLeave={e => { if (!isCheckedIn) e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name="clock" size={17} color={isCheckedIn ? 'var(--teal)' : 'var(--ink2)'} />
            {isCheckedIn && (
              <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--white)' }} />
            )}
          </button>

          {clockOpen && isCheckedIn && currentEntry && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 270, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,.16)', zIndex: 400, overflow: 'hidden' }}>
              <div style={{ background: 'rgba(16,185,129,.08)', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="clock" size={18} color="var(--green)" strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{currentEntry.task_name ?? 'Work session'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--green)', fontWeight: 600 }}>{clockDuration()} active</div>
                  </div>
                </div>
                {currentEntry.is_billable && (
                  <div style={{ marginTop: 8, fontSize: 11, padding: '3px 8px', background: 'rgba(8,145,178,.1)', color: 'var(--teal)', borderRadius: 5, display: 'inline-block', fontWeight: 700 }}>Billable</div>
                )}
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button type="button" onClick={() => { setClockOpen(false); triggerOpen(); }}
                  style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontWeight: 600, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer' }}>
                  Switch Task
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* Notifications */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setNotifOpen(o => !o); if (!notifOpen) loadNotifs(); }}
            style={{ ...ibStyle(), position: 'relative' }}
            title="Notifications"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="bell" size={17} color="var(--ink2)" />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 5, right: 5,
                minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
                background: 'var(--red)', border: '2px solid var(--white)',
                fontSize: 9, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="notif-panel">
              {/* Purple header */}
              <div className="notif-panel-hd">
                <div className="notif-panel-hd-row">
                  <span className="notif-panel-title">Notifications</span>
                  {unreadCount > 0 && <span className="notif-panel-badge">{unreadCount} New</span>}
                </div>
                <div className="notif-tabs">
                  {(['all', 'messages', 'alerts'] as const).map(tab => {
                    const labels = { all: `All (${notifs.length})`, messages: 'Messages', alerts: 'Alerts' };
                    return (
                      <button key={tab} type="button" onClick={() => setNotifTab(tab)}
                        className="notif-tab-btn" data-active={notifTab === tab}>
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notification list */}
              <div className="notif-list">
                {filteredNotifs.length === 0 ? (
                  <div className="notif-empty">No notifications</div>
                ) : filteredNotifs.map((n: any) => {
                  const cfg = NOTIF_TYPE_CFG[n.type] ?? NOTIF_TYPE_CFG.info;
                  const checked = checkedNotifs.has(n.id);
                  return (
                    <div key={n.id} className="notif-item" data-read={n.read}
                      onClick={() => markRead(n.id, n.link)}>
                      {/* Avatar — background is data-driven, kept as inline style */}
                      <div className="notif-avatar" style={{ background: n.avatar_url ? 'transparent' : cfg.bg }}>
                        {n.avatar_url
                          ? <img src={n.avatar_url} alt="" className="notif-avatar-img" />
                          : <Icon name={cfg.icon} size={20} color={cfg.fg} strokeWidth={2} />
                        }
                      </div>

                      {/* Content */}
                      <div className="notif-content">
                        <div className="notif-item-title">{n.title}</div>
                        {n.message && <div className="notif-item-body">{n.message}</div>}
                        <div className="notif-time-row">
                          <Icon name="clock" size={11} color="var(--ink3)" />
                          <span className="notif-time-label">{relTime(n.created_at)}</span>
                        </div>
                      </div>

                      {/* Checkbox */}
                      <div className="notif-check" data-checked={checked}
                        onClick={e => toggleCheck(n.id, e)}>
                        {checked && <Icon name="check" size={11} color="#fff" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="notif-footer">
                <button type="button" className="notif-footer-btn" onClick={markAllRead}>
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* User avatar + dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            style={{
              background: profileOpen ? 'var(--bg)' : 'none',
              border: 'none', cursor: 'pointer', borderRadius: 9,
              padding: '4px 8px 4px 4px',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background .15s',
            }}
            onMouseEnter={e => { if (!profileOpen) e.currentTarget.style.background = 'var(--bg)'; }}
            onMouseLeave={e => { if (!profileOpen) e.currentTarget.style.background = 'none'; }}
          >
            {/* Avatar circle */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name}
                  style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
              ) : (
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--teal) 0%, #0550ae 100%)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, letterSpacing: '-0.02em',
                }}>
                  {user ? initials(user.name) : '?'}
                </div>
              )}
              <span style={{
                position: 'absolute', bottom: 1, right: 1,
                width: 9, height: 9, borderRadius: '50%',
                background: '#22c55e', border: '2px solid var(--white)',
              }} />
            </div>

            {/* Name + role — hidden on mobile */}
            {!isMobile && (
              <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                  {user?.name ?? 'User'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
                </div>
              </div>
            )}

            {!isMobile && (
              <Icon name="chevronDown" size={12} color="var(--ink3)"
                style={{ transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
              />
            )}
          </button>

          {/* ── Profile dropdown ── */}
          {profileOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 9, boxShadow: '0 12px 40px rgba(0,0,0,.14)',
              zIndex: 400, minWidth: 252, overflow: 'hidden',
            }}>
              {/* User info header */}
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }} />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--teal) 0%, #0550ae 100%)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em',
                  }}>
                    {user ? initials(user.name) : '?'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                  <span style={{ display: 'inline-block', marginTop: 5, padding: '2px 8px', borderRadius: 20, background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { navigate('/settings'); setProfileOpen(false); }}
                  title="App Settings"
                  style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-l)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
                >
                  <Icon name="settings" size={13} color="var(--ink3)" />
                </button>
              </div>

              {/* Menu items */}
              <div style={{ padding: '6px 0' }}>
                {[
                  { icon: 'user'       as const, label: 'View Profile',        path: '/profile?tab=personal' },
                  { icon: 'settings'   as const, label: 'Account Setting',     path: '/profile?tab=security' },
                  { icon: 'activity'   as const, label: 'Login Activity',      path: '/profile?tab=activity' },
                  { icon: 'creditCard' as const, label: 'Manage Subscription', path: '/subscription'         },
                ].map(item => (
                  <button key={item.path}
                    type="button"
                    onClick={() => { navigate(item.path); setProfileOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={item.icon} size={15} color="var(--ink3)" />
                    </div>
                    {item.label}
                  </button>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', padding: '6px 0' }}>
                <button
                  type="button"
                  onClick={() => { logout(); setProfileOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--red)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="externalLink" size={15} color="var(--red)" />
                  </div>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      </div>{/* .top-bar-inner */}
    </header>
  );
};
