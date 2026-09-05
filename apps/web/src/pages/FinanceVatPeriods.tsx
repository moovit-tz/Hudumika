import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showPrompt } from '../lib/prompt.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionCard } from '../components/SectionCard.js';

/**
 * Filing periods.
 *
 * Closing one is what turns the return from a live query into a filed figure:
 * the computed return is stored verbatim, the partial-exemption restriction is
 * posted as a real journal, and every document dated inside the period stops
 * being editable. Reopening keeps the original snapshot — what was filed was
 * filed.
 */

interface Period {
  id: string;
  jurisdiction: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed';
  adjustment_amount: string | number | null;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}

interface ReturnSnapshot {
  outputTax: number; inputTax: number; inputTaxRecoverable: number; inputTaxRestricted: number;
  inputTaxBlocked: number; recoveryRatePct: number; netPayable: number;
  unclassified: { salesLines: number; purchaseLines: number };
  fxSkipped: { invoices: number; bills: number };
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
};
const td: React.CSSProperties = { padding: '11px 14px', color: 'var(--ink2)', whiteSpace: 'nowrap' };

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

export function FinanceVatPeriods() {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmt = (n: number) => `${cur} ${(Math.round(n) || 0).toLocaleString()}`;

  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<{ period: Period; snapshot: ReturnSnapshot; provisional: boolean } | null>(null);

  const init = monthRange(-1);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/vat-periods')
      .then((r: any) => setPeriods(Array.isArray(r) ? r : []))
      .catch(() => setPeriods([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy('create'); setNotice(null);
    try {
      await apiFetch('/v1/vat-periods', {
        method: 'POST', body: JSON.stringify({ period_start: from, period_end: to }),
      });
      setNotice({ kind: 'ok', text: `Period ${from} to ${to} created. It stays open until you close it.` });
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not create that period' });
    } finally { setBusy(null); }
  }

  async function view(p: Period) {
    setBusy(p.id);
    try {
      const r: any = await apiFetch(`/v1/vat-periods/${p.id}`);
      setOpen({ period: p, snapshot: r.return_snapshot, provisional: !!r.provisional });
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not load that return' });
    } finally { setBusy(null); }
  }

  async function close(p: Period, acknowledge = false) {
    setBusy(p.id); setNotice(null);
    try {
      const r: any = await apiFetch(`/v1/vat-periods/${p.id}/close`, {
        method: 'POST',
        body: JSON.stringify(acknowledge ? { acknowledge_unclassified: true } : {}),
      });
      const adj = Number(r?.period?.adjustment_amount) || 0;
      setNotice({
        kind: 'ok',
        text: `Period closed. The return is stored as filed and its documents are now frozen.` +
              (adj > 0 ? ` A partial-exemption adjustment of ${fmt(adj)} was posted to the ledger.` : ''),
      });
      setOpen(null);
      load();
    } catch (e: any) {
      // The API refuses to close over unclassified rows unless told explicitly.
      // That refusal is the useful part, so it is surfaced with the choice
      // rather than swallowed.
      const msg = e?.message || 'Could not close that period';
      if (/no tax treatment recorded|cannot be converted/i.test(msg)) {
        setNotice({ kind: 'warn', text: msg });
      } else {
        setNotice({ kind: 'err', text: msg });
      }
    } finally { setBusy(null); }
  }

  async function reopen(p: Period) {
    const reason = await showPrompt('Reopening unfreezes documents a return was already filed on.', {
      title: 'Why is this needed?', placeholder: 'e.g. A late credit note needs to post inside this period', required: true, confirmLabel: 'Reopen Period',
    });
    if (!reason?.trim()) return;
    setBusy(p.id); setNotice(null);
    try {
      await apiFetch(`/v1/vat-periods/${p.id}/reopen`, {
        method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      setNotice({ kind: 'warn', text: 'Period reopened. The return as originally filed is kept on record.' });
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not reopen that period' });
    } finally { setBusy(null); }
  }

  const gaps = open ? open.snapshot.unclassified.salesLines + open.snapshot.unclassified.purchaseLines
    + open.snapshot.fxSkipped.invoices + open.snapshot.fxSkipped.bills : 0;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Finance', 'Tax']}
        titlePlain="Filing"
        titleEm="periods"
        subtitle="Closing a period stores the return as filed and freezes the documents behind it."
      />

      <MetricsRow cards={[
        {
          title: 'Total Periods', value: String(periods.length), icon: 'calendar',
          sub1Label: 'OPEN', sub1Value: String(periods.filter(p => p.status === 'open').length),
          sub2Label: 'FILED', sub2Value: String(periods.filter(p => p.status === 'closed').length), barHighlight: 'var(--teal)',
        },
        {
          title: 'Open Periods', value: String(periods.filter(p => p.status === 'open').length), icon: 'unlock',
          sub1Label: 'JURISDICTIONS', sub1Value: String(new Set(periods.filter(p => p.status === 'open').map(p => p.jurisdiction)).size),
          sub2Label: 'TOTAL', sub2Value: String(periods.length), barHighlight: 'var(--gold)',
        },
        {
          title: 'Filed Returns', value: String(periods.filter(p => p.status === 'closed').length), icon: 'lock',
          sub1Label: 'REOPENED', sub1Value: String(periods.filter(p => p.reopened_at).length),
          sub2Label: 'TOTAL', sub2Value: String(periods.length), barHighlight: 'var(--green)',
        },
        {
          title: 'Adjustments Posted', value: fmt(periods.reduce((s, p) => s + (Number(p.adjustment_amount) || 0), 0)), icon: 'dollarSign',
          sub1Label: 'PERIODS', sub1Value: String(periods.filter(p => Number(p.adjustment_amount) > 0).length),
          sub2Label: 'JURISDICTIONS', sub2Value: String(new Set(periods.map(p => p.jurisdiction)).size), barHighlight: 'var(--blue)',
        },
      ]} />

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--r)',
          fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
          background: notice.kind === 'ok' ? 'var(--green-l)' : notice.kind === 'warn' ? 'var(--gold-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : notice.kind === 'warn' ? 'var(--gold)' : 'var(--red)'}`,
          color: notice.kind === 'ok' ? 'var(--green)' : notice.kind === 'warn' ? 'var(--ink2)' : 'var(--red)',
        }}>
          {notice.text}
          {notice.kind === 'warn' && /no tax treatment recorded/i.test(notice.text) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/finance/tax-codes/classify" className="btn btn-secondary btn-sm">Classify them first</a>
            </div>
          )}
        </div>
      )}

      {/* New period */}
      <div style={{ marginBottom: 16 }}>
        <SectionCard>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>From</label>
              <DatePicker date={parseDateOnly(from)} onChange={d => setFrom(toDateOnlyString(d))} />
            </div>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>To</label>
              <DatePicker date={parseDateOnly(to)} onChange={d => setTo(toDateOnlyString(d))} />
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'create'} onClick={create}>
              <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> {busy === 'create' ? 'Creating…' : 'New period'}
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', flex: '1 1 240px', minWidth: 200, lineHeight: 1.5 }}>
              Periods cannot overlap within a jurisdiction — a document must belong to exactly one return.
            </div>
          </div>
        </SectionCard>
      </div>

      {/* The periods */}
      <SectionCard padded={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['Period', 'Jurisdiction', 'Status', 'Adjustment posted', 'Closed', ''].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: '40px' }}><SectionLoading style={{ padding: 0 }} /></td></tr>}
            {!loading && periods.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
                No filing periods yet. Create one above to file a return.
              </td></tr>
            )}
            {periods.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, color: 'var(--ink)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {String(p.period_start).slice(0, 10)} → {String(p.period_end).slice(0, 10)}
                </td>
                <td style={td}>{p.jurisdiction}</td>
                <td style={td}>
                  <Badge variant={p.status === 'closed' ? 'success' : 'gray'}>
                    {p.status === 'closed' ? 'Filed' : 'Open'}
                  </Badge>
                  {p.reopened_at && (
                    <Tip label={p.reopen_reason || 'No reason recorded'}>
                      <span style={{ marginLeft: 6 }}>
                        <Badge variant="warning">Reopened</Badge>
                      </span>
                    </Tip>
                  )}
                </td>
                <td style={{ ...td, fontFamily: 'var(--mono)' }}>
                  {Number(p.adjustment_amount) > 0 ? fmt(Number(p.adjustment_amount)) : '—'}
                </td>
                <td style={td}>{p.closed_at ? String(p.closed_at).slice(0, 10) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy === p.id}
                    onClick={() => view(p)} style={{ marginRight: 6 }}>
                    {p.status === 'closed' ? 'View as filed' : 'Preview'}
                  </button>
                  {p.status === 'open' ? (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy === p.id}
                      onClick={() => close(p)}>Close &amp; file</button>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy === p.id}
                      onClick={() => reopen(p)}>Reopen</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* The return for one period */}
      {open && (
        <div style={{ marginTop: 16 }}>
        <SectionCard
          padded={false}
          collapsible={false}
          title={`${String(open.period.period_start).slice(0, 10)} → ${String(open.period.period_end).slice(0, 10)}${open.provisional ? ' · provisional, recomputed live' : ' · as filed'}`}
          action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(null)}>
            <Icon name="x" size={13} /> Close
          </button>}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {[
                { l: 'Output tax on sales', v: open.snapshot.outputTax },
                { l: 'Input tax charged on purchases', v: open.snapshot.inputTax, muted: true },
                { l: 'Less: blocked, and purchases with no treatment recorded', v: -open.snapshot.inputTaxBlocked, muted: true },
                { l: `Less: restricted by partial exemption (${open.snapshot.recoveryRatePct.toFixed(2)}% recovery)`, v: -open.snapshot.inputTaxRestricted, muted: true },
                { l: 'Input tax recoverable', v: open.snapshot.inputTaxRecoverable, rule: true },
                { l: open.snapshot.netPayable >= 0 ? 'Net payable to the authority' : 'Net repayable to you',
                  v: Math.abs(open.snapshot.netPayable), rule: true, strong: true },
              ].map((r, i) => (
                <tr key={i} style={{ borderTop: r.rule ? '2px solid var(--border)' : '1px solid var(--border)' }}>
                  <td style={{ ...td, whiteSpace: 'normal', color: r.muted ? 'var(--ink3)' : 'var(--ink)', fontWeight: r.strong ? 700 : 500 }}>{r.l}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: r.strong ? 800 : 600, color: r.muted ? 'var(--ink3)' : 'var(--ink)' }}>{fmt(r.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {open.provisional && gaps > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--gold-l)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--ink)' }}>{gaps} line(s) cannot be placed in a box.</strong>{' '}
              Closing freezes them exactly as they are, and the filed return will carry the hole.
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="/finance/tax-codes/classify" className="btn btn-secondary btn-sm">Classify them first</a>
                <button type="button" className="btn btn-secondary btn-sm"
                  disabled={busy === open.period.id}
                  onClick={() => close(open.period, true)}>
                  Close anyway, accepting the gap
                </button>
              </div>
            </div>
          )}
        </SectionCard>
        </div>
      )}
    </div>
  );
}
