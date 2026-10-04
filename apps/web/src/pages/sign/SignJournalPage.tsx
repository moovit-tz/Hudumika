import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { Textarea } from '../../components/ui/textarea.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';

interface JournalEntry {
  event_id: string;
  envelope_id: string;
  event_type: 'certified' | 'witnessed' | 'declared' | 'journal_correction';
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  note: string | null;
  envelope_title: string | null;
  execution_type: string | null;
  verification_code: string | null;
  anchor_hash: string | null;
  envelope_status: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  execution_role: string | null;
  certifier_title: string | null;
  certifier_roll_number: string | null;
  certifier_firm: string | null;
}

const EVENT_TYPE_BADGES: Record<string, { label: string; variant: 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'; icon: string }> = {
  certified:          { label: 'Notarial Certification', variant: 'brand',   icon: 'shield'      },
  witnessed:          { label: 'Witnessed Signature',    variant: 'info',    icon: 'eye'         },
  declared:           { label: 'Affidavit Declaration',  variant: 'warning', icon: 'fileText'    },
  journal_correction: { label: 'Journal Correction',     variant: 'error',   icon: 'alertCircle' },
};

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

function Pagination({ total, page, perPage, onPage }: { total: number; page: number; perPage: number; onPage: (p: number) => void }) {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', padding: '16px 0' }}>
      <button type="button" style={{ ...btnBase, opacity: page === 1 ? 0.4 : 1 }} disabled={page === 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" size={13} />
      </button>
      {pages.map((p, i) => p === '...' ? (
        <span key={`e${i}`} style={{ color: 'var(--ink3)', fontSize: 12.5, padding: '0 4px' }}>…</span>
      ) : (
        <button key={p} type="button" onClick={() => onPage(p as number)}
          style={{ ...btnBase, background: p === page ? 'hsl(var(--primary))' : 'var(--bg)', color: p === page ? 'hsl(var(--primary-foreground))' : 'var(--ink)', borderColor: p === page ? 'hsl(var(--primary))' : 'var(--border)' }}>
          {p}
        </button>
      ))}
      <button type="button" style={{ ...btnBase, opacity: page === totalPages ? 0.4 : 1 }} disabled={page === totalPages} onClick={() => onPage(page + 1)}>
        <Icon name="chevronRight" size={13} />
      </button>
      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink3)' }}>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
    </div>
  );
}

