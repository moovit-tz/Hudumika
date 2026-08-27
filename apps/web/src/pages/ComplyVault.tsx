import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { useComplyCertificates, useComplyRenewals } from '../hooks/useComply.js';
import type { CompCertificate } from '@hudumika/types';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { ComplyCustomerPicker } from './ComplyCustomerPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './ComplyOS.css';

type Filter = 'all' | 'active' | 'expiring' | 'expired';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLeft(expiryDate: string | null): number {
  if (!expiryDate) return 9999;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
}

function expiryLabel(c: CompCertificate): string {
  if (!c.expiry_date) return 'Perpetual';
  const d = daysLeft(c.expiry_date);
  if (d < 0)   return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return 'Expires today';
  if (d <= 30) return `Expires in ${d}d`;
  return new Date(c.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function expiryValClass(c: CompCertificate): string {
  const base = 'comply-cert-val comply-cert-val--sm';
  if (c.status === 'expired')  return `${base} comply-cert-val--danger`;
  if (c.status === 'expiring') return `${base} comply-cert-val--warn`;
  return base;
}

function issuedLabel(c: CompCertificate): string {
  if (!c.issued_date) return '—';
  return new Date(c.issued_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Two-stage expiry reminder status (90-day / 30-day notices) — mirrors the
 *  stages fired by apps/api's comply-renewal.job.ts runComplyExpiryReminderJob. */
function reminderStageLabel(c: CompCertificate): string {
  if (!c.expiry_date) return 'No expiry set — reminders don\'t apply';
  const sent90 = !!c.reminder_90d_sent_at;
  const sent30 = !!c.reminder_30d_sent_at;
  if (sent90 && sent30) return '3-month and 1-month notices sent';
  if (sent90) return '3-month notice sent · 1-month notice pending';
  const d = daysLeft(c.expiry_date);
  if (d > 90) return `Not yet due — 3-month notice fires in ${d - 90}d`;
  return 'Due — notice will be sent on the next daily check';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComplyVault() {
  const navigate                         = useNavigate();
  const { certs, loading, error, refresh, revoke }      = useComplyCertificates();
  const { startRenewal }                 = useComplyRenewals();
  const [filter, setFilter]              = useState<Filter>('all');
  const [view, setView]                  = useState<'grid' | 'list'>('grid');
  const [selected, setSelected]          = useState<CompCertificate | null>(null);
  const [renewing, setRenewing]          = useState<string | null>(null);
  const [revoking, setRevoking]          = useState(false);
  const [shareStatus, setShareStatus]    = useState<string | null>(null);

  const visible = filter === 'all' ? certs : certs.filter(c => c.status === filter);

  function handleExportAll() {
    const rows = [
      ['Certificate', 'Agency', 'Cert #', 'Issued', 'Expiry', 'Status'],
      ...visible.map(c => [c.name, c.agency_code, c.cert_number, issuedLabel(c), expiryLabel(c), c.status]),
    ];
    const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate-vault-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownload(cert: CompCertificate) {
    if (cert.document_url) window.open(cert.document_url, '_blank', 'noopener');
  }

  async function handleRenew(e: React.MouseEvent, certId: string) {
    e.stopPropagation();
    try {
      setRenewing(certId);
      await startRenewal(certId);
      navigate('/complyos/workflows');
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setRenewing(null);
    }
  }

  async function handleShare(cert: CompCertificate) {
    const link = `${window.location.origin}/complyos/vault?cert=${cert.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setShareStatus('Shareable link copied to clipboard.');
    } catch {
      setShareStatus(link);
    }
    setTimeout(() => setShareStatus(null), 4000);
  }

  async function handleRevoke(cert: CompCertificate) {
    const ok = await showConfirm(
      `Revoke "${cert.name}"? It will remain in the Vault for audit purposes but stop counting toward compliance health.`,
      { title: 'Revoke Certificate', confirmLabel: 'Revoke' }
    );
    if (!ok) return;
    try {
      setRevoking(true);
      await revoke(cert.id);
      setSelected(null);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Certificate Vault']} 
        titlePlain="Certificate"
        titleEm="vault"
        subtitle={<> {certs.filter(c => c.status === 'active').length} active ·{' '}
            {certs.filter(c => c.status === 'expiring').length} expiring ·{' '}
            {certs.filter(c => c.status === 'expired').length} expired </>}
        actions={
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={refresh} title="Refresh certificates">
            <Icon name="refresh" size={13} />
          </button>
          <button type="button" className="comply-btn-secondary" onClick={handleExportAll} disabled={visible.length === 0}>
            <Icon name="download" size={13} /> Export All
          </button>
          <button type="button" className="comply-btn-primary" onClick={() => navigate('/complyos/vault/new')}>
            <Icon name="plus" size={14} /> Add Certificate
          </button>
        </div>
        }
      />

      {error && <div className="comply-note comply-note--error">Failed to load certificates: {error}</div>}

      <div className="comply-filters" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(['all', 'active', 'expiring', 'expired'] as Filter[]).map(f => (
            <button key={f} type="button" className={`comply-filter-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && ` (${certs.filter(c => c.status === f).length})`}
            </button>
          ))}
        </div>
        <div className="comply-view-toggle">
          <button type="button" title="Grid view" className={`comply-view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>
            <Icon name="grid" size={15} />
          </button>
          <button type="button" title="List view" className={`comply-view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>
            <Icon name="list" size={15} />
          </button>
        </div>
      </div>

      {loading && <div className="comply-empty-hint">Loading certificates…</div>}

      {!loading && visible.length === 0 && (
        <div className="comply-empty-hint">No certificates in this view.</div>
      )}

      {view === 'grid' ? (
        <div className="comply-cert-grid">
          {visible.map(cert => (
            <div key={cert.id} className="comply-cert-card" onClick={() => setSelected(cert)}>
              <div className="comply-cert-card-body">
                <div className="comply-cert-card-hdr-row">
                  <span className={`comply-agency comply-agency--${cert.agency_class}`}>{cert.agency_code}</span>
                  <span className={`comply-badge comply-badge--${cert.status === 'expiring' ? 'pending' : cert.status}`}>
                    {cert.status === 'expiring' ? 'Expiring' : cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                  </span>
                </div>
                <div className="comply-cert-name">{cert.name}</div>
                <div className="comply-cert-agency comply-cert-ref">{cert.cert_number}</div>
                <div className="comply-cert-meta">
                  <div className="comply-cert-row">
                    <span className="comply-cert-key">Issued</span>
                    <span className="comply-cert-val comply-cert-val--sm">{issuedLabel(cert)}</span>
                  </div>
                  <div className="comply-cert-row">
                    <span className="comply-cert-key">Validity</span>
                    <span className={expiryValClass(cert)}>{expiryLabel(cert)}</span>
                  </div>
                </div>
              </div>
              <div className="comply-cert-card-foot">
                <button
                  type="button"
                  title="View certificate"
                  className="comply-btn-secondary"
                  onClick={e => { e.stopPropagation(); setSelected(cert); }}
                >
                  <Icon name="eye" size={14} /> View
                </button>
                {cert.document_url && (
                  <button
                    type="button"
                    title="Download certificate"
                    className="comply-btn-secondary"
                    onClick={e => { e.stopPropagation(); handleDownload(cert); }}
                  >
                    <Icon name="download" size={14} /> Download
                  </button>
                )}
                {(cert.status === 'expiring' || cert.status === 'expired') && (
                  <button
                    type="button"
                    title="Start renewal workflow"
                    className="comply-btn-primary comply-cert-renew"
                    disabled={renewing === cert.id}
                    onClick={e => handleRenew(e, cert.id)}
                  >
                    {renewing === cert.id ? '…' : 'Renew'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="comply-card">
          <div className="comply-card-body">
            <table className="comply-table">
              <thead>
                <tr>
                  <th>Certificate</th><th>Agency</th><th>Cert #</th><th>Issued</th><th>Validity</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(cert => (
                  <tr key={cert.id} className="comply-tr-click" onClick={() => setSelected(cert)}>
                    <td className="comply-table-name">{cert.name}</td>
                    <td><span className={`comply-agency comply-agency--${cert.agency_class}`}>{cert.agency_code}</span></td>
                    <td className="comply-td-mono">{cert.cert_number}</td>
                    <td className="comply-td-muted">{issuedLabel(cert)}</td>
                    <td className={expiryValClass(cert)}>{expiryLabel(cert)}</td>
                    <td>
                      <span className={`comply-badge comply-badge--${cert.status === 'expiring' ? 'pending' : cert.status}`}>
                        {cert.status === 'expiring' ? 'Expiring' : cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" title="View certificate" className="comply-btn-secondary" onClick={() => setSelected(cert)}>
                          <Icon name="eye" size={14} /> View
                        </button>
                        {(cert.status === 'expiring' || cert.status === 'expired') && (
                          <button
                            type="button"
                            title="Start renewal workflow"
                            className="comply-btn-primary comply-cert-renew"
                            disabled={renewing === cert.id}
                            onClick={e => handleRenew(e, cert.id)}
                          >
                            {renewing === cert.id ? '…' : 'Renew'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="comply-overlay" onClick={() => setSelected(null)}>
          <div className="comply-modal comply-modal--480" onClick={e => e.stopPropagation()}>
            <div className="comply-panel-hdr">
              <div>
                <div className="comply-panel-hdr-title">{selected.name}</div>
                <span className={`comply-agency comply-agency--${selected.agency_class}`}>{selected.agency_code}</span>
              </div>
              <button type="button" title="Close" className="comply-close-btn" onClick={() => setSelected(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="comply-panel-body">
              <div className="comply-meta-grid">
                {[
                  { label: 'Certificate Number', val: selected.cert_number, mono: true  },
                  { label: 'Agency',              val: selected.agency_name,  mono: false },
                  { label: 'Client / Entity',     val: selected.customer_name
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <PersonAvatar userId={selected.customer_id ?? undefined} kind="customers" name={selected.customer_name} size={20} />
                          {selected.customer_name}
                        </span>
                      : 'This business', mono: false },
                  { label: 'Date Issued',         val: issuedLabel(selected), mono: false },
                  { label: 'Expiry / Validity',   val: expiryLabel(selected), mono: false },
                  ...(selected.expiry_date ? [{ label: 'Reminders', val: reminderStageLabel(selected), mono: false }] : []),
                  ...(selected.external_ref ? [{ label: 'Agency Reference', val: selected.external_ref, mono: true }] : []),
                  ...(selected.last_synced_at ? [{ label: 'Last Synced', val: new Date(selected.last_synced_at).toLocaleString(), mono: false }] : []),
                ].map(m => (
                  <div key={m.label}>
                    <div className="comply-meta-key">{m.label}</div>
                    <div className={`comply-meta-val${m.mono ? ' comply-meta-val--mono' : ''}`}>{m.val}</div>
                  </div>
                ))}
              </div>
              {selected.non_renewal_risk && (
                <div className="comply-note comply-note--warning">
                  <strong>If not renewed: </strong>{selected.non_renewal_risk}
                </div>
              )}
              {shareStatus && (
                <div className="comply-note comply-note--success">{shareStatus}</div>
              )}
              <div className="comply-action-row">
                {selected.document_url && (
                  <a href={selected.document_url} target="_blank" rel="noreferrer" className="comply-btn-primary">
                    <Icon name="download" size={13} /> Download PDF
                  </a>
                )}
                <button type="button" className="comply-btn-secondary" onClick={() => handleShare(selected)}>
                  <Icon name="copy" size={13} /> Share
                </button>
                {(selected.status === 'expiring' || selected.status === 'expired') && (
                  <button
                    type="button"
                    className="comply-btn-secondary comply-btn-secondary--comply"
                    disabled={renewing === selected.id}
                    onClick={e => handleRenew(e, selected.id)}
                  >
                    <Icon name="refresh" size={13} />
                    {renewing === selected.id ? 'Starting…' : 'Start Renewal'}
                  </button>
                )}
                {selected.status !== 'revoked' && (
                  <button type="button" className="comply-btn-secondary" style={{ color: 'var(--red)' }} disabled={revoking} onClick={() => handleRevoke(selected)}>
                    <Icon name="trash" size={13} color="var(--red)" /> {revoking ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Add Certificate page ─────────────────────────────────────────────────────

const ADD_CERT_STEPS = ['Details', 'Dates', 'Client'];
const AGENCY_OPTIONS: { code: string; name: string }[] = [
  { code: 'BRELA', name: 'Business Registration & Licensing Agency' },
  { code: 'TRA',   name: 'Tanzania Revenue Authority' },
  { code: 'NSSF',  name: 'National Social Security Fund' },
  { code: 'WCF',   name: 'Workers Compensation Fund' },
  { code: 'NHIF',  name: 'National Health Insurance Fund' },
  { code: 'OSHA',  name: 'Occupational Safety & Health Authority' },
  { code: 'TBS',   name: 'Tanzania Bureau of Standards' },
  { code: 'TFDA',  name: 'Tanzania Food & Drugs Authority' },
  { code: 'CMSA',  name: 'Capital Markets & Securities Authority' },
  { code: 'BOT',   name: 'Bank of Tanzania' },
];

export function AddCertificatePage() {
  const navigate = useNavigate();
  const { create } = useComplyCertificates();
  const [step, setStep] = useState(0);
  const [certNumber, setCertNumber] = useState('');
  const [name, setName] = useState('');
  const [agencyCode, setAgencyCode] = useState(AGENCY_OPTIONS[0].code);
  const [issuedDate, setIssuedDate] = useState<Date | undefined>(undefined);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [nonRenewalRisk, setNonRenewalRisk] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const agency = AGENCY_OPTIONS.find(a => a.code === agencyCode)!;
      await create({
        cert_number: certNumber.trim(), name: name.trim(), agency_code: agency.code, agency_name: agency.name,
        issued_date: issuedDate ? toDateOnlyString(issuedDate) : null,
        expiry_date: expiryDate ? toDateOnlyString(expiryDate) : null,
        customer_id: customerId,
        non_renewal_risk: nonRenewalRisk.trim() || null,
      });
      navigate('/complyos/vault');
    } catch (e: any) {
      setError(e.message || 'Could not create certificate.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ComplyWizardPage
      title="Add Certificate"
      steps={ADD_CERT_STEPS}
      step={step}
      backTo="/complyos/vault"
      busy={saving}
      onBack={() => setStep(s => s - 1)}
      nextDisabled={step === 0 && (!certNumber.trim() || !name.trim())}
      nextLabel={step === 2 ? (saving ? 'Creating…' : 'Create Certificate') : undefined}
      onNext={() => { if (step < 2) setStep(s => s + 1); else handleCreate(); }}
    >
      {step === 0 && (
        <>
          <WizardField label="Certificate / Reference Number">
            <input className="input-field" value={certNumber} onChange={e => setCertNumber(e.target.value)} placeholder="e.g. 137644169" autoFocus />
          </WizardField>
          <WizardField label="Certificate Name">
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Certificate of Incorporation" />
          </WizardField>
          <WizardField label="Agency">
            <Select value={agencyCode} onValueChange={setAgencyCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGENCY_OPTIONS.map(a => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
        </>
      )}
      {step === 1 && (
        <>
          <WizardField label="Date Issued (optional)">
            <DatePicker date={issuedDate} onChange={setIssuedDate} />
          </WizardField>
          <WizardField label="Expiry Date (optional)">
            <DatePicker date={expiryDate} onChange={setExpiryDate} />
          </WizardField>
          {expiryDate && (
            <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: 0 }}>
              With an expiry date set, ComplyOS will send a reminder 3 months before and again 1 month before it lapses.
            </p>
          )}
          <WizardField label="If not renewed in time (optional)">
            <textarea
              className="input-field" rows={3} value={nonRenewalRisk} onChange={e => setNonRenewalRisk(e.target.value)}
              placeholder="e.g. Operating without this licence is unlawful and can lead to a stop-work order…"
            />
          </WizardField>
        </>
      )}
      {step === 2 && (
        <>
          <ComplyCustomerPicker value={customerId} onChange={setCustomerId} />
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </>
      )}
    </ComplyWizardPage>
  );
}
