import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyApplications, useComplyCertificates } from '../hooks/useComply.js';
import type { CompApplication } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import './ComplyOS.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { ComplyCustomerPicker } from './ComplyCustomerPicker.js';

const NEW_APP_STEPS = ['Document', 'Details', 'Review'];

const DOC_TYPE_LABEL: Record<string, string> = {
  BRELA_CERT: 'Certificate of Incorporation', TIN_CERT: 'TIN Registration',
  TAX_CLEARANCE: 'Tax Compliance Certificate', NSSF_CERT: 'NSSF Employer Registration',
  WCF_CERT: 'WCF Employer Registration', NHIF_CERT: 'NHIF Employer Registration', OTHER: '',
};

const AGENCY_OPTIONS = [
  'BRELA — Business Registration & Licensing',
  'TRA — Tanzania Revenue Authority',
  'NSSF — National Social Security Fund',
  'WCF — Workers Compensation Fund',
  'TFDA — Tanzania Food & Drugs Authority',
  'OSHA — Occupational Safety & Health Authority',
  'CMSA — Capital Markets & Securities Authority',
  'BOT — Bank of Tanzania',
];

type AppStatus = 'all' | 'draft' | 'submitted' | 'review' | 'issued' | 'rejected';

const AGENCY_CLASS: Record<string, string> = {
  BRELA: 'gov', TRA: 'tax', NSSF: 'social', WCF: 'social',
  NHIF: 'social', OSHA: 'reg', TBS: 'reg', TFDA: 'reg',
  CMSA: 'fin', BOT: 'fin', NEMC: 'reg', LGA: 'gov',
};

const FILTERS: { key: AppStatus; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'draft',     label: 'Draft'     },
  { key: 'submitted', label: 'Submitted' },
  { key: 'review',    label: 'In Review' },
  { key: 'issued',    label: 'Issued'    },
  { key: 'rejected',  label: 'Rejected'  },
];

