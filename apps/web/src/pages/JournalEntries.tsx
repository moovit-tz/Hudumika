import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

interface AccountNode {
  id: string; code: string; name: string; type: string;
  children?: AccountNode[];
}
interface JELine {
  id: string; journal_entry_id: string; account_code: string; account_name: string;
  debit: string | number; credit: string | number; description: string | null;
}
interface JournalEntry {
  id: string; entry_number: string; entry_date: string; reference: string | null;
  description: string; status: 'DRAFT' | 'POSTED' | 'VOIDED'; source_module: string;
  source_id: string | null; posted_at: string; voided_at: string | null; void_reason: string | null;
  lines: JELine[];
}
interface DraftLine { accountCode: string; debit: string; credit: string; description: string }

const emptyLine = (): DraftLine => ({ accountCode: '', debit: '', credit: '', description: '' });

function flattenAccounts(nodes: AccountNode[], out: AccountNode[] = []): AccountNode[] {
  for (const n of nodes) { out.push(n); if (n.children?.length) flattenAccounts(n.children, out); }
  return out;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function JournalEntries() {
  const { fmt } = useCurrency();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [entriesRes, accountsRes] = await Promise.all([
        apiFetch('/v1/finance/journal-entries'),
        apiFetch('/v1/finance/chart-of-accounts'),
      ]);
      setEntries(entriesRes.journal_entries || entriesRes || []);
      setAccounts(flattenAccounts(accountsRes.accounts || accountsRes || []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const accountOptions: ComboboxOption[] = useMemo(
    () => accounts.map(a => ({ value: a.code, label: `${a.code} — ${a.name}`, sublabel: a.type })),
    [accounts],
  );

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const cr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.01 && dr > 0 };
  }, [lines]);

  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev);

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDescription(''); setReference(''); setLines([emptyLine(), emptyLine()]);
  };

  const postEntry = async () => {
    if (!description.trim()) return showAlert('A description is required.');
    if (!totals.balanced) return showAlert('Debits and credits must balance before posting.');
    const validLines = lines.filter(l => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) return showAlert('At least two lines with an account and an amount are required.');

    setPosting(true);
    try {
      await apiFetch('/v1/finance/journal-entries', {
        method: 'POST',
        body: JSON.stringify({
          entryDate, description: description.trim(), reference: reference.trim() || undefined,
          sourceModule: 'MANUAL',
          lines: validLines.map(l => ({
            accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
            description: l.description.trim() || undefined,
          })),
        }),
      });
      resetForm(); setShowForm(false); await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not post this entry.');
    } finally {
      setPosting(false);
    }
  };

  const confirmVoid = async (id: string) => {
    if (!voidReason.trim()) return showAlert('A reason is required to void an entry.');
    try {
      await apiFetch(`/v1/finance/journal-entries/${id}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      setVoidingId(null); setVoidReason(''); await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not void this entry.');
    }
  };

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading journal entries…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Journal"
        titleEm="entries"
        subtitle="Every posting to the general ledger — automatic and manual."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={showForm ? 'x' : 'plus'} size={13} /> {showForm ? 'Cancel' : 'New entry'}
          </button>
        }
      />

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>New manual journal entry</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 200px', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Date</label>
              <DatePicker date={parseDateOnly(entryDate)} onChange={d => setEntryDate(toDateOnlyString(d))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Description</label>
              <input className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this entry for?" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Reference (optional)</label>
              <input className="input-field" value={reference} onChange={e => setReference(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 1fr 32px', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Account</span><span style={{ textAlign: 'right' }}>Debit</span><span style={{ textAlign: 'right' }}>Credit</span><span>Line description</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Combobox options={accountOptions} value={l.accountCode} onChange={v => updateLine(i, { accountCode: v })} placeholder="Select account…" searchPlaceholder="Search accounts…" />
              <input className="input-field" type="number" min="0" step="0.01" value={l.debit} onChange={e => updateLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} style={{ textAlign: 'right' }} placeholder="0.00" />
              <input className="input-field" type="number" min="0" step="0.01" value={l.credit} onChange={e => updateLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} style={{ textAlign: 'right' }} placeholder="0.00" />
              <input className="input-field" value={l.description} onChange={e => updateLine(i, { description: e.target.value })} placeholder="Optional" />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length <= 2} title="Remove line" style={{ background: 'none', border: 'none', cursor: lines.length > 2 ? 'pointer' : 'not-allowed', opacity: lines.length > 2 ? 1 : 0.3, padding: 4 }}>
                <Icon name="trash" size={14} color="var(--red)" />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 4, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={12} /> Add line
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontFamily: 'var(--mono)' }}>
              <span style={{ color: 'var(--ink3)' }}>DR </span><strong style={{ color: 'var(--ink)' }}>{fmt(totals.dr)}</strong>
              <span style={{ margin: '0 10px', color: 'var(--ink3)' }}>·</span>
              <span style={{ color: 'var(--ink3)' }}>CR </span><strong style={{ color: 'var(--ink)' }}>{fmt(totals.cr)}</strong>
              {!totals.balanced && totals.dr + totals.cr > 0 && <span style={{ marginLeft: 12, color: 'var(--red)', fontWeight: 700 }}>Out of balance</span>}
              {totals.balanced && <span style={{ marginLeft: 12, color: 'var(--green)', fontWeight: 700 }}>Balanced</span>}
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={posting || !totals.balanced} onClick={postEntry}>
              {posting ? 'Posting…' : 'Post entry'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}></th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Entry #</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Source</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>No journal entries yet.</td></tr>
              ) : entries.map(e => {
                const isOpen = expanded.has(e.id);
                const isVoided = e.status === 'VOIDED';
                return (
                  <React.Fragment key={e.id}>
                    <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => toggle(e.id)}>
                      <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{isOpen ? '−' : '+'}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{e.entry_number}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmtDate(e.entry_date)}</td>
                      <td style={{ padding: '9px 12px', color: isVoided ? 'var(--ink3)' : 'var(--ink)', textDecoration: isVoided ? 'line-through' : 'none' }}>{e.description}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{e.source_module}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: isVoided ? 'var(--red-l)' : 'var(--green-l)', color: isVoided ? 'var(--red)' : 'var(--green)' }}>{e.status}</span>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                        {!isVoided && e.source_module === 'MANUAL' && (
                          voidingId === e.id ? (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <input className="input-field" style={{ width: 160, height: 28, fontSize: 12 }} placeholder="Reason for voiding" value={voidReason} onChange={ev => setVoidReason(ev.target.value)} autoFocus />
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setVoidingId(null); setVoidReason(''); }}>Cancel</button>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmVoid(e.id)}>Confirm</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setVoidingId(e.id)} style={{ fontSize: 12.5, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Void</button>
                          )
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: 'var(--bg)' }}>
                          <div style={{ padding: '10px 16px 14px 40px' }}>
                            {e.reference && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>Reference: {e.reference}</div>}
                            {isVoided && e.void_reason && <div style={{ fontSize: 11.5, color: 'var(--red)', marginBottom: 8 }}>Voided: {e.void_reason}</div>}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--ink3)', fontWeight: 600 }}>Account</th>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--ink3)', fontWeight: 600 }}>Description</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--ink3)', fontWeight: 600 }}>Debit</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--ink3)', fontWeight: 600 }}>Credit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.lines.map(l => (
                                  <tr key={l.id}>
                                    <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)' }}>{l.account_code} — {l.account_name}</td>
                                    <td style={{ padding: '4px 8px', color: 'var(--ink3)' }}>{l.description || '—'}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{Number(l.debit) > 0 ? fmt(Number(l.debit)) : ''}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{Number(l.credit) > 0 ? fmt(Number(l.credit)) : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
