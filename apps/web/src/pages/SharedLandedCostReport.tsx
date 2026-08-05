/**
 * Public landing page for the QR code printed on a landed-cost estimate.
 *
 * Reachable without a session — the unguessable token is the access control.
 * Shows only a teaser until the visitor supplies an email address; that email
 * is captured as a CRM lead on the tenant that produced the estimate, and in
 * exchange the full report is released and re-rendered through exactly the
 * same code that produced the original PDF.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BASE_URL } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { printSharedReport } from './LandedCostPage.js';
import { PageHeader } from '../components/PageHeader.js';

interface Teaser {
  hs_code: string | null;
  description: string | null;
  customer_name: string | null;
  generated_at: string;
  prepared_by: string | null;
}

export const SharedLandedCostReport: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [unlocked, setUnlocked] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/v1/landed-cost-shares/${token}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setLoadError(body?.error || 'This report link is not valid.');
        else setTeaser(body);
      } catch {
        if (!cancelled) setLoadError('Could not reach the server. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/v1/landed-cost-shares/${token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: fullName || undefined, company: company || undefined }),
      });
      const body = await res.json();
      if (!res.ok) setSubmitError(body?.error || 'Could not unlock the report.');
      else setUnlocked(body.data);
    } catch {
      setSubmitError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function download() {
    // Single-item shares carry `result`, multi-item ones `multiResult`.
    if (!unlocked?.result && !unlocked?.multiResult) return;
    printSharedReport(unlocked);
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, border: '1px solid #E5E9EC', boxShadow: '0 10px 40px rgba(20,25,30,.08)', padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FF5E1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="package" size={18} color="#fff" />
          </div>
          <div style={{ fontFamily: 'system-ui', fontSize: 19, fontWeight: 800, color: '#14181B', letterSpacing: '-.01em' }}>
            Clear<span style={{ color: '#FF5E1A' }}>OS</span>
          </div>
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5B646D', fontWeight: 700, marginBottom: 20 }}>
          Customs &amp; Landed Cost Intelligence
        </div>
        {children}
      </div>
    </div>
  );

  if (loading) return shell(<div style={{ color: '#5B646D', fontSize: 14 }}>Loading report…</div>);

  if (loadError) return shell(
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.25)' }}>
      <Icon name="alertCircle" size={17} color="#DC2626" />
      <div style={{ fontSize: 13.5, color: '#991B1B', lineHeight: 1.6 }}>{loadError}</div>
    </div>
  );

  if (unlocked) return shell(
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, background: 'rgba(22,163,74,.08)', border: '1px solid rgba(22,163,74,.25)', marginBottom: 18 }}>
        <Icon name="check" size={17} color="#16A34A" />
        <div style={{ fontSize: 13.5, color: '#14532D', lineHeight: 1.6 }}>
          Report unlocked. {teaser?.prepared_by ? `${teaser.prepared_by} will follow up with you shortly.` : 'The clearing agent will follow up with you shortly.'}
        </div>
      </div>
      <button type="button" onClick={download}
        style={{ width: '100%', padding: 'var(--ds-btn-py-lg) 20px', borderRadius: 'var(--r)', border: 'none', background: '#FF5E1A', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
        <Icon name="download" size={16} color="#fff" /> Download the PDF
      </button>
      <div style={{ fontSize: 11.5, color: '#8A939C', marginTop: 12, lineHeight: 1.6 }}>
        Opens your browser's print dialog — choose “Save as PDF” as the destination.
      </div>
    </>
  );

  return shell(
    <>
      <div style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#E8480A', fontWeight: 700 }}>Estimate</div>
      <PageHeader
        crumbs={['ClearOS', 'Landed Cost']}
        titlePlain="Landed Cost"
        titleEm="report"
      />

      <div style={{ border: '1px solid #E5E9EC', borderRadius: 11, overflow: 'hidden', marginBottom: 20 }}>
        {([
          ['Cargo', teaser?.description],
          ['HS Code', teaser?.hs_code],
          ['Prepared for', teaser?.customer_name],
          ['Prepared by', teaser?.prepared_by],
          ['Generated', teaser?.generated_at ? new Date(teaser.generated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : null],
        ] as [string, string | null | undefined][])
          .filter(([, v]) => !!v)
          .map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid #EEF2F4', background: i % 2 ? '#fff' : '#F7F9FA' }}>
              <span style={{ fontSize: 12.5, color: '#5B646D' }}>{k}</span>
              <span style={{ fontSize: 12.5, color: '#2A3035', fontWeight: 600, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
      </div>

      <form onSubmit={unlock}>
        <div style={{ fontSize: 13.5, color: '#2A3035', lineHeight: 1.65, marginBottom: 16 }}>
          Enter your email to download the full report with every duty, tax and charge itemised.
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, color: '#5B646D', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>Email address *</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.co.tz"
          style={{ width: '100%', boxSizing: 'border-box', height: 44, fontSize: 14, padding: '0 13px', borderRadius: 9, border: '1px solid #E5E9EC', marginBottom: 13 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#5B646D', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>Your name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Optional"
              style={{ width: '100%', boxSizing: 'border-box', height: 42, fontSize: 13.5, padding: '0 13px', borderRadius: 9, border: '1px solid #E5E9EC' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#5B646D', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Optional"
              style={{ width: '100%', boxSizing: 'border-box', height: 42, fontSize: 13.5, padding: '0 13px', borderRadius: 9, border: '1px solid #E5E9EC' }} />
          </div>
        </div>

        {submitError && (
          <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 9, background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.25)', color: '#991B1B', fontSize: 13 }}>
            {submitError}
          </div>
        )}

        <button type="submit" disabled={submitting}
          style={{ width: '100%', padding: 'var(--ds-btn-py-lg) 20px', borderRadius: 'var(--r)', border: 'none', background: submitting ? '#C9CED3' : '#FF5E1A', color: '#fff', fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Unlocking…' : 'Get the full report'}
        </button>

        <div style={{ fontSize: 11, color: '#8A939C', marginTop: 12, lineHeight: 1.6 }}>
          {teaser?.prepared_by ? `${teaser.prepared_by} ` : 'The clearing agent '}
          will use your email to send this report and follow up about your shipment.
        </div>
      </form>
    </>
  );
};
