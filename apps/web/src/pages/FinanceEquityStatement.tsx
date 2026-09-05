import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { SectionCard } from '../components/SectionCard.js';

const YEARS = ['2026', '2025', '2024'];

interface EquityAccountRow {
  code: string; name: string; opening: number; fromNetIncome: number; dividends: number; other: number; closing: number;
}
interface EquityStatement {
  period: { from: string; to: string };
  accounts: EquityAccountRow[];
  totals: { opening: number; fromNetIncome: number; dividends: number; other: number; closing: number };
}
interface Dividend {
  id: string; declared_date: string; amount: string; description: string | null;
  status: 'DECLARED' | 'PAID'; paid_at: string | null; reference: string | null;
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
};
const td: React.CSSProperties = { padding: '11px 14px', color: 'var(--ink2)', textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' };

export function FinanceEquityStatement() {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmt = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`;

  const [year, setYear] = useState('2026');
  const [report, setReport] = useState<EquityStatement | null>(null);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [showDeclareForm, setShowDeclareForm] = useState(false);
  const [declareDate, setDeclareDate] = useState(new Date().toISOString().slice(0, 10));
  const [declareAmount, setDeclareAmount] = useState('');
  const [declareDesc, setDeclareDesc] = useState('');

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/v1/finance/equity-statement?from=${from}&to=${to}`),
      apiFetch(`/v1/dividends`),
    ])
      .then(([eq, divs]) => { setReport(eq); setDividends(divs); })
      .catch((err: any) => setError(err?.message ?? 'Failed to load equity statement'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function declareDividend() {
    const amount = Number(declareAmount);
    if (!amount || amount <= 0) { setNotice({ kind: 'err', text: 'Enter a positive amount.' }); return; }
    setBusy('declare');
    setNotice(null);
    try {
      await apiFetch('/v1/dividends', {
        method: 'POST',
        body: JSON.stringify({ declared_date: declareDate, amount, description: declareDesc.trim() || undefined }),
      });
      setNotice({ kind: 'ok', text: `Dividend of ${fmt(amount)} declared.` });
      setShowDeclareForm(false);
      setDeclareAmount(''); setDeclareDesc('');
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not declare that dividend.' });
    } finally { setBusy(null); }
  }

  async function payDividend(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      await apiFetch(`/v1/dividends/${id}/pay`, { method: 'POST', body: JSON.stringify({}) });
      setNotice({ kind: 'ok', text: 'Dividend marked paid.' });
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not record that payment.' });
    } finally { setBusy(null); }
  }

  const totals = report?.totals;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Statement of changes in"
        titleEm="equity"
        subtitle="How Retained Earnings and Share Capital moved this year — net income, dividends, and anything else."
        actions={
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading equity statement…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {notice && (
          <div style={{
            padding: '10px 16px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600,
            background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
            color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {notice.text}
          </div>
        )}

        <MetricsRow cards={[
          {
            title: 'Opening Equity', value: fmt(totals?.opening ?? 0), icon: 'layers',
            sub1Label: 'YEAR', sub1Value: year,
            sub2Label: 'CLOSING', sub2Value: fmt(totals?.closing ?? 0), barHighlight: 'var(--ink3)',
          },
          {
            title: 'From Net Income', value: fmt(totals?.fromNetIncome ?? 0), icon: 'trendingUp',
            sub1Label: 'DIVIDENDS', sub1Value: fmt(totals?.dividends ?? 0),
            sub2Label: 'OTHER', sub2Value: fmt(totals?.other ?? 0), barHighlight: 'var(--teal)',
          },
          {
            title: 'Dividends', value: fmt(totals?.dividends ?? 0), icon: 'dollarSign', invertTrend: true,
            sub1Label: 'DECLARED', sub1Value: String(dividends.length),
            sub2Label: 'PAID', sub2Value: String(dividends.filter(d => d.status === 'PAID').length), barHighlight: 'var(--red)',
          },
          {
            title: 'Closing Equity', value: fmt(totals?.closing ?? 0), icon: 'checkCircle',
            sub1Label: 'OPENING', sub1Value: fmt(totals?.opening ?? 0),
            sub2Label: 'MOVEMENT', sub2Value: fmt((totals?.closing ?? 0) - (totals?.opening ?? 0)), barHighlight: 'var(--green)',
          },
        ]} />

        {/* Statement table */}
        <SectionCard
          padded={false}
          title="Movement by account"
          action={<span style={{ fontSize: 11, color: 'var(--ink3)' }}>{from} to {to}</span>}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Account</th>
                  <th style={th}>Opening</th>
                  <th style={th}>From net income</th>
                  <th style={th}>Dividends</th>
                  <th style={th}>Other</th>
                  <th style={th}>Closing</th>
                </tr>
              </thead>
              <tbody>
                {(report?.accounts ?? []).map(a => (
                  <tr key={a.code} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', color: 'var(--ink)', fontWeight: 600 }}>{a.name}</td>
                    <td style={td}>{fmt(a.opening)}</td>
                    <td style={{ ...td, color: a.fromNetIncome !== 0 ? 'var(--teal)' : 'var(--ink3)' }}>{a.fromNetIncome !== 0 ? fmt(a.fromNetIncome) : '—'}</td>
                    <td style={{ ...td, color: a.dividends !== 0 ? 'var(--red)' : 'var(--ink3)' }}>{a.dividends !== 0 ? fmt(a.dividends) : '—'}</td>
                    <td style={{ ...td, color: a.other !== 0 ? 'var(--gold)' : 'var(--ink3)' }}>{a.other !== 0 ? fmt(a.other) : '—'}</td>
                    <td style={{ ...td, color: 'var(--ink)', fontWeight: 700 }}>{fmt(a.closing)}</td>
                  </tr>
                ))}
                {totals && (
                  <tr>
                    <td style={{ padding: '11px 14px', color: 'var(--ink)', fontWeight: 800 }}>TOTAL</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(totals.opening)}</td>
                    <td style={{ ...td, fontWeight: 800, color: 'var(--teal)' }}>{fmt(totals.fromNetIncome)}</td>
                    <td style={{ ...td, fontWeight: 800, color: 'var(--red)' }}>{fmt(totals.dividends)}</td>
                    <td style={{ ...td, fontWeight: 800, color: 'var(--gold)' }}>{fmt(totals.other)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(totals.closing)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Dividends */}
        <SectionCard
          padded={false}
          title="Dividends"
          action={<button type="button" className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={() => setShowDeclareForm(v => !v)}>
            <Icon name="plus" size={13} /> Declare dividend
          </button>}
        >
          {showDeclareForm && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Declared date</div>
                <DatePicker date={parseDateOnly(declareDate)} onChange={d => setDeclareDate(toDateOnlyString(d) ?? declareDate)} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Amount ({cur})</div>
                <input type="number" min={0} value={declareAmount} onChange={e => setDeclareAmount(e.target.value)}
                  style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, width: 160, fontFamily: 'inherit' }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Description (optional)</div>
                <input type="text" value={declareDesc} onChange={e => setDeclareDesc(e.target.value)}
                  style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'declare'} onClick={declareDividend}>
                {busy === 'declare' ? 'Declaring…' : 'Declare'}
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Declared</th>
                  <th style={{ ...th, textAlign: 'left' }}>Description</th>
                  <th style={th}>Amount</th>
                  <th style={{ ...th, textAlign: 'left' }}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {dividends.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--ink3)' }}>No dividends declared yet.</td></tr>
                )}
                {dividends.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{d.declared_date}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{d.description || '—'}</td>
                    <td style={td}>{fmt(Number(d.amount))}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={d.status === 'PAID' ? 'success' : 'warning'}>{d.status}</Badge>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      {d.status === 'DECLARED' && (
                        <button type="button" className="btn btn-secondary btn-xs" disabled={busy === d.id} onClick={() => payDividend(d.id)}>
                          {busy === d.id ? 'Paying…' : 'Mark paid'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
      )}
    </div>
  );
}
