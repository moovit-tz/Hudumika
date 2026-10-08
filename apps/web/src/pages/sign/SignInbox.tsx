// ─── SignInbox.tsx — Inbox + Sent + Drafts + Completed views ─────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiFetchBlob, apiDownload, BASE_URL } from '../../lib/api.js';
import type { SignEnvelope, SignRecipient } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.js';
import { PageLoading, SectionLoading } from '../../components/ui/spinner.js';
import { Progress } from '../../components/ui/progress.js';
import { Card } from '../../components/ui/card.js';
import { SkeletonCardsGrid, SkeletonTable } from '../../components/ui/skeleton.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Tip } from '../../components/ui/tooltip.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { MetricsRow } from '../../components/MetricCard.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
// Same real-canvas PDF render Cloud's Lightbox and the envelope editor both
// use — this page used to show only a filename chip, with no way to
// actually see the document without downloading it first.
import { usePdfDocument } from '../cloud/lib/usePdfDocument.js';
import { PdfPageCanvas } from '../cloud/components/PdfPageCanvas.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAuth } from '../../hooks/useAuth.js';
import './Sign.css';

const DETAIL_A4_ASPECT = 1.414; // height/width ratio of A4, same constant SignEditor.tsx uses

type EnvelopeWithRecipients = SignEnvelope & { recipients: SignRecipient[] };

const PER_PAGE = 20;

function Pagination({ total, page, onPage, perPage = PER_PAGE }: { total: number; page: number; onPage: (p: number) => void; perPage?: number }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }
  const btnBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 32, padding: '0 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', padding: '16px 0', flexShrink: 0 }}>
      <button type="button" style={{ ...btnBase, color: page === 1 ? 'var(--ink3)' : 'var(--ink)' }} disabled={page === 1} onClick={() => onPage(page - 1)} data-ui-native-button="">
        <Icon name="chevronLeft" size={13} />
      </button>
      {pages.map((p, i) => p === '...' ? (
        <span key={`e${i}`} style={{ color: 'var(--ink3)', fontSize: 12.5, padding: '0 4px' }}>…</span>
      ) : (
        <button key={p} type="button" onClick={() => onPage(p as number)}
          style={{ ...btnBase, background: p === page ? 'hsl(var(--primary))' : 'var(--bg)', color: p === page ? 'hsl(var(--primary-foreground))' : 'var(--ink)', borderColor: p === page ? 'hsl(var(--primary))' : 'var(--border)' }} data-ui-native-button="">
          {p}
        </button>
      ))}
      <button type="button" style={{ ...btnBase, color: page === totalPages ? 'var(--ink3)' : 'var(--ink)' }} disabled={page === totalPages} onClick={() => onPage(page + 1)} data-ui-native-button="">
        <Icon name="chevronRight" size={13} />
      </button>
      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink3)' }}>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
    </div>
  );
}

function PerPageSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)' }}>
      <span>Show</span>
      <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
        <SelectTrigger aria-label="Documents per page" className="w-20"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
        </SelectContent>
      </Select>
      <span>per page</span>
    </div>
  );
}

const VIEW_TABS = [
  { key: 'documents', label: 'Documents',    icon: 'fileText'    as const,
    subtitle: 'Create, send, and track your signing documents.' },
  { key: 'inbox',     label: 'Inbox',     icon: 'download'    as const,
    emWord: 'inbox', titlePlain: 'My',
    subtitle: 'Documents ready for your signature or approval.' },
  { key: 'sent',      label: 'Sent',         icon: 'send'        as const,
    subtitle: 'Everything you have sent out, at every stage from just-sent to fully signed.' },
  { key: 'drafts',    label: 'Drafts',       icon: 'edit'        as const,
    subtitle: 'Still being prepared on your side — not sent to anyone yet.' },
  { key: 'completed', label: 'Completed',    icon: 'checkCircle' as const,
    subtitle: 'Every recipient has signed. Fully executed and locked.' },
  // Voided and Declined used to share the same xCircle icon — both mean
  // "this didn't get signed," but for opposite reasons (you cancelled it
  // vs. a signer refused it), so they need distinct icons and copy that
  // actually says who stopped it and why — that's the exact distinction
  // a first-time user can't tell from the label alone.
  { key: 'voided',          label: 'Voided',       icon: 'xCircle'     as const,
    subtitle: 'You (the sender) cancelled these before everyone finished signing.' },
  { key: 'needs_rerouting', label: 'Action needed', icon: 'refresh'     as const,
    subtitle: 'A signer declined — re-assign that slot to a different person to keep going.' },
  { key: 'declined',        label: 'Declined',     icon: 'userMinus'   as const,
    subtitle: 'A signer refused to sign — the envelope stopped because of them, not you.' },
  { key: 'expired',         label: 'Expired',      icon: 'clock'       as const,
    subtitle: 'Nobody cancelled or declined these — they just passed their signing deadline first.' },
] as const;
type ViewKey = typeof VIEW_TABS[number]['key'];

// Same semantic mapping as statusBadgeClass/recipientStatusBadgeClass above,
// but as ui/badge.tsx variants — for SignEnvelopeDetail, which uses the real
// Badge component (CLAUDE.md's design-system mapping: "Status pill → Badge")
// rather than this file's own .sign-badge-* CSS classes.
type BadgeVariant = 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';
function envelopeBadgeVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    draft: 'gray', sent: 'info', completed: 'success', voided: 'error', declined: 'error', expired: 'gray',
    needs_rerouting: 'warning',
  };
  return map[status] ?? 'gray';
}
// Migration 416 — only WITNESSED_SIGNATURE/AFFIDAVIT/NOTARIAL_CERTIFICATION
// ever render; NORMAL_SIGN is the default and deliberately shows no badge.
const EXECUTION_TYPE_LABEL: Record<string, string> = {
  WITNESSED_SIGNATURE: 'Witnessed Signature',
  AFFIDAVIT: 'Affidavit',
  NOTARIAL_CERTIFICATION: 'Notarial Certification',
};
function recipientBadgeVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    pending: 'warning', viewed: 'info', signed: 'success', declined: 'error',
  };
  return map[status] ?? 'warning';
}

/** Stacked, overlapping avatars for a "who's on this envelope" summary —
 *  shared by grid (EnvelopeCard) and list (EnvelopeRow). PersonAvatar draws
 *  a real photo when a recipient is a linked platform user, deterministic
 *  per-name initials otherwise — replacing the old array-index-based
 *  coloring, which reassigned colors to the wrong person if recipients were
 *  ever reordered. */
function RecipientAvatarStack({ recipients, size, max }: { recipients: SignRecipient[]; size: number; max: number }) {
  return (
    <div style={{ display: 'flex' }}>
      {recipients.slice(0, max).map((r, i) => (
        // Tip, not PersonAvatar's own native-title fallback — every other
        // hover label on this page (view toggle, share buttons, amend/void
        // actions) already renders through the platform's styled tooltip;
        // this stack was the one place still popping the browser's plain,
        // unstyled title after a full second's delay.
        <Tip key={r.id} label={`${r.name} · ${r.status}`}>
          <PersonAvatar userId={r.user_id ?? r.matched_user_id ?? undefined} name={r.name} size={size}
            style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.28), border: '2px solid var(--card-bg)' }} />
        </Tip>
      ))}
    </div>
  );
}

