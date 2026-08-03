import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const COMPLYOS_PITCH = [
  { icon: 'users' as const, highlight: 'Vetted Experts', text: 'Connect with consultants who file on your behalf' },
  { icon: 'clipboardList' as const, highlight: 'Central Tracker', text: 'Track every permit & licence renewal in one place' },
  { icon: 'zap' as const, highlight: 'Auto Filings', text: 'Automate applications to BRELA, TRA, NSSF & more' },
];

// Soft, light card built from the design system's own derived tint tokens
// (--teal-l/--teal-m/--green-l — computed centrally by useDesignSystem's
// applyDesignTokens() from the live brand color) rather than hand-rolled
// color-mix percentages, so it tracks the live theme exactly the same way
// FeaturedIcon/Badge already do — in both light and dark mode. Only the CTA
// carries solid brand color, via the same .btn-primary class as "Check
// Compliance".
function ComplyOSPromoCard() {
  const navigate = useNavigate();
  const enabledApps = useEnabledApps();
  const enabled = isAppEnabled('complyos', enabledApps);

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--teal-l) 0%, var(--green-l) 100%)',
      border: '1px solid var(--teal-m)',
      borderRadius: 18,
      padding: 'clamp(18px, 4vw, 24px)',
      boxShadow: '0 4px 20px var(--teal-l)',
    }}>
      {/* Top header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <FeaturedIcon variant="brand" size="md" shape="square"><Icon name="shield" size={20} /></FeaturedIcon>
        <Badge variant="brand">Full Suite</Badge>
      </div>

      {/* Title & subtitle */}
      <div style={{ fontSize: 'clamp(15px, 2.4vw, 16px)', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.2px', lineHeight: 1.3 }}>
        Need more than a quick check?
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 6, lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--ink)' }}>ComplyOS</strong> is Hudumika's complete compliance engine, built for complex enterprise workflows.
      </div>

      {/* Feature rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {COMPLYOS_PITCH.map(p => (
          <div key={p.highlight} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--teal-l)',
            border: '1px solid var(--teal-m)',
          }}>
            <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name={p.icon} size={14} /></FeaturedIcon>
            <div style={{ fontSize: 12, lineHeight: 1.4, minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: 'var(--teal)', marginRight: 5 }}>{p.highlight}:</span>
              <span style={{ color: 'var(--ink2)' }}>{p.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* CTA — same solid-brand button style as "Check Compliance" above, so it
          reads as the one high-contrast element against this pale card. */}
      <button
        type="button"
        onClick={() => navigate('/complyos')}
        className="btn btn-primary"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, fontSize: 13.5, fontWeight: 700, marginTop: 20 }}
      >
        <span>{enabled ? 'Open ComplyOS' : 'Explore ComplyOS'}</span>
        <Icon name="arrowRight" size={15} color="#fff" />
      </button>
    </div>
  );
}

interface HsResult {
  code: string;
  description: string;
  import_duty_rate: number;
}

interface ComplianceCheck {
  key: string;
  name: string;
  required: boolean;
  note: string;
  authority: string;
  link?: string;
  color: 'green' | 'amber' | 'red';
}

const outcomeBtn: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border)', background: 'var(--card-bg, var(--white))',
  color: 'var(--ink2)', cursor: 'pointer', whiteSpace: 'nowrap',
};

const ORIGIN_GROUPS: { label: string; options: { code: string; name: string }[] }[] = [
  {
    label: 'East African Community (EAC) — PVoC/DI waived',
    options: [
      { code: 'TZ', name: 'Tanzania' },
      { code: 'KE', name: 'Kenya' },
      { code: 'UG', name: 'Uganda' },
      { code: 'RW', name: 'Rwanda' },
      { code: 'BI', name: 'Burundi' },
      { code: 'SS', name: 'South Sudan' },
    ],
  },
  {
    label: 'Common trading partners',
    options: [
      { code: 'CN', name: 'China' },
      { code: 'IN', name: 'India' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'TR', name: 'Turkey' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'US', name: 'United States' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'DE', name: 'Germany' },
      { code: 'JP', name: 'Japan' },
      { code: 'SA', name: 'Saudi Arabia' },
    ],
  },
];

