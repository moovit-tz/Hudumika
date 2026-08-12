import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';

// This page used to advertise fabricated ML models ("18.4M samples", "0.02
// drift", "38ms/query") that do not exist. There is no trained model here.
// What HuduBI can honestly offer is an AI-written executive analysis over the
// tenant's REAL figures, using the tenant's own configured model (BYO key,
// same contract as the rest of the platform), instructed never to invent.
export function HuduBIModels() {
  const [digest, setDigest] = useState<string | null>(null);
  const [signals, setSignals] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setErr(null); setDigest(null); setSignals(null);
    try {
      const r = await apiFetch('/v1/hudubi/ai-insights');
      setDigest(r?.digest || 'No analysis returned.');
      setSignals(r?.signals || null);
    } catch (e: any) { setErr(e?.message || 'Could not generate the analysis.'); }
    finally { setLoading(false); }
  };

  const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['HuduBI', 'Intelligence']}
        titlePlain="Executive AI"
        titleEm="analysis"
        subtitle="An AI-written read of your real figures, produced by your configured model — grounded in the data, never invented."
      />

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="sparkle" size={20} color="var(--teal)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Board digest</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Generated from your live customers, shipments, declarations and finance figures.</div>
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} onClick={generate}>
            <Icon name="sparkle" size={14} /> {loading ? 'Analysing…' : (digest ? 'Regenerate' : 'Generate analysis')}
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--ink2)', background: 'var(--gold-l)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>{err}</div>
        )}

        {digest && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {digest.split('\n').filter(l => l.trim()).map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>
                <span style={{ color: 'var(--teal)', flexShrink: 0 }}>•</span><span>{line.replace(/^[-*•]\s*/, '')}</span>
              </div>
            ))}
          </div>
        )}

        {!digest && !err && !loading && (
          <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--ink3)' }}>
            No trained forecasting model runs here — HuduBI does not predict. This produces a plain-language summary of what your current data shows.
          </div>
        )}
      </div>

      {/* Transparency: the exact figures the analysis was given */}
      {signals && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Figures the analysis was given</div>
          <pre style={{ margin: 0, fontSize: 11.5, color: 'var(--ink2)', fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
{JSON.stringify(signals, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
