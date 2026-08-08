import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import {
  useTaxCodes, TAX_CODE_KIND_HINT, TAX_CODE_KIND_VARIANT, TAX_CODE_KIND_LABEL, type TaxCode,
} from '../data/taxCodeData.js';

/**
 * Working through the classification backlog.
 *
 * Migration 180 could only backfill rows whose rate made the treatment
 * unambiguous. Everything at 0% stayed unrecorded, because zero-rated, exempt,
 * reverse-charge and out-of-scope are indistinguishable once all you have is a
 * percentage — and guessing would have been worse than leaving the gap visible.
 * This is where a human resolves them.
 *
 * The rate is never touched here. Classifying records what a document always
 * was; it does not reprice it. A code whose rate disagrees with the line is
 * refused for that line by the API, and the count comes back so a partial
 * result reads as a partial result rather than as success.
 */

type Target = 'sales' | 'purchase' | 'product';

interface Row {
  id: string;
  name: string;
  code?: string;
  category: string | null;
  tax_rate: string | number;
  document?: string;
  party?: string | null;
  date?: string | null;
  currency?: string | null;
  status?: string;
}

interface ClassifyResult {
  classified: number;
  skipped_rate_mismatch: number;
  skipped_closed_period: number;
  code_rate: number;
}

const PAGE_SIZE = 50;

const TARGETS: { key: Target; label: string; blurb: string }[] = [
  { key: 'sales',    label: 'Invoice lines',  blurb: 'What you charged. Decides the output-tax boxes on the return.' },
  { key: 'purchase', label: 'Bill lines',     blurb: 'What you were charged. Decides what you can actually claim back.' },
  { key: 'product',  label: 'Products',       blurb: 'The catalogue. Sets the treatment on every future line that uses it.' },
];

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
};
const td: React.CSSProperties = { padding: '9px 12px', color: 'var(--ink2)', whiteSpace: 'nowrap' };