function EnvelopeCard({ env, onClick, selected, onToggleSelect, signUrl }: { env: EnvelopeWithRecipients; onClick: () => void; selected: boolean; onToggleSelect: (evt: React.MouseEvent) => void; signUrl?: string | null }) {
  const signerCount = env.recipients?.length ?? 0;
  const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;

  return (
    <div className="sign-envelope-card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()} style={{ position: 'relative' }}>
      <Checkbox checked={selected} aria-label={`Select ${env.title}`} onClick={onToggleSelect} className="sign-envelope-select" />
      <div className="sign-envelope-icon"><Icon name="fileText" size={20} style={{ color: 'var(--teal)' }} /></div>
      <div className="sign-envelope-meta">
        <div className="sign-envelope-title">{env.title}</div>
        <div className="sign-envelope-sub">
          <Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge>
          {env.file_name && <span style={{ color: 'var(--ink3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={11} /> {env.file_name}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>
            {new Date(env.updated_at).toLocaleDateString()}
          </span>
        </div>
        {signerCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <RecipientAvatarStack recipients={env.recipients} size={22} max={5} />
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {signedCount}/{signerCount} signed
            </span>
          </div>
        )}
        {signUrl && (
          <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
            <Button size="sm" onClick={e => { e.stopPropagation(); window.open(signUrl, '_blank', 'noopener'); }}
              style={{ width: '100%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700 }}>
              <Icon name="edit" size={13} /> Sign Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Dense, single-row rendering for list view — a real table row rather than
 *  a hand-laid-out div, so Document/Status/Recipients/Updated line up in the
 *  same column on every row regardless of how long any one envelope's title,
 *  status text or filename happens to be (same reasoning as the Companies
 *  table in SuperAdmin.tsx / DataTable). Grid view keeps the taller,
 *  two-row EnvelopeCard, which is a different visual shape on purpose. */
function EnvelopeRow({ env, onClick, selected, onToggleSelect }: { env: EnvelopeWithRecipients; onClick: () => void; selected: boolean; onToggleSelect: (evt: React.MouseEvent) => void }) {
  const signerCount = env.recipients?.length ?? 0;
  const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;

  return (
    <tr onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()} style={{ cursor: 'pointer' }}>
      <td style={{ width: 34 }} onClick={onToggleSelect}>
        <Checkbox checked={selected} aria-label={`Select ${env.title}`} onClick={onToggleSelect} />
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.title}</div>
            {env.file_name && (
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Icon name="paperclip" size={10} /> {env.file_name}
              </div>
            )}
          </div>
        </div>
      </td>
      <td><Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge></td>
      <td>
        {signerCount > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RecipientAvatarStack recipients={env.recipients} size={20} max={4} />
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{signedCount}/{signerCount} signed</span>
          </div>
        ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
      </td>
      <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{new Date(env.updated_at).toLocaleDateString()}</td>
    </tr>
  );
}

/** Inbox-specific row: replaces generic EnvelopeRow for view==="inbox".
 *  Shows Sent By (PersonAvatar), my recipient status, and a direct "Sign Now" CTA. */
function InboxEnvelopeRow({ env, userId, onClick }: { env: EnvelopeWithRecipients; userId: string | undefined; onClick: () => void }) {
  const myR = env.recipients?.find(r => r.user_id === userId || r.matched_user_id === userId);
  const signUrl = myR?.token ? `/sign/public/${myR.token}` : null;
  const canSign = myR?.status === 'pending' || myR?.status === 'viewed';
  return (
    <tr onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()} style={{ cursor: 'pointer' }}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.title}</div>
            {env.file_name && (
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Icon name="paperclip" size={10} /> {env.file_name}
              </div>
            )}
          </div>
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PersonAvatar userId={env.created_by} name={env.created_by_name ?? ''} size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.created_by_name ?? 'Unknown'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(env.updated_at).toLocaleDateString()}</div>
          </div>
        </div>
      </td>
      <td>
        {myR ? (
          <div>
            <Badge variant={recipientBadgeVariant(myR.status)}>
              {myR.status === 'pending' ? 'Awaiting' : myR.status}
            </Badge>
            {myR.role_label && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{myR.role_label}</div>}
          </div>
        ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
      </td>
      <td style={{ textAlign: 'right', paddingRight: 12 }} onClick={e => e.stopPropagation()}>
        {canSign && signUrl ? (
          <Button size="sm" onClick={() => window.open(signUrl, '_blank', 'noopener')}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, gap: 5 }}>
            <Icon name="edit" size={13} /> Sign Now
          </Button>
        ) : myR?.status === 'signed' ? (
          <Badge variant="success">Signed</Badge>
        ) : null}
      </td>
    </tr>
  );
}

type ViewMode = 'list' | 'grid';
type SortOption = 'newest' | 'oldest' | 'title_asc' | 'title_desc';
type DateRangeOption = 'all' | 'today' | '7days' | '30days' | '90days';

export function SignInbox({ view }: { view: ViewKey }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [envelopes, setEnvelopes] = useState<EnvelopeWithRecipients[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  // Debounced so every keystroke doesn't fire its own request — real
  // Postgres full-text search (migration 463) replaces what used to be an
  // in-memory substring filter over whatever page had already loaded.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Advanced filtering & sorting states (Dreams Core pattern)
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [dateRange, setDateRange] = useState<DateRangeOption>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [execTypeFilter, setExecTypeFilter] = useState<string>('all');

  useEffect(() => {
    apiFetch('/v1/sign/envelopes/counts').then(setCounts).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadEnvelopes = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    // Drafts are a personal work-in-progress, same as Sent — the backend
    // scopes both to created_by when `view` is set, not just `status`.
    if (view === 'drafts') { params.set('status', 'draft'); params.set('view', 'drafts'); }
    else if (view === 'completed') params.set('status', 'completed');
    else if (view === 'voided') params.set('status', 'voided');
    else if (view === 'declined') params.set('status', 'declined');
    else if (view === 'needs_rerouting') params.set('status', 'needs_rerouting');
    else if (view === 'expired') params.set('status', 'expired');
    else params.set('view', view === 'documents' ? 'mine' : view);
    if (view === 'documents') params.set('limit', '200');
    if (debouncedSearch) params.set('search', debouncedSearch);

    return apiFetch(`/v1/sign/envelopes?${params}`)
      .then(setEnvelopes).catch(console.error)
      .finally(() => setLoading(false));
  }, [view, debouncedSearch]);

  useEffect(() => { loadEnvelopes(); }, [loadEnvelopes]);
  // Clears on a view or search change, not just view — otherwise a
  // selection made before narrowing the search could linger as a
  // "N selected" bar referencing rows no longer even in the list.
  useEffect(() => { setSelected(new Set()); }, [view, debouncedSearch, statusFilter, dateRange, execTypeFilter, sortBy]);

  function toggleSelect(id: string, evt: React.MouseEvent) {
    evt.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function bulkAction(action: 'void' | 'remind') {
    const ids = Array.from(selected);
    if (!ids.length || bulkBusy) return;
    if (action === 'void') {
      const ok = await showConfirm('Each one stops accepting signatures immediately. This cannot be undone.', {
        title: `Void ${ids.length} envelope${ids.length === 1 ? '' : 's'}?`,
        confirmLabel: 'Void', variant: 'danger',
      });
      if (!ok) return;
    }
    setBulkBusy(true);
    try {
      const res = await apiFetch('/v1/sign/envelopes/bulk', {
        method: 'POST', body: JSON.stringify({ ids, action }),
      });
      setSelected(new Set());
      await loadEnvelopes();
      const failed = (res.results as { id: string; ok: boolean; error?: string }[]).filter(r => !r.ok);
      if (failed.length) {
        showAlert(`${res.succeeded} succeeded, ${failed.length} skipped — ${failed[0].error}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ''}`);
      }
    } catch (err: any) {
      showAlert(err.message || `Bulk ${action} failed`);
    } finally {
      setBulkBusy(false);
    }
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (dateRange !== 'all') count++;
    if (execTypeFilter !== 'all') count++;
    return count;
  }, [statusFilter, dateRange, execTypeFilter]);

  function handleResetFilters() {
    setStatusFilter('all');
    setDateRange('all');
    setExecTypeFilter('all');
    setSortBy('newest');
    setSearch('');
  }

  // Client-side filtering & sorting on top of the backend fetched envelopes
  const filtered = useMemo(() => {
    let list = [...envelopes];

    // Status filter (when explicitly chosen in filter popover)
    if (statusFilter !== 'all') {
      list = list.filter(e => e.status === statusFilter);
    }

    // Date range filter
    if (dateRange !== 'all') {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      let maxAge = Infinity;
      if (dateRange === 'today') maxAge = oneDay;
      else if (dateRange === '7days') maxAge = 7 * oneDay;
      else if (dateRange === '30days') maxAge = 30 * oneDay;
      else if (dateRange === '90days') maxAge = 90 * oneDay;

      list = list.filter(e => {
        const itemDate = new Date(e.updated_at || e.created_at).getTime();
        return (now - itemDate) <= maxAge;
      });
    }

    // Execution type filter
    if (execTypeFilter !== 'all') {
      list = list.filter(e => (e as any).execution_type === execTypeFilter);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
      if (sortBy === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'title_desc') {
        return (b.title || '').localeCompare(a.title || '');
      }
      // default newest
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return list;
  }, [envelopes, statusFilter, dateRange, execTypeFilter, sortBy]);

  const currentTab = VIEW_TABS.find(t => t.key === view);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  // Reset to page 1 whenever the filtered set or per-page changes.
  useEffect(() => { setPage(1); }, [view, debouncedSearch, statusFilter, dateRange, execTypeFilter, sortBy, perPage]);
  const pageItems = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);

  function toggleAllVisible(checked: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      pageItems.forEach(envelope => checked ? next.add(envelope.id) : next.delete(envelope.id));
      return next;
    });
  }

  // Inbox metrics — how many of my items are pending/viewed/signed
  const inboxMetrics = useMemo(() => {
    if (view !== 'inbox') return null;
    const pending = envelopes.filter(e => e.recipients?.find(r => (r.user_id === user?.id || r.matched_user_id === user?.id) && r.status === 'pending')).length;
    const viewed  = envelopes.filter(e => e.recipients?.find(r => (r.user_id === user?.id || r.matched_user_id === user?.id) && r.status === 'viewed')).length;
    const signed  = envelopes.filter(e => e.recipients?.find(r => (r.user_id === user?.id || r.matched_user_id === user?.id) && r.status === 'signed')).length;
    return { pending, viewed, signed };
  }, [view, envelopes, user?.id]);

  return (
    <div className="sign-inbox-page">
      <PageHeader
        crumbs={['eSign', (currentTab?.label ?? view).toUpperCase()]}
        titlePlain={(currentTab as any)?.titlePlain ?? 'eSign'}
        titleEm={(currentTab as any)?.emWord ?? (currentTab?.label ?? view).toLowerCase()}
        subtitle={currentTab?.subtitle ?? 'Send documents for signature, track every recipient, and verify completed envelopes.'}
        actions={view === 'inbox' ? <Button variant="outline" onClick={() => navigate('/sign')}><Icon name="fileText" />Documents</Button> : (
          <Button size="lg" onClick={() => navigate('/sign/editor')}>
            <Icon name="plus" size={14} /> New envelope
          </Button>
        )}
      />

      {/* Inbox KPI strip — MetricsRow shows all 3 states at a glance */}
      {view === 'inbox' && (
        <MetricsRow cards={[
          { title: 'Awaiting action', value: String(inboxMetrics?.pending ?? 0), loading, icon: 'clock' as const, sub1Label: 'Ready for your action' },
          { title: 'Opened', value: String(inboxMetrics?.viewed ?? 0), loading, icon: 'eye' as const, sub1Label: 'Still awaiting a signature' },
          { title: 'Signed', value: String(inboxMetrics?.signed ?? 0), loading, icon: 'checkCircle' as const, sub1Label: 'Your part is complete' },
        ]} />
      )}

      {view === 'documents' && (
        <MetricsRow cards={[
          { title: 'Documents', value: String(envelopes.length), loading, icon: 'fileText', sub1Label: 'Created or shared with you' },
          { title: 'Awaiting action', value: String(counts.inbox ?? 0), loading, icon: 'clock', sub1Label: 'Ready for your signature' },
          { title: 'Completed', value: String(envelopes.filter(envelope => envelope.status === 'completed').length), loading, icon: 'checkCircle', sub1Label: 'All signatures collected' },
        ]} />
      )}
      <Card className="sign-inbox-panel" role="region" aria-label={`${currentTab?.label ?? view} envelopes`}>
        <div className="sign-inbox-navigation">
          <div className="sign-inbox-nav-content">
            <Tabs value={view} onValueChange={value => navigate(value === 'documents' ? '/sign' : `/sign/${value}`)}>
              <TabsList>
                {VIEW_TABS.slice(0, 5).map(tab => <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}{(counts[tab.key] ?? 0) > 0 && <Badge variant="gray">{counts[tab.key]}</Badge>}
                </TabsTrigger>)}
              </TabsList>
            </Tabs>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" aria-label="More document views">
                {VIEW_TABS.slice(5).some(tab => tab.key === view) ? currentTab?.label : 'More'}<Icon name="chevronDown" />
              </Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {VIEW_TABS.slice(5).map(tab => <DropdownMenuItem key={tab.key} onSelect={() => navigate(`/sign/${tab.key}`)}><Icon name={tab.icon} />{tab.label}{(counts[tab.key] ?? 0) > 0 && <Badge variant="gray">{counts[tab.key]}</Badge>}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="sign-inbox-search-row">
          <div className="sign-inbox-toolbar">
            <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search documents…"
            quickFilter={{
              label: 'Sort',
              value: sortBy,
              onChange: (v) => setSortBy((v as SortOption) ?? 'newest'),
              allLabel: 'Newest',
              options: [
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
                { value: 'title_asc', label: 'Title (A–Z)' },
                { value: 'title_desc', label: 'Title (Z–A)' },
              ],
            }}
            activeFilterCount={activeFilterCount}
            filterContent={(close) => {
              const hasActive = activeFilterCount > 0 || Boolean(search.trim());
              return (
                <div className="sign-filter-popover">
                  {/* Header */}
                  <div className="sign-filter-header">
                    <div className="sign-filter-title">
                      <Icon name="sliders" size={14} style={{ color: 'hsl(var(--primary))' }} />
                      <span>Filter Envelopes</span>
                      {activeFilterCount > 0 && (
                        <span className="stb-green-badge">
                          <span className="stb-green-dot" />
                          <span>{activeFilterCount}</span>
                        </span>
                      )}
                    </div>
                    {hasActive && (
                      <Button variant="ghost"
                        type="button"
                        onClick={handleResetFilters}


                      >
                        Reset all
                      </Button>
                    )}
                  </div>

                  {/* Date Range Section */}
                  <div className="sign-filter-group">
                    <label className="sign-filter-label">Updated Date</label>
                    <div className="sign-filter-chips">
                      {[
                        { id: 'all', label: 'All time' },
                        { id: 'today', label: 'Today' },
                        { id: '7days', label: 'Last 7 days' },
                        { id: '30days', label: 'Last 30 days' },
                        { id: '90days', label: 'Last 90 days' },
                      ].map(opt => (
                        <Button variant={dateRange === opt.id ? 'secondary' : 'outline'} aria-pressed={dateRange === opt.id}
                          key={opt.id}
                          type="button"


                          onClick={() => setDateRange(opt.id as DateRangeOption)}
                        >
                          {opt.label}
                          {dateRange === opt.id && <Icon name="check" size={12} />}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Status Section */}
                  <div className="sign-filter-group">
                    <label className="sign-filter-label">Status</label>
                    <div className="sign-filter-chips">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'draft', label: 'Draft', color: 'var(--ink3)' },
                        { id: 'sent', label: 'Sent', color: 'var(--blue)' },
                        { id: 'completed', label: 'Completed', color: 'var(--green)' },
                        { id: 'voided', label: 'Voided', color: 'var(--red)' },
                        { id: 'declined', label: 'Declined', color: 'var(--red)' },
                        { id: 'needs_rerouting', label: 'Action needed', color: 'var(--amber)' },
                        { id: 'expired', label: 'Expired', color: 'var(--ink3)' },
                      ].map(opt => (
                        <Button variant={statusFilter === opt.id ? 'secondary' : 'outline'} aria-pressed={statusFilter === opt.id}
                          key={opt.id}
                          type="button"


                          onClick={() => setStatusFilter(opt.id)}
                        >
                          {opt.color && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, display: 'inline-block' }} />
                          )}
                          {opt.label}
                          {statusFilter === opt.id && <Icon name="check" size={12} />}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Execution Type Section */}
                  <div className="sign-filter-group">
                    <label className="sign-filter-label">Execution Type</label>
                    <div className="sign-filter-chips">
                      {[
                        { id: 'all', label: 'All Types' },
                        { id: 'NORMAL_SIGN', label: 'Normal Sign' },
                        { id: 'WITNESSED_SIGNATURE', label: 'Witnessed' },
                        { id: 'AFFIDAVIT', label: 'Affidavit' },
                        { id: 'NOTARIAL_CERTIFICATION', label: 'Notarial' },
                      ].map(opt => (
                        <Button variant={execTypeFilter === opt.id ? 'secondary' : 'outline'} aria-pressed={execTypeFilter === opt.id}
                          key={opt.id}
                          type="button"


                          onClick={() => setExecTypeFilter(opt.id)}
                        >
                          {opt.label}
                          {execTypeFilter === opt.id && <Icon name="check" size={12} />}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="sign-filter-footer">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      onClick={() => {
                        handleResetFilters();
                        close();
                      }}
                      style={{ fontSize: 12 }}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      size="default"
                      onClick={() => close()}
                      style={{ fontSize: 12, fontWeight: 600 }}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              );
            }}
            />
          </div>
        </div>

        <div className="sign-inbox-list-meta">
          <span role="status">{loading ? 'Loading…' : `${filtered.length} document${filtered.length === 1 ? '' : 's'}`}</span>
          <div className="sign-inbox-list-options">
            <PerPageSelect value={perPage} onChange={value => { setPerPage(value); setPage(1); }} />
            <div className="sign-inbox-display" aria-label="Display">
              {(['list', 'grid'] as const).map(mode => <Tip key={mode} label={mode === 'list' ? 'List view' : 'Grid view'}><Button variant={viewMode === mode ? 'secondary' : 'ghost'} size="icon" aria-label={mode === 'list' ? 'List view' : 'Grid view'} aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}><Icon name={mode} /></Button></Tip>)}
            </div>
          </div>
        </div>
      {/* Bulk-select action bar — Void/Remind many envelopes from one
          multi-select, instead of opening each one. The backend reports
          per-item skip reasons (e.g. a completed envelope can't be voided),
          surfaced via the summary alert after the batch runs. */}
      {selected.size > 0 && (
        <div className="sign-inbox-bulk" role="status">
          <span>{selected.size} selected</span>
          {view !== 'inbox' && (
            <Button size="default" variant="outline" disabled={bulkBusy} onClick={() => bulkAction('remind')}>
              <Icon name="bell" size={13} /> Remind
            </Button>
          )}
          {view !== 'inbox' && (
            <Button size="default" variant="outline" disabled={bulkBusy} onClick={() => bulkAction('void')} className="sign-inbox-void-btn">
              <Icon name="xCircle" size={13} /> Void
            </Button>
          )}
          <Button type="button" size="default" variant="ghost" onClick={() => setSelected(new Set())} className="sign-inbox-clear-btn">
            Clear
          </Button>
        </div>
      )}

      {/* List / grid */}
      <div className="sign-inbox-content">
        {loading ? (
          viewMode === 'grid' ? <SkeletonCardsGrid count={6} /> : <SkeletonTable rows={5} cols={view === 'inbox' ? 4 : 5} />
        ) : filtered.length === 0 ? (
          <div className="sign-inbox-empty">
            <FeaturedIcon variant={view === 'inbox' ? 'success' : 'gray'} size="lg" shape="circle">
              <Icon name={view === 'inbox' ? 'checkCircle' : 'edit'} size={22} />
            </FeaturedIcon>
            <div className="sign-inbox-empty-title">
              {(search.trim() || activeFilterCount > 0) ? 'No matches'
                : view === 'inbox' ? 'You’re all caught up'
                : view === 'drafts' ? 'No drafts yet'
                : view === 'documents' ? 'No documents yet'
                : `No ${view} envelopes`}
            </div>
            <div className="sign-inbox-empty-copy">
              {(search.trim() || activeFilterCount > 0) ? 'Try another search or clear your filters.'
                : view === 'inbox' ? 'Documents sent to you for signing or approval will appear here.'
                : view === 'voided' ? 'Envelopes only land here once you cancel one yourself — nothing to show yet.'
                : view === 'declined' ? 'This fills up if a signer ever refuses to sign — nothing here means everyone has signed so far.'
                : view === 'expired' ? 'Envelopes land here only after their deadline passes unsigned — none have yet.'
                : 'Create a new envelope to get started.'}
            </div>
            {(search.trim() || activeFilterCount > 0) && <Button variant="outline" onClick={handleResetFilters}>Clear filters</Button>}
            {view === 'inbox' && !search.trim() && activeFilterCount === 0 && <Button variant="outline" onClick={() => navigate('/sign')}>View documents</Button>}
            {view !== 'inbox' && !search.trim() && activeFilterCount === 0 && (
              <Button onClick={() => navigate('/sign/editor')}>
                <Icon name="plus" size={14} /> Create envelope
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <>
            <div className="sign-envelope-grid">
              {pageItems.map(env => {
                const myR = view === 'inbox'
                  ? env.recipients?.find(r => r.user_id === user?.id || r.matched_user_id === user?.id)
                  : null;
                const signUrl = (myR?.status === 'pending' || myR?.status === 'viewed') && myR?.token
                  ? `/sign/public/${myR.token}` : null;
                return (
                  <EnvelopeCard key={env.id} env={env} onClick={() => navigate(`/sign/envelope/${env.id}`)}
                    selected={selected.has(env.id)} onToggleSelect={evt => toggleSelect(env.id, evt)}
                    signUrl={signUrl} />
                );
              })}
            </div>
            <Pagination total={filtered.length} page={page} onPage={setPage} perPage={perPage} />
          </>
        ) : (
          <>
            {/* Mobile card view — only visible on screens < 640px */}
            <div className="sign-mobile-cards">
              {pageItems.map(env => {
                const signerCount = env.recipients?.length ?? 0;
                const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;
                if (view === 'inbox') {
                  const myR = env.recipients?.find(r => r.user_id === user?.id || r.matched_user_id === user?.id);
                  const signUrl = (myR?.status === 'pending' || myR?.status === 'viewed') && myR?.token
                    ? `/sign/public/${myR.token}` : null;
                  return (
                    <div key={env.id} className="sign-mobile-card" role="button" tabIndex={0}
                      onClick={() => navigate(`/sign/envelope/${env.id}`)}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/sign/envelope/${env.id}`)}>
                      <div className="sign-mobile-card-top">
                        <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
                        <div className="sign-mobile-card-info">
                          <div className="sign-mobile-card-name">{env.title}</div>
                          <div className="sign-mobile-card-sender">
                            <PersonAvatar userId={env.created_by} name={env.created_by_name ?? ''} size={16} />
                            <span>{env.created_by_name ?? 'Unknown'}</span>
                          </div>
                        </div>
                        {myR && <Badge variant={recipientBadgeVariant(myR.status)}>{myR.status === 'pending' ? 'Awaiting' : myR.status}</Badge>}
                      </div>
                      {signUrl && (
                        <div className="sign-mobile-card-action" onClick={e => e.stopPropagation()}>
                          <Button size="default" className="w-full" onClick={() => window.open(signUrl, '_blank', 'noopener')}>
                            <Icon name="edit" size={13} /> Sign Now
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={env.id} className="sign-mobile-card" role="button" tabIndex={0}
                    onClick={() => navigate(`/sign/envelope/${env.id}`)}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/sign/envelope/${env.id}`)}>
                    <div className="sign-mobile-card-top">
                      <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
                      <div className="sign-mobile-card-info">
                        <div className="sign-mobile-card-name">{env.title}</div>
                        {env.file_name && <div className="sign-mobile-card-fname"><Icon name="paperclip" size={10} /> {env.file_name}</div>}
                      </div>
                      <Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge>
                    </div>
                    <div className="sign-mobile-card-bottom">
                      {signerCount > 0 && (
                        <>
                          <RecipientAvatarStack recipients={env.recipients} size={18} max={4} />
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{signedCount}/{signerCount} signed</span>
                        </>
                      )}
                      <span className="sign-mobile-card-date">{new Date(env.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view — hidden on mobile, full table on >= 640px */}
            <div className="sign-desktop-table rtbl-wrap sign-inbox-table-wrap">
              <table className="rtbl sign-inbox-table">
                <thead>
                  {view === 'inbox' ? (
                    <tr>
                      <th>Document</th>
                      <th>Sent By</th>
                      <th>My Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  ) : (
                    <tr>
                      <th style={{ width: 42 }}>
                        <Checkbox
                          checked={pageItems.length > 0 && pageItems.every(envelope => selected.has(envelope.id))
                            ? true
                            : pageItems.some(envelope => selected.has(envelope.id)) ? 'indeterminate' : false}
                          onCheckedChange={checked => toggleAllVisible(checked === true)}
                          aria-label="Select all visible envelopes"
                        />
                      </th>
                      <th>Document</th>
                      <th>Status</th>
                      <th>Recipients</th>
                      <th style={{ textAlign: 'right' }}>Updated</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {view === 'inbox' ? (
                    pageItems.map(env => (
                      <InboxEnvelopeRow key={env.id} env={env} userId={user?.id}
                        onClick={() => navigate(`/sign/envelope/${env.id}`)} />
                    ))
                  ) : (
                    pageItems.map(env => (
                      <EnvelopeRow key={env.id} env={env} onClick={() => navigate(`/sign/envelope/${env.id}`)}
                        selected={selected.has(env.id)} onToggleSelect={evt => toggleSelect(env.id, evt)} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination total={filtered.length} page={page} onPage={setPage} perPage={perPage} />
          </>
        )}
      </div>
      </Card>
    </div>
  );
}

export function ShareEnvelopeModal({ env, onClose }: { env: EnvelopeWithRecipients; onClose: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = window.location.origin;
  const verifyUrl = env.verification_code ? `${origin}/sign/verify/${env.verification_code}` : '';
  const downloadUrl = env.verification_code ? `${BASE_URL}/v1/sign/public/verify/${env.verification_code}/download` : '';

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const shareText = `View signed document "${env.title}" verified on Hudumika eSign:\n${verifyUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Signed Document: ${env.title}`)}&body=${encodeURIComponent(shareText)}`;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-140 max-h-[85vh] overflow-y-auto" style={{ padding: 24, borderRadius: 'var(--r)'}}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            <Icon name="share" size={16} style={{ color: 'var(--teal)' }} />
            Share Document — {env.title}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
          {/* Verification & View Link */}
          {env.verification_code && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Public Verification &amp; View Link
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  value={verifyUrl}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'monospace' }}
                />
                <Button variant="default" size="default" onClick={() => copy(verifyUrl, 'verify')} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Icon name={copiedKey === 'verify' ? 'check' : 'copy'} size={13} />
                  {copiedKey === 'verify' ? 'Copied!' : 'Copy Link'}
                </Button>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '5px 0 0', lineHeight: 1.4 }}>
                Anyone with this link can view the verification docket, audit details, and download the signed document without logging in.
              </p>
            </div>
          )}

          {/* Direct PDF Download Link */}
          {env.verification_code && env.stamped_file_url && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Direct PDF Download Link
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  value={downloadUrl}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'monospace' }}
                />
                <Button variant="outline" size="default" onClick={() => copy(downloadUrl, 'download')} style={{ whiteSpace: 'nowrap' }}>
                  <Icon name={copiedKey === 'download' ? 'check' : 'copy'} size={13} />
                  {copiedKey === 'download' ? 'Copied!' : 'Copy PDF Link'}
                </Button>
              </div>
            </div>
          )}

          {/* Verification Code */}
          {env.verification_code && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Verification Code
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ padding: '8px 14px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: 'var(--teal)', letterSpacing: '0.06em', flex: 1 }}>
                  {env.verification_code}
                </div>
                <Button variant="outline" size="default" onClick={() => copy(env.verification_code!, 'code')}>
                  <Icon name={copiedKey === 'code' ? 'check' : 'copy'} size={13} />
                  {copiedKey === 'code' ? 'Copied!' : 'Copy Code'}
                </Button>
              </div>
            </div>
          )}

          {/* Recipient Signing Links (if active sent status) */}
          {env.status === 'sent' && env.recipients && env.recipients.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Recipient Signing Links
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {env.recipients.map(r => {
                  const rLink = `${origin}/sign/public/${r.token}`;
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12.5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.email}</div>
                      </div>
                      <Button variant="outline" size="xs" onClick={() => copy(rLink, `recipient-${r.id}`)} style={{ borderRadius: 'var(--r-sm)' }}>
                        <Icon name={copiedKey === `recipient-${r.id}` ? 'check' : 'copy'} size={11} />
                        {copiedKey === `recipient-${r.id}` ? 'Copied' : 'Copy Link'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Share Action Buttons */}
          {env.verification_code && (
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <a href={whatsappUrl} target="_blank" rel="noreferrer"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="messageSquare" size={14} style={{ color: 'var(--green)' }} /> WhatsApp Share
              </a>
              <a href={mailtoUrl}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="mail" size={14} style={{ color: 'var(--teal)' }} /> Email Share
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Phase S9 — a real DRAFT sales_invoices row (sign-billing.routes.ts),
// not a fee schedule: the preparer types the real amount being charged,
// since Sign has no existing notary/consultant rate card to compute one
// from. Finalization (tax, GL posting) happens entirely in FinOps's own
// invoice screen afterward — this only creates the draft it starts from.
function BillEnvelopeModal({ env, onClose, onBilled }: { env: EnvelopeWithRecipients; onClose: () => void; onBilled: (invoiceId: string) => void }) {
  const [description, setDescription] = useState(`${env.title} — professional service fee`);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsed = Number(amount);
    if (!description.trim()) { showAlert('A description is required'); return; }
    if (!parsed || parsed <= 0) { showAlert('Enter an amount greater than zero'); return; }
    setSaving(true);
    try {
      const res: any = await apiFetch(`/v1/sign/envelopes/${env.id}/bill`, {
        method: 'POST',
        body: JSON.stringify({ description: description.trim(), amount: parsed, currency }),
      });
      showAlert(`Draft invoice ${res.invoice_number} created`, { variant: 'success' });
      onBilled(res.invoice_id);
      onClose();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-110" style={{ padding: 24, borderRadius: 'var(--r)'}}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            <Icon name="invoice" size={16} style={{ color: 'var(--teal)' }} />
            Create Invoice — {env.title}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--ink3)', margin: 0, lineHeight: 1.5 }}>
            Creates a draft invoice on this document's customer. Review and finalize it in FinOps's own invoice screen — tax and posting happen there, not here.
          </p>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Amount</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 100 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Currency</label>
              <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          <Button variant="default" onClick={submit} disabled={saving} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700 }}>
            {saving ? 'Creating…' : 'Create Draft Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getAuditEventStyle(type: string) {
  const t = type.toLowerCase();
  if (t === 'created') return { icon: 'plus' as const, color: 'var(--teal)', bg: 'var(--teal-l)' };
  if (t === 'sent') return { icon: 'send' as const, color: 'var(--blue)', bg: 'var(--blue-l)' };
  if (t === 'viewed') return { icon: 'eye' as const, color: 'var(--gold)', bg: 'var(--gold-l)' };
  if (t === 'signed') return { icon: 'edit' as const, color: 'var(--green)', bg: 'var(--green-l)' };
  if (t === 'completed') return { icon: 'checkCircle' as const, color: 'var(--green)', bg: 'var(--green-l)' };
  if (t === 'stamped') return { icon: 'stamp' as const, color: 'var(--teal)', bg: 'var(--teal-l)' };
  if (t === 'verified') return { icon: 'shield' as const, color: 'var(--blue)', bg: 'var(--blue-l)' };
  if (t === 'anchored') return { icon: 'lock' as const, color: 'var(--green)', bg: 'var(--green-l)' };
  // 'updated' covers every metadata edit — a rename, or PUT's own message/
  // recipient/field changes on a still-draft envelope.
  if (t === 'updated') return { icon: 'edit' as const, color: 'var(--ink2)', bg: 'var(--bg)' };
  if (t === 'voided') return { icon: 'xCircle' as const, color: 'var(--red)', bg: 'var(--red-l)' };
  if (t === 'declined') return { icon: 'userMinus' as const, color: 'var(--red)', bg: 'var(--red-l)' };
  if (t === 'rerouted') return { icon: 'refresh' as const, color: 'var(--gold)', bg: 'var(--gold-l)' };
  if (t === 'expired') return { icon: 'clock' as const, color: 'var(--ink3)', bg: 'var(--bg)' };
  return { icon: 'circle' as const, color: 'var(--ink3)', bg: 'var(--bg)' };
}

export function SignEnvelopeDetail() {
  const navigate = useNavigate();

  const id = window.location.pathname.split('/').pop() ?? '';
  const [env, setEnv] = useState<EnvelopeWithRecipients | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRecipientId, setCopiedRecipientId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/v1/sign/envelopes/${id}`).then(setEnv).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || env?.status !== 'sent') return;
    const interval = setInterval(() => {
      apiFetch(`/v1/sign/envelopes/${id}`).then(setEnv).catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, [id, env?.status]);

  async function handleSend() {
    if (!env) return;
    if (!(await showConfirm('This sends a real signing link to every recipient.', { title: 'Send this envelope for signing?', variant: 'info', confirmLabel: 'Send' }))) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/send`, { method: 'POST' });
      const refreshed = await apiFetch(`/v1/sign/envelopes/${env.id}`);
      setEnv(refreshed);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to send');
    }
  }

  async function handleVoid() {
    if (!env) return;
    const reason = await showPrompt("This stops the envelope for every recipient — it can't be un-voided.", { title: 'Reason for voiding (optional)', placeholder: 'e.g. Sent to the wrong recipient', confirmLabel: 'Void' });
    if (reason === null) return;
    await apiFetch(`/v1/sign/envelopes/${env.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    navigate('/sign');
  }

  async function handleRemind() {
    if (!env) return;
    try {
      const result = await apiFetch(`/v1/sign/envelopes/${env.id}/remind`, { method: 'POST' });
      const names = (result.reminded ?? []).map((r: { name: string }) => r.name).join(', ');
      showAlert(names ? `Reminder emailed to ${names}` : 'Reminder sent', { variant: 'success' });
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to send reminder');
    }
  }

  function handleCopyCode() {
    if (!env?.verification_code) return;
    navigator.clipboard?.writeText(env.verification_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  async function handleCopySigningLink(recipientId: string, token: string) {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is not available in this browser.');
      await navigator.clipboard.writeText(`${window.location.origin}/sign/public/${token}`);
      setCopiedRecipientId(recipientId);
      window.setTimeout(() => setCopiedRecipientId(current => current === recipientId ? null : current), 2000);
      showAlert('The recipient signing link is ready to paste.', {
        title: 'Signing link copied',
        variant: 'success',
      });
    } catch (error: unknown) {
      showAlert(error instanceof Error ? error.message : 'The signing link could not be copied.', {
        title: 'Could not copy link',
        variant: 'error',
      });
    }
  }

  async function handleReroute(recipientId: string, recipientName: string, declineReason: string | null) {
    if (!env) return;
    const newName = await showPrompt(
      `${recipientName} declined${declineReason ? ` — "${declineReason}"` : ''}. Enter the replacement signer's full name.`,
      { title: 'Re-assign signing slot', placeholder: 'Full name', required: true, confirmLabel: 'Next' },
    );
    if (newName === null || !newName.trim()) return;
    const newEmail = await showPrompt(
      `Enter the email address for ${newName.trim()}.`,
      { title: 'Replacement signer email', placeholder: 'email@example.com', required: true, confirmLabel: 'Re-assign' },
    );
    if (newEmail === null || !newEmail.trim()) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/reroute-recipient`, {
        method: 'POST',
        body: JSON.stringify({ recipientId, newName: newName.trim(), newEmail: newEmail.trim() }),
      });
      showAlert(`Signing link sent to ${newName.trim()} (${newEmail.trim()}).`, { variant: 'success', title: 'Signer re-assigned' });
      const refreshed = await apiFetch(`/v1/sign/envelopes/${env.id}`);
      setEnv(refreshed);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to re-assign signer');
    }
  }

  async function handleRename() {
    if (!env) return;
    const next = await showPrompt('', { title: 'Rename this envelope', defaultValue: env.title, required: true, confirmLabel: 'Rename' });
    if (next === null || !next.trim() || next.trim() === env.title) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/title`, { method: 'PATCH', body: JSON.stringify({ title: next.trim() }) });
      setEnv(prev => prev ? { ...prev, title: next.trim() } : prev);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to rename');
    }
  }

  async function handleAmend() {
    if (!env) return;
    const ok = await showConfirm(
      `This creates a new draft — Version ${env.version_number + 1} — copying the same document, recipients and fields. The signed original stays exactly as it is, on file.`,
      { title: 'Create an amended version?', variant: 'info', confirmLabel: 'Create Version ' + (env.version_number + 1) });
    if (!ok) return;
    try {
      const amended = await apiFetch(`/v1/sign/envelopes/${env.id}/amend`, { method: 'POST' });
      navigate(`/sign/editor/${amended.id}`);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to create an amended version');
    }
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(true);
  useEffect(() => {
    if (!env) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setPreviewLoading(true);
    (async () => {
      try {
        if (env.status === 'completed' && env.stamped_file_url) {
          const blob = await apiFetchBlob(`/v1/sign/envelopes/${env.id}/download`);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
          setPreviewIsPdf(true);
        } else if (env.document_data) {
          setPreviewUrl(env.document_data);
          setPreviewIsPdf(!!env.file_name?.toLowerCase().endsWith('.pdf') || env.document_data.startsWith('data:application/pdf'));
        } else if (env.file_id) {
          const blob = await apiFetchBlob(`/v1/files/${env.file_id}/preview`);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
          setPreviewIsPdf(!!env.file_name?.toLowerCase().endsWith('.pdf'));
        } else {
          setPreviewUrl(null);
        }
      } catch {
        if (!cancelled) setPreviewUrl(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [env?.id, env?.status, env?.document_data, env?.file_id, env?.stamped_file_url]);

  const { doc: previewDoc, numPages: previewNumPages, loading: previewPdfLoading, error: previewPdfError } =
    usePdfDocument(previewIsPdf ? previewUrl : null);
  const [previewPage, setPreviewPage] = useState(1);
  useEffect(() => { setPreviewPage(1); }, [previewUrl]);
  const [previewNaturalSize, setPreviewNaturalSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!previewDoc) { setPreviewNaturalSize(null); return; }
    let cancelled = false;
    previewDoc.getPage(1).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setPreviewNaturalSize({ width: vp.width, height: vp.height });
    });
    return () => { cancelled = true; };
  }, [previewDoc]);

  const [previewW, setPreviewW] = useState(480);
  const previewPaneRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setPreviewW(Math.min(800, Math.max(220, node.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const previewH = Math.round(previewW * (previewNaturalSize ? previewNaturalSize.height / previewNaturalSize.width : DETAIL_A4_ASPECT));
  const previewScale = previewNaturalSize ? previewW / previewNaturalSize.width : 1;

  if (loading) return <PageLoading label="Loading document…" />;

  if (!env) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, gap: 12, color: 'var(--ink3)' }}>
        <Icon name="xCircle" size={36} style={{ color: 'var(--red)', opacity: 0.8 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Document unavailable</div>
        <Button variant="outline" size="default" onClick={() => navigate('/sign')}>View documents</Button>
      </div>
    );
  }

  return (
    <div className="sign-envelope-detail">
      <PageHeader
        crumbs={['eSign', 'Envelopes']}
        title={env.title}
        subtitle={env.version_number > 1 ? `Version ${env.version_number}` : undefined}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="outline" size="default" onClick={() => navigate('/sign')} style={{ fontWeight: 600 }}>
              <Icon name="arrowLeft" size={14} /> Documents
            </Button>
            <Badge variant={envelopeBadgeVariant(env.status)} className="capitalize">
              {env.status}
            </Badge>
            {/* Only shown for an advanced execution — an ordinary envelope's
                header looks exactly as it did before migration 416. */}
            {env.execution_type && env.execution_type !== 'NORMAL_SIGN' && (
              <Badge variant="warning">
                {EXECUTION_TYPE_LABEL[env.execution_type] ?? env.execution_type}
              </Badge>
            )}
            {/* Phase S7 — a free-text case tag (migration 428), shown to
                whoever can already see this envelope; the grouped /sign/
                matters view itself stays admin-only (see that route's own
                gate), so this reads as plain text, not a link. */}
            {env.matter_reference && (
              <Badge variant="gray">
                <Icon name="briefcase" size={11} /> {env.matter_reference}
              </Badge>
            )}
            {/* Phase S9 — a real draft invoice, not a claim of payment. Only
                offered when there's a customer to bill (client_id, Phase
                S6/S7's own column) and not already billed. */}
            {env.invoice_id ? (
              <a href={`/finance/invoices?id=${env.invoice_id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <Badge variant="success">
                  <Icon name="invoice" size={11} /> Invoiced
                </Badge>
              </a>
            ) : env.client_id && (
              <Tip label="Create a draft invoice for this document's customer in FinOps">
                <Button variant="outline" size="default" onClick={() => setShowBillModal(true)}>
                  <Icon name="invoice" size={13} /> Bill client
                </Button>
              </Tip>
            )}
            {/* Phase S4 — a real Bliss (or Jitsi-fallback) meeting, set from
                the editor's own MeetingLinkPanel. Shown to whoever can
                already see this envelope; recipients get the same link on
                the public signing page. */}
            {env.meeting_url && (
              <a href={env.meeting_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <Badge variant="info">
                  <Icon name="video" size={11} /> Join session
                </Badge>
              </a>
            )}
            {env.status === 'completed' ? (
              !env.next_version && (
                <Tip label="This document has an issue — create an amended Version 2">
                  <Button variant="outline" size="default" onClick={handleAmend} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Icon name="gitBranch" size={14} /> Amend
                  </Button>
                </Tip>
              )
            ) : (
              <Tip label="Rename this envelope">
                <Button variant="ghost" size="default" className="aspect-square px-0" onClick={handleRename} aria-label="Rename this envelope">
                  <Icon name="edit" size={14} />
                </Button>
              </Tip>
            )}
            {env.status === 'draft' && (
              <>
                <Button variant="outline" size="default" onClick={() => navigate(`/sign/editor/${env.id}`)}>
                  <Icon name="edit" size={14} /> Edit
                </Button>
                <Button variant="default" size="default" onClick={handleSend} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700 }}>
                  <Icon name="send" size={14} /> Send
                </Button>
              </>
            )}
            {env.status === 'sent' && (
              <>
                <Button variant="outline" size="default" onClick={handleRemind}>
                  <Icon name="mail" size={14} /> Remind
                </Button>
                <Button variant="outline" size="default" onClick={handleVoid}
                  style={{ borderColor: 'var(--sign-red)', background: 'var(--sign-red-l)', color: 'var(--sign-red)', fontWeight: 600 }}>
                  <Icon name="xCircle" size={14} /> Void
                </Button>
              </>
            )}
            {env.status === 'needs_rerouting' && (
              <>
                {env.recipients?.filter(r => r.status === 'declined').map(r => (
                  <Button key={r.id} variant="outline" size="default" onClick={() => handleReroute(r.id, r.name, r.decline_reason ?? null)}
                    style={{ borderColor: 'var(--gold)', background: 'var(--gold-l)', color: 'var(--ink)', fontWeight: 600 }}>
                    <Icon name="refresh" size={14} /> Re-assign {r.name}
                  </Button>
                ))}
                <Button variant="outline" size="default" onClick={handleVoid}
                  style={{ borderColor: 'var(--sign-red)', background: 'var(--sign-red-l)', color: 'var(--sign-red)', fontWeight: 600 }}>
                  <Icon name="xCircle" size={14} /> Void
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card className="sign-envelope-summary">
        <div className="sign-envelope-identity">
          <FeaturedIcon size="xl"><Icon name="fileText" size={26} /></FeaturedIcon>
          <div className="sign-envelope-identity-text">
            <strong>{env.file_name || env.title}</strong>
            <div className="sign-envelope-owner">
              <PersonAvatar userId={env.created_by} name={env.created_by_name ?? 'Unknown'} size={30} />
              <span>Created by <strong>{env.created_by_name ?? 'Unknown'}</strong></span>
            </div>
          </div>
          <div className="sign-envelope-progress">
            <div><strong>Signing progress</strong><span>{env.recipients?.filter(r => r.status === 'signed').length ?? 0}/{env.recipients?.length ?? 0} signed</span></div>
            <Progress value={env.recipients?.length ? env.recipients.filter(r => r.status === 'signed').length / env.recipients.length * 100 : 0} aria-label="Signing progress" />
          </div>
        </div>
        <dl className="sign-envelope-facts">
          <div><dt>Created</dt><dd>{new Date(env.created_at).toLocaleDateString()}</dd></div>
          <div><dt>Updated</dt><dd>{new Date(env.updated_at).toLocaleDateString()}</dd></div>
          <div><dt>Recipients</dt><dd>{env.recipients?.length ?? 0}</dd></div>
          <div><dt>Version</dt><dd>{env.version_number || 1}</dd></div>
        </dl>
      </Card>
      {/* Version chain banners */}
      {env.previous_version && (
        <div onClick={() => navigate(`/sign/envelope/${env.previous_version!.id}`)}
          role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/sign/envelope/${env.previous_version!.id}`); } }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--teal-l)', border: '1px solid var(--teal)', borderRadius: 'var(--r)', padding: '12px 18px', fontSize: 13, color: 'var(--ink)' }}>
          <Icon name="gitBranch" size={16} style={{ color: 'var(--teal)', flexShrink: 0 } as React.CSSProperties} />
          <span>This is Version {env.version_number}, amended from <strong>Version {env.previous_version.version_number} — {env.previous_version.title}</strong></span>
          <Icon name="chevronRight" size={14} style={{ marginLeft: 'auto', color: 'var(--teal)' } as React.CSSProperties} />
        </div>
      )}
      {env.next_version && (
        <div onClick={() => navigate(`/sign/envelope/${env.next_version!.id}`)}
          role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/sign/envelope/${env.next_version!.id}`); } }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', padding: '12px 18px', fontSize: 13, color: 'var(--ink)' }}>
          <Icon name="gitBranch" size={16} style={{ color: 'var(--gold)', flexShrink: 0 } as React.CSSProperties} />
          <span>This signed document is unchanged, but it's been superseded by <strong>Version {env.next_version.version_number}</strong> ({env.next_version.status})</span>
          <Icon name="chevronRight" size={14} style={{ marginLeft: 'auto', color: 'var(--gold)' } as React.CSSProperties} />
        </div>
      )}

      {/* Main 2-column workspace layout */}
      <div className="sign-envelope-workspace">

        {/* LEFT: Premium PDF / Document Preview Studio */}
        <Card className="sign-envelope-preview">
          {/* Top Dark Slate Studio Control Bar */}
          <div className="sign-envelope-preview-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Icon name="fileText" size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {env.file_name || env.title}
              </span>
              {env.file_name && (
                <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--bg)', color: 'var(--ink3)', padding: '2px 6px', borderRadius: 'var(--r-sm)', textTransform: 'uppercase' }}>
                  {env.file_name.split('.').pop() || 'PDF'}
                </span>
              )}
            </div>

            {previewIsPdf && previewNumPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 'var(--badge-radius)', padding: '3px 10px', flexShrink: 0 }}>
                <Button variant="outline" size="icon" aria-label="Previous page" onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage <= 1}>
                  <Icon name="chevronLeft" size={14} color="var(--ink)" />
                </Button>
                <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>
                  {previewPage} / {previewNumPages}
                </span>
                <Button variant="outline" size="icon" aria-label="Next page" onClick={() => setPreviewPage(p => Math.min(previewNumPages, p + 1))} disabled={previewPage >= previewNumPages}>
                  <Icon name="chevronRight" size={14} color="var(--ink)" />
                </Button>
              </div>
            )}
          </div>

          {/* Document Canvas Container */}
          <div className="sign-envelope-canvas">
            <div ref={previewPaneRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: previewW, height: previewH, maxWidth: '100%', background: '#ffffff', borderRadius: 'var(--r)',
                overflow: 'hidden', boxShadow: 'var(--elev)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative'
              }}>
                {previewLoading || (previewIsPdf && !!previewUrl && previewPdfLoading) ? (
                  <SectionLoading label="Loading preview…" />
                ) : !previewUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--ink3)', padding: 24, textAlign: 'center' }}>
                    <Icon name="fileText" size={32} style={{ opacity: 0.3 }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>No document preview available</div>
                  </div>
                ) : previewIsPdf ? (
                  previewPdfError || !previewDoc ? (
                    <div style={{ color: 'var(--ink3)', fontSize: 13, fontWeight: 600 }}>Unable to render PDF preview</div>
                  ) : (
                    <PdfPageCanvas doc={previewDoc} pageNumber={previewPage} scale={previewScale} style={{ display: 'block' }} />
                  )
                ) : (
                  <img src={previewUrl} alt={env.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* RIGHT: Status, Verification Certificate, Recipients, & Audit Trail */}
        <div className="sign-envelope-sidebar">

          {/* Void / Decline Reason Banner */}
          {(env.status === 'voided' || env.status === 'declined') && env.void_reason && (
            <div style={{ background: 'var(--sign-red-l)', border: '1px solid var(--sign-red)', borderRadius: 'var(--card-radius)', padding: '16px 20px', boxShadow: '0 2px 8px var(--sign-red-l)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sign-red)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="xCircle" size={14} /> {env.status === 'declined' ? 'Envelope Declined' : 'Envelope Voided'}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>{env.void_reason}</div>
            </div>
          )}

          {/* Stamped & Verified Certificate Card (if Completed) — styled as an
              actual certificate (serial plate + provenance line + corner
              seal) rather than a generic tinted SaaS status card. */}
          {env.status === 'completed' && env.verification_code && (
            <div style={{
              position: 'relative', overflow: 'hidden',
              background: 'var(--sign-green-l)', border: '1px solid var(--sign-green)', borderRadius: 'var(--r)',
              padding: '22px 24px', boxShadow: 'var(--elev-sm)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* Corner seal ring — a notary-stamp motif, not another icon-in-a-circle */}
              <div aria-hidden style={{
                position: 'absolute', top: -20, right: -20, width: 88, height: 88, borderRadius: '50%',
                border: '2px dashed var(--sign-green)', opacity: 0.3, transform: 'rotate(12deg)', pointerEvents: 'none',
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--sign-green)' }}>
                    Legal Verification Certificate
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 3, maxWidth: 420 }}>
                    This document's signed record is sealed and independently verifiable by anyone holding the certificate number below.
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--white)', border: '2px solid var(--sign-green)', color: 'var(--sign-green)', transform: 'rotate(-8deg)',
                }}>
                  <Icon name="stamp" size={18} />
                </div>
              </div>

              {/* Certificate plate — the code presented like a serial number */}
              <div style={{
                background: 'var(--white)', border: '1px dashed var(--sign-green)', borderRadius: 'var(--r-sm)',
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink3)' }}>
                    Certificate No.
                  </div>
                  <div style={{ fontFamily: 'var(--font)', fontSize: 19, fontWeight: 800, letterSpacing: '0.07em', color: 'var(--sign-green)', marginTop: 2 }}>
                    {env.verification_code}
                  </div>
                </div>
                <a href={`/sign/verify/${env.verification_code}`} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--sign-green)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Verify record <Icon name="arrowRight" size={12} />
                </a>
              </div>

              {env.anchor_status && (
                <div style={{ fontSize: 11.5, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={env.anchor_status === 'confirmed' ? 'checkCircle' : 'clock'} size={14} style={{ color: env.anchor_status === 'confirmed' ? 'var(--green)' : 'var(--gold)', flexShrink: 0 }} />
                  <span>
                    {env.anchor_status === 'confirmed'
                      ? `Bitcoin-anchored — confirmed in block #${env.anchor_block_height}`
                      : 'Bitcoin anchor pending blockchain confirmation'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <Button variant="outline" size="default" onClick={() => setShowShareModal(true)} style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)', fontWeight: 600 }}>
                  <Icon name="share" size={13} /> Share link
                </Button>
                {env.stamped_file_url && (
                  <Button variant="outline" size="default" onClick={() => apiDownload(`/v1/sign/envelopes/${env.id}/download`, `${env.title} — signed.pdf`)} style={{ background: 'var(--sign-green-l)', borderColor: 'var(--sign-green)', color: 'var(--sign-green)', fontWeight: 700 }}>
                    <Icon name="download" size={13} /> Download PDF
                  </Button>
                )}
                <Button variant="outline" size="default" onClick={handleCopyCode} style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)' }}>
                  <Icon name={copiedCode ? 'check' : 'copy'} size={13} /> {copiedCode ? 'Copied!' : 'Copy code'}
                </Button>
              </div>
            </div>
          )}

          <Tabs defaultValue="recipients" className="sign-envelope-sections">
            <TabsList aria-label="Document details">
              <TabsTrigger value="recipients">Recipients <Badge variant="gray">{env.recipients?.length ?? 0}</Badge></TabsTrigger>
              <TabsTrigger value="activity">Activity <Badge variant="gray">{env.events?.length ?? 0}</Badge></TabsTrigger>
            </TabsList>
            <TabsContent value="recipients" className="sign-envelope-section-content">
          {/* Recipients — a legal certifier (Certified True Copy — an
              advocate/notary attesting the copy, not just another party
              signing it) gets its own section, separate from ordinary
              signatories/approvers, rather than being one more row in the
              same flat list with just a small badge to tell it apart. */}
          {(() => {
            const renderRecipientRow = (r: typeof env.recipients[number]) => (
              // Same overlap risk as the signing-links row above, plus a
              // taller one: this row's second/third lines (certifier info,
              // a decline reason) are meant to wrap as real sentences, not
              // truncate — so the trailing badges/timestamp need their own
              // wrapping group, or a long reason growing this row taller
              // pushes past the single-line-height the trailing badges
              // assumed and overlaps them the same way.
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, rowGap: 8, padding: '12px 14px', borderRadius: 'var(--r)', background: r.is_certifier ? 'var(--blue-l)' : 'var(--bg)', border: `1px solid ${r.is_certifier ? 'var(--blue)' : 'var(--border)'}`, flexWrap: 'wrap' }}>
                <Tip label={`${r.name} — ${r.email}`}>
                  <PersonAvatar userId={r.user_id ?? r.matched_user_id ?? undefined} name={r.name} size={38} />
                </Tip>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <Tip label={r.name}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  </Tip>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}{r.role_label ? ` · ${r.role_label}` : ''}</div>
                  {r.is_certifier && (
                    <div style={{ fontSize: 11.5, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>
                      {r.certifier_title || 'Advocate'}{r.certifier_roll_number ? ` · Roll No. ${r.certifier_roll_number}` : ''}{r.certifier_firm ? ` · ${r.certifier_firm}` : ''}
                    </div>
                  )}
                  {r.status === 'declined' && r.decline_reason && (
                    <div style={{ fontSize: 11.5, color: 'var(--sign-red)', marginTop: 2 }}>Reason: {r.decline_reason}</div>
                  )}
                </div>
                <div className="sign-envelope-recipient-status">
                  <Badge variant={recipientBadgeVariant(r.status)}>{r.status}</Badge>
                  {env.status === 'sent' && (
                    <div className="sign-envelope-recipient-actions">
                      {(r.status === 'pending' || r.status === 'viewed') && <Button variant="outline" onClick={() => window.open(`/sign/public/${r.token}`, '_blank', 'noopener')}><Icon name="edit" size={16} />Open signing</Button>}
                      <Button variant="outline" onClick={() => void handleCopySigningLink(r.id, r.token)}><Icon name={copiedRecipientId === r.id ? 'check' : 'copy'} size={16} />{copiedRecipientId === r.id ? 'Copied' : 'Copy link'}</Button>
                    </div>
                  )}                  {r.signed_at && <span style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>{new Date(r.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            );
            const certifiers = env.recipients?.filter(r => r.is_certifier) ?? [];
            const signatories = env.recipients?.filter(r => !r.is_certifier) ?? [];
            return (
              <>
                {certifiers.length > 0 && (
                  <SectionCard title="Certification" collapsible={false} action={env.status === 'sent' ? <Button variant="outline" onClick={() => setShowShareModal(true)}><Icon name="share" size={16} />Share links</Button> : undefined}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {certifiers.map(renderRecipientRow)}
                    </div>
                  </SectionCard>
                )}
                {signatories.length > 0 && <SectionCard title="Recipients" collapsible={false} action={env.status === 'sent' ? <Button variant="outline" onClick={() => setShowShareModal(true)}><Icon name="share" size={16} />Share links</Button> : undefined}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {signatories.map(renderRecipientRow)}
                  </div>
                </SectionCard>}
              </>
            );
          })()}

            </TabsContent>
            <TabsContent value="activity" className="sign-envelope-section-content">
          {/* Audit Trail Timeline */}
          {env.events && env.events.length > 0 && (
            <SectionCard title="Activity" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 4 }}>
                {env.events.map((ev, i) => {
                  const styleCfg = getAuditEventStyle(ev.event_type);
                  const isLast = i === env.events!.length - 1;
                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: 14, paddingBottom: isLast ? 0 : 20, position: 'relative' }}>
                      {!isLast && (
                        <div style={{ position: 'absolute', left: 13, top: 26, bottom: 0, width: 2, background: 'var(--border)' }} />
                      )}
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: styleCfg.bg, color: styleCfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, border: '2px solid var(--card-bg)' }}>
                        <Icon name={styleCfg.icon} size={13} />
                      </div>
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                          {ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}
                          {ev.actor_name ? ` by ${ev.actor_name}` : ''}
                        </div>
                        {ev.note && <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{ev.note}</div>}
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{new Date(ev.created_at).toLocaleString()}</span>
                          {ev.ip_address && (
                            <span style={{ background: 'var(--white)', padding: '1px 6px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 10.5, fontFamily: 'var(--font)' }}>
                              IP: {ev.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

            {!env.events?.length && <Card className="sign-inbox-empty"><div className="sign-inbox-empty-title">No activity yet</div></Card>}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {showShareModal && <ShareEnvelopeModal env={env} onClose={() => setShowShareModal(false)} />}
      {showBillModal && (
        <BillEnvelopeModal env={env} onClose={() => setShowBillModal(false)}
          onBilled={invoiceId => setEnv(prev => prev ? { ...prev, invoice_id: invoiceId } : prev)} />
      )}
    </div>
  );
}

// ─── SignAllDocuments — tenant-admin view across every user ───────────────────
// Every other view in this file is scoped to "documents I own or I'm a
// recipient on" (Inbox/Sent/Drafts/...). A tenant admin currently has no
// way to find a colleague's document short of already knowing its exact
// link — GET /envelopes?view=all (role-gated server-side, not just here)
// is the one query that isn't scoped to the requesting user, and this is
// its one page.
type AdminEnvelope = EnvelopeWithRecipients & { owner: { name: string; email: string } | null };

export function SignDocuments() {
  return <SignInbox view="documents" />;
}

export function SignAllDocuments() {
  const navigate = useNavigate();
  const [envelopes, setEnvelopes] = useState<AdminEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminEnvelope['status']>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/sign/envelopes?view=all&limit=200')
      .then(setEnvelopes).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = envelopes.filter(e =>
    (statusFilter === 'all' || e.status === statusFilter) &&
    (!search || e.title.toLowerCase().includes(search.toLowerCase()) || e.owner?.name.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => { setPage(1); }, [statusFilter, search, perPage]);
  const pageItems = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);

  // Same tenant-wide stats shape SignInbox's MetricsRow already establishes
  // for the personal Inbox/Sent/Drafts views — this admin oversight page
  // had none of that, just the bare table below.
  const stats = useMemo(() => {
    const total = envelopes.length;
    const sent = envelopes.filter(e => e.status === 'sent').length;
    const completed = envelopes.filter(e => e.status === 'completed').length;
    const needsAttention = envelopes.filter(e => e.status === 'voided' || e.status === 'declined' || e.status === 'expired' || e.status === 'needs_rerouting').length;
    const owners = new Set(envelopes.map(e => e.owner?.email).filter(Boolean)).size;
    return { total, sent, completed, needsAttention, owners };
  }, [envelopes]);

  return (
    <div className="sign-inbox-page">
      <PageHeader
        crumbs={['eSign', 'Admin']}
        titlePlain="All"
        titleEm="documents"
        subtitle="Review documents, owners, and signing progress across your workspace."
      />

      <MetricsRow cards={[
        { title: 'Documents', value: String(stats.total), loading, icon: 'fileText', sub1Label: 'Completed', sub1Value: String(stats.completed) },
        { title: 'Needs review', value: String(stats.needsAttention), loading, icon: 'clock', sub1Label: 'Cancelled, declined, or expired' },
        { title: 'Senders', value: String(stats.owners), loading, icon: 'users', sub1Label: 'Sent', sub1Value: String(stats.sent) },
      ]} />

      <Card className="sign-inbox-panel" role="region" aria-label="Workspace documents">
        <div className="sign-inbox-search-row">      <SearchToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by title or owner"

        quickFilter={{
          label: 'Status', allLabel: 'All statuses', value: statusFilter === 'all' ? null : statusFilter,
          onChange: value => setStatusFilter((value || 'all') as typeof statusFilter),
          options: (['draft', 'sent', 'completed', 'voided', 'needs_rerouting', 'declined', 'expired'] as const).map(status => ({ value: status, label: status === 'needs_rerouting' ? 'Action needed' : status.charAt(0).toUpperCase() + status.slice(1) })),
          columns: 1,
        }}

      />

        </div>
        <div className="sign-inbox-list-meta">
          <span>{loading ? 'Loading…' : `${filtered.length} document${filtered.length === 1 ? '' : 's'}`}</span>
          <PerPageSelect value={perPage} onChange={v => { setPerPage(v); setPage(1); }} />
        </div>
        <div className="sign-inbox-content">
        {loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="sign-inbox-empty">
            <FeaturedIcon size="lg"><Icon name="fileText" size={24} /></FeaturedIcon>
            <div className="sign-inbox-empty-title">{search || statusFilter !== 'all' ? 'No matches' : 'No documents yet'}</div>
            <div className="sign-inbox-empty-copy">{search || statusFilter !== 'all' ? 'Try another search or clear your filters.' : 'Workspace documents will appear here once an envelope is created.'}</div>
            {(search || statusFilter !== 'all') && <Button variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>}
          </div>        ) : (
          <>
            <div className="sign-mobile-cards">
              {pageItems.map(env => (
                <Card key={env.id} className="sign-mobile-card">
                  <div className="sign-mobile-card-top">
                    <FeaturedIcon><Icon name="fileText" size={20} /></FeaturedIcon>
                    <div className="sign-mobile-card-info">
                      <div className="sign-mobile-card-name">{env.title}</div>
                      {env.owner && <div className="sign-mobile-card-sender"><PersonAvatar userId={env.created_by} name={env.owner.name} size={26} />{env.owner.name}</div>}
                      <div className="sign-mobile-card-fname">{env.recipients?.filter(recipient => recipient.status === 'signed').length ?? 0}/{env.recipients?.length ?? 0} signed</div>
                    </div>
                  </div>
                  <div className="sign-mobile-card-bottom">
                    <Badge variant={envelopeBadgeVariant(env.status)}>{env.status === 'needs_rerouting' ? 'Action needed' : env.status}</Badge>
                    <span>{new Date(env.updated_at).toLocaleDateString()}</span>
                  </div>
                  <Button variant="outline" onClick={() => navigate(`/sign/envelope/${env.id}`)}>View document</Button>
                </Card>
              ))}
            </div>            <div className="sign-desktop-table rtbl-wrap">
              <table className="rtbl">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Recipients</th>
                    <th style={{ textAlign: 'right' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(env => {
                    const signerCount = env.recipients?.length ?? 0;
                    const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;
                    return (
                      <tr key={env.id} onClick={() => navigate(`/sign/envelope/${env.id}`)} role="button" tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && navigate(`/sign/envelope/${env.id}`)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.title}</div>
                              {env.file_name && (
                                <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <Icon name="paperclip" size={10} /> {env.file_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          {env.owner ? (
                            <Tip label={`${env.owner.name} — ${env.owner.email}`}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <PersonAvatar userId={env.created_by} name={env.owner.name} size={26} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.owner.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.owner.email}</div>
                                </div>
                              </div>
                            </Tip>
                          ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                        </td>
                        <td><Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge></td>
                        <td>
                          {signerCount > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <RecipientAvatarStack recipients={env.recipients} size={20} max={4} />
                              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{signedCount}/{signerCount} signed</span>
                            </div>
                          ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{new Date(env.updated_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={filtered.length} page={page} onPage={setPage} perPage={perPage} />
          </>
        )}
      </div>
      </Card>
    </div>
  );
}
