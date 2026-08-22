import React, { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

/**
 * The platform's real (CA-issued) document-signing certificate — the
 * connection point for replacing Hudumika eSign's self-signed default with
 * a real, purchased certificate once one exists. One identity signs every
 * tenant's completed Sign envelopes, which is why this lives here rather
 * than in any per-tenant Settings page.
 *
 * Upload alone never changes what the platform signs with — a fresh upload
 * is parsed and put through a real sign-and-independently-verify round trip
 * (platform-signing-cert.service.ts) before it's even stored, but going
 * live is always a separate, explicit "Activate" click: this is a
 * hard-to-reverse, shared-system change (every tenant's documents going
 * forward), not something a successful upload should do on its own.
 */

interface CertRow {
  id: string;
  label: string;
  subject: string;
  issuer: string;
  is_self_signed: boolean;
  not_before: string;
  not_after: string;
  verified_at: string | null;
  enabled: boolean;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CnFromSubject(subject: string): string {
  const m = subject.match(/CN=([^,]+)/);
  return m ? m[1] : subject;
}

export function SuperAdminSigningCert() {
  const [active, setActive] = useState<CertRow | null>(null);
  const [history, setHistory] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    apiFetch('/v1/superadmin/signing-cert')
      .then(r => { setActive(r.active); setHistory(r.history); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function handleUpload() {
    if (!file || !password.trim()) return;
    setUploading(true);
    try {
      // password/label are appended before the file part deliberately —
      // fastify-multipart only reliably exposes fields sent before the file
      // part on data.fields (the same established quirk documents.routes.ts's
      // own upload route already works around), and this field is a real
      // secret, so it's not sent as a query param the way a plain id would be.
      const form = new FormData();
      form.append('password', password);
      form.append('label', label.trim() || file.name);
      form.append('file', file);
      await apiFetch('/v1/superadmin/signing-cert/upload', { method: 'POST', body: form });
      setLabel(''); setPassword(''); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
      showAlert('Certificate uploaded and verified — a real test document was signed with it and the signature independently re-checked. Activate it below to make it the live platform identity.', { title: 'Verified', variant: 'info' });
    } catch (e: any) {
      showAlert(e?.message || 'Upload failed', { title: 'Could not verify this certificate' });
    } finally {
      setUploading(false);
    }
  }

  async function activate(row: CertRow) {
    if (!(await showConfirm(
      `Activate "${row.label}" (${CnFromSubject(row.subject)})? Every tenant's Sign envelope completed from now on will be signed with this certificate instead of the current one.`,
      { title: 'Activate signing certificate', confirmLabel: 'Activate', variant: 'warning' },
    ))) return;
    try {
      await apiFetch(`/v1/superadmin/signing-cert/${row.id}/activate`, { method: 'POST' });
      load();
    } catch (e: any) {
      showAlert(e?.message || 'Failed to activate', { title: 'Could not activate' });
    }
  }

  async function remove(row: CertRow) {
    if (!(await showConfirm(`Delete "${row.label}"? This can't be undone.`, { title: 'Delete certificate', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/superadmin/signing-cert/${row.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showAlert(e?.message || 'Failed to delete', { title: 'Could not delete' });
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Platform', 'Signing Certificate']}
        titlePlain="Signing"
        titleEm="Certificate"
        subtitle="The real, CA-issued certificate Hudumika eSign signs every tenant's completed documents with — or the honest self-signed default until one is connected."
      />

      {/* Active identity */}
      <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Currently signing with</div>
        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
        ) : active ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="checkCircle" size={18} color="var(--green)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{CnFromSubject(active.subject)} <span style={{ fontWeight: 500, color: 'var(--ink3)', fontSize: 12 }}>— real certificate</span></div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Issued by {CnFromSubject(active.issuer)} · valid until {fmtDate(active.not_after)}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gold-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="alertCircle" size={18} color="var(--gold)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Hudumika eSign — self-signed (platform default)</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', maxWidth: 560 }}>
                Documents are genuinely, cryptographically signed and their content-integrity is real — but a standard PDF viewer will show the signer's identity as untrusted until a real certificate is uploaded and activated below.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload */}
      <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', padding: 20, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Upload a certificate</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14 }}>
          A real, CA-issued PKCS#12 (.p12/.pfx) document-signing certificate — from DigiCert, Sectigo, GlobalSign, SSL.com, or any other CA. It's parsed, then signs and independently re-verifies a real test document before it's stored — never taken on faith.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 560, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4 }}>Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. DigiCert OV 2026"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4 }}>Certificate password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password on the .p12/.pfx file"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input ref={fileInputRef} type="file" accept=".p12,.pfx" onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }} />
          <Button variant="default" onClick={handleUpload} disabled={!file || !password.trim() || uploading}>
            {uploading ? 'Verifying…' : 'Upload & Verify'}
          </Button>
        </div>
      </div>

      {/* History */}
      <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', padding: 20, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Uploaded certificates</div>
        {history.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, marginTop: 10 }}>None uploaded yet — the platform is signing with the self-signed default.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {history.map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${row.enabled ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, background: row.enabled ? 'var(--green-l)' : 'transparent' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {row.label} {row.enabled && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>· ACTIVE</span>}
                    {row.is_self_signed && <span style={{ fontSize: 11, color: 'var(--gold)', marginLeft: 6 }}>self-signed</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    {CnFromSubject(row.subject)} · issued by {CnFromSubject(row.issuer)} · expires {fmtDate(row.not_after)} · uploaded {fmtDate(row.created_at)}
                  </div>
                </div>
                {!row.enabled && (
                  <>
                    <Button variant="default" size="xs" onClick={() => activate(row)}>Activate</Button>
                    <Button variant="outline" size="xs" onClick={() => remove(row)} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>Delete</Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