function statusLabel(s: string) {
  if (s === 'review') return 'In Review';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeline(app: CompApplication) {
  const submitted = app.submitted_at ? formatDate(app.submitted_at) : '—';
  const updated   = formatDate(app.updated_at);
  return [
    { step: 'Application created',   date: formatDate(app.created_at),  done: true },
    { step: 'Documents submitted',   date: submitted,                    done: app.status !== 'draft' },
    { step: 'Agency review started', date: ['review', 'issued', 'rejected'].includes(app.status) ? updated : '—', done: ['review', 'issued', 'rejected'].includes(app.status) },
    { step: 'Decision received',     date: ['issued', 'rejected'].includes(app.status) ? updated : '—', done: ['issued', 'rejected'].includes(app.status) },
    { step: 'Certificate issued',    date: app.status === 'issued' ? updated : '—', done: app.status === 'issued' },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComplyApplications() {
  const navigate = useNavigate();
  const { apps, loading, error, refresh, update, remove } = useComplyApplications();
  const { certs } = useComplyCertificates();
  const [filter,   setFilter]   = useState<AppStatus>('all');
  const [selected, setSelected] = useState<CompApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const visible = filter === 'all'
    ? apps
    : apps.filter(a => a.status === filter || (filter === 'submitted' && a.status === 'pending'));

  const pipelineSteps = [
    { label: 'Draft',         count: apps.filter(a => a.status === 'draft').length     },
    { label: 'Submitted',     count: apps.filter(a => a.status === 'submitted').length },
    { label: 'Agency Review', count: apps.filter(a => a.status === 'review').length    },
    { label: 'Decision',      count: apps.filter(a => ['issued', 'rejected'].includes(a.status)).length },
    { label: 'Issued',        count: apps.filter(a => a.status === 'issued').length    },
  ];

  async function handleSubmit(app: CompApplication) {
    try {
      setSubmitting(true);
      await update(app.id, { status: 'submitted' });
      setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownloadPackage(app: CompApplication) {
    const linkedCert = app.linked_cert_id ? certs.find(c => c.id === app.linked_cert_id) : null;
    if (linkedCert?.document_url) {
      window.open(linkedCert.document_url, '_blank', 'noopener');
    } else {
      alert('No document package is attached to this application yet — upload documents from the Vault once they\'re available.');
    }
  }

  function handleEngageLegalFirm(app: CompApplication) {
    navigate(`/complyos/legal?agency=${encodeURIComponent(app.agency_code)}&application=${encodeURIComponent(app.id)}`);
  }

  async function handleDelete(app: CompApplication) {
    if (!window.confirm(`Delete draft application ${app.app_number}? This can't be undone.`)) return;
    try {
      setDeleting(true);
      await remove(app.id);
      setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="comply-page">
      <div className="comply-page-hdr">
        <div>
          <h1 className="comply-page-title">Applications</h1>
          <p className="comply-page-sub">Track submissions across all government agencies</p>
        </div>
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={refresh} title="Refresh applications">
            <Icon name="refresh" size={13} />
          </button>
          <button type="button" className="comply-btn-primary" onClick={() => navigate('/complyos/applications/new')}>
            <Icon name="plus" size={14} /> New Application
          </button>
        </div>
      </div>

      {error && <div className="comply-note comply-note--error">Failed to load applications: {error}</div>}

      {/* Pipeline */}
      <div className="comply-pipeline">
        {pipelineSteps.map((s, i) => (
          <div key={s.label} className={`comply-pipeline-step${i === 2 && s.count > 0 ? ' comply-pipeline-step--active' : ''}`}>
            <div className="comply-pipeline-num">{s.count}</div>
            <div className="comply-pipeline-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="comply-filters">
        {FILTERS.map(f => (
          <button key={f.key} type="button" className={`comply-filter-btn${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="comply-card">
        <div className="comply-card-body">
          <table className="comply-table">
            <thead>
              <tr>
                <th>Application ID</th>
                <th>Certification</th>
                <th>Agency</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Last Update</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="comply-empty-hint">Loading applications…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={7} className="comply-empty-hint">No applications found.</td></tr>
              )}
              {visible.map(app => (
                <tr key={app.id} className="comply-tr-click" onClick={() => setSelected(app)}>
                  <td className="comply-td-mono">{app.app_number}</td>
                  <td>
                    <div className="comply-table-name">{app.cert_type}</div>
                    {app.notes && <div className="comply-table-sub">{app.notes}</div>}
                  </td>
                  <td><span className={`comply-agency comply-agency--${AGENCY_CLASS[app.agency_code] ?? 'gov'}`}>{app.agency_code}</span></td>
                  <td><span className={`comply-badge comply-badge--${app.status}`}>{statusLabel(app.status)}</span></td>
                  <td className="comply-td-muted">{formatDate(app.submitted_at)}</td>
                  <td className="comply-td-muted">{formatDate(app.updated_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="comply-td-actions">
                      <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => setSelected(app)}>
                        View
                      </button>
                      {app.status === 'rejected' && (
                        <button type="button" className="comply-btn-secondary comply-btn-sm">Appeal</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="comply-overlay comply-overlay--end" onClick={() => setSelected(null)}>
          <div className="comply-drawer" onClick={e => e.stopPropagation()}>
            <div className="comply-panel-hdr">
              <div>
                <div className="comply-panel-hdr-title">{selected.cert_type}</div>
                <span className={`comply-badge comply-badge--${selected.status}`}>{statusLabel(selected.status)}</span>
              </div>
              <button type="button" title="Close" className="comply-close-btn" onClick={() => setSelected(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="comply-panel-body">
              <div className="comply-meta-grid">
                {[
                  { label: 'Application ID', val: selected.app_number,            mono: true  },
                  { label: 'Agency',          val: selected.agency_code,           mono: false },
                  { label: 'Client / Entity', val: selected.customer_name ?? 'This business', mono: false },
                  { label: 'Submitted',       val: formatDate(selected.submitted_at), mono: false },
                  { label: 'Last Updated',    val: formatDate(selected.updated_at),  mono: false },
                  ...(selected.agency_ref ? [{ label: 'Agency Ref.', val: selected.agency_ref, mono: true }] : []),
                ].map(m => (
                  <div key={m.label}>
                    <div className="comply-meta-key">{m.label}</div>
                    <div className={`comply-meta-val${m.mono ? ' comply-meta-val--mono' : ''}`}>{m.val}</div>
                  </div>
                ))}
              </div>

              {selected.notes && (
                <div className="comply-note">
                  <strong>Note: </strong>{selected.notes}
                </div>
              )}

              {Array.isArray((selected.metadata as any)?.requirements) && (selected.metadata as any).requirements.length > 0 && (
                <div>
                  <div className="comply-section-title">Requirements Checklist</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {((selected.metadata as any).requirements as string[]).map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <Icon name="fileText" size={13} color="var(--comply)" />
                        <span style={{ fontSize: 13, color: 'var(--ink)' }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="comply-section-title">Application Timeline</div>
                <div className="comply-timeline">
                  {timeline(selected).map((t, i) => (
                    <div key={i} className="comply-tl-item">
                      <div className={`comply-tl-dot${t.done ? ' comply-tl-dot--done' : ''}`}>
                        {t.done && <Icon name="check" size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <div>
                        <div className={`comply-tl-text${t.done ? ' comply-tl-text--done' : ''}`}>{t.step}</div>
                        <div className="comply-tl-date">{t.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="comply-action-row">
                {selected.status === 'draft' && (
                  <button
                    type="button"
                    className="comply-btn-primary"
                    disabled={submitting}
                    onClick={() => handleSubmit(selected)}
                  >
                    <Icon name="send" size={13} />
                    {submitting ? 'Submitting…' : 'Submit Application'}
                  </button>
                )}
                {selected.status === 'rejected' && (
                  <button type="button" className="comply-btn-primary">
                    <Icon name="refresh" size={13} /> Start Appeal
                  </button>
                )}
                <button type="button" className="comply-btn-secondary" onClick={() => handleDownloadPackage(selected)}>
                  <Icon name="download" size={13} /> Download Package
                </button>
                <button type="button" className="comply-btn-secondary" onClick={() => handleEngageLegalFirm(selected)}>
                  <Icon name="briefcase" size={13} /> Engage Legal Firm
                </button>
                {selected.status === 'draft' && (
                  <button type="button" className="comply-btn-secondary" style={{ color: 'var(--red)' }} disabled={deleting} onClick={() => handleDelete(selected)}>
                    <Icon name="trash" size={13} color="var(--red)" /> {deleting ? 'Deleting…' : 'Delete Draft'}
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

// ── New Application page ─────────────────────────────────────────────────────

export function NewApplicationPage() {
  const navigate = useNavigate();
  const { create } = useComplyApplications();
  const [wizardStep, setWizardStep] = useState(0);
  const [creating, setCreating] = useState(false);

  const [agency, setAgency] = useState(AGENCY_OPTIONS[0]);
  const [notes, setNotes] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [certTypeValue, setCertTypeValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  async function handleCreate() {
    const agencyCode = agency.split(' ')[0] ?? '';
    const certType   = certTypeValue.trim();
    if (!agencyCode || !certType) return;
    try {
      setCreating(true);
      await create({ cert_type: certType, agency_code: agencyCode, notes: notes.trim() || undefined, customer_id: customerId });
      navigate('/complyos/applications');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleScanDocument(file: File) {
    if (!file.type.startsWith('image/')) {
      setScanError('Only image files can be scanned right now (PDF support coming later).');
      return;
    }
    setScanning(true);
    setScanError(null);
    setScanNote(null);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image_base64 = dataUrl.split(',')[1];
      const res = await apiFetch('/v1/comply/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64, media_type: file.type }),
      });
      const r = res.result;
      if (r?.agency_code) {
        const match = AGENCY_OPTIONS.find(a => a.startsWith(r.agency_code));
        if (match) setAgency(match);
      }
      const label = DOC_TYPE_LABEL[r?.doc_type] || '';
      setCertTypeValue(label || r?.entity_name || '');
      setScanNote(res.simulated
        ? 'Document scanned (simulated — configure a Gemini API key in Platform Settings to enable live extraction).'
        : `Document scanned — detected ${label || 'a compliance document'}. Review the fields below before creating.`);
    } catch (err: any) {
      setScanError(err?.message || 'Document scan failed. You can still fill the details in manually.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <ComplyWizardPage
      title="New Compliance Application"
      steps={NEW_APP_STEPS}
      step={wizardStep}
      backTo="/complyos/applications"
      onBack={() => setWizardStep(s => s - 1)}
      busy={creating}
      nextDisabled={wizardStep === 1 && (!agency || !certTypeValue.trim())}
      nextLabel={wizardStep === NEW_APP_STEPS.length - 1 ? (creating ? 'Creating…' : 'Create Application') : undefined}
      onNext={() => {
        if (wizardStep < NEW_APP_STEPS.length - 1) setWizardStep(s => s + 1);
        else handleCreate();
      }}
    >
      {wizardStep === 0 && (
        <WizardField label="Scan a Document (optional)">
          <label htmlFor="app-scan" className="comply-btn-secondary comply-btn-sm" style={{ cursor: scanning ? 'default' : 'pointer', display: 'inline-flex' }}>
            <Icon name="upload" size={13} />
            {scanning ? 'Scanning…' : 'Upload certificate to auto-fill'}
            <input
              id="app-scan" type="file" accept="image/*" style={{ display: 'none' }} disabled={scanning}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleScanDocument(f); e.target.value = ''; }}
            />
          </label>
          {scanNote && <div className="comply-note comply-note--success" style={{ marginTop: 8 }}>{scanNote}</div>}
          {scanError && <div className="comply-note comply-note--error" style={{ marginTop: 8 }}>{scanError}</div>}
          <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
            Optional — scanning a certificate auto-fills the agency and certification type on the next step. You can also skip this and enter the details manually.
          </p>
        </WizardField>
      )}

      {wizardStep === 1 && (
        <>
          <WizardField label="Government Agency">
            <Select value={agency} onValueChange={setAgency}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGENCY_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
          <WizardField label="Certification Type">
            <input className="input-field" placeholder="e.g. Annual Business Licence, VAT Registration…" value={certTypeValue} onChange={e => setCertTypeValue(e.target.value)} />
          </WizardField>
          <ComplyCustomerPicker value={customerId} onChange={setCustomerId} />
          <WizardField label="Notes (optional)">
            <textarea className="input-field" rows={3} placeholder="Any context or special instructions for this application…" value={notes} onChange={e => setNotes(e.target.value)} />
          </WizardField>
        </>
      )}

      {wizardStep === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="comply-meta-grid">
            {[
              { label: 'Agency', val: agency.split(' — ')[0] },
              { label: 'Certification Type', val: certTypeValue || '—' },
              { label: 'Client / Entity', val: customerId ? 'Selected client' : 'This business' },
            ].map(m => (
              <div key={m.label}>
                <div className="comply-meta-key">{m.label}</div>
                <div className="comply-meta-val">{m.val}</div>
              </div>
            ))}
          </div>
          {notes && (
            <div className="comply-note"><strong>Note: </strong>{notes}</div>
          )}
          <p style={{ fontSize: 12, color: 'var(--ink3)' }}>Review the details above, then click Create Application. You can submit it to the agency afterwards from the application's detail view.</p>
        </div>
      )}
    </ComplyWizardPage>
  );
}
