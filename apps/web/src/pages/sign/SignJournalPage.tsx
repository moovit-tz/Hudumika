import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
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
  certified: { label: 'Notarial Certification', variant: 'brand', icon: 'shield' },
  witnessed: { label: 'Witnessed Signature', variant: 'info', icon: 'eye' },
  declared: { label: 'Affidavit Declaration', variant: 'warning', icon: 'fileText' },
  journal_correction: { label: 'Journal Correction', variant: 'error', icon: 'alertCircle' },
};

export function SignJournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Correction modal state
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

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  const stats = useMemo(() => {
    if (!entries) return { total: 0, certified: 0, witnessed: 0, declared: 0, corrections: 0 };
    return {
      total: entries.length,
      certified: entries.filter(e => e.event_type === 'certified').length,
      witnessed: entries.filter(e => e.event_type === 'witnessed').length,
      declared: entries.filter(e => e.event_type === 'declared').length,
      corrections: entries.filter(e => e.event_type === 'journal_correction').length,
    };
  }, [entries]);

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        crumbs={['Sign', 'Electronic Journal']}
        titlePlain="Electronic "
        titleEm="Journal"
        subtitle="Chronological, append-only official register of all witnessed, notarized, and declared signatures."
      />

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Recorded Acts</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Icon name="fileText" size={20} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notarial Certifications</p>
            <p className="text-2xl font-bold mt-1 text-teal-600">{stats.certified}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Icon name="shield" size={20} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Witnessed Signatures</p>
            <p className="text-2xl font-bold mt-1 text-sky-600">{stats.witnessed}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
            <Icon name="eye" size={20} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Affidavits & Declarations</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{stats.declared}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Icon name="fileText" size={20} />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <SectionCard>
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 flex gap-2 items-center">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search document title, certifier, roll number, code or notes..."
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Acts & Events</option>
              <option value="certified">Notarial Certifications</option>
              <option value="witnessed">Witnessed Signatures</option>
              <option value="declared">Affidavit Declarations</option>
              <option value="journal_correction">Corrections</option>
            </select>
          </div>

          <button
            onClick={loadJournal}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </SectionCard>

      {/* Journal Table */}
      <SectionCard>
        {loading && !entries ? (
          <SectionLoading />
        ) : !entries || entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
              <Icon name="fileText" size={24} />
            </div>
            <p className="font-medium text-foreground">No journal entries found</p>
            <p className="text-sm max-w-md mx-auto text-muted-foreground">
              When documents are certified by a Notary Public, witnessed, or signed under affidavit, an immutable journal entry will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 px-4 font-semibold">Date & Time</th>
                  <th className="py-3 px-4 font-semibold">Act / Event</th>
                  <th className="py-3 px-4 font-semibold">Document & Code</th>
                  <th className="py-3 px-4 font-semibold">Professional / Actor</th>
                  <th className="py-3 px-4 font-semibold">Integrity Hash</th>
                  <th className="py-3 px-4 font-semibold">Audit Notes</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {entries.map((entry) => {
                  const badgeInfo = EVENT_TYPE_BADGES[entry.event_type] || {
                    label: entry.event_type,
                    variant: 'gray' as const,
                    icon: 'file',
                  };

                  return (
                    <tr key={entry.event_id} className="hover:bg-muted/30 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">
                          {new Date(entry.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          {new Date(entry.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>

                      {/* Event Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge variant={badgeInfo.variant}>
                          <Icon name={badgeInfo.icon as any} size={12} className="mr-1 inline" />
                          {badgeInfo.label}
                        </Badge>
                      </td>

                      {/* Document Title & Verification Code */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground line-clamp-1 max-w-xs">
                          {entry.envelope_title || 'Untitled Document'}
                        </div>
                        {entry.verification_code && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-mono text-[11px] text-teal-600 bg-teal-500/10 px-1.5 py-0.5 rounded">
                              {entry.verification_code}
                            </span>
                            <Link
                              to={`/sign/verify/${entry.verification_code}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-teal-600 transition-colors"
                              title="Open public verification page"
                            >
                              <Icon name="externalLink" size={12} />
                            </Link>
                          </div>
                        )}
                      </td>

                      {/* Professional / Actor */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground">
                          {entry.recipient_name || entry.actor_name || 'System / Unspecified'}
                        </div>
                        {entry.certifier_title && (
                          <div className="text-xs text-muted-foreground">
                            {entry.certifier_title}
                            {entry.certifier_roll_number ? ` • Roll #${entry.certifier_roll_number}` : ''}
                          </div>
                        )}
                        {entry.certifier_firm && (
                          <div className="text-[11px] text-muted-foreground/80 italic">
                            {entry.certifier_firm}
                          </div>
                        )}
                      </td>

                      {/* Hash */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {entry.anchor_hash ? (
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {entry.anchor_hash.slice(0, 10)}...{entry.anchor_hash.slice(-6)}
                            </code>
                            <button
                              onClick={() => copyToClipboard(entry.anchor_hash!, entry.event_id)}
                              className="text-muted-foreground hover:text-foreground p-1"
                              title="Copy SHA-256 Hash"
                            >
                              <Icon name={copiedHash === entry.event_id ? 'check' : 'copy'} size={13} className={copiedHash === entry.event_id ? 'text-teal-600' : ''} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Pending Hash</span>
                        )}
                      </td>

                      {/* Audit Note */}
                      <td className="py-3.5 px-4 text-xs text-muted-foreground max-w-xs">
                        {entry.note ? (
                          <span className="line-clamp-2">{entry.note}</span>
                        ) : (
                          <span className="italic text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        {entry.event_type !== 'journal_correction' && (
                          <button
                            onClick={() => {
                              setSelectedEvent(entry);
                              setCorrectionNote('');
                            }}
                            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium px-2 py-1 rounded hover:bg-teal-500/10 transition-colors"
                            title="Add official append-only correction note"
                          >
                            <Icon name="edit" size={12} />
                            Add Correction
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Append-Only Correction Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
                  <Icon name="shield" size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Append Journal Correction</h3>
                  <p className="text-xs text-muted-foreground">Original records are never altered or deleted</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg text-xs space-y-1 text-muted-foreground border border-border/50">
              <div className="font-medium text-foreground">
                Document: <span className="font-normal">{selectedEvent.envelope_title}</span>
              </div>
              <div>
                Event ID: <span className="font-mono">{selectedEvent.event_id}</span>
              </div>
              <div>
                Professional: <span className="text-foreground">{selectedEvent.recipient_name || selectedEvent.actor_name || 'N/A'}</span>
              </div>
            </div>

            <form onSubmit={handleAddCorrection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                  Correction / Clarification Note <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={correctionNote}
                  onChange={e => setCorrectionNote(e.target.value)}
                  placeholder="Explain why this correction is being appended (e.g., Typo in commissioner roll number, clarified firm name, added court jurisdiction reference)..."
                  className="w-full p-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="text-[11px] text-muted-foreground bg-amber-500/10 text-amber-900 dark:text-amber-200 p-2.5 rounded-lg flex items-start gap-2">
                <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5" />
                <span>
                  This correction will be permanently logged in the electronic journal under your identity ({user?.name || user?.email}) and timestamped in the audit chain.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  disabled={savingCorrection}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCorrection || !correctionNote.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {savingCorrection ? 'Appending...' : 'Append Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default SignJournalPage;