const badgeVariant = (color: ComplianceCheck['color']): 'error' | 'warning' | 'success' =>
  color === 'red' ? 'error' : color === 'amber' ? 'warning' : 'success';

const iconVariant = (color: ComplianceCheck['color']): 'error' | 'warning' | 'success' =>
  color === 'red' ? 'error' : color === 'amber' ? 'warning' : 'success';

export const QuickComplianceCheck: React.FC = () => {
  const isMobile = useIsMobile();
  const [urlParams] = useSearchParams();
  const [hs, setHs] = useState(() => urlParams.get('hs') ?? '');
  const [hsSelected, setHsSelected] = useState<HsResult | null>(null);
  const [hsResults, setHsResults] = useState<HsResult[]>([]);
  const [hsLoading, setHsLoading] = useState(false);
  const [origin, setOrigin] = useState(() => urlParams.get('origin') ?? 'TZ');
  const [checks, setChecks] = useState<ComplianceCheck[] | null>(null);
  /** Checks the user has already reported back on, so the prompt disappears
   *  rather than inviting a second, contradictory report. */
  const [reported, setReported] = useState<Record<string, true>>({});

  /**
   * Records whether a predicted requirement actually applied.
   *
   * Fire-and-forget: the acknowledgement is optimistic because the value here
   * is in people bothering to click at all, and a spinner on a courtesy
   * report is a good way to ensure they stop.
   */
  function reportOutcome(c: ComplianceCheck, actual: 'applied' | 'not_applied' | 'unexpected') {
    setReported(p => ({ ...p, [c.key]: true }));
    void apiFetch('/v1/intel/compliance-outcomes', {
      method: 'POST',
      body: JSON.stringify({
        outcomes: [{
          requirement: c.key,
          predicted: c.required,
          actual,
          hs_code: hsSelected?.code ?? hs,
          origin_country: origin,
        }],
      }),
    }).catch(() => { /* observation only */ });
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hsDebounce = useRef<any>(null);

  useEffect(() => {
    if (hsDebounce.current) clearTimeout(hsDebounce.current);
    if (!hs || hs.length < 2 || hsSelected) { setHsResults([]); return; }
    hsDebounce.current = setTimeout(async () => {
      setHsLoading(true);
      try {
        const r = await apiFetch(`/v1/customs/hs-search?q=${encodeURIComponent(hs)}&limit=6`);
        setHsResults(Array.isArray(r) ? r : []);
      } catch { setHsResults([]); }
      setHsLoading(false);
    }, 300);
  }, [hs, hsSelected]);

  // Re-opened from history ("Open" on a past Quick Check) — run once
  // automatically with the prefilled HS code/origin instead of making the
  // user retype and click Check Compliance again.
  useEffect(() => {
    if (urlParams.get('hs')) runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck() {
    if (!hs.trim()) { setError('Enter an HS code or product description.'); return; }
    setError('');
    setHsResults([]);
    setLoading(true);
    try {
      const code = hsSelected?.code ?? hs;
      const r = await apiFetch('/v1/customs/compliance-check', {
        method: 'POST',
        body: JSON.stringify({ hs_code: code, origin_country: origin }),
      });
      // The route wraps the check list in a summary envelope
      // ({ hs_code, origin_country, summary, checks }), not a bare array.
      setChecks(Array.isArray(r?.checks) ? r.checks : []);
    } catch (e: any) {
      setError(e.message ?? 'Compliance check failed');
      setChecks(null);
    }
    setLoading(false);
  }

  const sortedChecks = checks
    ? [...checks].sort((a, b) => Number(b.required) - Number(a.required))
    : null;
  const requiredCount = sortedChecks?.filter(c => c.required).length ?? 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(280px, 380px) 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT: input card + ComplyOS cross-sell */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="shield" size={18} color="var(--teal)" /> Shipment Details
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                HS Code or Product
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input-field"
                  placeholder="e.g. 1006.10 or rice"
                  value={hs}
                  onChange={e => { setHs(e.target.value); setHsSelected(null); setChecks(null); }}
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, height: 44, fontSize: 14 }}
                />
                <Icon name="search" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              </div>

              {hsLoading && (
                <div style={{ fontSize: 11.5, color: 'var(--teal)', fontWeight: 600, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="refresh" size={13} color="var(--teal)" className="spin" /> Searching…
                </div>
              )}

              {hsResults.length > 0 && !hsSelected && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, zIndex: 1000, boxShadow: '0 8px 30px rgba(0,0,0,0.25)', overflow: 'hidden', marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {hsResults.map(r => (
                    <div key={r.code} onClick={() => { setHs(r.code); setHsSelected(r); setHsResults([]); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface, rgba(255,255,255,0.06))')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{r.code}</span>
                      <span style={{ color: 'var(--ink2)' }}> — {r.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {hsSelected && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={13} color="var(--teal)" /> {hsSelected.description}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                Country of Origin
              </label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger className="input-field" style={{ height: 44 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGIN_GROUPS.map(g => (
                    <React.Fragment key={g.label}>
                      <div style={{ padding: '6px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{g.label}</div>
                      {g.options.map(o => (
                        <SelectItem key={o.code} value={o.code}>{o.name} ({o.code})</SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)' }}>
                {error}
              </div>
            )}

            <button type="button" onClick={runCheck} disabled={loading} className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, fontSize: 14, fontWeight: 700 }}>
              <Icon name="shield" size={15} color="#fff" />
              {loading ? 'Checking…' : 'Check Compliance'}
            </button>
          </div>
        </div>

        {checks !== null && <ComplyOSPromoCard />}
        </div>

        {/* RIGHT: results */}
        <div>
          {!sortedChecks && !loading && (
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px dashed var(--border)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              <Icon name="shield" size={28} color="var(--ink4)" style={{ display: 'block', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13.5 }}>Enter an HS code and origin, then run the check.</div>
            </div>
          )}

          {loading && (
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              <Icon name="sliders" size={28} color="var(--teal)" className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13.5 }}>Checking compliance requirements…</div>
            </div>
          )}

          {sortedChecks && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 22%, transparent)', borderRadius: 12, fontSize: 13, color: 'var(--ink2)' }}>
                <Icon name="info" size={16} color="var(--teal)" />
                <span><strong>{requiredCount}</strong> of {sortedChecks.length} checks require action for HS {hsSelected?.code ?? hs} from {ORIGIN_GROUPS.flatMap(g => g.options).find(o => o.code === origin)?.name ?? origin}.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sortedChecks.map(c => (
                  <div key={c.key} style={{ display: 'flex', gap: 14, padding: 16, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <FeaturedIcon variant={iconVariant(c.color)} size="sm" shape="square">
                      <Icon name={c.required ? 'alertTriangle' : 'checkCircle'} size={16} />
                    </FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
                        <Badge variant={badgeVariant(c.color)}>{c.required ? 'Required' : 'Not required'}</Badge>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>{c.note}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>{c.authority}</span>
                        {c.link && (
                          <a href={c.link} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                            Website <Icon name="externalLink" size={11} color="var(--teal)" />
                          </a>
                        )}
                      </div>
                      {/* Whether the prediction held. This is the only way to
                          tell a rule that protects the tenant from one that
                          adds noise to every check — and "enforced anyway" is
                          the report that matters most, since a missed
                          requirement costs a delay rather than a wasted
                          certificate. One click, recorded once per check. */}
                      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {reported[c.key] ? (
                          <span style={{ fontSize: 11.5, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Icon name="checkCircle" size={12} color="var(--green)" /> Thanks — recorded. It will sharpen this check for everyone.
                          </span>
                        ) : (
                          <>
                            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Cleared this cargo? What actually happened:</span>
                            <button type="button" onClick={() => reportOutcome(c, c.required ? 'applied' : 'unexpected')}
                              style={outcomeBtn}>
                              {c.required ? 'It was required' : 'It was enforced anyway'}
                            </button>
                            <button type="button" onClick={() => reportOutcome(c, c.required ? 'not_applied' : 'applied')}
                              style={outcomeBtn}>
                              {c.required ? 'Nothing was required' : 'Correct — not required'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1.2s linear infinite; }
      `}</style>
    </div>
  );
};