export function FinanceTaxClassify() {
  const allCodes = useTaxCodes();
  const [target, setTarget] = useState<Target>('sales');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [codeId, setCodeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // A purchase row takes a purchase treatment; a sales or catalogue row takes a
  // sales one. The API refuses the wrong side anyway — this stops it being
  // offered in the first place.
  const codes = useMemo(
    () => allCodes.filter(c => (target === 'purchase' ? c.appliesTo !== 'SALES' : c.appliesTo !== 'PURCHASE')),
    [allCodes, target],
  );
  const chosen: TaxCode | undefined = codes.find(c => c.id === codeId);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/tax-codes/unclassified?target=${target}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      .then((r: any) => { setRows(r.rows ?? []); setTotal(r.total ?? 0); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [target, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); setCodeId(''); }, [target, page]);

  // Only rows the chosen code can actually take. Showing this before the user
  // commits is the difference between a considered action and a surprise.
  const eligible = useMemo(() => {
    if (!chosen) return new Set<string>();
    return new Set(rows.filter(r => Number(r.tax_rate) === chosen.rate).map(r => r.id));
  }, [rows, chosen]);

  const selectedEligible = [...selected].filter(id => eligible.has(id));

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAllEligible() {
    setSelected(new Set(eligible));
  }

  async function apply() {
    if (!chosen || selectedEligible.length === 0) return;
    setBusy(true); setNotice(null);
    try {
      const r: ClassifyResult = await apiFetch('/v1/tax-codes/classify', {
        method: 'POST',
        body: JSON.stringify({ target, ids: selectedEligible, tax_code_id: chosen.id }),
      });
      const bits = [`${r.classified} row${r.classified === 1 ? '' : 's'} classified as ${chosen.code}`];
      if (r.skipped_rate_mismatch > 0) bits.push(`${r.skipped_rate_mismatch} skipped — the rate did not match`);
      if (r.skipped_closed_period > 0) bits.push(`${r.skipped_closed_period} skipped — inside a closed period`);
      setNotice({
        kind: r.classified === 0 ? 'warn' : (r.skipped_rate_mismatch + r.skipped_closed_period > 0 ? 'warn' : 'ok'),
        text: bits.join('. ') + '.',
      });
      setSelected(new Set());
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not classify those rows' });
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const targetMeta = TARGETS.find(t => t.key === target)!;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['FinOps', 'Tax codes']}
        titlePlain="Classify the"
        titleEm="backlog"
        subtitle="Rows written before tax codes existed, when tax was only a percentage."
      />

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--r)',
          fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
          background: notice.kind === 'ok' ? 'var(--green-l)' : notice.kind === 'warn' ? 'var(--gold-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : notice.kind === 'warn' ? 'var(--gold)' : 'var(--red)'}`,
          color: notice.kind === 'ok' ? 'var(--green)' : notice.kind === 'warn' ? 'var(--ink2)' : 'var(--red)',
        }}>{notice.text}</div>
      )}

      {/* Which pile */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {TARGETS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTarget(t.key); setPage(0); }}
            className={target === t.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>{targetMeta.blurb}</div>

      {/* The action bar */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
        padding: '12px 14px', marginBottom: 14,
        background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
      }}>
        <div style={{ minWidth: 240, flex: '1 1 240px' }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
            Treatment to apply
          </label>
          <Select value={codeId} onValueChange={setCodeId}>
            <SelectTrigger><SelectValue placeholder="Choose a treatment…" /></SelectTrigger>
            <SelectContent>
              {codes.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} · {c.name} · {c.rate}%{c.inputTaxRecoverable ? '' : ' · blocked'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && (
            <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 4 }}>
              {TAX_CODE_KIND_HINT[chosen.kind]}
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 240, fontSize: 12, color: 'var(--ink2)', lineHeight: 1.55, paddingTop: 18 }}>
          {!chosen
            ? 'Pick a treatment to see which of these rows can take it.'
            : (
              <>
                <strong style={{ color: 'var(--ink)' }}>{eligible.size}</strong> of {rows.length} rows on this page
                carry {chosen.rate}% and can take <strong>{chosen.code}</strong>.
                {' '}The rest are on a different rate — classifying does not change a rate, so they need their own treatment.
              </>
            )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 14 }}>
          <button type="button" className="btn btn-secondary btn-sm"
            disabled={!chosen || eligible.size === 0}
            onClick={selectAllEligible}>
            Select {chosen ? eligible.size : ''} eligible
          </button>
          <button type="button" className="btn btn-primary btn-sm"
            disabled={busy || !chosen || selectedEligible.length === 0}
            onClick={apply}>
            <Icon name="check" size={13} color="#fff" />
            {busy ? 'Applying…' : `Classify ${selectedEligible.length || ''}`}
          </button>
        </div>
      </div>

      {/* The rows */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              <th style={{ ...th, width: 34 }} />
              <th style={th}>{target === 'product' ? 'Code' : 'Document'}</th>
              <th style={th}>{target === 'product' ? 'Name' : 'Line'}</th>
              {target !== 'product' && <th style={th}>Party</th>}
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: 'right' }}>Rate</th>
              {target !== 'product' && <th style={th}>Date</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink3)' }}>Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
                Nothing left to classify here.
              </td></tr>
            )}
            {!loading && rows.map(r => {
              const canTake = !chosen || eligible.has(r.id);
              return (
                <tr key={r.id}
                  onClick={() => canTake && toggle(r.id)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: canTake ? 'pointer' : 'not-allowed',
                    opacity: canTake ? 1 : 0.45,
                    background: selected.has(r.id) ? 'var(--teal-l)' : undefined,
                  }}>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(r.id)} disabled={!canTake}
                      onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} />
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink)' }}>
                    {target === 'product' ? r.code : r.document}
                  </td>
                  <td style={{ ...td, color: 'var(--ink)', fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </td>
                  {target !== 'product' && <td style={td}>{r.party || '—'}</td>}
                  <td style={td}>{r.category || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{Number(r.tax_rate)}%</td>
                  {target !== 'product' && (
                    <td style={td}>{r.date ? String(r.date).slice(0, 10) : '—'}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 2px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
          <strong style={{ color: 'var(--ink)' }}>{total}</strong> unclassified {targetMeta.label.toLowerCase()} in total
          {total > 0 && <> — showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}</>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}>
            <Icon name="chevronLeft" size={13} /> Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, padding: '0 6px' }}>
            Page {page + 1} of {pages}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page + 1 >= pages}
            onClick={() => setPage(p => p + 1)}>
            Next <Icon name="chevronRight" size={13} />
          </button>
        </div>
      </div>

      {/* Why any of this matters, for whoever is doing the work. */}
      <div style={{
        marginTop: 4, padding: '12px 14px', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 'var(--r)',
        fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--ink)' }}>All four 0% treatments look identical on a document and behave differently on a return.</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {(['ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE'] as const).map(k => (
            <div key={k} style={{ flex: '1 1 210px', minWidth: 200 }}>
              <Badge variant={TAX_CODE_KIND_VARIANT[k]}>{TAX_CODE_KIND_LABEL[k]}</Badge>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>{TAX_CODE_KIND_HINT[k]}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, color: 'var(--ink3)' }}>
          An unclassified purchase line is <strong>not</strong> being claimed — the return treats an unrecorded
          treatment as no claim at all, which is the safe direction but costs you real money until it is set.
        </div>
      </div>
    </div>
  );
}
