import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

// ── Duty Check — single-HS-code companion to the Landed Cost Calculator.
// "What does this one code cost" rather than "calculate a whole shipment".
// Backed by GET /v1/customs/duty-check/:code, a plain versioned REST route
// (same auth + entitlement gate as the rest of /v1/customs/*) so any other
// page, or an external integration holding a valid token, can call it too —
// see the route's own doc comment in customs.routes.ts.

interface HsSearchResult {
  code: string;
  description: string;
  import_duty_rate: number;
}

interface DutyAlternative {
  code: string;
  description: string;
  import_duty_rate: number | string | null;
  excise_rate: number | string | null;
  vat_rate: number | string | null;
}

interface DutyCheckResult {
  code: string;
  description: string;
  unit: string | null;
  import_duty_rate: number | string | null;
  excise_rate: number | string | null;
  vat_rate: number | string | null;
  pvoc_required: boolean;
  di_required: boolean;
  permits: string | null;
  restrictions: string | null;
  notes: string | null;
  alternatives: DutyAlternative[];
}

interface HsSuggestion {
  code: string;
  description: string;
  duty_rate: number | null;
  matchPct: number;
  matchedWords: string[];
}

interface AiPick {
  code: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

function pct(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `${n}%` : '—';
}

export const DutyCheckPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [urlParams] = useSearchParams();

  const [hs, setHs] = useState(() => urlParams.get('hs') ?? '');
  const [hsSelected, setHsSelected] = useState<HsSearchResult | null>(null);
  const [hsResults, setHsResults] = useState<HsSearchResult[]>([]);
  const [hsLoading, setHsLoading] = useState(false);
  const hsDebounce = useRef<any>(null);

  const [result, setResult] = useState<DutyCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // AI / word-match HS suggester — for when the caller has no code at all,
  // only a description. Reuses the same backend the Landed Cost Calculator's
  // multi-line suggester already uses (hs-suggest.service.ts), just for one
  // item instead of a whole invoice.
  const [showSuggester, setShowSuggester] = useState(false);
  const [description, setDescription] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<HsSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState('');
  const [aiPicking, setAiPicking] = useState(false);
  const [aiPick, setAiPick] = useState<AiPick | null>(null);
  const [aiPickError, setAiPickError] = useState('');

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

