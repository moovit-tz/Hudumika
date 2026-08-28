// ─── SignVerifyPage.tsx — Public verification page ────────────────────────────
// At /sign/verify/:code — completely public, no auth required.
// Anyone who receives a signed document can enter the verification code
// and see who signed, when, and whether the stamp is genuine.
// Style: DocuSign-like full-page branded verification experience.

import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { BASE_URL } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import '../sign/Sign.css';

interface VerifyResult {
  valid: boolean;
  verification_code: string;
  title: string;
  status: string;
  completed_at: string | null;
  stamp_applied: boolean;
  has_signed_pdf: boolean;
  anchor_status: 'pending' | 'confirmed' | null;
  anchor_block_height: number | null;
  anchor_block_time: string | null;
  signers: Array<{
    name: string; email: string; role_label: string | null;
    status: string; signed_at: string | null;
  }>;
  certification: {
    name: string; title: string; roll_number: string | null; firm: string | null;
    certified: boolean; certified_at: string | null;
  } | null;
}

function getCodeFromUrl(): string {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1]?.toUpperCase() ?? '';
}

export function SignVerifyPage() {
  const urlCode = getCodeFromUrl();
  const [code, setCode] = useState(urlCode);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(!!urlCode);
  const [error, setError] = useState<string | null>(null);
  // A public verification link is very often the first page in a fresh tab
  // (opened from an email/WhatsApp share) — window.history.length is useless
  // here, it's already 2 on a brand-new tab because the browser counts its
  // own initial blank entry, so history.back() would land on that blank
  // state instead of doing nothing. document.referrer is the real signal:
  // empty means this tab has no prior page to go back to at all.
  const [canGoBack] = useState(() => !!document.referrer);

  useEffect(() => {
    if (urlCode) verify(urlCode);
  }, []);

  async function verify(lookupCode: string) {
    if (!lookupCode.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${BASE_URL}/v1/sign/public/verify/${lookupCode.trim()}`);
      if (!res.ok) {
        setError('Verification code not found. Please check the code and try again.');
        return;
      }
      setResult(await res.json());
    } catch {
      setError('Unable to connect to verification server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sign-verify-page" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Public Branded Header */}
      <header style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--primary-foreground))' }}>
            <Icon name="edit" size={16} />
          </div>
          <span>Hudumika eSign</span>
        </div>
        {canGoBack && (
          <Button variant="outline" size="sm" onClick={() => window.history.back()} style={{ fontWeight: 600 }}>
            <Icon name="arrowLeft" size={14} /> Back
          </Button>
        )}
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: 540, width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '32px', boxShadow: 'var(--elev-sm)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, textAlign: 'center' }}>Verify a Document</h2>
          <p style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 24, textAlign: 'center' }}>
            Enter the verification code printed at the bottom of the signed document pages.
          </p>

          {/* Code input */}
          {(() => {
            // "Verified" isn't just "a result exists" — it has to be the
            // result for what's currently typed, or editing the code field
            // after a successful check would keep showing a stale green
            // "Verified" state for a code that was never actually looked up.
            const isCurrentlyVerified = !!result && result.verification_code === code.trim().toUpperCase();
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && verify(code)}
                      placeholder="e.g. HSGN-A1B2C3-D4E5F6"
                      style={{
                        width: '100%', padding: isCurrentlyVerified ? '10px 36px 10px 14px' : '10px 14px', borderRadius: 6,
                        border: `1px solid ${isCurrentlyVerified ? 'var(--sign-green)' : 'var(--border)'}`,
                        fontSize: 14, fontFamily: 'monospace', fontWeight: 600,
                        color: 'var(--ink)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    {isCurrentlyVerified && (
                      <Icon name="checkCircle" size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sign-green)' }} />
                    )}
                  </div>
                  <Button variant="default" onClick={() => verify(code)} disabled={loading || !code.trim()}
                    style={{ background: isCurrentlyVerified ? 'var(--sign-green)' : 'var(--blue)', color: '#fff', padding: '0 20px', borderRadius: 6, fontSize: 13.5, fontWeight: 600 }}>
                    {loading ? 'Verifying...' : isCurrentlyVerified ? 'Re-verify' : 'Verify'}
                  </Button>
                </div>
                {isCurrentlyVerified && (
                  <div style={{ fontSize: 11.5, color: 'var(--sign-green)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="checkCircle" size={11} /> Verified — re-verify to check for status updates (e.g. Bitcoin confirmation).
                  </div>
                )}
              </div>
            );
          })()}

          {/* Result */}
          {/* Result */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 6, marginTop: 16 }}>
              <Icon name="xCircle" size={16} style={{ color: 'var(--red)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--red)' }}>Verification Failed</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{error}</div>
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 24 }}>
              {/* Status Banner */}
              <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <Icon name="checkCircle" size={18} style={{ color: 'var(--green)' }} />
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--green)' }}>
                  This document is authentic and verified.
                </div>
              </div>

              {/* Document Info Table */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Document Details</h3>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)', width: '30%' }}>File Name</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--ink)' }}>{result.title}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)' }}>Code</td>
                      <td style={{ padding: '8px 0', fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{result.verification_code}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)' }}>Completed</td>
                      <td style={{ padding: '8px 0', color: 'var(--ink)' }}>{result.completed_at ? new Date(result.completed_at).toLocaleString() : 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)' }}>Status</td>
                      <td style={{ padding: '8px 0', textTransform: 'capitalize', fontWeight: 600, color: 'var(--ink)' }}>{result.status}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signers Grid */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Signers</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.signers.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: s.status === 'signed' ? 'var(--green-l)' : 'var(--card-sunken)', color: s.status === 'signed' ? 'var(--green)' : 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={s.status === 'signed' ? 'check' : 'clock'} size={12} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{s.email}{s.role_label ? ` · ${s.role_label}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: s.status === 'signed' ? 'var(--green)' : 'var(--gold)', textTransform: 'capitalize' }}>{s.status}</span>
                        {s.signed_at && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{new Date(s.signed_at).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certified True Copy — the whole point of checking this page for
                  a legally certified document is confirming who certified it
                  and their roll number, so it gets its own distinct block
                  rather than blending into the ordinary signers list above. */}
              {result.certification && (
                <div style={{ marginBottom: 24, padding: 14, borderRadius: 6, background: 'var(--blue-l)', border: '1px solid var(--blue)' }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="shield" size={13} /> Certified True Copy
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                    <div style={{ fontWeight: 700 }}>{result.certification.name}</div>
                    <div style={{ color: 'var(--ink2)', marginTop: 2 }}>
                      {result.certification.title}
                      {result.certification.roll_number ? ` · Roll No. ${result.certification.roll_number}` : ''}
                    </div>
                    {result.certification.firm && <div style={{ color: 'var(--ink2)' }}>{result.certification.firm}</div>}
                    <div style={{ fontSize: 11.5, color: result.certification.certified ? 'var(--green)' : 'var(--gold)', fontWeight: 600, marginTop: 6 }}>
                      {result.certification.certified
                        ? `Certified${result.certification.certified_at ? ` on ${new Date(result.certification.certified_at).toLocaleDateString()}` : ''}`
                        : 'Certification pending'}
                    </div>
                  </div>
                </div>
              )}

              {/* Cryptographic Proof Details */}
              <div style={{ padding: '16px', background: 'var(--card-sunken)', borderRadius: 6, border: '1px solid var(--border)' }}>
                {result.stamp_applied && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>
                    <Icon name="checkCircle" size={14} />
                    <span>Visual audit stamp applied to all pages.</span>
                  </div>
                )}
                {result.anchor_status && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: 'var(--ink2)', lineHeight: '1.4' }}>
                    <Icon name={result.anchor_status === 'confirmed' ? 'lock' : 'clock'} size={12} style={{ marginTop: 2, color: result.anchor_status === 'confirmed' ? 'var(--green)' : 'var(--ink3)' }} />
                    <div>
                      {result.anchor_status === 'confirmed'
                        ? `Cryptographically anchored to the Bitcoin blockchain (Block #${result.anchor_block_height}).`
                        : 'Bitcoin blockchain anchor pending confirmation.'}
                    </div>
                  </div>
                )}
              </div>

              {result.has_signed_pdf && (
                <a href={`${BASE_URL}/v1/sign/public/verify/${result.verification_code}/download`} download
                  style={{ display: 'block', textAlign: 'center', marginTop: 24, padding: '10px 16px', borderRadius: 6, background: 'var(--blue)', color: '#fff', fontSize: 13.5, fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s' }}>
                  Download Signed PDF
                </a>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>
          Powered by <strong>Hudumika eSign</strong> · Electronic signature verification
        </div>
      </div>
    </div>
  );
}
