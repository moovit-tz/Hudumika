import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import type { IconName } from '../components/Icon.js';
import {
  getJobs, addJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, CUSTOMERS_LIST, stageIdx,
  type ClearanceJob, type Stage, type Flag, type TransportMode, type Channel,
} from './clearanceData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

// --- Store hook ---------------------------------------------------------------

function useJobs() {
  const [jobs, setJobs] = useState(getJobs);
  useEffect(() => subscribe(() => setJobs(getJobs())), []);
  return jobs;
}

// --- Helpers -----------------------------------------------------------------

function fdate(d: Date) { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function relative(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtTZS(n: number) { return 'TZS ' + n.toLocaleString('en'); }
function avatarBg(name: string) {
  const c = ['#e8461a', '#2563eb', '#059669', '#7c3aed', '#ca8a04', '#0891b2'];
  let h = 0; for (const ch of (name ?? '')) h = (h * 31 + ch.charCodeAt(0)) % c.length;
  return c[Math.abs(h)];
}
function initials(name: string) { return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(); }

// --- Shared UI ----------------------------------------------------------------

function Av({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarBg(name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font)' }}>
      {initials(name)}
    </div>
  );
}

export function FlagChip({ flag, hero }: { flag: Flag; hero?: boolean }) {
  const cfg = FLAG_CFG[flag];
  if (!cfg) return null;
  if (hero) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', whiteSpace: 'nowrap', letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>
        <Icon name={cfg.icon as IconName} size={10} color={cfg.color} />{cfg.label}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}44`, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
      <Icon name={cfg.icon as IconName} size={10} />{cfg.label}
    </span>
  );
}

export function ChBadge({ ch }: { ch: Channel }) {
  const cfg = CH_CFG[ch];
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}55` }}>
      {cfg.label}
    </span>
  );
}

// --- Summary Panel ------------------------------------------------------------