  // Deep-linked from another page/tool with ?hs= — run once automatically
  // instead of making the caller retype and click Check Duty again. This is
  // the frontend half of "recall this tool from elsewhere": any page can
  // link straight to a result with `/clearos/duty-check?hs=<code>`.
  useEffect(() => {
    if (urlParams.get('hs')) runCheck(urlParams.get('hs')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck(codeOverride?: string) {
    const code = (codeOverride ?? hsSelected?.code ?? hs).trim();
    if (!code) { setError('Enter an HS code or product description.'); return; }
    setError('');
    setHsResults([]);
    setChecking(true);
    try {
      const r = await apiFetch(`/v1/customs/duty-check/${encodeURIComponent(code)}`);
      setResult(r);
    } catch (e: any) {
      setError(e.message ?? 'Duty check failed');
      setResult(null);
    }
    setChecking(false);
  }

  async function fetchSuggestions() {
    if (!description.trim()) { setSuggestError('Describe the product first.'); return; }
    setSuggestError('');
    setAiPick(null);
    setAiPickError('');
    setSuggesting(true);
    try {
      const r: any = await apiFetch('/v1/customs/hs-suggest', {
        method: 'POST',
        body: JSON.stringify({ items: [{ id: 'x', text: description }] }),
      });
      const line = r?.data?.[0];
      const list: HsSuggestion[] = line?.suggestions ?? [];
      setSuggestions(list);
      if (list.length === 0) setSuggestError('No tariff headings matched that description — try different wording, or search by code above.');
    } catch (e: any) {
      setSuggestError(e.message ?? 'Suggestion lookup failed');
    }
    setSuggesting(false);
  }

  async function pickWithAI() {
    setAiPicking(true);
    setAiPickError('');
    try {
      const r: any = await apiFetch('/v1/customs/hs-suggest/ai-pick', {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            id: 'x',
            text: description,
            candidates: suggestions.map(s => ({ code: s.code, description: s.description, duty_rate: s.duty_rate })),
          }],
        }),
      });
      const pick = (r?.picks ?? [])[0] ?? null;
      if (!pick) { setAiPickError('The AI review returned nothing usable.'); return; }
      setAiPick(pick);
    } catch (e: any) {
      setAiPickError(e.message ?? 'The AI review failed.');
    }
    setAiPicking(false);
  }

  function acceptCode(code: string) {
    setHs(code);
    setHsSelected(null);
    setHsResults([]);
    setShowSuggester(false);
    setSuggestions([]);
    setDescription('');
    setAiPick(null);
    runCheck(code);
  }

  return (
    <div style={{ padding: '0 0 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Duty Check']}
        titlePlain="Duty"
        titleEm="check"
        subtitle="Import duty and excise for one HS code, at a glance — plus nearby alternatives and a description-based finder for when you don't have a code yet."
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(280px, 380px) 1fr', gap: 24, alignItems: 'start' }}>

          {/* LEFT: input card + HS finder, stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--elev-lg)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="percent" size={18} color="var(--teal)" /> Item Details
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                  HS Code or Product
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-field"
                    placeholder="e.g. 8471.30 or laptop"
                    value={hs}
                    onChange={e => { setHs(e.target.value); setHsSelected(null); setResult(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') runCheck(); }}
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
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, zIndex: 1000, boxShadow: 'var(--elev-lg)', overflow: 'hidden', marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
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

              {error && (
                <div style={{ padding: '10px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)' }}>
                  {error}
                </div>
              )}

              <button type="button" onClick={() => runCheck()} disabled={checking} className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, fontSize: 14, fontWeight: 700 }}>
                <Icon name="percent" size={15} color="#fff" />
                {checking ? 'Checking…' : 'Check Duty'}
              </button>
            </div>
          </div>

          {/* HS code finder — description → suggestions → optional AI pick.
              Lives right under the main input, not in the results column, since
              its whole purpose is finding a code before you have one to check. */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            {!showSuggester ? (
              <button type="button" onClick={() => setShowSuggester(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', fontFamily: 'var(--font)' }}>
                <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="sparkle" size={14} /></FeaturedIcon>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Don't know the HS code?</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Describe the product and find a probable heading.</div>
                </div>
                <Icon name="chevronRight" size={16} color="var(--ink3)" />
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="sparkle" size={14} /></FeaturedIcon>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>HS code finder</div>
                  <button type="button" onClick={() => { setShowSuggester(false); setSuggestions([]); setSuggestError(''); setAiPick(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--ink3)' }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>

                <textarea
                  className="input-field"
                  placeholder="e.g. solar panel, 250W monocrystalline, aluminium frame"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical', fontFamily: 'var(--font)', fontSize: 13 }}
                />

                {suggestError && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 9, fontSize: 12, color: 'var(--red)' }}>
                    {suggestError}
                  </div>
                )}

                <button type="button" onClick={fetchSuggestions} disabled={suggesting} className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 38, fontSize: 13, fontWeight: 700, marginTop: 10, width: '100%' }}>
                  <Icon name="search" size={14} />
                  {suggesting ? 'Searching…' : 'Suggest HS code'}
                </button>

                {suggestions.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
                      Candidates — word matches, not a classification
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {suggestions.map(s => (
                        <button key={s.code} type="button" onClick={() => acceptCode(s.code)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', flexShrink: 0 }}>{s.code}</span>
                          <span style={{ fontSize: 12.5, color: 'var(--ink2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</span>
                          <Badge variant="gray">{s.matchPct}% match</Badge>
                        </button>
                      ))}
                    </div>

                    {suggestions.length > 1 && (
                      <>
                        {aiPickError && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 9, fontSize: 12, color: 'var(--red)' }}>
                            {aiPickError}
                          </div>
                        )}
                        {!aiPick ? (
                          <button type="button" onClick={pickWithAI} disabled={aiPicking} className="btn btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, fontSize: 12.5, fontWeight: 700, marginTop: 10, width: '100%' }}>
                            <Icon name="sparkle" size={13} />
                            {aiPicking ? 'Asking AI…' : 'Let AI pick the best match'}
                          </button>
                        ) : (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 10 }}>
                            {aiPick.code ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <Icon name="sparkle" size={13} color="var(--teal)" />
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)' }}>{aiPick.code}</span>
                                  <Badge variant={aiPick.confidence === 'high' ? 'success' : aiPick.confidence === 'medium' ? 'warning' : 'gray'}>{aiPick.confidence} confidence</Badge>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.5 }}>{aiPick.reason}</div>
                                <button type="button" onClick={() => acceptCode(aiPick.code!)} className="btn btn-primary"
                                  style={{ height: 32, fontSize: 12, fontWeight: 700, marginTop: 8, padding: '0 14px' }}>
                                  Use this code
                                </button>
                              </>
                            ) : (
                              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>{aiPick.reason || 'The AI did not settle on any of the candidate headings.'}</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>

          {/* RIGHT: results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!result && !checking && (
              <div style={{ background: 'var(--card-bg, var(--white))', border: '1px dashed var(--border)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
                <Icon name="percent" size={28} color="var(--ink4)" style={{ display: 'block', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13.5 }}>Enter an HS code and run the check — or describe the product below and let the finder locate one.</div>
              </div>
            )}

            {checking && (
              <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
                <Icon name="sliders" size={28} color="var(--teal)" className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13.5 }}>Looking up duty and excise…</div>
              </div>
            )}

            {result && !checking && (
              <>
                {/* Summary line */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 12, fontSize: 13, color: 'var(--ink2)', flexWrap: 'wrap' }}>
                  <Icon name="info" size={16} color="var(--teal)" />
                  <span><strong>{result.code}</strong> — {result.description}{result.unit ? ` (per ${result.unit})` : ''}</span>
                  {result.pvoc_required && <Badge variant="warning">PVoC required</Badge>}
                  {result.di_required && <Badge variant="warning">Destination Inspection</Badge>}
                </div>

                {/* Import Duty / Excise Duty cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px' }}>
                    <FeaturedIcon variant="info" size="md" shape="square"><Icon name="percent" size={18} /></FeaturedIcon>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)', marginTop: 14, letterSpacing: '-0.5px' }}>{pct(result.import_duty_rate)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, fontWeight: 600 }}>Import Duty (EAC CET)</div>
                  </div>
                  <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px' }}>
                    <FeaturedIcon variant="warning" size="md" shape="square"><Icon name="percent" size={18} /></FeaturedIcon>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)', marginTop: 14, letterSpacing: '-0.5px' }}>{pct(result.excise_rate)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, fontWeight: 600 }}>Excise Duty</div>
                  </div>
                </div>

                {/* Alternative HS codes — siblings under the same 4-digit heading */}
                {result.alternatives.length > 0 && (
                  <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Alternative HS codes</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Other subheadings under the same tariff heading — in case this isn't quite the right one.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {result.alternatives.map(a => (
                        <button key={a.code} type="button" onClick={() => runCheck(a.code)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', flexShrink: 0 }}>{a.code}</span>
                          <span style={{ fontSize: 12.5, color: 'var(--ink2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>Duty {pct(a.import_duty_rate)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
