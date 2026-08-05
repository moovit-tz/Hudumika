import React, { useState, useCallback, useEffect } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon, type IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';

interface PenResult {
  violation_type: string;
  duty_shortfall_tzs: number;
  under_declaration_penalty: number;
  misclassification_fine: number;
  late_interest: number;
  no_pvoc_fine: number;
  no_di_fine: number;
  total_penalty_tzs: number;
  breakdown: { label: string; amount: number; basis: string }[];
  legal_references: string[];
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function RRow({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: red ? 13 : 12.5, color: 'var(--ink2)', fontWeight: red ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: red ? 15 : 13, fontWeight: 700, color: red ? '#dc2626' : 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function StepBar({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, marginTop: 4 }}>
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12.5, fontWeight: 700, flexShrink: 0,
              background: i <= current ? 'var(--teal, #0d9488)' : 'var(--border)',
              color: i <= current ? '#fff' : 'var(--ink3)',
              transition: 'background 0.15s ease',
            }}>
              {i < current ? <Icon name="check" size={13} color="#ffffff" strokeWidth={3} /> : i + 1}
            </div>
            <span style={{ fontSize: 13, fontWeight: i === current ? 700 : 400, color: i === current ? 'var(--ink)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? 'var(--teal, #0d9488)' : 'var(--border)', margin: '0 16px', minWidth: 24, borderRadius: 2, transition: 'background 0.15s ease' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

const VIOLATION_CARDS = [
  {
    value: 'under_declaration',
    icon: 'trendingDown' as IconName,
    title: 'Under-declaration of Value',
    description: 'Goods declared at a lower customs value than their true transaction price. Attracts a 3× duty shortfall penalty under CEMA CAP 403 s.133.',
  },
  {
    value: 'misclassification',
    icon: 'arrowUpDown' as IconName,
    title: 'Mis-classification of HS Code',
    description: 'Goods placed under an incorrect tariff heading resulting in lower duty. Penalty is the duty difference plus a 50% surcharge (CEMA CAP 403 s.128).',
  },
  {
    value: 'late_payment',
    icon: 'clock' as IconName,
    title: 'Late Payment of Duty',
    description: 'Customs duty paid after the statutory deadline. Interest accrues at 2% per month on the outstanding duty amount.',
  },
] as const;

const STEP_LABELS = ['Violation Type', 'Declaration Values', 'Penalty Assessment'];

export const PenaltyPage: React.FC = () => {
  usePageSEO('Penalty Estimator', 'Estimate Tanzania customs penalties under CEMA CAP 403.');
  const [step,       setStep]      = useState<1 | 2 | 3>(1);
  const [violation,  setViolation] = useState('under_declaration');
  const [hs,         setHs]        = useState('');
  const [declared,   setDeclared]  = useState('');
  const [actual,     setActual]    = useState('');
  const [months,     setMonths]    = useState('0');
  const [noPvoc,     setNoPvoc]    = useState(false);
  const [noDi,       setNoDi]      = useState(false);
  const [result,     setResult]    = useState<PenResult | null>(null);
  const [summary,    setSummary]   = useState('');
  const [aiPending,  setAiPending] = useState(false);
  const [aiError,    setAiError]   = useState('');
  const [error,      setError]     = useState('');
  const [calcLoading, setCalcLoading] = useState(false);

  async function calculate() {
    const dc = parseFloat(declared);
    if (!dc || dc <= 0) { setError('Enter the declared CIF value.'); return; }
    setError('');
    setCalcLoading(true);
    try {
      const body: any = {
        violation_type: violation,
        hs_code: hs || undefined,
        declared_value_usd: dc,
        actual_value_usd: parseFloat(actual) || undefined,
        late_months: parseInt(months) || undefined,
        save_record: true,
      };
      if (noPvoc)  body.violation_type = 'no_pvoc';
      else if (noDi) body.violation_type = 'no_di';
      const r = await apiFetch('/v1/customs/penalty-calc', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(r);
      setSummary('');
    } catch (e: any) {
      setError(e.message ?? 'Calculation failed');
    }
    setCalcLoading(false);
  }

  const runAi = useCallback(async () => {
    if (!result) return;
    setAiPending(true);
    setAiError('');
    const text =
      `Penalty Estimate — Violation: ${result.violation_type.replace(/_/g, ' ')}, HS Code: ${hs || 'unspecified'}\n` +
      `Declared CIF: ${fmtUsd(parseFloat(declared))}\n\n` +
      `Breakdown:\n` +
      result.breakdown.map(b => `• ${b.label}: TZS ${fmt(b.amount)}`).join('\n') +
      `\n\nTotal: TZS ${fmt(result.total_penalty_tzs)}\n\nLegal Basis:\n` +
      result.legal_references.map(r => `• ${r}`).join('\n');
    try {
      const res = await apiFetch('/v1/ai/summarise', { method: 'POST', body: JSON.stringify({ text, mode: 'brief' }) });
      if (res.summary) {
        setSummary(res.summary);
      } else {
        setAiError('AI analysis returned no summary. Please try again.');
      }
    } catch (e: any) {
      setAiError(e?.message || 'AI analysis failed. Please try again.');
    }
    setAiPending(false);
  }, [result, hs, declared]);

  // Auto-calculate when arriving at step 3 with no result yet
  useEffect(() => {
    if (step === 3 && !result) {
      calculate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function resetAll() {
    setStep(1);
    setViolation('under_declaration');
    setHs('');
    setDeclared('');
    setActual('');
    setMonths('0');
    setNoPvoc(false);
    setNoDi(false);
    setResult(null);
    setSummary('');
    setError('');
  }

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Customs Tools', 'Penalty Estimator']}
        titlePlain="Penalty"
        titleEm="Estimator"
        subtitle="Estimate Tanzania customs penalties under CEMA CAP 403"
        actions={
          step === 3 ? (
            <button type="button" className="btn btn-primary"
              disabled={!result || aiPending} onClick={runAi}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Icon name="zap" size={14} />
              {aiPending ? 'Analysing…' : 'AI Analysis'}
            </button>
          ) : undefined
        }
      />

      <StepBar current={step - 1} steps={STEP_LABELS} />

      {/* ── Step 1: Violation Type ── */}
      {step === 1 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Select Violation Type</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 24 }}>Choose the type of customs violation to estimate the applicable penalty.</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            {VIOLATION_CARDS.map(card => {
              const selected = violation === card.value;
              return (
                <div
                  key={card.value}
                  onClick={() => setViolation(card.value)}
                  style={{
                    border: `2px solid ${selected ? 'var(--teal, #0d9488)' : 'var(--border)'}`,
                    borderRadius: 14,
                    padding: '24px 20px',
                    background: selected ? 'var(--teal-l, rgba(13, 148, 136, 0.07))' : 'var(--white)',
                    cursor: 'pointer',
                    transition: 'all .16s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    userSelect: 'none',
                    boxShadow: selected ? '0 4px 16px rgba(13, 148, 136, 0.12)' : 'none',
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <Icon name={card.icon} size={36} color={selected ? 'var(--teal, #0d9488)' : 'var(--ink2)'} />
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: selected ? 'var(--teal, #0d9488)' : 'var(--ink)', lineHeight: 1.35 }}>{card.title}</div>
                  <div style={{ fontSize: 12.5, color: selected ? 'var(--ink)' : 'var(--ink3)', lineHeight: 1.6 }}>{card.description}</div>
                  {selected && (
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--teal, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal, #0d9488)' }}>Selected</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(2)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 28px', borderRadius: 'var(--r)', fontSize: 14, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
            >
              <span>Continue</span>
              <span style={{ fontSize: 15 }}>→</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Declaration Values ── */}
      {step === 2 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
          {/* Info banner */}
          <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--teal-l, rgba(13, 148, 136, 0.07))', border: '1px solid rgba(13, 148, 136, 0.2)', marginBottom: 24, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
            Penalty rates: <strong>Under-declaration 3× duty shortfall</strong> (s.133) · <strong>Mis-classification 1.5× duty diff.</strong> (s.128) · Late payment <strong>2%/month</strong> · No PVoC <strong>TZS 10M</strong> · No DI <strong>TZS 5M</strong> — Tanzania CEMA CAP 403
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 20 }}>
            Enter Declaration Values
            <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: 'var(--teal, #0d9488)', background: 'var(--teal-l, rgba(13, 148, 136, 0.08))', border: '1px solid rgba(13, 148, 136, 0.2)', borderRadius: 6, padding: '3px 10px' }}>
              {VIOLATION_CARDS.find(c => c.value === violation)?.title}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Declared CIF — always shown */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>
                Declared CIF (USD)
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--ink4)', fontSize: 10.5 }}>— as submitted to customs</span>
              </label>
              <input className="input-field" type="number" min="0" placeholder="e.g. 10000" value={declared} onChange={e => setDeclared(e.target.value)} />
            </div>

            {/* Actual CIF — under_declaration / misclassification only */}
            {(violation === 'under_declaration' || violation === 'misclassification') && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>
                  Actual CIF (USD)
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--ink4)', fontSize: 10.5 }}>— true value on inspection</span>
                </label>
                <input className="input-field" type="number" min="0" placeholder="e.g. 18000" value={actual} onChange={e => setActual(e.target.value)} />
              </div>
            )}

            {/* HS Code — always shown */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>
                HS Code (optional)
              </label>
              <input className="input-field" placeholder="e.g. 8471" value={hs} onChange={e => setHs(e.target.value)} />
            </div>

            {/* Months Overdue — late_payment only */}
            {violation === 'late_payment' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>
                  Months Overdue
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--ink4)', fontSize: 10.5 }}>— for late payment interest</span>
                </label>
                <input className="input-field" type="number" min="0" placeholder="e.g. 3" value={months} onChange={e => setMonths(e.target.value)} />
              </div>
            )}

            {/* Checkboxes — full row */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 32, paddingTop: 4 }}>
              {([
                [noPvoc, setNoPvoc, 'No PVoC / CoC certificate'],
                [noDi,   setNoDi,   'No Destination Inspection permit'],
              ] as const).map(([val, set, label]) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: 'var(--ink2)', userSelect: 'none' }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                    style={{ accentColor: 'var(--teal, #0d9488)', width: 15, height: 15, cursor: 'pointer' }} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button type="button" onClick={() => setStep(1)}
              style={{ padding: 'var(--ds-btn-py) 24px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              ← Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const dc = parseFloat(declared);
                if (!dc || dc <= 0) { setError('Enter the declared CIF value.'); return; }
                setError('');
                setResult(null);
                setSummary('');
                setStep(3);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 28px', borderRadius: 'var(--r)', fontSize: 14, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
            >
              <span>Calculate Penalty</span>
              <span style={{ fontSize: 15 }}>→</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Penalty Assessment ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Estimate button shown while no result yet */}
          {!result && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink3)' }}>{calcLoading ? 'Calculating estimate…' : 'Ready to calculate estimate.'}</div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={calculate}
                disabled={calcLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 36px', borderRadius: 'var(--r)', fontSize: 14, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
              >
                <Icon name="alertCircle" size={15} color="#fff" />
                <span>{calcLoading ? 'Calculating…' : 'Estimate Penalty'}</span>
              </button>
            </div>
          )}

          {/* Result breakdown */}
          {result && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '14px 22px', background: 'var(--teal-l, rgba(13, 148, 136, 0.08))', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="alertCircle" size={16} color="var(--teal, #0d9488)" />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Penalty Breakdown</span>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink3)' }}>EAC CET · CEMA CAP 403</span>
              </div>
              <div style={{ padding: '20px 26px' }}>
                {result.breakdown.map((b, i) => (
                  <RRow key={i}
                    label={b.label}
                    value={`TZS ${fmt(b.amount)}`}
                    red={b.label.includes('TOTAL')}
                  />
                ))}
                {result.total_penalty_tzs === 0 && <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 0' }}>No penalties apply with the inputs provided.</div>}
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <RRow label="Total Estimated Penalty" value={`TZS ${fmt(result.total_penalty_tzs)}`} red />

                {result.legal_references.length > 0 && (
                  <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 10, background: 'var(--teal-l, rgba(13, 148, 136, 0.06))', border: '1px solid rgba(13, 148, 136, 0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal, #0d9488)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Legal Basis — CEMA CAP 403</div>
                    {result.legal_references.map((b, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: 'var(--ink2)', paddingLeft: 12, borderLeft: '2px solid var(--teal, #0d9488)', marginBottom: 6, lineHeight: 1.6 }}>{b}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Analysis panel */}
          {summary && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 22px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="zap" size={15} color="var(--teal, #0d9488)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>AI Analysis</span>
                <button type="button" onClick={() => setSummary('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <div style={{ padding: '18px 22px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{summary}</div>
            </div>
          )}

          {aiError && !summary && (
            <div style={{ padding: '12px 16px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 12, fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="alertCircle" size={14} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {aiError}
                {aiError.toLowerCase().includes('not configured') && ' Ask an admin to add an AI provider key under Settings → Integrations → AI Integration.'}
              </span>
            </div>
          )}

          {/* Bottom nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={() => setStep(2)}
              style={{ padding: 'var(--ds-btn-py) 24px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              ← Back
            </button>
            <button type="button" onClick={resetAll}
              style={{ padding: 'var(--ds-btn-py) 24px', borderRadius: 'var(--r)', border: '1px solid rgba(13, 148, 136, 0.3)', background: 'var(--teal-l, rgba(13, 148, 136, 0.08))', color: 'var(--teal, #0d9488)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Start New Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