function SummaryPanel({ job, onClose }: { job: ClearanceJob; onClose: () => void }) {
  const idx = stageIdx(job.stage);
  const pct = Math.round((idx / (STAGES.length - 1)) * 100);
  const stageLabel = STAGES.find(s => s.id === job.stage)?.label || '';
  const totalCharges = job.ledger.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
  const totalPaid = job.ledger.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
  const docsExtracted = job.documents.filter(d => d.extracted?.status === 'done').length;
  const lastMsg = [...job.thread].reverse().find(Boolean);

  return (
    <div style={{ width: 340, background: 'var(--white)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>{job.id}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35, marginBottom: 4 }}>{job.title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>{job.customer} · {job.mode}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {job.flags.map(f => <FlagChip key={f} flag={f} />)}
          {job.tansad && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#dbeafe', color: '#2563eb', border: '1px solid #93c5fd' }}>{job.tansad}</span>}
        </div>
      </div>

      {/* Stage */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>{stageLabel}</span>
          <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{pct}% complete</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 3, transition: 'width 0.3s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
          {STAGES.map((s, i) => (
            <div key={s.id} title={s.label} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= idx ? 'var(--teal)' : 'var(--border)', opacity: i < idx ? 0.6 : 1 }} />
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderBottom: '1px solid var(--border)', background: 'var(--border)' }}>
        {[
          { label: 'Documents', value: `${job.documents.length} (${docsExtracted} extracted)`, icon: 'file' as IconName },
          { label: 'Messages', value: `${job.thread.length} updates`, icon: 'chatBubble' as IconName },
          { label: 'Charges', value: fmtTZS(totalCharges), icon: 'receipt' as IconName },
          { label: 'Received', value: fmtTZS(totalPaid), icon: 'dollarSign' as IconName },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '10px 14px', background: 'var(--white)' }}>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* B/L & key info */}
      {(job.bl || job.vessel) && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          {job.bl && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>B/L: <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>{job.bl}</span></div>}
          {job.vessel && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Vessel: <span style={{ color: 'var(--ink)' }}>{job.vessel}</span></div>}
          {job.containers && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Containers: <span style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{job.containers.join(', ')}</span></div>}
        </div>
      )}

      {/* Last update */}
      {lastMsg && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Update</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Av name={lastMsg.userName} size={24} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{lastMsg.userName} <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>· {relative(lastMsg.ts)}</span></div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {lastMsg.content}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {lastMsg.channels.map(c => <ChBadge key={c} ch={c} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignees */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Assigned:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {job.assignees.map(a => <Av key={a} name={a} size={24} />)}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 4 }}>{job.listeners.length} listeners</span>
      </div>

      {/* CTA */}
      <div style={{ padding: '14px 16px' }}>
        <Link
          to={`/clearance/${job.id}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '11px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}
        >
          Open Full View <Icon name="arrowRight" size={15} />
        </Link>
        {job.dueDate && (
          <div style={{ textAlign: 'center', fontSize: 11, color: new Date() > job.dueDate ? 'var(--red)' : 'var(--ink3)', marginTop: 8 }}>
            {new Date() > job.dueDate ? '? Overdue — ' : 'Due '}
            {fdate(job.dueDate)}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Job Card -----------------------------------------------------------------

function JobCard({ job, selected, isMobile, onSelect }: { job: ClearanceJob; selected: boolean; isMobile: boolean; onSelect: () => void }) {
  const idx = stageIdx(job.stage);
  const pct = Math.round((idx / (STAGES.length - 1)) * 100);
  const stage = STAGES.find(s => s.id === job.stage);
  const stageColor = stage?.color || 'var(--teal)';
  const isOverdue = job.dueDate && new Date() > job.dueDate;
  const docsExtracted = job.documents.filter(d => d.extracted?.status === 'done').length;

  const Wrapper = isMobile ? Link : 'div';
  const wrapperProps = isMobile
    ? { to: `/clearance/${job.id}` }
    : { onClick: onSelect };

  return (
    <Wrapper
      {...(wrapperProps as any)}
      className={`kb-card${selected ? ' kb-card--selected' : ''}`}
      style={{ '--stage-color': stageColor, textDecoration: 'none', color: 'inherit' } as React.CSSProperties}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: stageColor, fontFamily: 'var(--mono)', letterSpacing: '0.03em' }}>{job.id}</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {job.flags.slice(0, 2).map(f => <FlagChip key={f} flag={f} />)}
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 2, lineHeight: 1.35 }}>{job.title}</div>
      <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 10 }}>{job.customer}</div>

      <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: stageColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {job.assignees.map(a => <Av key={a} name={a} size={20} />)}
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--ink3)', alignItems: 'center' }}>
          {docsExtracted > 0 && <span style={{ color: '#059669', fontWeight: 700 }}>AI ?</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="chatBubble" size={10} />{job.thread.length}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="file" size={10} />{job.documents.length}</span>
          {job.dueDate && <span style={{ color: isOverdue ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue ? 700 : 400 }}>{isOverdue ? '?' : ''}{fdate(job.dueDate)}</span>}
        </div>
      </div>
    </Wrapper>
  );
}

// --- Create Modal -------------------------------------------------------------

function CreateModal({ onClose, onCreate, isMobile }: { onClose: () => void; onCreate: (job: ClearanceJob) => void; isMobile: boolean }) {
  const [customer, setCustomer] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<TransportMode>('SEA FCL');
  const [bl, setBl] = useState('');
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('Dar es Salaam Port');
  const [newCustomer, setNewCustomer] = useState('');
  const isNew = customer === '+ Onboard new customer';
  const jobs = getJobs();

  function handleCreate() {
    const c = isNew ? newCustomer : customer;
    if (!c || !title) return;
    const nextNum = String(jobs.length + 1).padStart(4, '0');
    const id = `CLR-2026-${nextNum}`;
    const job: ClearanceJob = {
      id, title, customer: c, customerId: 'new-' + Date.now(),
      mode, bl: bl || undefined, origin, destination: dest,
      stage: 'docs_received', flags: [], assignees: ['You'],
      listeners: [{ id: 'me', name: 'You', role: 'Clearance Officer', type: 'internal', channel: ['internal'] }],
      createdAt: new Date(), thread: [], ledger: [], documents: [], tasks: [], timeEntries: [], activity: [], cloudLinks: [],
      timeline: [{ id: 'ev1', stage: 'docs_received', label: 'Docs Received', userId: 'me', userName: 'You', ts: new Date(), note: 'Shipment created.' }],
    };
    onCreate(job);
  }

  const field = (label: string, el: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>{label}</label>
      {el}
    </div>
  );

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box', ...props.style }} />
  );

  const selWrap: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, height: 'auto' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, width: 520, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>New Clearance Job</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: '20px' }}>
          {field('Shipment Description *', inp({ value: title, onChange: e => setTitle(e.target.value), placeholder: 'e.g. Generator Parts — 3× 20GP COSCO' }))}
          {field('Customer *', (
            <Select value={customer || '__none__'} onValueChange={v => setCustomer(v === '__none__' ? '' : v)}>
              <SelectTrigger style={selWrap}><SelectValue placeholder="Select existing customer…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select existing customer…</SelectItem>
                {CUSTOMERS_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {isNew && field('New Customer Name *', inp({ value: newCustomer, onChange: e => setNewCustomer(e.target.value), placeholder: 'Company name', style: { border: '1px solid var(--teal)' } }))}
          {isNew && <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 14, marginTop: -8 }}>A new customer profile will be created and linked to this job.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            {field('Mode of Transport', (
              <Select value={mode} onValueChange={v => setMode(v as TransportMode)}>
                <SelectTrigger style={selWrap}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['SEA FCL', 'SEA LCL', 'AIR', 'ROAD'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
            {field('B/L or AWB', inp({ value: bl, onChange: e => setBl(e.target.value), placeholder: 'COSU641234567' }))}
            {field('Origin', inp({ value: origin, onChange: e => setOrigin(e.target.value), placeholder: 'e.g. Shanghai, China' }))}
            {field('Destination', inp({ value: dest, onChange: e => setDest(e.target.value) }))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onClose} style={{ padding: 'var(--ds-btn-py) 20px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button onClick={handleCreate} disabled={!title || (!customer && !newCustomer)} style={{ padding: 'var(--ds-btn-py) 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!title || (!customer && !newCustomer)) ? 0.5 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Create Job</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Component -----------------------------------------------------------

export function ShipmentBoard() {
  const jobs = useJobs();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isFullLayout = useFullLayout();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const [view, setView] = useState<'list' | 'kanban'>('list');

  const selectedJob = selected ? jobs.find(j => j.id === selected) : null;

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !search || [j.id, j.title, j.customer, j.bl || '', j.tansad || ''].some(v => v.toLowerCase().includes(q));
    const matchStage = stageFilter === 'all' || j.stage === stageFilter;
    return matchSearch && matchStage;
  });

  const stagesWithJobs = STAGES.filter(s => jobs.some(j => j.stage === s.id));

  function handleCreate(job: ClearanceJob) {
    addJob(job);
    setShowCreate(false);
    navigate(`/clearance/${job.id}`);
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', maxWidth: isFullLayout ? 'none' : 1400, margin: '0 auto', width: '100%' }}>
      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '16px 20px 12px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <PageHeader
                crumbs={['ClearOS', 'Clearance Board']}
                titlePlain="Clearance"
                titleEm="board"
              />
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink3)' }}>
                {jobs.length} jobs · {jobs.filter(j => j.flags.includes('sla_breach')).length} SLA breach · {jobs.filter(j => j.flags.includes('demurrage')).length} demurrage
              </p>
            </div>
            <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="plus" size={15} /> New Shipment
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }}><Icon name="search" size={13} /></span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search CLR#, customer, B/L, TANSAD…" style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <Select value={stageFilter} onValueChange={v => setStageFilter(v as Stage | 'all')}>
              <SelectTrigger style={{ width: 'auto', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, height: 'auto' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['list', 'kanban'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ padding: 'var(--ds-btn-py) 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: view === v ? 'var(--teal)' : 'var(--white)', color: view === v ? '#fff' : 'var(--ink3)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {v === 'list' ? '= List' : '? Board'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px', flexShrink: 0, overflowX: 'auto' }}>
          {[
            { label: 'Total Jobs', value: jobs.length, color: 'var(--teal)' },
            { label: 'In Progress', value: jobs.filter(j => j.stage !== 'completed').length, color: '#2563eb' },
            { label: 'Completed', value: jobs.filter(j => j.stage === 'completed').length, color: '#059669' },
            { label: 'SLA Breach', value: jobs.filter(j => j.flags.includes('sla_breach')).length, color: 'var(--red)' },
            { label: 'Demurrage', value: jobs.filter(j => j.flags.includes('demurrage')).length, color: '#ea580c' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 16px', minWidth: 90, flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Cards */}
        <div style={{ flex: 1, overflowX: view === 'kanban' ? 'auto' : 'hidden', overflowY: view === 'list' ? 'auto' : 'hidden', padding: '0 20px 20px' }}>
          {view === 'list' ? (
            <div style={{ maxWidth: 760 }}>
              {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>No jobs match your filter.</div>}
              {filtered.map(job => (
                <JobCard key={job.id} job={job} selected={selected === job.id} isMobile={isMobile} onSelect={() => setSelected(selected === job.id ? null : job.id)} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, height: '100%', paddingBottom: 8 }}>
              {stagesWithJobs.map(s => {
                const stageJobs = filtered.filter(j => j.stage === s.id);
                return (
                  <div key={s.id} className="kb-col">
                    <div className="kb-col-head" style={{ borderTopColor: s.color }}>
                      <span className="kb-col-label">{s.label}</span>
                      <span className="kb-col-badge" style={{ background: s.color }}>{stageJobs.length}</span>
                    </div>
                    <div className="kb-col-body">
                      {stageJobs.map(job => <JobCard key={job.id} job={job} selected={selected === job.id} isMobile={isMobile} onSelect={() => setSelected(selected === job.id ? null : job.id)} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Summary panel — hidden on mobile (tap card opens full view) */}
      {selectedJob && !isMobile && (
        <SummaryPanel
          job={selectedJob}
          onClose={() => setSelected(null)}
        />
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} isMobile={isMobile} />}
    </div>
  );
}

// Re-export for use in Icon references
export type { IconName };
