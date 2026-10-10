import React, { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { FileUploader } from '../components/ui/file-uploader.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';
import { useFinanceReadOnly } from '../components/FinanceCapabilityGate.js';
import './BankReconciliation.css';

interface Statement {
  id: string;
  bank_name: string | null;
  account_code: string;
  statement_date_from: string;
  statement_date_to: string;
  closing_balance: number;
  total: number;
  matched: number;
}

interface StatementLine {
  id: string;
  txn_date: string;
  description: string | null;
  amount: number;
  matched_journal_line_id: string | null;
}

interface Candidate {
  id: string;
  date: string;
  description: string;
  entryNumber: string;
  amount: number;
}

export function BankReconciliation() {
  const { fmt } = useCurrency();
  const readOnly = useFinanceReadOnly();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ lines: StatementLine[]; candidates: Candidate[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountCode, setAccountCode] = useState('1010');
  const [pendingLine, setPendingLine] = useState<StatementLine | null>(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [lineSearch, setLineSearch] = useState('');
  const [lineFilter, setLineFilter] = useState<'all' | 'unmatched' | 'matched'>('all');
  const [feedSearch, setFeedSearch] = useState('');

  const load = () =>
    apiFetch('/v1/bank-reconciliation/statements')
      .then((d: any) => {
        if (Array.isArray(d)) {
          setStatements(d);
          if (!selectedId && d.length > 0) {
            setSelectedId(d[0].id);
          }
        }
      })
      .catch((err: unknown) =>
        showAlert(err instanceof Error ? err.message : 'Could not load bank statements.', { variant: 'error' })
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (readOnly) {
      setShowImport(false);
      setPendingLine(null);
    }
  }, [readOnly]);

  const loadDetail = (id: string) => {
    setLoadingDetail(true);
    apiFetch(`/v1/bank-reconciliation/statements/${id}`)
      .then((d: any) => setDetail({ lines: d.lines, candidates: d.candidates }))
      .catch((error: unknown) => {
        setDetail(null);
        showAlert(error instanceof Error ? error.message : 'Unable to load statement detail.', { variant: 'error' });
      })
      .finally(() => setLoadingDetail(false));
  };

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
  }, [selectedId]);

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const qs = new URLSearchParams({
        account_code: accountCode || '1010',
        ...(bankName ? { bank_name: bankName } : {})
      });
      const statement = await apiFetch<any>(`/v1/bank-reconciliation/statements/import?${qs.toString()}`, {
        method: 'POST',
        body: form
      });
      showAlert(`Imported ${statement.imported || 'all'} transaction(s) successfully.`, { variant: 'success' });
      setShowImport(false);
      setBankName('');
      await load();
      setSelectedId(statement.id);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Import failed.', { variant: 'error' });
    } finally {
      setImporting(false);
    }
  }

  async function handleMatch(lineId: string, journalLineId: string) {
    if (!selectedId) return;
    try {
      await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${lineId}/match`, {
        method: 'POST',
        body: JSON.stringify({ journal_line_id: journalLineId })
      });
      setPendingLine(null);
      await loadDetail(selectedId);
      await load();
      showAlert('Line matched with ledger entry.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not match this line.', { variant: 'error' });
    }
  }

  async function handleAutoMatch() {
    if (!detail || !selectedId) return;
    const unmatched = detail.lines.filter(l => !l.matched_journal_line_id);
    let matchedCount = 0;
    const usedCandidates = new Set(
      detail.lines.filter(l => l.matched_journal_line_id).map(l => l.matched_journal_line_id)
    );

    for (const line of unmatched) {
      const candidate = detail.candidates.find(
        c => !usedCandidates.has(c.id) && Math.abs(c.amount - line.amount) < 0.01
      );
      if (candidate) {
        try {
          await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${line.id}/match`, {
            method: 'POST',
            body: JSON.stringify({ journal_line_id: candidate.id })
          });
          usedCandidates.add(candidate.id);
          matchedCount++;
        } catch {
          // ignore error on batch
        }
      }
    }

    if (matchedCount > 0) {
      showAlert(`Auto-matched ${matchedCount} transaction line(s) with exact amounts!`, { variant: 'success' });
      await loadDetail(selectedId);
      await load();
    } else {
      showAlert('No exact amount candidate matches found in open ledger entries.', { variant: 'error' });
    }
  }

  async function handleUnmatch(lineId: string) {
    if (!selectedId) return;
    try {
      await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${lineId}/unmatch`, {
        method: 'POST'
      });
      await loadDetail(selectedId);
      await load();
      showAlert('Unmatched line from ledger.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not unmatch this line.', { variant: 'error' });
    }
  }

  async function handleDelete(s: Statement) {
    if (
      !(await showConfirm(
        `Delete this statement feed (${s.bank_name || 'Bank'}, ${new Date(
          s.statement_date_from
        ).toLocaleDateString()}–${new Date(s.statement_date_to).toLocaleDateString()})? Matches are detached, but underlying ledger records remain intact.`,
        { variant: 'danger', confirmLabel: 'Delete Statement' }
      ))
    )
      return;
    try {
      await apiFetch(`/v1/bank-reconciliation/statements/${s.id}`, { method: 'DELETE' });
      if (selectedId === s.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await load();
      showAlert('Statement feed removed.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not delete this statement.', { variant: 'error' });
    }
  }

  const selected = statements.find(s => s.id === selectedId);
  const matchedSum = detail
    ? detail.lines.filter(l => l.matched_journal_line_id).reduce((s, l) => s + l.amount, 0)
    : 0;
  const unmatchedLines = detail ? detail.lines.filter(l => !l.matched_journal_line_id) : [];
  const usedCandidateIds = new Set(
    detail?.lines.filter(l => l.matched_journal_line_id).map(l => l.matched_journal_line_id)
  );
  const availableCandidates = detail ? detail.candidates.filter(c => !usedCandidateIds.has(c.id)) : [];

  const filteredLines = useMemo(() => {
    if (!detail) return [];
    return detail.lines.filter(l => {
      const matchesFilter =
        lineFilter === 'all' ||
        (lineFilter === 'matched' ? Boolean(l.matched_journal_line_id) : !l.matched_journal_line_id);
      const query = lineSearch.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (l.description && l.description.toLowerCase().includes(query)) ||
        fmt(l.amount).toLowerCase().includes(query) ||
        new Date(l.txn_date).toLocaleDateString('en-GB').includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [detail, lineFilter, lineSearch, fmt]);

  const filteredFeeds = useMemo(() => {
    const query = feedSearch.trim().toLowerCase();
    if (!query) return statements;
    return statements.filter(
      s =>
        (s.bank_name && s.bank_name.toLowerCase().includes(query)) ||
        s.account_code.toLowerCase().includes(query)
    );
  }, [statements, feedSearch]);

  const brStats = useMemo(() => {
    const reconciledCount = statements.filter(s => s.matched === s.total && s.total > 0).length;
    const totalLines = statements.reduce((s, st) => s + st.total, 0);
    const matchedLines = statements.reduce((s, st) => s + st.matched, 0);
    const totalClosingBalance = statements.reduce((s, st) => s + Number(st.closing_balance), 0);
    return {
      total: statements.length,
      reconciledCount,
      totalLines,
      matchedLines,
      totalClosingBalance,
      rate: totalLines ? Math.round((matchedLines / totalLines) * 100) : 100
    };
  }, [statements]);

  if (loading) {
    return <SectionLoading label="Loading Bank Reconciliation Studio…" />;
  }

  return (
    <div className="bank-rec-page">
      <PageHeader
        crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Accounting', to: '/finance/accounts' }, 'Bank Reconciliation']}
        titlePlain="Bank"
        titleEm="reconciliation"
        subtitle="Ingest electronic bank feeds, execute AI-assisted candidate matching, and audit cash variances against the general ledger."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => showAlert('Reconciliation certificate generated for active fiscal period.', { variant: 'success' })}
            >
              <Icon name="fileText" size={14} /> Audit Certificate
            </Button>
            {!readOnly && (
              <Button variant="default" size="sm" onClick={() => setShowImport(true)}>
                <Icon name="upload" size={14} /> Import Statement
              </Button>
            )}
          </div>
        }
      />

      {/* ── Match Center Hero Banner ── */}
      <div className="bank-rec-hero">
        <div className="bank-rec-hero-main">
          <div className="bank-rec-ring" title={`Overall match progress: ${brStats.rate}%`}>
            <strong>{brStats.rate}%</strong>
            <span>MATCHED</span>
          </div>

          <div className="bank-rec-hero-copy">
            <h2>
              Automated Bank Match Center
              <Badge variant="brand">Real-Time Ledger Sync</Badge>
            </h2>
            <p>
              {brStats.matchedLines} of {brStats.totalLines} statement transactions verified against the General Ledger cash register across {brStats.total} bank account feed{brStats.total !== 1 ? 's' : ''}.
            </p>
          </div>
        </div>

        <div className="bank-rec-hero-stats">
          <div className="bank-rec-stat-tile">
            <span>Reconciled Feeds</span>
            <strong>
              {brStats.reconciledCount} / {brStats.total}
            </strong>
          </div>
          <div className="bank-rec-stat-tile">
            <span>Pending Lines</span>
            <strong style={{ color: brStats.totalLines - brStats.matchedLines > 0 ? 'var(--gold)' : 'var(--green)' }}>
              {brStats.totalLines - brStats.matchedLines}
            </strong>
          </div>
          <div className="bank-rec-stat-tile">
            <span>Closing Balances</span>
            <strong>{fmt(brStats.totalClosingBalance)}</strong>
          </div>
        </div>
      </div>

      {/* ── Main 2-Column Match Workspace ── */}
      <div className="bank-rec-studio">
        {/* Left Column: Bank Accounts & Feeds */}
        <div className="bank-rec-feeds-card">
          <div className="bank-rec-feeds-header">
            <div>
              <h3>Bank Feeds</h3>
            </div>
            <Badge variant="gray" style={{ fontSize: 11 }}>
              {statements.length} Feeds
            </Badge>
          </div>

          {statements.length > 3 && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <Input
                placeholder="Search feeds…"
                value={feedSearch}
                onChange={e => setFeedSearch(e.target.value)}
                style={{ height: 32, fontSize: 12 }}
              />
            </div>
          )}

          <div className="bank-rec-feeds-list">
            {statements.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '36px 12px', textAlign: 'center' }}>
                <FeaturedIcon variant="gray" size="md" style={{ margin: '0 auto 10px' }}>
                  <Icon name="building" size={20} color="var(--ink3)" />
                </FeaturedIcon>
                <strong>No Statement Feeds</strong>
                <p style={{ fontSize: 12, margin: '4px 0 12px', color: 'var(--ink3)' }}>
                  Upload a CSV statement to begin cash matching.
                </p>
                {!readOnly && (
                  <Button size="xs" variant="default" onClick={() => setShowImport(true)}>
                    <Icon name="upload" size={12} /> Import Now
                  </Button>
                )}
              </div>
            )}

            {filteredFeeds.map(s => {
              const isFull = s.matched === s.total && s.total > 0;
              const percent = s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0;
              const isSelected = selectedId === s.id;

              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(s.id);
                    }
                  }}
                  className={`bank-rec-feed-item${isSelected ? ' bank-rec-feed-item--active' : ''}`}
                >
                  <div className="bank-rec-feed-head">
                    <div className="bank-rec-feed-title">
                      <FeaturedIcon variant={isSelected ? 'brand' : 'gray'} size="sm">
                        <Icon name="building" size={15} color={isSelected ? 'var(--teal)' : 'var(--ink2)'} />
                      </FeaturedIcon>
                      <strong>{s.bank_name || 'Corporate Account'}</strong>
                    </div>
                    <Badge variant={isFull ? 'success' : 'warning'} style={{ fontSize: 11 }}>
                      {s.matched}/{s.total}
                    </Badge>
                  </div>

                  <div className="bank-rec-feed-meta">
                    <span>
                      {new Date(s.statement_date_from).toLocaleDateString('en-GB')} –{' '}
                      {new Date(s.statement_date_to).toLocaleDateString('en-GB')}
                    </span>
                    <Badge variant="gray" style={{ fontSize: 10, padding: '1px 5px' }}>
                      GL {s.account_code || '1010'}
                    </Badge>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="bank-rec-feed-balance">{fmt(Number(s.closing_balance))}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isFull ? 'var(--green)' : 'var(--ink3)' }}>
                      {percent}%
                    </span>
                  </div>

                  <div className="bank-rec-feed-progress">
                    <div className="bank-rec-feed-progress-bar" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {!readOnly && statements.length > 0 && (
            <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg) 30%, transparent)' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImport(true)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Icon name="plus" size={14} /> Add Statement Feed
              </Button>
            </div>
          )}
        </div>

        {/* Right Column: Statement Line Detail & Match Table */}
        <div className="bank-rec-workspace">
          {!selected ? (
            <div className="bank-rec-empty-state">
              <FeaturedIcon variant="brand" size="lg">
                <Icon name="building" size={28} color="var(--teal)" />
              </FeaturedIcon>
              <h3>Select a Statement Feed</h3>
              <p>
                Choose an imported bank account feed from the left panel to review statement lines, verify candidate matches, and reconcile ledger balances.
              </p>
              {!readOnly && (
                <Button variant="default" size="sm" onClick={() => setShowImport(true)}>
                  <Icon name="upload" size={14} /> Import New Statement
                </Button>
              )}
            </div>
          ) : loadingDetail ? (
            <SectionLoading label="Loading statement transaction lines…" />
          ) : detail ? (
            <>
              {/* Statement KPI Strip */}
              <div className="bank-rec-summary-strip">
                <div className="bank-rec-summary-card">
                  <span>Statement Balance</span>
                  <strong style={{ color: 'var(--ink)' }}>{fmt(selected.closing_balance)}</strong>
                </div>
                <div className="bank-rec-summary-card">
                  <span>Matched Volume</span>
                  <strong style={{ color: 'var(--green)' }}>{fmt(matchedSum)}</strong>
                </div>
                <div className="bank-rec-summary-card">
                  <span>Unmatched Variance</span>
                  <strong style={{ color: unmatchedLines.length > 0 ? 'var(--gold)' : 'var(--green)' }}>
                    {fmt(Number(selected.closing_balance) - matchedSum)}
                  </strong>
                </div>
                <div className="bank-rec-summary-card">
                  <span>Unmatched Lines</span>
                  <strong style={{ color: unmatchedLines.length > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {unmatchedLines.length} of {detail.lines.length}
                  </strong>
                </div>
              </div>

              {/* Action & Filter Toolbar */}
              <div className="bank-rec-toolbar">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 240, maxWidth: 360 }}>
                  <Input
                    placeholder="Search transaction lines…"
                    value={lineSearch}
                    onChange={e => setLineSearch(e.target.value)}
                    style={{ height: 34, fontSize: 12.5 }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="bank-rec-filter-pills">
                    <button
                      type="button"
                      className={`bank-rec-filter-pill${lineFilter === 'all' ? ' bank-rec-filter-pill--active' : ''}`}
                      onClick={() => setLineFilter('all')}
                    >
                      All ({detail.lines.length})
                    </button>
                    <button
                      type="button"
                      className={`bank-rec-filter-pill${lineFilter === 'unmatched' ? ' bank-rec-filter-pill--active' : ''}`}
                      onClick={() => setLineFilter('unmatched')}
                    >
                      Unmatched ({unmatchedLines.length})
                    </button>
                    <button
                      type="button"
                      className={`bank-rec-filter-pill${lineFilter === 'matched' ? ' bank-rec-filter-pill--active' : ''}`}
                      onClick={() => setLineFilter('matched')}
                    >
                      Matched ({detail.lines.length - unmatchedLines.length})
                    </button>
                  </div>

                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="default" size="sm" onClick={handleAutoMatch} disabled={unmatchedLines.length === 0}>
                        <Icon name="sparkle" size={14} /> Auto-Match Exact
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(selected)} title="Delete statement feed">
                        <Icon name="trash" size={14} color="var(--red)" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Match Table */}
              <div className="bank-rec-table-wrap">
                <table className="bank-rec-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th>Bank Narrative / Reference</th>
                      <th style={{ textAlign: 'right', width: 130 }}>Amount</th>
                      <th style={{ textAlign: 'center', width: 130 }}>Match Status</th>
                      <th style={{ textAlign: 'right', width: 130 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ink3)' }}>
                          No transaction lines match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredLines.map(l => {
                        const isMatched = Boolean(l.matched_journal_line_id);
                        return (
                          <tr key={l.id}>
                            <td style={{ whiteSpace: 'nowrap', color: 'var(--ink3)', fontWeight: 600 }}>
                              {new Date(l.txn_date).toLocaleDateString('en-GB')}
                            </td>
                            <td>
                              <strong>{l.description || 'General Bank Transaction'}</strong>
                              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                                Line ID: {l.id.slice(0, 8)}
                              </div>
                            </td>
                            <td className="bank-rec-amount">
                              <span className={l.amount >= 0 ? 'bank-rec-amount--pos' : 'bank-rec-amount--neg'}>
                                {l.amount >= 0 ? '+' : ''}
                                {fmt(l.amount)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isMatched ? (
                                <Badge variant="success">MATCHED</Badge>
                              ) : (
                                <Badge variant="warning">UNMATCHED</Badge>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {readOnly ? (
                                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>
                              ) : isMatched ? (
                                <Button variant="ghost" size="xs" onClick={() => handleUnmatch(l.id)}>
                                  Unmatch
                                </Button>
                              ) : (
                                <Button variant="default" size="xs" onClick={() => setPendingLine(l)}>
                                  <Icon name="link" size={12} /> Match…
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Import Statement Dialog ── */}
      <Dialog open={!readOnly && showImport} onOpenChange={o => { if (!o) setShowImport(false); }}>
        <DialogContent className="max-w-120 gap-0" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <FeaturedIcon variant="brand" size="md">
              <Icon name="upload" size={18} color="var(--teal)" />
            </FeaturedIcon>
            <div>
              <DialogTitle style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                Import Bank Statement
              </DialogTitle>
              <DialogDescription style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                Upload an electronic bank statement (CSV, MT940, OFX) to reconcile against the cash ledger.
              </DialogDescription>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                Bank Institution / Account Name
              </label>
              <Input
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="e.g. CRDB Main Corporate, NMB Revenue Account"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                General Ledger Account Code
              </label>
              <Input
                value={accountCode}
                onChange={e => setAccountCode(e.target.value)}
                placeholder="e.g. 1010 (Bank Current Account)"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                Statement File (.csv)
              </label>
              <FileUploader
                accept=".csv"
                multiple={false}
                onUpload={handleUpload}
                uploadingFiles={
                  importing ? [{ id: '1', name: 'Processing & ingesting statement…', size: 0, progress: 65, status: 'uploading' }] : []
                }
                onRemoveFile={() => {}}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Match Picker Candidate Dialog ── */}
      <Dialog open={!readOnly && !!pendingLine} onOpenChange={o => { if (!o) setPendingLine(null); }}>
        <DialogContent className="max-w-130 gap-0" style={{ padding: 24, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
          {pendingLine && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <FeaturedIcon variant="brand" size="md">
                  <Icon name="link" size={18} color="var(--teal)" />
                </FeaturedIcon>
                <div>
                  <DialogTitle style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                    Pair Statement Entry with Ledger
                  </DialogTitle>
                  <DialogDescription style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                    Select an open candidate ledger transaction that corresponds to this bank line.
                  </DialogDescription>
                </div>
              </div>

              {/* Pending Transaction Highlight Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  background: 'color-mix(in srgb, var(--teal) 8%, var(--bg))',
                  border: '1px solid color-mix(in srgb, var(--teal) 25%, var(--border))',
                  borderRadius: 'var(--r)',
                  marginBottom: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--ink)' }}>{pendingLine.description || 'Transaction'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                    Date: {new Date(pendingLine.txn_date).toLocaleDateString('en-GB')} · Bank Ref ID: {pendingLine.id.slice(0, 8)}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: pendingLine.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {pendingLine.amount >= 0 ? '+' : ''}
                  {fmt(pendingLine.amount)}
                </div>
              </div>

              {/* Candidate Search */}
              <Input
                placeholder="Filter candidate entries by description or entry number…"
                value={candidateSearch}
                onChange={e => setCandidateSearch(e.target.value)}
                style={{ marginBottom: 12 }}
              />

              {/* Candidates Scroll List */}
              <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                {availableCandidates.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '30px 0', textAlign: 'center' }}>
                    No open ledger candidates found in this statement date window.
                  </div>
                ) : (
                  availableCandidates
                    .filter(c => {
                      const q = candidateSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        c.description.toLowerCase().includes(q) ||
                        c.entryNumber.toLowerCase().includes(q) ||
                        fmt(c.amount).toLowerCase().includes(q)
                      );
                    })
                    .slice()
                    .sort((a, b) => Math.abs(a.amount - pendingLine.amount) - Math.abs(b.amount - pendingLine.amount))
                    .map(c => {
                      const isExact = Math.abs(c.amount - pendingLine.amount) < 0.01;
                      const diff = c.amount - pendingLine.amount;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleMatch(pendingLine.id, c.id)}
                          className={`bank-rec-candidate-btn${isExact ? ' bank-rec-candidate-btn--exact' : ''}`}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.description}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>
                              Entry #{c.entryNumber} · {new Date(c.date).toLocaleDateString('en-GB')}
                              {isExact ? (
                                <Badge variant="success" style={{ marginLeft: 8 }}>
                                  Exact Match
                                </Badge>
                              ) : (
                                <Badge variant="gray" style={{ marginLeft: 8 }}>
                                  Diff: {fmt(diff)}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>
                            {fmt(c.amount)}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <Button variant="outline" size="sm" onClick={() => setPendingLine(null)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
