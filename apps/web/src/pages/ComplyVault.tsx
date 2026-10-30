import {Banner} from '../components/ui/alert.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import {Sheet, SheetContent, SheetTitle} from '../components/ui/sheet.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { Card } from '../components/ui/card.js';
import { SectionLoading } from '../components/ui/spinner.js';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
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
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';

type Filter = 'current' | 'all' | 'active' | 'expiring' | 'expired' | 'unknown';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLeft(expiryDate: string | null): number {
  if (!expiryDate) return 9999;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
}

function expiryLabel(c: CompCertificate): string {
  if (!c.expiry_date) return 'Unknown validity';
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

  const [params,setParams]=useSearchParams();
  const [linkError,setLinkError]=useState<string|null>(null);
  const requestedStatus=params.get('status');
  useEffect(()=>{
    if(requestedStatus && ['all','current','active','expiring','expired','unknown'].includes(requestedStatus))setFilter(requestedStatus as Filter);
  },[requestedStatus]);
  useEffect(()=>{
    const id=params.get('certificate');
    if(!id||loading||error)return;
    const record=certs.find(c=>c.id===id);
    if(record){setSelected(record);setFilter('all');setLinkError(null);}
    else setLinkError('This certificate was not found or is not accessible in your workspace.');
    const next=new URLSearchParams(params);next.delete('certificate');setParams(next,{replace:true});
  },[params,loading,error,certs,setParams]);

  const visible = filter === 'all' ? certs : certs.filter(c => filter === 'current' ? ['active','expiring'].includes(c.status) : c.status === filter);

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
          <Tip label="Refresh certificates"><Button type="button" variant="outline" size="icon" onClick={refresh} aria-label="Refresh certificates">
            <Icon name="refresh" size={13} />
          </Button></Tip>
          <Button type="button" variant="outline" size="sm" onClick={handleExportAll} disabled={visible.length === 0}>
            <Icon name="download" size={13} /> Export All
          </Button>
          <Button type="button" size="sm" onClick={() => navigate('/complyos/vault/new')}>
            <Icon name="plus" size={14} /> Add Certificate
          </Button>
        </div>
        }
      />

      {linkError && <Banner variant="error">{linkError}</Banner>}
      {error && <Banner variant="error" icon={false} className="">Failed to load certificates: {error}</Banner>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} >
        <TabsList>
          {(['all', 'current', 'active', 'expiring', 'expired', 'unknown'] as Filter[]).map(f => {
            const isActive = filter === f;
            return (
              <TabsTrigger key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--badge-radius)', lineHeight: 1.5, background: isActive ? 'var(--teal-l)' : 'var(--bg)', color: isActive ? 'var(--teal)' : 'var(--ink3)' }}>
                    {certs.filter(c => f === 'current' ? ['active','expiring'].includes(c.status) : c.status === f).length}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        </Tabs>
        <div className="comply-view-toggle">
          <Tip label="Grid view"><Button variant="ghost" size="icon" type="button" aria-label="Grid view" className={`comply-view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')} >
            <Icon name="grid" size={15} />
          </Button></Tip>
          <Tip label="List view"><Button variant="ghost" size="icon" type="button" aria-label="List view" className={`comply-view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} >
            <Icon name="list" size={15} />
          </Button></Tip>
        </div>
      </div>

      {loading && <div className="comply-empty-hint"><SectionLoading label="Loading certificates…" /></div>}

      {!loading && visible.length === 0 && (
        <div className="comply-empty-hint">No certificates in this view.</div>
      )}

      {view === 'grid' ? (
        <div className="comply-cert-grid">
          {visible.map(cert => (
            <Card key={cert.id} className="comply-cert-card" onClick={() => setSelected(cert)}>
              <div className="comply-cert-card-body">
                <div className="comply-cert-card-hdr-row">
                  <Badge variant={complyBadgeVariant(`comply-agency comply-agency--${cert.agency_class}`)}>{cert.agency_code}</Badge>
                  <Badge variant={complyBadgeVariant(`comply-badge comply-badge--${cert.status === 'expiring' ? 'pending' : cert.status}`)}>
                    {cert.status === 'expiring' ? 'Expiring' : cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                  </Badge>
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
                <Button
                  type="button"
                  title="View certificate"
                  variant="outline"
                  size="xs"
                  onClick={e => { e.stopPropagation(); setSelected(cert); }}
                >
                  <Icon name="eye" size={14} /> View
                </Button>
                {cert.document_url && (
                  <Button
                    type="button"
                    title="Download certificate"
                    variant="outline"
                    size="xs"
                    onClick={e => { e.stopPropagation(); handleDownload(cert); }}
                  >
                    <Icon name="download" size={14} /> Download
                  </Button>
                )}
                {(cert.status === 'expiring' || cert.status === 'expired') && (
                  <Button
                    type="button"
                    title="Start renewal workflow"
                    className="comply-cert-renew"
                    size="xs"
                    disabled={renewing === cert.id}
                    onClick={e => handleRenew(e, cert.id)}
                  >
                    {renewing === cert.id ? '…' : 'Renew'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="comply-card">
          <div className="comply-card-body">
            <Table className="comply-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate</TableHead><TableHead>Agency</TableHead><TableHead>Cert #</TableHead><TableHead>Issued</TableHead><TableHead>Validity</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(cert => (
                  <TableRow tabIndex={0} onKeyDown={event => {if(event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')){event.preventDefault();event.currentTarget.click();}}} key={cert.id} className="comply-tr-click" onClick={() => setSelected(cert)}>
                    <TableCell data-label="Certificate" className="comply-table-name">{cert.name}</TableCell>
                    <TableCell data-label="Agency"><Badge variant={complyBadgeVariant(`comply-agency comply-agency--${cert.agency_class}`)}>{cert.agency_code}</Badge></TableCell>
                    <TableCell data-label="Cert #" className="comply-td-mono">{cert.cert_number}</TableCell>
                    <TableCell data-label="Issued" className="comply-td-muted">{issuedLabel(cert)}</TableCell>
                    <TableCell data-label="Validity" className={expiryValClass(cert)}>{expiryLabel(cert)}</TableCell>
                    <TableCell data-label="Status">
                      <Badge variant={complyBadgeVariant(`comply-badge comply-badge--${cert.status === 'expiring' ? 'pending' : cert.status}`)}>
                        {cert.status === 'expiring' ? 'Expiring' : cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Actions" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Button type="button" variant="outline" size="xs" onClick={() => setSelected(cert)}>
                          <Icon name="eye" size={14} /> View
                        </Button>
                        {(cert.status === 'expiring' || cert.status === 'expired') && (
                          <Button
                            type="button"
                            title="Start renewal workflow"
                            className="comply-cert-renew"
                            size="xs"
                            disabled={renewing === cert.id}
                            onClick={e => handleRenew(e, cert.id)}
                          >
                            {renewing === cert.id ? '…' : 'Renew'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {selected && (
        <Sheet open={true} onOpenChange={open => { if (!open) (() => setSelected(null))(); }}>
          <SheetContent aria-describedby={undefined} className="comply-detail-sheet w-full sm:max-w-xl flex flex-col p-0 gap-0">
            <div className="comply-panel-hdr">
              <div>
                <SheetTitle className="comply-panel-hdr-title">{selected.name}</SheetTitle>
                <Badge variant={complyBadgeVariant(`comply-agency comply-agency--${selected.agency_class}`)}>{selected.agency_code}</Badge>
              </div>

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
                  ...(selected.metadata?.source==='tausi_reviewed_import' ? [
                    {label:'Import source',val:selected.metadata.capture_method==='tab_capture'?'Tausi · reviewed tab capture':'Tausi · reviewed document',mono:false},
                    {label:'Reported licence cost',val:typeof selected.metadata.reported_cost==='number'?new Intl.NumberFormat('en-GB',{style:'currency',currency:'TZS'}).format(selected.metadata.reported_cost):'Not recorded',mono:false},
                    {label:'Authority verification',val:'Not independently verified',mono:false},
                  ]:[]),
                  ...(selected.last_synced_at ? [{ label: 'Last Synced', val: new Date(selected.last_synced_at).toLocaleString(), mono: false }] : []),
                ].map(m => (
                  <div key={m.label}>
                    <div className="comply-meta-key">{m.label}</div>
                    <div className={`comply-meta-val${m.mono ? ' comply-meta-val--mono' : ''}`}>{m.val}</div>
                  </div>
                ))}
              </div>
              {selected.non_renewal_risk && (
                <Banner variant="warning" icon={false} className="">
                  <strong>If not renewed: </strong>{selected.non_renewal_risk}
                </Banner>
              )}
              {shareStatus && (
                <Banner variant="success" icon={false} className="">{shareStatus}</Banner>
              )}
              <div className="comply-action-row">
                {selected.document_url && (
                  <Button asChild size="sm"><a href={selected.document_url} target="_blank" rel="noreferrer">
                    <Icon name="download" size={13} /> Download PDF
                  </a></Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => handleShare(selected)}>
                  <Icon name="copy" size={13} /> Share
                </Button>
                {(selected.status === 'expiring' || selected.status === 'expired') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{color: 'var(--comply)', borderColor: 'var(--comply-edge)'}}
                    disabled={renewing === selected.id}
                    onClick={e => handleRenew(e, selected.id)}
                  >
                    <Icon name="refresh" size={13} />
                    {renewing === selected.id ? 'Starting…' : 'Start Renewal'}
                  </Button>
                )}
                {selected.status !== 'revoked' && (
                  <Button type="button" variant="outline" size="sm" style={{color: 'var(--red)', borderColor: 'var(--red)'}} disabled={revoking} onClick={() => handleRevoke(selected)}>
                    <Icon name="trash" size={13} color="var(--red)" /> {revoking ? 'Revoking…' : 'Revoke'}
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
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
            <Input className="input-field" value={certNumber} onChange={e => setCertNumber(e.target.value)} placeholder="e.g. 137644169" autoFocus />
          </WizardField>
          <WizardField label="Certificate Name">
            <Input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Certificate of Incorporation" />
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
            <Textarea
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
