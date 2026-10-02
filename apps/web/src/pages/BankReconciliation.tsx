import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionCard } from '../components/SectionCard.js';
import { FileUploader } from '../components/ui/file-uploader.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { useFinanceReadOnly } from '../components/FinanceCapabilityGate.js';

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
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [bankName, setBankName] = useState('');
  const [pendingLine, setPendingLine] = useState<StatementLine | null>(null);

  const load = () =>
    apiFetch('/v1/bank-reconciliation/statements')
      .then((d: any) => {
        if (Array.isArray(d)) setStatements(d);
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

  const loadDetail = (id: string) =>
    apiFetch(`/v1/bank-reconciliation/statements/${id}`)
      .then((d: any) => setDetail({ lines: d.lines, candidates: d.candidates }))
      .catch(() => setDetail(null));

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId]);

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const qs = new URLSearchParams({ account_code: '1010', ...(bankName ? { bank_name: bankName } : {}) });
      const statement = await apiFetch(`/v1/bank-reconciliation/statements/import?${qs.toString()}`, {
        method: 'POST',
        body: form,
      });
      showAlert(`Imported ${statement.imported} transaction(s) successfully.`, { variant: 'success' });
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
        body: JSON.stringify({ journal_line_id: journalLineId }),
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
    const usedCandidates = new Set(detail.lines.filter(l => l.matched_journal_line_id).map(l => l.matched_journal_line_id));

    for (const line of unmatched) {
      const candidate = detail.candidates.find(
        c => !usedCandidates.has(c.id) && Math.abs(c.amount - line.amount) < 0.01
      );
      if (candidate) {
        try {
          await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${line.id}/match`, {
            method: 'POST',
            body: JSON.stringify({ journal_line_id: candidate.id }),
          });
          usedCandidates.add(candidate.id);
          matchedCount++;
        } catch {
          // ignore error on batch
        }
      }
    }

    if (matchedCount > 0) {
      showAlert(`Auto-matched ${matchedCount} transaction line(s) with exact amount match!`, { variant: 'success' });
      await loadDetail(selectedId);
      await load();
    } else {
      showAlert('No exact amount candidate matches found.', { variant: 'error' });
    }
  }

  async function handleUnmatch(lineId: string) {
    if (!selectedId) return;
    try {
      await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${lineId}/unmatch`, {
        method: 'POST',
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
        `Delete this statement (${s.bank_name || 'Bank'}, ${new Date(
          s.statement_date_from
        ).toLocaleDateString()}–${new Date(s.statement_date_to).toLocaleDateString()})? Matches are lost, not the underlying ledger entries.`,
        { variant: 'danger', confirmLabel: 'Delete' }
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
      showAlert('Statement removed.', { variant: 'success' });
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

  if (loading)
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading bank reconciliation…</div>;

  const brStats = (() => {
    const reconciledCount = statements.filter(s => s.matched === s.total && s.total > 0).length;
    const totalLines = statements.reduce((s, st) => s + st.total, 0);
    const matchedLines = statements.reduce((s, st) => s + st.matched, 0);
    const totalClosingBalance = statements.reduce((s, st) => s + Number(st.closing_balance), 0);
    const latest = [...statements].sort((a, b) => b.statement_date_to.localeCompare(a.statement_date_to))[0];
    return {
      total: statements.length,
      reconciledCount,
      totalLines,
      matchedLines,
      totalClosingBalance,
      latestBalance: latest ? Number(latest.closing_balance) : 0,
      rate: totalLines ? Math.round((matchedLines / totalLines) * 100) : 100,
    };
  })();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reconciliation']}
        titlePlain="Bank"
        titleEm="reconciliation"
        subtitle="Statement feeds reconciliation, AI-assisted journal entry pairing, and audit match verification."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => showAlert('Generating reconciliation certificate...', { variant: 'success' })}>
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
      <div
        style={{
          background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy2) 60%, color-mix(in srgb, var(--teal) 35%, var(--navy2)) 100%)',
          borderRadius: 'var(--r-lg, 12px)',
          padding: '22px 26px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          boxShadow: '0 10px 25px -5px rgba(14, 31, 61, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '3px solid color-mix(in srgb, var(--teal) 40%, transparent)',
              borderTopColor: 'var(--teal)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.25)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 800, color: '#ffffff' }}>{brStats.rate}%</span>
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>MATCHED</span>
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
              Automated Bank Match Center
              <Badge variant="brand">Real-Time Sync</Badge>
            </h2>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
              {brStats.matchedLines} of {brStats.totalLines} statement transactions verified against the General Ledger cash register.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(0,0,0,0.22)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Statements</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{brStats.reconciledCount} / {brStats.total} Reconciled</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.22)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Closing Balance</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{fmt(brStats.totalClosingBalance)}</div>
          </div>
        </div>
      </div>

      {/* ── Main 2-Column Match Workspace ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        {/* Left: Statement Feed Selector */}
        <SectionCard
          title="Bank Accounts & Feeds"
          action={<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{statements.length} Feeds</span>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {statements.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0', textAlign: 'center' }}>
                No statements imported yet.
              </div>
            )}
            {statements.map(s => (
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
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r)',
                  cursor: 'pointer',
                  border: selectedId === s.id ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                  background: selectedId === s.id ? 'var(--teal-l)' : 'var(--white)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{s.bank_name || 'Corporate Account'}</span>
                  <Badge variant={s.matched === s.total && s.total > 0 ? 'success' : 'warning'}>
                    {s.matched}/{s.total}
                  </Badge>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  {new Date(s.statement_date_from).toLocaleDateString('en-GB')} –{' '}
                  {new Date(s.statement_date_to).toLocaleDateString('en-GB')}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 6 }}>
                  {fmt(Number(s.closing_balance))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Right: Statement Line Detail & Match Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!selected ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <Icon name="building" size={32} color="var(--ink3)" style={{ margin: '0 auto 8px', display: 'block' } as React.CSSProperties} />
              Select a statement from the left feed to start transaction matching.
            </div>
          ) : detail && (
            <>
              {/* Statement KPI Strip & Auto-Match trigger */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ padding: '10px 14px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Statement Total</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>{fmt(selected.closing_balance)}</div>
                  </div>
                  <div style={{ padding: '10px 14px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Matched Volume</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>{fmt(matchedSum)}</div>
                  </div>
                  <div style={{ padding: '10px 14px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Unmatched Lines</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: unmatchedLines.length > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {unmatchedLines.length}
                    </div>
                  </div>
                </div>

                {!readOnly && <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="default" size="sm" onClick={handleAutoMatch}>
                    <Icon name="zap" size={14} /> Auto-Match Exact
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(selected)}>
                    <Icon name="trash" size={14} /> Delete Feed
                  </Button>
                </div>}
              </div>

              {/* Match Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', fontSize: 11 }}>Date</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', fontSize: 11 }}>Description</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', fontSize: 11 }}>Amount</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', fontSize: 11 }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', fontSize: 11 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--ink2)' }}>
                          {new Date(l.txn_date).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--navy)' }}>
                          {l.description || '—'}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontFamily: 'var(--font)',
                            fontWeight: 700,
                            color: l.amount >= 0 ? 'var(--green)' : 'var(--red)',
                          }}
                        >
                          {l.amount >= 0 ? '+' : ''}
                          {fmt(l.amount)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {readOnly ? '—' : l.matched_journal_line_id ? (
                            <Badge variant="success">MATCHED</Badge>
                          ) : (
                            <Badge variant="warning">UNMATCHED</Badge>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {l.matched_journal_line_id ? (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Import Modal */}
      <Dialog open={!readOnly && showImport} onOpenChange={o => { if (!o) setShowImport(false); }}>
        <DialogContent className="max-w-110 gap-0" style={{ padding: 24 }}>
          <DialogTitle style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: 'var(--navy)' }}>Import Bank Statement</DialogTitle>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
            Upload CSV or MT940 statement with Date, Description, and Debit/Credit columns.
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>
            Bank / Account Label
          </label>
          <input
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            placeholder="e.g. NMB Main Corporate Account"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 16,
              background: 'var(--white)',
              color: 'var(--ink)',
            }}
          />
          <FileUploader
            accept=".csv"
            multiple={false}
            onUpload={handleUpload}
            uploadingFiles={importing ? [{ id: '1', name: 'Uploading statement…', size: 0, progress: 60, status: 'uploading' }] : []}
            onRemoveFile={() => {}}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Match Picker Dialog */}
      <Dialog open={!readOnly && !!pendingLine} onOpenChange={o => { if (!o) setPendingLine(null); }}>
        <DialogContent className="max-w-120 gap-0" style={{ padding: 24, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
          {pendingLine && (
            <>
              <DialogTitle style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: 'var(--navy)' }}>
                Match Statement Entry: "{pendingLine.description}"
              </DialogTitle>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14 }}>
                {new Date(pendingLine.txn_date).toLocaleDateString('en-GB')} · {fmt(pendingLine.amount)}
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {availableCandidates.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0', textAlign: 'center' }}>
                    No unmatched ledger entries in this statement date range.
                  </div>
                ) : (
                  availableCandidates
                    .slice()
                    .sort((a, b) => Math.abs(a.amount - pendingLine.amount) - Math.abs(b.amount - pendingLine.amount))
                    .map(c => {
                      const isExact = Math.abs(c.amount - pendingLine.amount) < 0.01;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleMatch(pendingLine.id, c.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 14px',
                            borderRadius: 'var(--r)',
                            border: '1px solid var(--border)',
                            background: isExact ? 'var(--teal-l)' : 'var(--white)',
                            cursor: 'pointer',
                            marginBottom: 8,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{c.description}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                              Entry #{c.entryNumber} · {new Date(c.date).toLocaleDateString('en-GB')}
                              {isExact && <Badge variant="success" className="ml-2">Exact Match</Badge>}
                            </div>
                          </div>
                          <div style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: 13.5, color: 'var(--navy)' }}>
                            {fmt(c.amount)}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
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
