import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { KanbanBoard, type KanbanCardData } from '../components/ui/kanban-board.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import './Lens.css';

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

interface Link { provider: string; kind: string; external_id: string; url: string | null; external_status: string | null }
interface Card {
  id: string; ref: string; kind: Kind; title: string; status: string;
  severity: string; confidence: Confidence; waiting_on: string | null;
  area_name: string | null; links: Link[];
}
interface Column { id: string; name: string; status: string; wip_limit: number | null; items: Card[]; count: number; over_wip: boolean }

interface Item {
  id: string; ref: string; kind: Kind; title: string; body: string | null;
  area_id: string | null; area_name?: string | null;
  status: Status; severity: Severity; confidence: Confidence;
  evidence: string | null; waiting_on: string | null;
  refs: string[]; tags: string[];
  resolution: string | null; created_at: string;
}
interface Area { id: string; name: string; kind: string; description: string | null }
interface Project { id: string; name: string; key: string; description: string | null }
interface Stats {
  total: number; open: number; unproven: number;
  by_kind: Record<string, number>; by_severity: Record<string, number>;
  by_confidence: Record<string, number>;
}
interface Event { id: string; kind: string; detail: string | null; actor_name: string | null; created_at: string }

const KIND_VARIANT: Record<Kind, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  BUG: 'error', FEATURE: 'brand', DEBT: 'warning', DECISION: 'info', QUESTION: 'gray', RISK: 'error',
};
const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'var(--red)', HIGH: 'var(--gold)', NORMAL: 'var(--ink3)', LOW: 'var(--ink3)',
};
const CONFIDENCE_VARIANT: Record<Confidence, 'success' | 'warning' | 'gray'> = {
  CONFIRMED: 'success', SUSPECTED: 'warning', UNVERIFIED: 'gray',
};
const CONFIDENCE_HINT: Record<Confidence, string> = {
  CONFIRMED: 'Somebody ran this and it behaved as described.',
  SUSPECTED: 'A reading of the code. Nobody has reproduced it yet.',
  UNVERIFIED: 'Reported, not yet looked at.',
};

function renderPriorityBadge(severity: string) {
  if (severity === 'CRITICAL') {
    return (
      <span className="lens-prio-wrap lens-prio-critical" title="Critical Priority">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a.75.75 0 01.75.75v5a.75.75 0 01-1.5 0v-5A.75.75 0 018 3.5zm0 8.5a1 1 0 110-2 1 1 0 010 2z"/>
        </svg>
        <span>CRITICAL</span>
      </span>
    );
  }
  if (severity === 'HIGH') {
    return (
      <span className="lens-prio-wrap lens-prio-high" title="High Priority">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="7" width="2.2" height="4" rx="0.5" fill="currentColor"/>
          <rect x="5" y="4" width="2.2" height="7" rx="0.5" fill="currentColor"/>
          <rect x="9" y="1" width="2.2" height="10" rx="0.5" fill="currentColor"/>
        </svg>
        <span>HIGH</span>
      </span>
    );
  }
  return null;
}

function renderKindTag(kind: Kind) {
  const k = (kind || 'FEATURE').toLowerCase();
  return (
    <span className={`lens-kind-badge kind-${k}`}>
      <span className="lens-kind-dot" />
      {kind}
    </span>
  );
}

function renderConfidenceTag(confidence: Confidence) {
  if (confidence === 'CONFIRMED') return null;
  const isUnverified = confidence === 'UNVERIFIED';
  return (
    <span
      className={`lens-conf-badge ${isUnverified ? 'conf-unverified' : ''}`}
      title={CONFIDENCE_HINT[confidence]}
    >
      <span style={{ fontSize: 9 }}>{isUnverified ? '⚠️' : '👁️'}</span>
      {isUnverified ? 'Unverified' : 'Suspected'}
    </span>
  );
}

