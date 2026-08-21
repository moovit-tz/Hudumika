import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

/**
 * Denied-party screening review queue (ClearOS M2). Every customer created
 * anywhere in the platform is already screened server-side, best-effort, at
 * creation time (customers.routes.ts) against the shared OFAC SDN + UN
 * Consolidated lists synced daily (sanctions-sync.job.ts). This page is
 * where a real, unresolved match — status 'flagged' — gets a human decision,
 * plus an ad-hoc screen box for checking a name before it becomes a record.
 */

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

const STATUS_VARIANT: Record<string, 'gray' | 'warning' | 'success' | 'error'> = {
  clear: 'gray', flagged: 'warning', cleared_false_positive: 'success', confirmed_match: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  clear: 'Clear', flagged: 'Needs review', cleared_false_positive: 'Cleared (false positive)', confirmed_match: 'Confirmed match',
};

function fmtScore(s: Screening['best_match_score']): string {
  if (s == null) return '—';
  return `${Math.round(Number(s) * 100)}%`;
}

export function SanctionsScreeningPage() {
  const [rows, setRows] = useState<Screening[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'flagged' | 'all'>('flagged');

  const [adhocName, setAdhocName] = useState('');
  const [adhocBusy, setAdhocBusy] = useState(false);
  const [adhocResult, setAdhocResult] = useState<{ status: string; matches: any[] } | null>(null);

  const [reviewing, setReviewing] = useState<Screening | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  const [entryDetail, setEntryDetail] = useState<EntryDetail | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const q = filter === 'flagged' ? '?status=flagged' : '';
    apiFetch(`/v1/sanctions/screenings${q}`)
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(load, [load]);

  const runAdhocScreen = async () => {
    if (!adhocName.trim()) return;
    setAdhocBusy(true);
    setAdhocResult(null);
    try {
      const res = await apiFetch('/v1/sanctions/screen', { method: 'POST', body: JSON.stringify({ name: adhocName.trim() }) });
      setAdhocResult(res);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not screen this name.', { variant: 'error' });
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
      showAlert(err.message || 'Could not load the matched list entry.', { variant: 'error' });
    } finally {
      setEntryLoading(false);
    }
  };

  const openReview = (row: Screening) => { setReviewing(row); setReviewNote(''); };

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
      showAlert(err.message || 'Could not save this review decision.', { variant: 'error' });
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Compliance', 'Screening']}
        titlePlain="Sanctions"
        titleEm="screening"
        subtitle="Every customer is checked against the OFAC SDN and UN Consolidated lists at creation — flagged matches wait here for a human decision."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Screen a name" collapsible={false}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Input
              value={adhocName}
              onChange={e => setAdhocName(e.target.value)}
              placeholder="Full name or company name…"
              style={{ maxWidth: 340 }}
              onKeyDown={e => { if (e.key === 'Enter') runAdhocScreen(); }}
            />
            <Button disabled={adhocBusy || !adhocName.trim()} onClick={runAdhocScreen}>
              {adhocBusy ? 'Screening…' : 'Screen'}
            </Button>
          </div>
          {adhocResult && (
            <div style={{ marginTop: 14 }}>
              {adhocResult.matches.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
                  <Icon name="checkCircle" size={16} /> No match against either list.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {adhocResult.matches.map((m: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                      <Badge variant={m.score >= 0.45 ? 'error' : 'warning'}>{Math.round(m.score * 100)}%</Badge>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.matchedName}</span>
                      <span style={{ color: 'var(--ink3)' }}>· {m.source} {m.entryType.toLowerCase()} · {m.programs || 'no program listed'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Screening queue"
          padded={false}
          collapsible={false}
          action={
            <Select value={filter} onValueChange={v => setFilter(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flagged">Needs review</SelectItem>
                <SelectItem value="all">All screenings</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
              <Icon name="checkCircle" size={28} style={{ marginBottom: 8 }} />
              <div>{filter === 'flagged' ? 'Nothing waiting on review.' : 'No screenings recorded yet.'}</div>
            </div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Screened name', 'Subject', 'Best match', 'Score', 'Status', 'Date', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{row.screened_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', textTransform: 'capitalize' }}>{row.subject_type}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5 }}>
                      {row.best_match_entry_id ? (
                        <button
                          type="button"
                          onClick={() => openEntry(row.best_match_entry_id!)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--teal)', fontWeight: 600 }}
                        >
                          {row.best_match_name}
                        </button>
                      ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{fmtScore(row.best_match_score)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(row.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {row.status === 'flagged' && (
                        <Button size="xs" onClick={() => openReview(row)}>Review</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      </div>

      <Dialog open={!!reviewing} onOpenChange={o => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review flagged match</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
              <strong>{reviewing?.screened_name}</strong> matched <strong>{reviewing?.best_match_name}</strong> at {fmtScore(reviewing?.best_match_score ?? null)} similarity.
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Note (optional)</div>
              <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} placeholder="Why this is (or isn't) the same party…" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button variant="outline" disabled={reviewBusy} onClick={() => submitReview('cleared_false_positive')}>Clear — false positive</Button>
              <Button variant="destructive" disabled={reviewBusy} onClick={() => submitReview('confirmed_match')}>Confirm match</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!entryDetail || entryLoading} onOpenChange={o => !o && setEntryDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sanctions list entry</DialogTitle></DialogHeader>
          {entryLoading ? (
            <div style={{ padding: 20, color: 'var(--ink3)' }}>Loading…</div>
          ) : entryDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, fontSize: 13 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{entryDetail.primary_name}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Badge variant="info">{entryDetail.source}</Badge>
                <Badge variant="gray">{entryDetail.entry_type}</Badge>
              </div>
              {entryDetail.programs && <div><span style={{ color: 'var(--ink3)' }}>Program:</span> {entryDetail.programs}</div>}
              {entryDetail.listed_on && <div><span style={{ color: 'var(--ink3)' }}>Listed:</span> {entryDetail.listed_on}</div>}
              {entryDetail.remarks && <div><span style={{ color: 'var(--ink3)' }}>Remarks:</span> {entryDetail.remarks}</div>}
              {entryDetail.aliases.length > 0 && (
                <div><span style={{ color: 'var(--ink3)' }}>Also known as:</span> {entryDetail.aliases.join(', ')}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
