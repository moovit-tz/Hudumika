import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon.js';
import { SectionCard } from './SectionCard.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import type { AdvancedCalcResult } from '../lib/advancedCalculators.js';
import { groupBreakdown, fmt } from '../lib/advancedCalculators.js';
import { buildAiSummaryText, printAdvancedCalcReport, type AdvancedCalcReportMeta } from '../lib/advancedCalcReport.js';

/** Shared results renderer for the LCL, Air Freight and Transit calculators —
 *  headline stat tiles, the full section-grouped breakdown, an AI Analysis
 *  card, and the same Export PDF / Report an issue / New Calculation action
 *  row the FCL calculator has, so all four tools read as one family. Each
 *  page supplies its own input form; this is the one place the actual
 *  figures (and the actions on them) are rendered. */
export function AdvancedCalcResultPanel({ result, loading, error, meta, onAmend, onNewCalculation }: {
  result: AdvancedCalcResult | null;
  loading: boolean;
  error: string;
  meta?: AdvancedCalcReportMeta;
  onAmend?: () => void;
  onNewCalculation?: () => void;
}) {
  const navigate = useNavigate();

  if (error) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)' }}>
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
        <Icon name="sliders" size={28} color="var(--teal)" style={{ display: 'block', margin: '0 auto 12px', animation: 'ds-spin 1.2s linear infinite' }} />
        <div style={{ fontSize: 13.5 }}>Calculating…</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div style={{ background: 'var(--white)', border: '1px dashed var(--border)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
        <Icon name="calculator" size={28} color="var(--ink4)" style={{ display: 'block', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13.5 }}>Fill in the shipment details and calculate.</div>
      </div>
    );
  }

  const cur = result.currency;
  const groups = groupBreakdown(result.breakdown);
  const showFcy = cur !== 'TZS';

  const tiles: { label: string; value: string; sub?: string; variant: 'info' | 'warning' | 'success' | 'brand' }[] = [
    { label: 'Total CIF Value', value: `${cur} ${fmt(result.cif)}`, sub: `TZS ${fmt(result.cif_tzs)}`, variant: 'info' },
    { label: 'Duties & Taxes', value: `${cur} ${fmt(result.statutory_total)}`, sub: `TZS ${fmt(result.statutory_total_tzs)}`, variant: 'warning' },
    { label: 'All Charges', value: `${cur} ${fmt(result.charges_total)}`, sub: `TZS ${fmt(result.charges_total_tzs)}`, variant: 'brand' },
    { label: 'Grand Total (net of recoverable VAT)', value: `${cur} ${fmt(result.grand_total_net_vat)}`, sub: `TZS ${fmt(result.grand_total_net_vat_tzs)}`, variant: 'success' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <FeaturedIcon variant={t.variant} size="sm" shape="square"><Icon name="dollarSign" size={15} /></FeaturedIcon>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginTop: 12, letterSpacing: '-0.4px' }}>{t.value}</div>
            {t.sub && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{t.sub}</div>}
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4, fontWeight: 600 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {result.per_unit && (
        <div style={{ display: 'flex', gap: 24, padding: '12px 16px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 12, fontSize: 12.5, color: 'var(--ink2)', flexWrap: 'wrap' }}>
          <span>Cost per {result.per_unit.unit_label} (incl. VAT): <strong>{cur} {result.per_unit.cost_incl_vat.toFixed(4)}</strong></span>
          <span>Cost per {result.per_unit.unit_label} (net VAT): <strong>{cur} {result.per_unit.cost_net_vat.toFixed(4)}</strong></span>
          <span>Landed ÷ EXW multiple: <strong>{result.landed_multiplier.toFixed(2)}x</strong></span>
        </div>
      )}

      <SectionCard title="Cost Breakdown" padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {groups.map(g => (
                <React.Fragment key={g.section}>
                  <tr>
                    <td colSpan={showFcy ? 3 : 2} style={{ padding: '10px 18px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg)' }}>
                      {g.section}
                    </td>
                  </tr>
                  {g.lines.map((l, i) => {
                    const isTotal = /subtotal|total/i.test(l.label);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 18px', color: isTotal ? 'var(--ink)' : 'var(--ink2)', fontWeight: isTotal ? 700 : 400 }}>
                          {l.label}{l.rate ? <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> ({l.rate})</span> : null}
                        </td>
                        {showFcy && (
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isTotal ? 'var(--ink)' : 'var(--ink2)', fontWeight: isTotal ? 700 : 400 }}>
                            {cur} {fmt(l.amount_fcy)}
                          </td>
                        )}
                        <td style={{ padding: '7px 18px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isTotal ? 'var(--ink)' : 'var(--ink3)', fontWeight: isTotal ? 700 : 400 }}>
                          TZS {fmt(l.amount_tzs)}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <AiAnalysisCard result={result} />

      {(result.warnings.length > 0 || result.assumptions.length > 0) && (
        <SectionCard title="Assumptions & Warnings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.warnings.map((w, i) => (
              <div key={`w${i}`} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--gold)' }}>
                <Icon name="alertTriangle" size={13} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{w}</span>
              </div>
            ))}
            {result.assumptions.map((a, i) => (
              <div key={`a${i}`} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--ink3)' }}>
                <Icon name="info" size={13} color="var(--ink3)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{a}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {onAmend && (
          <button type="button" onClick={onAmend} className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, fontSize: 13, fontWeight: 700 }}>
            <Icon name="edit" size={14} color="var(--ink2)" /> Amend details
          </button>
        )}
        <button type="button" onClick={() => printAdvancedCalcReport(result, meta)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 'var(--r-sm)', border: '1.5px solid var(--teal)', background: 'var(--white)', color: 'var(--teal)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <Icon name="download" size={14} color="var(--teal)" /> Export PDF
        </button>
        <button type="button" onClick={() => navigate('/clearos/report-issue')} className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, fontSize: 13, fontWeight: 600 }}>
          <Icon name="alertCircle" size={14} color="var(--ink2)" /> Report an issue
        </button>
        {onNewCalculation && (
          <button type="button" onClick={onNewCalculation} className="btn btn-secondary"
            style={{ height: 42, fontSize: 13, fontWeight: 600 }}>
            New Calculation
          </button>
        )}
      </div>
    </div>
  );
}

/** Same shape as the FCL calculator's own AI Analysis card — a plain-text
 *  summary of the result sent to /v1/ai/summarise, unstyled beyond what that
 *  endpoint already returns. */
function AiAnalysisCard({ result }: { result: AdvancedCalcResult }) {
  const [summary, setSummary] = useState('');
  const [pending, setPending] = useState(false);
  const [aiError, setAiError] = useState('');

  async function runAi() {
    setPending(true);
    setAiError('');
    try {
      const res = await apiFetch('/v1/ai/summarise', { method: 'POST', body: JSON.stringify({ text: buildAiSummaryText(result), mode: 'brief' }) });
      if (res.summary) setSummary(res.summary);
      else setAiError('AI analysis returned no summary. Please try again.');
    } catch (e: any) {
      setAiError(e?.message || 'AI analysis failed. Please try again.');
    }
    setPending(false);
  }

  if (summary) {
    return (
      <SectionCard title="AI Analysis" action={
        <button type="button" onClick={() => { setSummary(''); runAi(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--teal)', fontWeight: 700 }}>
          <Icon name="refresh" size={12} color="var(--teal)" /> Re-run
        </button>
      }>
        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{summary}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="AI Analysis">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="sparkle" size={16} color="var(--teal)" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Get an AI-powered read of this estimate</span>
      </div>
      {aiError && (
        <div style={{ marginBottom: 14, padding: '11px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Icon name="alertCircle" size={14} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{aiError}{aiError.toLowerCase().includes('not configured') && ' Ask an admin to add an AI provider key under Settings → Integrations → AI Integration.'}</span>
        </div>
      )}
      <button type="button" onClick={runAi} disabled={pending} className="btn btn-primary"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, fontSize: 13.5, fontWeight: 700 }}>
        <Icon name="sparkle" size={14} color="#fff" />
        {pending ? 'Analysing…' : aiError ? 'Retry AI Analysis' : 'Run AI Analysis'}
      </button>
    </SectionCard>
  );
}