function renderLensColumnHeader(col: { id: string; label: string; color?: string }, count: number) {
  let iconSvg: React.ReactNode;
  switch (col.id) {
    case 'OPEN':
      iconSvg = (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--ink3)" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeDasharray="3.5 2.5" />
        </svg>
      );
      break;
    case 'IN_PROGRESS':
      iconSvg = (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--teal)" strokeWidth="2">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 2a6 6 0 0 1 6 6h-6V2z" fill="var(--teal)" />
        </svg>
      );
      break;
    case 'BLOCKED':
      iconSvg = (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <polygon points="5,2 11,2 14,5 14,11 11,14 5,14 2,11 2,5" fill="var(--red-l)" stroke="var(--red)" strokeWidth="1.5" />
          <line x1="5.5" y1="8" x2="10.5" y2="8" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
      break;
    case 'DONE':
      iconSvg = (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" fill="var(--green)" />
          <path d="M5 8.2l2 2 4.2-4.4" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
      break;
    default:
      iconSvg = (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--ink3)" strokeWidth="2">
          <circle cx="8" cy="8" r="6" />
        </svg>
      );
  }

  return (
    <div className="lens-col-header-custom">
      <div className="lens-col-title-wrap">
        <span className="lens-col-icon">{iconSvg}</span>
        <span className="lens-col-name">{col.label}</span>
      </div>
      <span className="lens-col-badge">{count}</span>
    </div>
  );
}

const PROVIDER_ICON: Record<string, string> = {
  github: 'gitBranch', slack: 'chatBubble', jira: 'layers', linear: 'list', circleci: 'refresh',
};

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'];
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CONFIDENCES: Confidence[] = ['CONFIRMED', 'SUSPECTED', 'UNVERIFIED'];

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' };
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
  fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', width: '100%',
};
const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};

