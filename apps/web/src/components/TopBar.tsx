import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCompany } from '../data/companyStore.js';
import { Icon } from './Icon.js';
import { getJobs, updateJob, STAGES } from '../pages/clearanceData.js';
import type { Stage, TimeEntry } from '../pages/clearanceData.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { apiFetch } from '../lib/api.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu.js';

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

const CATEGORY_LABELS: Record<string, { label: string; icon: 'ship' | 'users' | 'invoice' | 'user' | 'truck' | 'container' }> = {
  shipments: { label: 'Shipments', icon: 'ship' },
  customers: { label: 'Customers', icon: 'users' },
  invoices:  { label: 'Invoices',  icon: 'invoice' },
  staff:     { label: 'Staff',     icon: 'user' },
  drivers:   { label: 'Drivers',   icon: 'truck' },
  vehicles:  { label: 'Vehicles',  icon: 'container' },
};

function AISearchModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, { id: string; label: string; sublabel: string | null; path: string }[]>>({});
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults({}); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      apiFetch(`/v1/search?q=${encodeURIComponent(query.trim())}`)
        .then(res => setResults(res.data || {}))
        .catch(() => setResults({}))
        .finally(() => setSearching(false));
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const hasResults = Object.keys(results).length > 0;
  const totalResults = Object.values(results).reduce((n, arr) => n + arr.length, 0);

  function handleChip(q: string) { setQuery(q); inputRef.current?.focus(); }

  function handleSuggestion(path: string) { navigate(path); onClose(); }

  function handleHit(path: string) { navigate(path); onClose(); }

  function searchWeb() {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query.trim())}`, '_blank', 'noopener');
    onClose();
  }

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
            placeholder="Search shipments, customers, invoices, staff, drivers, vehicles…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, fontFamily: 'var(--font)', color: 'var(--ink)',
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !query.trim()) return;
              const first = Object.values(results)[0]?.[0];
              if (first) handleHit(first.path);
              else searchWeb();
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

        {query.trim().length < 2 ? (
          <>
            {/* Quick chips */}
            <div style={{ padding: '12px 18px 8px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Try</span>
              {QUICK_CHIPS.map(c => (
                <button key={c.q} type="button" onClick={() => handleChip(c.q)}
                  style={{
                    fontSize: 12, padding: 'var(--ds-btn-py-sm) 11px', borderRadius: 20, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink2)',
                    fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                    width: '100%', padding: 'var(--ds-btn-py) 18px', border: 'none',
                    background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                    color: 'var(--ink)', fontSize: 14, textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
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
          </>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0' }}>
            {searching && (
              <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--ink3)' }}>Searching…</div>
            )}
            {!searching && !hasResults && (
              <div style={{ padding: '18px', fontSize: 13, color: 'var(--ink3)' }}>No matches in the app for "{query}".</div>
            )}
            {!searching && Object.entries(results).map(([cat, hits]) => (
              <div key={cat} style={{ padding: '4px 0 8px' }}>
                <div style={{ padding: '4px 18px 6px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {CATEGORY_LABELS[cat]?.label || cat}
                </div>
                {hits.map(h => (
                  <button key={h.id} type="button" onClick={() => handleHit(h.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: 'var(--ds-btn-py) 18px', border: 'none',
                      background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                      color: 'var(--ink)', fontSize: 14, textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={CATEGORY_LABELS[cat]?.icon || 'search'} size={13} color="var(--teal)" strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.label}</div>
                      {h.sublabel && <div style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.sublabel}</div>}
                    </div>
                  </button>
                ))}
              </div>
            ))}

            {/* Extend outside the app */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
              <button type="button" onClick={searchWeb}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: 'var(--ds-btn-py) 18px', border: 'none',
                  background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                  color: 'var(--ink2)', fontSize: 13, textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="globe" size={13} color="var(--ink3)" strokeWidth={2} />
                </div>
                Search the web for "{query}"
                <Icon name="arrowUpRight" size={13} color="var(--ink3)" style={{ marginLeft: 'auto' }} />
              </button>
            </div>
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          borderTop: '1px solid var(--border)', padding: '10px 18px',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink3)',
        }}>
          <span><kbd style={{ fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> to open</span>
          <span><kbd style={{ fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>ESC</kbd> to close</span>
          {hasResults && <span style={{ marginLeft: 'auto' }}>{totalResults} result{totalResults === 1 ? '' : 's'}</span>}
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
          <button type="button" title="Close" onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', padding: 6, display: 'flex' }}>
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
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--ds-btn-py-lg) 14px', borderRadius: 'var(--r)', border: `1.5px solid ${selected ? 'var(--teal)' : 'var(--border)'}`, background: selected ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all .12s', minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                  style={{ padding: 'var(--ds-btn-py) 20px', background: selectedJobId ? 'var(--teal)' : 'var(--border)', color: selectedJobId ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: selectedJobId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                      style={{ padding: 'var(--ds-btn-py) 12px', borderRadius: 'var(--r)', border: `1.5px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? 'var(--teal-l)' : disabled ? 'var(--bg)' : 'var(--white)', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                  style={{ padding: 'var(--ds-btn-py) 16px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Back</button>
                <button type="button" disabled={selectedSteps.length === 0} onClick={handleConfirm}
                  style={{ padding: 'var(--ds-btn-py) 20px', background: selectedSteps.length > 0 ? 'var(--teal)' : 'var(--border)', color: selectedSteps.length > 0 ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: selectedSteps.length > 0 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
  const [aiOpen, setAiOpen] = useState(false);
  const { isCheckedIn, currentEntry, triggerOpen } = useClockIn();
  const [clockOpen, setClockOpen] = useState(false);
  // clockDuration() below reads Date.now() directly, so nothing forces a
  // re-render as time passes — without this tick, the displayed duration
  // was frozen at whatever it happened to be on the last unrelated render
  // (e.g. the 30s notification poll), not actually live.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!isCheckedIn) return;
    const t = setInterval(() => setClockTick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, [isCheckedIn]);

  const openAI = useCallback(() => setAiOpen(true), []);
  const closeAI = useCallback(() => setAiOpen(false), []);

  /* ── Notifications ── */
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifTab, setNotifTab] = useState<'all' | 'messages' | 'alerts'>('all');
  const [checkedNotifs, setCheckedNotifs] = useState<Set<string>>(new Set());

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

      {/* ── Center: Search trigger ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
        <button
          type="button"
          title="Search (⌘K)"
          onClick={openAI}
          className="top-bar-search-trigger"
          style={{
            position: 'relative', width: '100%', maxWidth: 380, height: 36,
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid var(--border)', borderRadius: 'var(--r)',
            background: 'var(--bg)', cursor: 'pointer', padding: '0 10px 0 12px',
            fontFamily: 'var(--font)',
          }}
        >
          <Icon name="search" size={14} color="var(--ink3)" strokeWidth={2} />
          <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--ink3)' }}>
            Search...
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
        {isCheckedIn && currentEntry ? (
          <DropdownMenu open={clockOpen} onOpenChange={setClockOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Session active — click to manage"
                style={{ ...ibStyle(true), position: 'relative' }}
              >
                <Icon name="clock" size={17} color="var(--teal)" />
                <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--white)' }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-[270px] p-0 rounded-xl overflow-hidden">
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
                  style={{ width: '100%', padding: '8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontWeight: 600, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer' }}>
                  Switch Task
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            title="Clock In"
            onClick={() => triggerOpen()}
            style={ibStyle()}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="clock" size={17} color="var(--ink2)" />
          </button>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* Notifications */}
        <DropdownMenu open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) loadNotifs(); }}>
          <DropdownMenuTrigger asChild>
            <button
              style={{ ...ibStyle(), position: 'relative' }}
              title="Notifications"
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
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="notif-panel p-0 rounded-xl">
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
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* User avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                style={{
                  background: 'none',
                  border: 'none', cursor: 'pointer', borderRadius: 'var(--r)',
                  padding: 'var(--ds-btn-py-xs) 8px 4px 4px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background .15s', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
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
                  <Icon name="chevronDown" size={12} color="var(--ink3)" />
                )}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[280px] p-2 rounded-xl">
              {/* User info header */}
              <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name}
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }} />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--teal) 0%, #0550ae 100%)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em',
                  }}>
                    {user ? initials(user.name) : '?'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                  <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 20, background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
                  </span>
                </div>
              </div>

              <DropdownMenuSeparator />

              {[
                { icon: 'user'       as const, label: 'View Profile',        path: '/profile?tab=personal' },
                { icon: 'settings'   as const, label: 'Account Setting',     path: '/profile?tab=security' },
                { icon: 'activity'   as const, label: 'Login Activity',      path: '/profile?tab=activity' },
                { icon: 'creditCard' as const, label: 'Manage Subscription', path: '/subscription'         },
              ].map(item => (
                <DropdownMenuItem
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="rounded-lg gap-3 py-2.5 px-3 cursor-pointer text-[13px]"
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={item.icon} size={14} color="var(--ink3)" />
                  </div>
                  {item.label}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={logout}
                className="rounded-lg gap-3 py-2.5 px-3 cursor-pointer text-[13px] text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="externalLink" size={14} color="var(--red)" />
                </div>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      </div>{/* .top-bar-inner */}
    </header>
  );
};
