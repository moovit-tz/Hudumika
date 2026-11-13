import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Banner } from '../../components/ui/alert.js';

interface Screening {
  id: string;
  subject_type: string;
  subject_id: string | null;
  screened_name: string;
  best_match_entry_id: string | null;
  best_match_name: string | null;
  best_match_score: number | string | null;
  status: 'clear' | 'flagged' | 'cleared_false_positive' | 'confirmed_match';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

interface EntryDetail {
  id: string;
  source: string;
  entry_type: string;
  primary_name: string;
  programs: string | null;
  listed_on: string | null;
  remarks: string | null;
  aliases: string[];
}

interface SyncStatus {
  runs: any[];
  entriesTotal: number;
  /** Per list: when it was last refreshed, and whether that is too old to trust. */
  lists?: { source: 'OFAC' | 'UN'; lastSuccessAt: string | null; entries: number | null; stale: boolean; lastError: string | null }[];
}

const LIST_NAMES: Record<string, string> = { OFAC: 'OFAC SDN', UN: 'UN Consolidated' };
const fmtListDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'never';

type QueueTab = 'flagged' | 'all' | 'confirmed' | 'cleared' | 'clear';
type SortKey = 'name' | 'type' | 'match' | 'score' | 'status' | 'date';

function fmtScore(s: Screening['best_match_score']): string {
  if (s == null) return '—';
  return `${Math.round(Number(s) * 100)}%`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function SanctionsScreeningPage() {
  const [rows, setRows] = useState<Screening[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Ad-hoc screen state
  const [adhocName, setAdhocName] = useState('');
  const [adhocBusy, setAdhocBusy] = useState(false);
  const [adhocResult, setAdhocResult] = useState<{ status: string; matches: any[] } | null>(null);

  // Filtering, search & pagination state
  const [currentTab, setCurrentTab] = useState<QueueTab>('flagged');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Review modal state
  const [reviewing, setReviewing] = useState<Screening | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Entry detail modal state
  const [entryDetail, setEntryDetail] = useState<EntryDetail | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sanctions/screenings').catch(() => []),
      apiFetch('/v1/sanctions/sync-status').catch(() => null),
    ])
      .then(([screeningsRes, syncRes]) => {
        setRows(Array.isArray(screeningsRes) ? screeningsRes : []);
        if (syncRes) setSyncStatus(syncRes);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAdhocScreen = async () => {
    if (!adhocName.trim()) return;
    setAdhocBusy(true);
    setAdhocResult(null);
    try {
      const res = await apiFetch('/v1/sanctions/screen', {
        method: 'POST',
        body: JSON.stringify({ name: adhocName.trim() }),
      });
      setAdhocResult(res);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not screen this party name.', { variant: 'error' });
    } finally {
      setAdhocBusy(false);
    }
  };

  const openEntry = async (entryId: string) => {
    setEntryLoading(true);
    setEntryDetail(null);
    try {
      const res = await apiFetch(`/v1/sanctions/entries/${entryId}`);
      setEntryDetail(res);
    } catch (err: any) {
      showAlert(err.message || 'Could not load sanctions entry details.', { variant: 'error' });
    } finally {
      setEntryLoading(false);
    }
  };

  const openReview = (row: Screening) => {
    setReviewing(row);
    setReviewNote('');
  };

  const submitReview = async (decision: 'cleared_false_positive' | 'confirmed_match') => {
    if (!reviewing) return;
    setReviewBusy(true);
    try {
      await apiFetch(`/v1/sanctions/screenings/${reviewing.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, note: reviewNote.trim() || undefined }),
      });
      setReviewing(null);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not save review decision.', { variant: 'error' });
    } finally {
      setReviewBusy(false);
    }
  };

  // Metrics computation
  const countFlagged = rows.filter(r => r.status === 'flagged').length;
  const countConfirmed = rows.filter(r => r.status === 'confirmed_match').length;
  const countCleared = rows.filter(r => r.status === 'cleared_false_positive').length;
  const countClean = rows.filter(r => r.status === 'clear').length;

  const metrics = [
    {
      label: 'Needs Review',
      value: countFlagged,
      subtitle: countFlagged === 0 ? 'Queue is clear' : `${countFlagged} pending review decisions`,
      icon: 'alertTriangle' as IconName,
      alert: countFlagged > 0,
    },
    {
      label: 'Confirmed Matches',
      value: countConfirmed,
      subtitle: `${countConfirmed} active sanctioned entities identified`,
      icon: 'shield' as IconName,
      alert: false,
    },
    {
      label: 'Cleared (False Positives)',
      value: countCleared,
      subtitle: 'Verified non-matching counterparties',
      icon: 'checkCircle' as IconName,
      alert: false,
    },
    {
      label: 'Indexed Watchlists',
      // A real count or nothing: this used to show a made-up "15,000+" when
      // the status call failed, which reads as a working screen.
      value: syncStatus?.entriesTotal ? syncStatus.entriesTotal.toLocaleString() : '—',
      subtitle: syncStatus?.lists?.length
        ? 'Updated ' + syncStatus.lists.map(l => `${l.source} ${fmtListDate(l.lastSuccessAt)}`).join(' · ')
        : 'OFAC SDN & UN Consolidated lists',
      icon: 'database' as IconName,
      alert: false,
    },
  ];

  // Filtering & Sorting
  const filteredRows = useMemo(() => {
    let list = rows;

    if (currentTab === 'flagged') {
      list = list.filter(r => r.status === 'flagged');
    } else if (currentTab === 'confirmed') {
      list = list.filter(r => r.status === 'confirmed_match');
    } else if (currentTab === 'cleared') {
      list = list.filter(r => r.status === 'cleared_false_positive');
    } else if (currentTab === 'clear') {
      list = list.filter(r => r.status === 'clear');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r =>
        r.screened_name.toLowerCase().includes(q) ||
        (r.best_match_name && r.best_match_name.toLowerCase().includes(q)) ||
        r.subject_type.toLowerCase().includes(q)
      );
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.screened_name.localeCompare(b.screened_name);
        case 'type':
          return dir * a.subject_type.localeCompare(b.subject_type);
        case 'match':
          return dir * (a.best_match_name || '').localeCompare(b.best_match_name || '');
        case 'score':
          return dir * (Number(a.best_match_score || 0) - Number(b.best_match_score || 0));
        case 'status':
          return dir * a.status.localeCompare(b.status);
        default:
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
  }, [rows, currentTab, searchQuery, sortKey, sortDir]);

  // Paginated slice
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  function handleTabChange(tab: QueueTab) {
    setCurrentTab(tab);
    setPage(1);
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setPage(1);
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
    setPage(1);
  }

  function SortHeader({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: active ? 'var(--ink)' : 'var(--ink3)',
          fontWeight: active ? 700 : 600,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        <span>{label}</span>
        <Icon
          name={active && sortDir === 'asc' ? 'chevronUp' : 'chevronDown'}
          size={11}
          color={active ? 'var(--ink)' : 'var(--ink3)'}
          style={{ opacity: active ? 1 : 0.4 }}
        />
      </button>
    );
  }

  function renderStatus(status: Screening['status']) {
    if (status === 'flagged') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--gold, #b45309)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold, #b45309)', flexShrink: 0 }} />
          Needs Review
        </span>
      );
    }
    if (status === 'confirmed_match') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--red, #cf222e)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red, #cf222e)', flexShrink: 0 }} />
          Confirmed Match
        </span>
      );
    }
    if (status === 'cleared_false_positive') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--green, #16a34a)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green, #16a34a)', flexShrink: 0 }} />
          Cleared (False Positive)
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500, color: 'var(--ink3)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink3)', opacity: 0.5, flexShrink: 0 }} />
        Clean
      </span>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Compliance', 'Screening']}
        titlePlain="Sanctions"
        titleEm="screening"
        subtitle="Counterparties and customers are screened server-side against OFAC SDN and UN Consolidated databases. Flagged matches are reviewed and dispositioned here."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* A "clear" result is only as current as the lists behind it. */}
        {syncStatus === null ? null : !syncStatus.lists?.length ? null : syncStatus.lists.some(l => l.stale) && (
          <Banner variant="warning" title="Sanctions lists may be out of date">
            {syncStatus.lists.filter(l => l.stale).map(l => `${LIST_NAMES[l.source]} last updated ${fmtListDate(l.lastSuccessAt)}`).join('; ')}.
            {' '}New designations since then are not screened. The daily refresh will retry; until it succeeds, treat "clear" results with care.
            {syncStatus.lists.find(l => l.stale && l.lastError) ? ` Last error: ${syncStatus.lists.find(l => l.stale && l.lastError)!.lastError}` : ''}
          </Banner>
        )}
        {/* ── Key Metrics Overview (Calm Monochrome / Slate) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}>
          {metrics.map(m => (
            <Card key={m.label} style={{ padding: '16px 18px', transition: 'border-color 0.15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink3)' }}>{m.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.15, marginTop: 4 }}>
                    {m.value}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{m.subtitle}</div>
                </div>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink2)',
                  flexShrink: 0,
                }}>
                  <Icon name={m.icon} size={17} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Ad-hoc Screening Tool (Clean Quick Screen Panel) ── */}
        <Card>
          <CardHeader style={{ padding: '16px 20px 12px' }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 700 }}>Quick Entity / Counterparty Screen</CardTitle>
            <CardDescription style={{ fontSize: 12, marginTop: 2 }}>
              Screen any individual, trading entity, supplier or vessel name immediately against live OFAC SDN and UN lists
            </CardDescription>
          </CardHeader>
          <CardContent style={{ padding: '0 20px 18px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 440 }}>
                <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={adhocName}
                  onChange={e => setAdhocName(e.target.value)}
                  placeholder="Enter full legal name, business entity, or vessel name…"
                  onKeyDown={e => { if (e.key === 'Enter') runAdhocScreen(); }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '7px 28px 7px 32px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    fontSize: 12.5,
                    color: 'var(--ink)',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.background = 'var(--white)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
                />
                {adhocName && (
                  <button
                    type="button"
                    onClick={() => setAdhocName('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>

              <Button
                disabled={adhocBusy || !adhocName.trim()}
                onClick={runAdhocScreen}
                size="sm"
                style={{ height: 33, padding: '0 16px', fontSize: 12.5 }}
              >
                {adhocBusy ? 'Screening…' : 'Screen Entity'}
              </Button>
            </div>

            {/* Ad-hoc Result Output */}
            {adhocResult && (
              <div style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
              }}>
                {adhocResult.matches.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--green, #16a34a)' }}>
                    <Icon name="checkCircle" size={16} />
                    <span>Clean Record — No matching entries located on OFAC SDN or UN Consolidated lists.</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--red, #cf222e)', marginBottom: 10 }}>
                      <Icon name="alertTriangle" size={15} />
                      <span>{adhocResult.matches.length} Potential Sanctions Match{adhocResult.matches.length > 1 ? 'es' : ''} Identified</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {adhocResult.matches.map((m: any, i: number) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '8px 12px',
                            borderRadius: 'var(--r-sm)',
                            background: 'var(--white)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: m.score >= 0.45 ? 'var(--red, #cf222e)' : 'var(--gold, #b45309)' }}>
                              {Math.round(m.score * 100)}% Match
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.matchedName}</span>
                            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                              · {m.source} {m.entryType?.toLowerCase()} · {m.programs || 'No program specified'}
                            </span>
                          </div>

                          {m.entryId && (
                            <button
                              type="button"
                              onClick={() => openEntry(m.entryId)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                color: 'var(--ink)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                flexShrink: 0,
                              }}
                            >
                              <span>Inspect Entry</span>
                              <Icon name="chevronRight" size={12} color="var(--ink3)" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Screening Queue & Audit Trail Table ── */}
        <Card>
          <CardHeader style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div>
                <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Screening Review Queue & Audit Log</CardTitle>
                <CardDescription style={{ fontSize: 12, marginTop: 2 }}>
                  Comprehensive record of entity checks, automated screening results and compliance officer decisions
                </CardDescription>
              </div>

              {/* Search input & Segmented filter tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 220 }}>
                  <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Filter by party or match…"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '6px 26px 6px 30px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      fontSize: 12,
                      color: 'var(--ink)',
                      outline: 'none',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.background = 'var(--white)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange('')}
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>

                {/* Segmented Filter Control */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: 2,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                }}>
                  {(['flagged', 'all', 'confirmed', 'cleared', 'clear'] as QueueTab[]).map(tabKey => {
                    const isActive = currentTab === tabKey;
                    const labels: Record<QueueTab, string> = {
                      flagged: `Needs Review (${countFlagged})`,
                      all: `All (${rows.length})`,
                      confirmed: `Confirmed (${countConfirmed})`,
                      cleared: `Cleared (${countCleared})`,
                      clear: `Clean (${countClean})`,
                    };
                    return (
                      <button
                        key={tabKey}
                        type="button"
                        onClick={() => handleTabChange(tabKey)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 5,
                          fontSize: 11.5,
                          fontWeight: isActive ? 600 : 500,
                          border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                          background: isActive ? 'var(--white)' : 'transparent',
                          color: isActive ? 'var(--ink)' : 'var(--ink3)',
                          boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.12s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {labels[tabKey]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 32 }}><SectionLoading /></div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                <Icon name="checkCircle" size={28} color="var(--ink3)" style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div>
                  {searchQuery
                    ? 'No screening records match your search filter.'
                    : currentTab === 'flagged'
                      ? 'Queue is clean — no pending flagged party matches waiting on review.'
                      : 'No screening records found in this category.'}
                </div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left' }}><SortHeader label="Screened Party" k="name" /></th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', width: 110 }}><SortHeader label="Type" k="type" /></th>
                        <th style={{ padding: '10px 14px', textAlign: 'left' }}><SortHeader label="Closest Match" k="match" /></th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', width: 100 }}><SortHeader label="Similarity" k="score" /></th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', width: 160 }}><SortHeader label="Status" k="status" /></th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', width: 120 }}><SortHeader label="Recorded" k="date" /></th>
                        <th style={{ padding: '10px 16px', width: 90, textAlign: 'right' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map(row => (
                        <tr
                          key={row.id}
                          style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s ease' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        >
                          {/* Screened Name */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                              {row.screened_name}
                            </div>
                            {row.review_note && (
                              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                                Note: {row.review_note}
                              </div>
                            )}
                          </td>

                          {/* Subject Type */}
                          <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)', textTransform: 'capitalize' }}>
                            {row.subject_type || 'Entity'}
                          </td>

                          {/* Closest Match Link */}
                          <td style={{ padding: '12px 14px' }}>
                            {row.best_match_entry_id ? (
                              <button
                                type="button"
                                onClick={() => openEntry(row.best_match_entry_id!)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  color: 'var(--ink)',
                                  fontWeight: 600,
                                  fontSize: 12.5,
                                  textAlign: 'left',
                                  textDecoration: 'underline',
                                  textUnderlineOffset: 2,
                                }}
                              >
                                {row.best_match_name}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>
                            )}
                          </td>

                          {/* Similarity */}
                          <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--font)' }}>
                            {fmtScore(row.best_match_score)}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 14px' }}>
                            {renderStatus(row.status)}
                          </td>

                          {/* Date */}
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                            {formatDate(row.created_at)}
                          </td>

                          {/* Action Button */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {row.status === 'flagged' ? (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => openReview(row)}
                                style={{ fontSize: 11.5, fontWeight: 600 }}
                              >
                                Review
                              </Button>
                            ) : row.best_match_entry_id ? (
                              <button
                                type="button"
                                onClick={() => openEntry(row.best_match_entry_id!)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--ink3)',
                                  fontSize: 11.5,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 2,
                                }}
                              >
                                <span>Details</span>
                                <Icon name="chevronRight" size={11} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Canonical Pagination Bar */}
                <PaginationBar
                  page={page}
                  pageSize={pageSize}
                  total={filteredRows.length}
                  onPageChange={setPage}
                  onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                  pageSizeOptions={[10, 20, 50]}
                  itemLabel="record"
                  bordered={false}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Review Dialog ── */}
      <Dialog open={!!reviewing} onOpenChange={o => !o && setReviewing(null)}>
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle>Review Flagged Sanctions Match</DialogTitle>
            <DialogDescription style={{ fontSize: 12 }}>
              Evaluate similarity and record an audit-traceable compliance decision.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <div style={{
              padding: '12px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              fontSize: 12.5,
              color: 'var(--ink2)',
              lineHeight: 1.45,
            }}>
              Screened entity <strong style={{ color: 'var(--ink)' }}>{reviewing?.screened_name}</strong> was matched against{' '}
              <strong style={{ color: 'var(--ink)' }}>{reviewing?.best_match_name}</strong> with{' '}
              <strong style={{ color: 'var(--ink)' }}>{fmtScore(reviewing?.best_match_score ?? null)}</strong> similarity.
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                Compliance Officer Disposition Note (Optional)
              </div>
              <Textarea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
                placeholder="Reasoning for disposition (e.g. Verified passport/registration differs from SDN record)…"
                style={{ fontSize: 12.5 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button
                variant="outline"
                size="sm"
                disabled={reviewBusy}
                onClick={() => submitReview('cleared_false_positive')}
              >
                Clear — False Positive
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={reviewBusy}
                onClick={() => submitReview('confirmed_match')}
              >
                Confirm Match (Denied Party)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Entry Detail Modal ── */}
      <Dialog open={!!entryDetail || entryLoading} onOpenChange={o => !o && setEntryDetail(null)}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle>Sanctions List Official Entry</DialogTitle>
            <DialogDescription style={{ fontSize: 12 }}>
              Official record details from the designated sanctions authority.
            </DialogDescription>
          </DialogHeader>

          {entryLoading ? (
            <div style={{ padding: 24 }}><SectionLoading /></div>
          ) : entryDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6, fontSize: 12.5 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{entryDetail.primary_name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <Badge variant="outline">{entryDetail.source}</Badge>
                  <Badge variant="outline" style={{ textTransform: 'capitalize' }}>{entryDetail.entry_type}</Badge>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                {entryDetail.programs && (
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>Sanction Program:</span>{' '}
                    <span style={{ color: 'var(--ink)' }}>{entryDetail.programs}</span>
                  </div>
                )}
                {entryDetail.listed_on && (
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>Listed On:</span>{' '}
                    <span style={{ color: 'var(--ink)' }}>{entryDetail.listed_on}</span>
                  </div>
                )}
                {entryDetail.remarks && (
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>Remarks:</span>{' '}
                    <span style={{ color: 'var(--ink3)' }}>{entryDetail.remarks}</span>
                  </div>
                )}
                {entryDetail.aliases && entryDetail.aliases.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>Known Aliases:</span>{' '}
                    <span style={{ color: 'var(--ink)' }}>{entryDetail.aliases.join(', ')}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <Button variant="outline" size="sm" onClick={() => setEntryDetail(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