export function Lens() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('project_id') || '';

  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [activeCol, setActiveCol] = useState<string>('all');
  const [items, setItems] = useState<Item[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ci, setCi] = useState<any>(null);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [fProject, setFProject] = useState(initialProjectId);
  const [fKind, setFKind] = useState('');
  const [fArea, setFArea] = useState('');
  const [fConfidence, setFConfidence] = useState('');
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const hasActiveFilters = Boolean(fProject || fKind || fArea || fConfidence || q || showClosed);
  const clearFilters = () => {
    setFProject('');
    setFKind('');
    setFArea('');
    setFConfidence('');
    setQ('');
    setShowClosed(false);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('project_id');
      return p;
    });
  };

  // Sync state if URL changes externally
  useEffect(() => {
    const p = searchParams.get('project_id') || '';
    if (p !== fProject) setFProject(p);
  }, [searchParams]);

  // List view only — the board doesn't paginate (a kanban column with a page
  // boundary through it makes drag-and-drop nonsensical), so this drives
  // /v1/lens/items alone, which the board's own /v1/lens/board call never
  // touches.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [closing, setClosing] = useState<{ card: Card; status: string } | null>(null);
  const [resolution, setResolution] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fProject) params.set('project_id', fProject);
    if (fKind) params.set('kind', fKind);
    if (fArea) params.set('area', fArea);
    if (fConfidence) params.set('confidence', fConfidence);
    if (q) params.set('q', q);
    if (showClosed) params.set('include_closed', '1');
    const itemParams = new URLSearchParams(params);
    itemParams.set('limit', String(PAGE_SIZE));
    itemParams.set('offset', String((page - 1) * PAGE_SIZE));
    Promise.all([
      apiFetch(`/v1/lens/items?${itemParams}`),
      apiFetch(`/v1/lens/board?${params}`),
      apiFetch('/v1/lens/areas'),
      apiFetch(`/v1/lens/stats${params.toString() ? `?${params}` : ''}`),
      apiFetch('/v1/lens/projects'),
    ])
      .then(([i, b, a, s, p]: any[]) => {
        setItems(i?.data ?? []);
        setTotal(i?.total ?? 0);
        setColumns(b ?? []);
        setAreas(a ?? []);
        setStats(s ?? null);
        setProjects(Array.isArray(p) ? p : []);
      })
      .catch(() => { setItems([]); setTotal(0); setColumns([]); })
      .finally(() => setLoading(false));

    apiFetch('/v1/lens/ci').then(setCi).catch(() => setCi(null));
  }, [fProject, fKind, fArea, fConfidence, q, showClosed, page]);

  useEffect(() => { load(); }, [load]);
  // A filter/search change makes the current page number meaningless against
  // the new result set — back to page 1 rather than showing a page that may
  // no longer exist (or silently skipping matches on pages 1..n-1).
  useEffect(() => { setPage(1); }, [fProject, fKind, fArea, fConfidence, q, showClosed]);

  function open(ref: string) {
    navigate(`/lens/items/${ref}`);
  }

  async function move(card: Card, status: string) {
    if (card.status === status) return;
    if (status === 'DONE' || status === 'WONTFIX') { setClosing({ card, status }); setResolution(''); return; }

    const before = columns;
    setColumns(cols => cols.map(c => ({
      ...c,
      items: c.status === status
        ? [{ ...card, status }, ...c.items.filter(i => i.id !== card.id)]
        : c.items.filter(i => i.id !== card.id),
    })).map(c => ({ ...c, count: c.items.length, over_wip: c.wip_limit != null && c.items.length > c.wip_limit })));

    try {
      await apiFetch(`/v1/lens/items/${card.ref}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (e: any) {
      setColumns(before);
      setNotice({ kind: 'err', text: e?.message || `Could not move ${card.ref}` });
    }
  }

  async function confirmClose() {
    if (!closing || !resolution.trim()) return;
    try {
      await apiFetch(`/v1/lens/items/${closing.card.ref}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: closing.status, resolution: resolution.trim() }),
      });
      setNotice({ kind: 'ok', text: `${closing.card.ref} closed.` });
      setClosing(null); load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not close it' });
    }
  }

  if (composing) {
    return <Compose areas={areas} onClose={() => setComposing(false)}
      onSaved={(ref) => { setComposing(false); setNotice({ kind: 'ok', text: `${ref} opened.` }); load(); }} />;
  }

  const totalBoardItems = columns.reduce((acc, col) => acc + (col.items?.length || 0), 0);

  const activeProject = projects.find(p => p.id === fProject);

  return (
    <div className="lens-page">
      <PageHeader
        crumbs={activeProject ? ['Lens', activeProject.name] : ['Lens']}
        titlePlain={activeProject ? activeProject.name : "Developer"}
        titleEm={activeProject ? activeProject.key : "record"}
        subtitle={activeProject ? `Project record: what is pending, broken, or decided in ${activeProject.name}.` : "What is pending, what is broken, and what was decided — across the whole platform."}
        actions={
          <div className="lens-header-actions">
            {ci?.ok && !ci.empty && (
              <span className="lens-ci-badge" title={`Pipeline #${ci.number} · ${ci.vcs ?? ''}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
                padding: '5px 10px', borderRadius: 'var(--r-sm)',
                background: ci.state === 'created' ? 'var(--blue-l)' : 'var(--bg)',
                border: '1px solid var(--border)', color: 'var(--ink2)',
              }}>
                <Icon name="refresh" size={12} /> CI #{ci.number} · {ci.state}
              </span>
            )}

            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              {(['board', 'list'] as const).map(m => (
                <button key={m} type="button" onClick={() => setViewMode(m)} style={{
                  padding: isMobile ? "6px 10px" : "var(--action-py) var(--space-md)", border: 'none', background: viewMode === m ? 'var(--teal)' : 'var(--white)',
                  color: viewMode === m ? '#fff' : 'var(--ink3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  fontWeight: 600, fontSize: isMobile ? 12 : "var(--text-base)"
                }} data-ui-native-button="">
                  <Icon name={m === 'board' ? 'columns' : 'list'} size={14} style={{ marginRight: isMobile ? 3 : 6 }} color={viewMode === m ? '#fff' : 'var(--ink3)'} />
                  {m === 'board' ? 'Board' : 'List'}
                </button>
              ))}
            </div>

            <Button size="sm" type="button" onClick={() => setComposing(true)}>
              <Icon name="plus" size={14} color="#fff" /> {isMobile ? 'New' : 'New item'}
            </Button>
          </div>
        }
      />

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--r)',
          fontSize: 12.5, fontWeight: 600,
          background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{notice.text}</div>
      )}

      {/* Filters */}
      <div style={{ margin: '0 0 16px', flexShrink: 0, width: '100%' }}>
        <SectionCard>
          <div className="lens-filters-wrap">
            <div className="lens-filters-controls">
              <Select value={fProject || '__all__'} onValueChange={v => {
                const next = v === '__all__' ? '' : v;
                setFProject(next);
                setSearchParams(prev => {
                  const p = new URLSearchParams(prev);
                  if (next) p.set('project_id', next);
                  else p.delete('project_id');
                  return p;
                });
              }}>
                <SelectTrigger className="lens-filter-select" style={{ minWidth: isMobile ? 0 : 160, width: isMobile ? '100%' : 'auto' }}>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All projects</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={fKind || '__all__'} onValueChange={v => setFKind(v === '__all__' ? '' : v)}>
                <SelectTrigger className="lens-filter-select" style={{ minWidth: isMobile ? 0 : 130, width: isMobile ? '100%' : 'auto' }}>
                  <SelectValue placeholder="All kinds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All kinds</SelectItem>
                  {KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={fArea || '__all__'} onValueChange={v => setFArea(v === '__all__' ? '' : v)}>
                <SelectTrigger className="lens-filter-select" style={{ minWidth: isMobile ? 0 : 160, width: isMobile ? '100%' : 'auto' }}>
                  <SelectValue placeholder="All areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All areas</SelectItem>
                  {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {viewMode === 'list' && (
                <Select value={fConfidence || '__all__'} onValueChange={v => setFConfidence(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="lens-filter-select" style={{ minWidth: isMobile ? 0 : 170, width: isMobile ? '100%' : 'auto' }}>
                    <SelectValue placeholder="Any confidence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any confidence</SelectItem>
                    {CONFIDENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <label className="lens-closed-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                <Checkbox checked={showClosed} onCheckedChange={c => setShowClosed(c === true)} />
                Show closed
              </label>

              {hasActiveFilters && (
                <Button variant="ghost" size="xs" onClick={clearFilters} style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  <Icon name="x" size={12} /> Clear
                </Button>
              )}
            </div>

            <div className="lens-search-wrap">
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none', display: 'flex', zIndex: 1 }}>
                  <Icon name="search" size={14} />
                </span>
                <Input
                  type="search"
                  aria-label="Search title, body, evidence"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search title, body, evidence…"
                  style={{ paddingLeft: 32, paddingRight: q ? 28 : 10 }}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}
                    title="Clear search"
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {loading ? (
        <SectionLoading />
      ) : viewMode === 'board' ? (
        (() => {
          const allCards = columns.flatMap(c => c.items.map(card => ({ ...card, id: card.id, columnId: c.status })));
          const displayedColumns = (activeCol !== 'all')
            ? columns.filter(c => c.status === activeCol)
            : columns;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', minWidth: 0 }}>
              <div className={`lens-board-scroll-wrap${activeCol !== 'all' ? ' lens-board-single-col' : isMobile ? ' lens-board-mobile-swipe' : ''}`}>
                <KanbanBoard
                  columns={displayedColumns.map(c => ({ id: c.status, label: c.name, color: c.over_wip ? 'var(--red)' : 'var(--ink2)' }))}
                  items={allCards}
                  emptyMessage="No items in this column"
                  defaultPageSize={8}
                  pageSizeOptions={[8, 16, 32]}
                  renderColumnHeader={renderLensColumnHeader}
                  toolbarLeft={
                    <div className="lens-col-tabs" role="tablist" aria-label="Kanban columns">
                      <button
                        type="button"
                        className={`lens-col-tab-btn${activeCol === 'all' ? ' active' : ''}`}
                        onClick={() => setActiveCol('all')}
                      >
                        All <span className="lens-tab-count">{totalBoardItems}</span>
                      </button>
                      {columns.map(c => {
                        const dotColor = c.status === 'BLOCKED' || c.over_wip ? 'var(--red)' : c.status === 'IN_PROGRESS' ? 'var(--teal)' : c.status === 'DONE' ? 'var(--green)' : 'var(--ink3)';
                        return (
                          <button
                            key={c.status}
                            type="button"
                            className={`lens-col-tab-btn${activeCol === c.status ? ' active' : ''}`}
                            onClick={() => setActiveCol(c.status)}
                          >
                            <span className="lens-tab-dot" style={{ background: dotColor }} />
                            {c.name}
                            <span className="lens-tab-count">{c.items.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  }
                  onDrop={(itemId, _from, toCol) => {
                    const card = allCards.find(c => c.id === itemId);
                    if (card) move(card, toCol);
                  }}
                  boardStyle={
                    activeCol !== 'all'
                      ? { display: 'grid', gridTemplateColumns: '1fr', width: '100%', gap: 12 }
                      : isMobile
                        ? undefined
                        : {
                          display: 'grid',
                          gridTemplateColumns: `repeat(${displayedColumns.length}, minmax(280px, 1fr))`,
                          minWidth: 'fit-content',
                          width: '100%',
                          gap: 14,
                        }
                  }
                  renderCard={(item) => (
                    <div onClick={() => open(item.ref)} style={{ cursor: 'pointer' }}>
                      <div className="lens-card-header">
                        <div className="lens-card-id-wrap">
                          <span className="lens-card-ref">{item.ref}</span>
                          {renderKindTag(item.kind)}
                          {renderConfidenceTag(item.confidence)}
                        </div>
                        {renderPriorityBadge(item.severity)}
                      </div>

                      <div className="lens-card-title">{item.title}</div>

                      {item.waiting_on && (
                        <div className="lens-card-waiting">
                          <span style={{ fontSize: 10, flexShrink: 0, marginTop: 1 }}>⏳</span>
                          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.waiting_on}</span>
                        </div>
                      )}

                      {(item.area_name || (item.links && item.links.length > 0)) && (
                        <div className="lens-card-footer">
                          {item.area_name && (
                            <span className="lens-area-tag">#{item.area_name}</span>
                          )}
                          {item.links && item.links.length > 0 && (
                            <div className="lens-card-links">
                              {item.links.map((l: any) => (
                                <a
                                  key={`${l.provider}-${l.external_id}`}
                                  href={l.url ?? '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title={`${l.provider}: ${l.external_id}${l.external_status ? ` (${l.external_status})` : ''}`}
                                  style={{ color: 'var(--ink3)', textDecoration: 'none', display: 'flex' }}
                                >
                                  <Icon name={(PROVIDER_ICON[l.provider] ?? 'link') as any} size={11} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>
          );
        })()
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 8 }}>
            {items.length === 0 ? (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
                Nothing matches. {showClosed ? '' : 'Closed items are hidden — tick "Show closed" to include them.'}
              </div>
            ) : (
              <SectionCard padded={false}>
                {items.map(it => (
                  <button key={it.id} type="button" onClick={() => open(it.ref)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', background: 'none',
                      border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      padding: "var(--action-py) var(--space-md)", fontFamily: 'var(--font)',
                    }} data-ui-native-button="">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className="lens-card-ref">{it.ref}</span>
                      {renderKindTag(it.kind)}
                      {renderConfidenceTag(it.confidence)}
                      {it.status !== 'OPEN' && <Badge variant="gray">{it.status.replace('_', ' ')}</Badge>}
                      {it.area_name && <span className="lens-area-tag">#{it.area_name}</span>}
                      {renderPriorityBadge(it.severity)}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>{it.title}</div>
                    {it.waiting_on && (
                      <div className="lens-card-waiting" style={{ marginTop: 6, display: 'inline-flex' }}>
                        <span>⏳</span>
                        <span>Waiting on: {it.waiting_on}</span>
                      </div>
                    )}
                  </button>
                ))}
              </SectionCard>
            )}
          </div>

          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 2px 2px', flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="outline" size="sm" type="button" disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <Icon name="chevronLeft" size={14} /> Prev
                </Button>
                <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <Button variant="outline" size="sm" type="button" disabled={page * PAGE_SIZE >= total}
                  onClick={() => setPage(p => p + 1)}>
                  Next <Icon name="chevronRight" size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!closing} onOpenChange={o => { if (!o) setClosing(null); }}>
        <DialogContent className="max-w-105 gap-0">
          {closing && (
            <>
              <DialogTitle style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--ink)' }}>Close {closing.card.ref}</DialogTitle>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 16, lineHeight: 1.5 }}>
                Closing an item requires a resolution. What happened here? Was it fixed, proven false, or abandoned?
              </div>
              <Textarea
                aria-label="Resolution"
                autoFocus
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                placeholder="e.g. Fixed in #123"
                rows={3}
                style={{ marginBottom: 16 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="outline" type="button" onClick={() => setClosing(null)}>Cancel</Button>
                <Button type="button" disabled={!resolution.trim()} onClick={confirmClose}>Close {closing.card.ref}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Compose({ areas, onClose, onSaved }: {
  areas: Area[]; onClose: () => void; onSaved: (ref: string) => void;
}) {
  const isMobile = useIsMobile();
  const [f, setF] = useState({
    kind: 'BUG' as Kind, title: '', body: '', area_id: '',
    severity: 'NORMAL' as Severity, confidence: 'SUSPECTED' as Confidence,
    evidence: '', waiting_on: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!f.title.trim()) { setErr('A title is required'); return; }
    setSaving(true); setErr('');
    try {
      const r: any = await apiFetch('/v1/lens/items', {
        method: 'POST',
        body: JSON.stringify({ ...f, area_id: f.area_id || null, waiting_on: f.waiting_on || null }),
      });
      onSaved(r.ref);
    } catch (e: any) {
      setErr(e?.message || 'Could not save');
    } finally { setSaving(false); }
  }

  return (
    <div className="lens-page">
      <PageHeader crumbs={['Lens', 'New']} titlePlain="New" titleEm="item"
        subtitle="Say what it is, and say how you know." />

      <div className="card" style={{ maxWidth: 760, width: '100%', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, boxSizing: 'border-box' }}>
        {err && (
          <div style={{ gridColumn: '1 / -1' }}><Banner variant="error">{err}</Banner></div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="compose-title" style={label}>Title *</label>
          <Input
            id="compose-title"
            value={f.title}
            onChange={e => setF({ ...f, title: e.target.value })}
            placeholder="What is wrong, or what is missing"
            required
          />
        </div>

        <div>
          <label htmlFor="compose-kind" style={label}>Kind</label>
          <Select value={f.kind} onValueChange={v => setF({ ...f, kind: v as Kind })}>
            <SelectTrigger id="compose-kind"><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="compose-area" style={label}>Area</label>
          <Select value={f.area_id || '__none__'} onValueChange={v => setF({ ...f, area_id: v === '__none__' ? '' : v })}>
            <SelectTrigger id="compose-area"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="compose-severity" style={label}>Severity</label>
          <Select value={f.severity} onValueChange={v => setF({ ...f, severity: v as Severity })}>
            <SelectTrigger id="compose-severity"><SelectValue /></SelectTrigger>
            <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="compose-confidence" style={label}>Confidence</label>
          <Select value={f.confidence} onValueChange={v => setF({ ...f, confidence: v as Confidence })}>
            <SelectTrigger id="compose-confidence"><SelectValue /></SelectTrigger>
            <SelectContent>{CONFIDENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 3 }}>
            {CONFIDENCE_HINT[f.confidence]}
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="compose-body" style={label}>What it is</label>
          <Textarea
            id="compose-body"
            rows={4}
            value={f.body}
            onChange={e => setF({ ...f, body: e.target.value })}
            placeholder="What happens, where, and what it costs."
          />
        </div>

        {/* Asked separately from the description on purpose. "What it does" and
            "how you know" are different claims, and conflating them is how a
            reading of the code becomes a reported fact. */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="compose-evidence" style={label}>How you know</label>
          <Textarea
            id="compose-evidence"
            rows={3}
            value={f.evidence}
            onChange={e => setF({ ...f, evidence: e.target.value })}
            placeholder="The command you ran, the figures that came back, the query that returned the row. Leave blank if you have not reproduced it — that is what SUSPECTED means."
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="compose-waiting" style={label}>Waiting on</label>
          <Input
            id="compose-waiting"
            value={f.waiting_on}
            onChange={e => setF({ ...f, waiting_on: e.target.value })}
            placeholder="A person, a decision, an authority — anything blocking it"
          />
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} loading={saving} disabled={!f.title.trim()} loadingText="Saving…">
            Open item
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── New item ───────────────────────────────────────────────────────────── */
