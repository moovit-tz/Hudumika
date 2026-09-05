import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { FileUploader } from '../components/ui/file-uploader.js';

interface Statement {
  id: string; bank_name: string | null; account_code: string;
  statement_date_from: string; statement_date_to: string; closing_balance: number;
  total: number; matched: number;
}
interface StatementLine { id: string; txn_date: string; description: string | null; amount: number; matched_journal_line_id: string | null }
interface Candidate { id: string; date: string; description: string; entryNumber: string; amount: number }

export function BankReconciliation() {
  const { fmt } = useCurrency();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ lines: StatementLine[]; candidates: Candidate[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [bankName, setBankName] = useState('');
  const [pendingLine, setPendingLine] = useState<StatementLine | null>(null);

  const load = () => apiFetch('/v1/bank-reconciliation/statements').then((d: any) => { if (Array.isArray(d)) setStatements(d); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const loadDetail = (id: string) => apiFetch(`/v1/bank-reconciliation/statements/${id}`).then((d: any) => setDetail({ lines: d.lines, candidates: d.candidates })).catch(() => setDetail(null));
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const qs = new URLSearchParams({ account_code: '1010', ...(bankName ? { bank_name: bankName } : {}) });
      const statement = await apiFetch(`/v1/bank-reconciliation/statements/import?${qs.toString()}`, { method: 'POST', body: form });
      showAlert(`Imported ${statement.imported} transaction(s).`);
      setShowImport(false); setBankName('');
      await load();
      setSelectedId(statement.id);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  async function handleMatch(lineId: string, journalLineId: string) {
    if (!selectedId) return;
    try {
      await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${lineId}/match`, { method: 'POST', body: JSON.stringify({ journal_line_id: journalLineId }) });
      setPendingLine(null);
      await loadDetail(selectedId);
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not match this line.');
    }
  }

  async function handleUnmatch(lineId: string) {
    if (!selectedId) return;
    await apiFetch(`/v1/bank-reconciliation/statements/${selectedId}/lines/${lineId}/unmatch`, { method: 'POST' }).catch(() => {});
    await loadDetail(selectedId);
    await load();
  }

  async function handleDelete(s: Statement) {
    if (!(await showConfirm(`Delete this statement (${s.bank_name || 'Bank'}, ${new Date(s.statement_date_from).toLocaleDateString()}–${new Date(s.statement_date_to).toLocaleDateString()})? Matches are lost, not the underlying ledger entries.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/bank-reconciliation/statements/${s.id}`, { method: 'DELETE' }).catch(() => {});
    if (selectedId === s.id) { setSelectedId(null); setDetail(null); }
    await load();
  }

  const selected = statements.find(s => s.id === selectedId);
  const matchedSum = detail ? detail.lines.filter(l => l.matched_journal_line_id).reduce((s, l) => s + l.amount, 0) : 0;
  const unmatchedLines = detail ? detail.lines.filter(l => !l.matched_journal_line_id) : [];
  const usedCandidateIds = new Set(detail?.lines.filter(l => l.matched_journal_line_id).map(l => l.matched_journal_line_id));
  const availableCandidates = detail ? detail.candidates.filter(c => !usedCandidateIds.has(c.id)) : [];

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading bank reconciliation…</div>;

  const brStats = (() => {
    const reconciledCount = statements.filter(s => s.matched === s.total && s.total > 0).length;
    const totalLines = statements.reduce((s, st) => s + st.total, 0);
    const matchedLines = statements.reduce((s, st) => s + st.matched, 0);
    const totalClosingBalance = statements.reduce((s, st) => s + Number(st.closing_balance), 0);
    const latest = [...statements].sort((a, b) => b.statement_date_to.localeCompare(a.statement_date_to))[0];
    return { total: statements.length, reconciledCount, totalLines, matchedLines, totalClosingBalance, latestBalance: latest ? Number(latest.closing_balance) : 0 };
  })();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Bank"
        titleEm="reconciliation"
        subtitle="Import a bank statement and match its lines against what's actually posted to cash."
      />

      <MetricsRow cards={[
        {
          title: 'Total Statements', value: String(brStats.total),
          sub1Label: 'RECONCILED', sub1Value: String(brStats.reconciledCount),
          sub2Label: 'PENDING', sub2Value: String(brStats.total - brStats.reconciledCount), barHighlight: 'var(--teal)',
        },
        {
          title: 'Total Lines', value: String(brStats.totalLines),
          sub1Label: 'MATCHED', sub1Value: String(brStats.matchedLines),
          sub2Label: 'UNMATCHED', sub2Value: String(brStats.totalLines - brStats.matchedLines), barHighlight: 'var(--blue)',
        },
        {
          title: 'Closing Balance', value: fmt(brStats.totalClosingBalance),
          sub1Label: 'STATEMENTS', sub1Value: String(brStats.total),
          sub2Label: 'LATEST', sub2Value: fmt(brStats.latestBalance), barHighlight: 'var(--purple)',
        },
        {
          title: 'Match Rate', value: `${brStats.totalLines ? Math.round((brStats.matchedLines / brStats.totalLines) * 100) : 0}%`,
          sub1Label: 'MATCHED', sub1Value: String(brStats.matchedLines),
          sub2Label: 'TOTAL LINES', sub2Value: String(brStats.totalLines), barHighlight: 'var(--green)',
        },
      ]} />

      <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button"
          onClick={() => setShowImport(true)}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="upload" size={14} color="hsl(var(--primary-foreground))" /> Import Statement
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
        {/* Statement list */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statements.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0' }}>No statements imported yet.</div>}
          {statements.map(s => (
            <div key={s.id} onClick={() => setSelectedId(s.id)}
              style={{ padding: '12px 14px', borderRadius: 'var(--r)', cursor: 'pointer', border: selectedId === s.id ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: selectedId === s.id ? 'var(--teal-l)' : 'var(--white)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{s.bank_name || 'Bank Account'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{new Date(s.statement_date_from).toLocaleDateString('en-GB')} – {new Date(s.statement_date_to).toLocaleDateString('en-GB')}</div>
              <div style={{ fontSize: 11.5, marginTop: 4, color: s.matched === s.total ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{s.matched}/{s.total} matched</div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink3)' }}>Select a statement to reconcile.</div>
          ) : detail && (
            <>
              <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                <div className="card" style={{ padding: '14px 18px', flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Statement Total</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(selected.closing_balance)}</div>
                </div>
                <div className="card" style={{ padding: '14px 18px', flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Matched</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{fmt(matchedSum)}</div>
                </div>
                <div className="card" style={{ padding: '14px 18px', flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Unmatched Lines</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: unmatchedLines.length > 0 ? 'var(--red)' : 'var(--green)' }}>{unmatchedLines.length}</div>
                </div>
                <button type="button" onClick={() => handleDelete(selected)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--red)', cursor: 'pointer', padding: '0 14px' }}><Icon name="trash" size={14} /></button>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(l.txn_date).toLocaleDateString('en-GB')}</td>
                          <td style={{ padding: '8px 12px' }}>{l.description || '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: l.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>{l.amount >= 0 ? '+' : ''}{fmt(l.amount)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {l.matched_journal_line_id
                              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: 'var(--green-l)', color: 'var(--green)' }}>MATCHED</span>
                              : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: 'var(--gold-l)', color: 'var(--gold)' }}>UNMATCHED</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {l.matched_journal_line_id
                              ? <button type="button" onClick={() => handleUnmatch(l.id)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Unmatch</button>
                              : <button type="button" onClick={() => setPendingLine(l)} style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Match…</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <>
          <div onClick={() => setShowImport(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 440 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Import Bank Statement</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>CSV with Date, Description, and Amount (or separate Debit/Credit) columns.</div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Bank Name (optional)</label>
              <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. CRDB Bank"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
              <FileUploader accept=".csv" multiple={false} onUpload={handleUpload} uploadingFiles={importing ? [{ id: '1', name: 'Uploading…', size: 0, progress: 60, status: 'uploading' }] : []} onRemoveFile={() => {}} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Match picker */}
      {pendingLine && (
        <>
          <div onClick={() => setPendingLine(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Match "{pendingLine.description}"</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14 }}>{new Date(pendingLine.txn_date).toLocaleDateString('en-GB')} · {fmt(pendingLine.amount)}</div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {availableCandidates.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0', textAlign: 'center' }}>No unmatched ledger entries in this statement's date range.</div>
                ) : availableCandidates
                  .slice()
                  .sort((a, b) => Math.abs(a.amount - pendingLine.amount) - Math.abs(b.amount - pendingLine.amount))
                  .map(c => (
                    <button key={c.id} type="button" onClick={() => handleMatch(pendingLine.id, c.id)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: Math.abs(c.amount - pendingLine.amount) < 0.01 ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{c.entryNumber} · {new Date(c.date).toLocaleDateString('en-GB')}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{fmt(c.amount)}</div>
                    </button>
                  ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPendingLine(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