export function SignJournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [selectedEvent, setSelectedEvent] = useState<JournalEntry | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const loadJournal = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await apiFetch(`/v1/sign/journal?${params.toString()}`);
      setEntries(res.data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => { loadJournal(); }, [loadJournal]);
  useEffect(() => { setPage(1); }, [search, typeFilter, perPage]);

  const stats = useMemo(() => {
    if (!entries) return { total: 0, certified: 0, witnessed: 0, declared: 0, corrections: 0 };
    return {
      total:       entries.length,
      certified:   entries.filter(e => e.event_type === 'certified').length,
      witnessed:   entries.filter(e => e.event_type === 'witnessed').length,
      declared:    entries.filter(e => e.event_type === 'declared').length,
      corrections: entries.filter(e => e.event_type === 'journal_correction').length,
    };
  }, [entries]);

  const pageItems = useMemo(() => (entries ?? []).slice((page - 1) * perPage, page * perPage), [entries, page, perPage]);

  async function handleAddCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent || !correctionNote.trim()) return;
    setSavingCorrection(true);
    try {
      await apiFetch(`/v1/sign/journal/${selectedEvent.event_id}/correction`, {
        method: 'POST',
        body: JSON.stringify({ note: correctionNote.trim() }),
      });
      setSelectedEvent(null);
      setCorrectionNote('');
      loadJournal();
    } catch (err: any) {
      alert(err.message || 'Failed to submit correction');
    } finally {
      setSavingCorrection(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign', 'Electronic Journal']}
        titlePlain="Electronic"
        titleEm="journal"
        subtitle="Chronological, append-only official register of all witnessed, notarized, and declared signatures."
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Recorded Acts',      value: stats.total,       icon: 'fileText'   as const, variant: 'brand'   as const },
          { label: 'Notarial Certifications',  value: stats.certified,   icon: 'shield'     as const, variant: 'brand'   as const },
          { label: 'Witnessed Signatures',     value: stats.witnessed,   icon: 'eye'        as const, variant: 'info'    as const },
          { label: 'Affidavits & Declarations',value: stats.declared,    icon: 'fileText'   as const, variant: 'warning' as const },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{card.value}</div>
            </div>
            <FeaturedIcon variant={card.variant} size="md" shape="square"><Icon name={card.icon} size={18} /></FeaturedIcon>
          </div>
        ))}
      </div>

      {/* Filter + Search toolbar */}
      <div style={{ marginBottom: 16 }}>
      <SectionCard>
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search document title, certifier, roll number, code, or notes"
          quickFilter={{
            label: 'Event', allLabel: 'All Acts & Events', value: typeFilter === 'all' ? null : typeFilter,
            onChange: value => setTypeFilter(value || 'all'),
            options: [
              { value: 'certified', label: 'Notarial Certifications' }, { value: 'witnessed', label: 'Witnessed Signatures' },
              { value: 'declared', label: 'Affidavit Declarations' }, { value: 'journal_correction', label: 'Corrections' },
            ],
          }}
          actions={<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)' }}>
            <span>Show</span>
            <Select value={String(perPage)} onValueChange={v => { setPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger style={{ height: 30, fontSize: 12, padding: '0 8px', width: 72 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <span>per page</span>
            </div>
            <Button variant="outline" size="sm" onClick={loadJournal} disabled={loading}>
            <Icon name="refresh" size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
            Refresh
            </Button>
          </>}
        />
      </SectionCard>
      </div>

      {/* Journal table */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20, display: 'flex', flexDirection: 'column' }}>
        <SectionCard padded={false}>
          {loading && !entries ? (
            <SectionLoading />
          ) : !entries || entries.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 14, textAlign: 'center', padding: 32 }}>
              <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="fileText" size={24} /></FeaturedIcon>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No journal entries found</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, lineHeight: 1.55 }}>
                When documents are certified by a Notary Public, witnessed, or signed under affidavit, an immutable journal entry will automatically appear here.
              </div>
            </div>
          ) : (
            <>
              <div className="rtbl-wrap">
                <table className="rtbl">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Act / Event</th>
                      <th>Document & Code</th>
                      <th>Professional / Actor</th>
                      <th>Integrity Hash</th>
                      <th>Audit Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(entry => {
                      const badge = EVENT_TYPE_BADGES[entry.event_type] ?? { label: entry.event_type, variant: 'gray' as const, icon: 'file' };
                      return (
                        <tr key={entry.event_id}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>
                              {new Date(entry.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                              {new Date(entry.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          </td>
                          <td>
                            <Badge variant={badge.variant}>
                              <Icon name={badge.icon as any} size={12} style={{ marginRight: 4, display: 'inline' }} />
                              {badge.label}
                            </Badge>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                              {entry.envelope_title || 'Untitled Document'}
                            </div>
                            {entry.verification_code && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 'var(--r-sm)' }}>
                                  {entry.verification_code}
                                </span>
                                <Link to={`/sign/verify/${entry.verification_code}`} target="_blank" rel="noreferrer" style={{ color: 'var(--ink3)' }} title="Open public verification page">
                                  <Icon name="externalLink" size={12} />
                                </Link>
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>
                              {entry.recipient_name || entry.actor_name || 'System / Unspecified'}
                            </div>
                            {entry.certifier_title && (
                              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                                {entry.certifier_title}{entry.certifier_roll_number ? ` · Roll #${entry.certifier_roll_number}` : ''}
                              </div>
                            )}
                            {entry.certifier_firm && (
                              <div style={{ fontSize: 11, color: 'var(--ink3)', fontStyle: 'italic' }}>{entry.certifier_firm}</div>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {entry.anchor_hash ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <code style={{ fontSize: 11, fontFamily: 'var(--font)', color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--r-sm)' }}>
                                  {entry.anchor_hash.slice(0, 10)}…{entry.anchor_hash.slice(-6)}
                                </code>
                                <button type="button" onClick={() => copyToClipboard(entry.anchor_hash!, entry.event_id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }} title="Copy SHA-256 Hash">
                                  <Icon name={copiedHash === entry.event_id ? 'check' : 'copy'} size={13} style={{ color: copiedHash === entry.event_id ? 'var(--green)' : undefined }} />
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>Pending</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--ink3)', maxWidth: 200 }}>
                            {entry.note ? (
                              <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.note}</span>
                            ) : <span style={{ fontStyle: 'italic', opacity: 0.5 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {entry.event_type !== 'journal_correction' && (
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedEvent(entry); setCorrectionNote(''); }}
                                style={{ fontSize: 12, height: 28, gap: 4 }}>
                                <Icon name="edit" size={12} /> Add Correction
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination total={entries.length} page={page} perPage={perPage} onPage={setPage} />
            </>
          )}
        </SectionCard>
      </div>

      {/* Correction dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={open => { if (!open) setSelectedEvent(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="shield" size={16} /></FeaturedIcon>
                Append Journal Correction
              </div>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>Document: {selectedEvent?.envelope_title}</div>
              <div>Event ID: <span style={{ fontFamily: 'var(--font)' }}>{selectedEvent?.event_id}</span></div>
              <div>Professional: {selectedEvent?.recipient_name || selectedEvent?.actor_name || 'N/A'}</div>
            </div>
            <form id="correction-form" onSubmit={handleAddCorrection}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Correction / Clarification Note <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <Textarea
                required rows={4} value={correctionNote}
                onChange={e => setCorrectionNote(e.target.value)}
                placeholder="Explain why this correction is being appended (e.g., Typo in commissioner roll number, clarified firm name…)"
              />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: '8px 12px', background: 'var(--gold-l)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--ink2)' }}>
                <Icon name="alertCircle" size={14} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
                This correction will be permanently logged under your identity ({user?.name || user?.email}) and timestamped in the audit chain.
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEvent(null)} disabled={savingCorrection}>Cancel</Button>
            <Button form="correction-form" type="submit" disabled={savingCorrection || !correctionNote.trim()}>
              {savingCorrection ? 'Appending…' : 'Append Correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default SignJournalPage;
