import {SearchToolbar} from '../components/ui/filter-dropdown.js';
import {Banner} from '../components/ui/alert.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import { Textarea } from '../components/ui/textarea.js';
import { Card } from '../components/ui/card.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Input } from '../components/ui/input.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import React, { useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { useComplyLegalFirms, useComplyLegalEngagements } from '../hooks/useComply.js';
import type { CompLegalFirm, CompLegalEngagement } from '@hudumika/types';
import './ComplyOS.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { ComplyCustomerPicker } from './ComplyCustomerPicker.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar, CompanyAvatar } from '../components/PersonAvatar.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';

const SPECIALTIES_FILTER = [
  'All', 'Corporate Registration', 'Tax Compliance', 'Employment Law',
  'Import/Export', 'Financial Licences', 'Product Certification',
];

const ENGAGEMENT_STEPS: { key: string; label: string }[] = [
  { key: 'requested',  label: 'Requested'  },
  { key: 'quoted',     label: 'Quoted'     },
  { key: 'instructed', label: 'Instructed' },
  { key: 'in_progress',label: 'In Progress'},
  { key: 'completed',  label: 'Completed'  },
];

function stepIndex(status: string): number {
  const idx = ENGAGEMENT_STEPS.findIndex(s => s.key === status);
  return idx === -1 ? (status === 'milestone_due' ? 3 : 0) : idx;
}

function EngagementStepper({ status }: { status: string }) {
  if (status === 'cancelled') return <Badge variant={complyBadgeVariant("comply-badge comply-badge--draft")}>Cancelled</Badge>;
  const current = stepIndex(status);
  return (
    <div className="wf-stepper">
      {ENGAGEMENT_STEPS.map((step, idx) => (
        <React.Fragment key={step.key}>
          {idx > 0 && <div className={`wf-conn${idx <= current ? ' wf-conn--done' : ''}`} />}
          <div title={step.label} className={['wf-dot', idx < current ? ' wf-dot--done' : '', idx === current ? ' wf-dot--active' : ''].join('')} />
        </React.Fragment>
      ))}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Icon key={i} name="star" size={12} color={i < filled ? 'var(--gold)' : 'var(--border2)'} />
      ))}
    </span>
  );
}

// ── Engagement detail drawer ─────────────────────────────────────────────────

function EngagementDrawer({ engagement, onClose, onSendMessage, onSetMilestone, onCancel }: {
  engagement: CompLegalEngagement;
  onClose: () => void;
  onSendMessage: (id: string, body: string) => Promise<void>;
  onSetMilestone: (engagementId: string, milestoneId: string, status: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await onSendMessage(engagement.id, message.trim());
      setMessage('');
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (!(await showConfirm(`Cancel the engagement with ${engagement.firm_name}?`, { confirmLabel: 'Cancel Engagement' }))) return;
    setCancelling(true);
    try {
      await onCancel(engagement.id);
      onClose();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Sheet open={true} onOpenChange={open => { if (!open) (onClose)(); }}>
      <SheetContent aria-describedby={undefined} className="comply-detail-sheet w-full sm:max-w-xl flex flex-col p-0 gap-0">
        <div className="comply-panel-hdr">
          <div>
            <SheetTitle className="comply-panel-hdr-title">{engagement.firm_name}</SheetTitle>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{engagement.engagement_type}{engagement.agency_code ? ` · ${engagement.agency_code}` : ''}{engagement.customer_name ? ` · ${engagement.customer_name}` : ''}</div>
          </div>

        </div>
        <div className="comply-panel-body">
          <EngagementStepper status={engagement.status} />

          <div>
            <div className="comply-section-title">Brief</div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>{engagement.brief}</p>
          </div>

          {engagement.milestones.length > 0 && (
            <div>
              <div className="comply-section-title">Milestones</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {engagement.milestones.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{m.description}</div>
                      {m.amount && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{m.amount}</div>}
                    </div>
                    <Select value={m.status} onValueChange={(v) => onSetMilestone(engagement.id, m.id, v)}>
                      <SelectTrigger className="input-field" style={{ width: 120, fontSize: 12 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="released">Released</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="comply-section-title">Shared Workspace</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 10 }}>
              {engagement.messages.map(m => (
                <div key={m.id || m.created_at} style={{ alignSelf: m.sender_type === 'tenant' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.sender_type === 'tenant' ? 'var(--comply-l)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 3 }}>{m.sender_type === 'tenant' ? 'You' : engagement.firm_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>{m.body}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input className="input-field" style={{ flex: 1 }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Send a message to the firm…" onKeyDown={e => { if (e.key === 'Enter') handleSend(); }} />
              <Tip label="Send message">
                <span>
                  <Button type="button" size="icon" disabled={sending} onClick={handleSend} aria-label="Send message">
                    <Icon name="send" size={13} />
                  </Button>
                </span>
              </Tip>
            </div>
          </div>

          {engagement.status !== 'completed' && engagement.status !== 'cancelled' && (
            <Button type="button" variant="outline" size="sm" style={{alignSelf: 'flex-start', color: 'var(--red)', borderColor: 'var(--red)'}} disabled={cancelling} onClick={handleCancel}>
              <Icon name="x" size={13} color="var(--red)" /> {cancelling ? 'Cancelling…' : 'Cancel Engagement'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ComplyLegal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { firms, loading: firmsLoading } = useComplyLegalFirms();
  const { engagements, sendMessage, setMilestoneStatus, setStatus } = useComplyLegalEngagements();

  const [search, setSearch]       = useState('');
  const [specialty, setSpecialty] = useState('All');
  const [selected, setSelected]   = useState<CompLegalFirm | null>(null);
  const [openEngagement, setOpenEngagement] = useState<CompLegalEngagement | null>(null);
  const [tab, setTab] = useState<'firms' | 'engagements'>(engagements.length > 0 ? 'engagements' : 'firms');

  const prefillAgency = searchParams.get('agency');
  const prefillApplication = searchParams.get('application');

  function engageUrl(firmId: string) {
    const qs = new URLSearchParams();
    if (prefillAgency) qs.set('agency', prefillAgency);
    if (prefillApplication) qs.set('application', prefillApplication);
    const q = qs.toString();
    return `/complyos/legal/engage/${firmId}${q ? '?' + q : ''}`;
  }

  const visible = firms.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || (f.location ?? '').toLowerCase().includes(search.toLowerCase());
    const matchSpec   = specialty === 'All' || f.specialties.includes(specialty);
    return matchSearch && matchSpec;
  });

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Legal firms']}
        titlePlain="Legal"
        titleEm="firms"
        subtitle="Engage vetted legal firms to handle your compliance applications"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} >
      <TabsList style={{ marginBottom: 18 }}>
        <TabsTrigger value="firms">Browse Firms</TabsTrigger>
        <TabsTrigger value="engagements">
          My Engagements
          {engagements.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--badge-radius)', lineHeight: 1.5, background: tab === 'engagements' ? 'var(--teal-l)' : 'var(--bg)', color: tab === 'engagements' ? 'var(--teal)' : 'var(--ink3)' }}>
              {engagements.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      </Tabs>

      {tab === 'firms' && (
        <>
          {prefillAgency && (
            <Banner variant="info" icon={false} className="" style={{ marginBottom: 16 }}>
              <Icon name="briefcase" size={16} />
              <span>Showing firms that can help with {prefillAgency}
                {prefillApplication ? ' for your application' : ''} — pick a firm below and click Engage.</span>
            </Banner>
          )}

          <div className="comply-list-toolbar">
          <Tabs value={specialty} onValueChange={setSpecialty}>
          <TabsList >
            {SPECIALTIES_FILTER.map(s => (
              <TabsTrigger key={s} value={s}>{s}</TabsTrigger>
            ))}
          </TabsList>
          </Tabs>
            <div className="comply-list-search"><SearchToolbar search={search} onSearch={setSearch} placeholder="Search firms or location…" activeFilterCount={0} /></div>
          </div>

          <div className="comply-firm-grid">
            {firmsLoading && <div className="comply-empty"><SectionLoading label="Loading firms…" /></div>}
            {!firmsLoading && visible.map(firm => (
              <Card key={firm.id} className="comply-firm-card">
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <CompanyAvatar name={firm.name} size={44} shape="square" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="comply-firm-name">{firm.name}</div>
                    <div className="comply-firm-location">
                      <Icon name="mapPin" size={11} /> {firm.location} · Est. {firm.founded_year}
                    </div>
                    <div className="comply-firm-meta">
                      <div className="comply-firm-rating"><Stars rating={firm.rating} /> <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>({firm.review_count})</span></div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>{firm.description}</div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Specialties</div>
                  <div className="comply-firm-tags">
                    {firm.specialties.map(s => <Badge key={s} variant={complyBadgeVariant("comply-firm-tag")}>{s}</Badge>)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Handles</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {firm.agencies_handled.map(a => <Badge key={a} variant={complyBadgeVariant("comply-badge comply-badge--review")}>{a}</Badge>)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{firm.starting_price_label}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button type="button" variant="outline" size="xs" onClick={() => setSelected(firm)}>Profile</Button>
                    <Button type="button" size="xs" onClick={() => navigate(engageUrl(firm.id))}>Engage</Button>
                  </div>
                </div>
              </Card>
            ))}
            {!firmsLoading && visible.length === 0 && (
              <div className="comply-empty" style={{ gridColumn: '1/-1' }}>No firms match your filters.</div>
            )}
          </div>
        </>
      )}

      {tab === 'engagements' && (
        <Card className="comply-card">
          <div className="comply-card-body">
            {engagements.length === 0 ? (
              <div className="comply-empty">No engagements yet — browse firms and click Engage to get started.</div>
            ) : (
              <Table className="comply-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Firm</TableHead><TableHead>Type</TableHead><TableHead>Agency</TableHead><TableHead>Client</TableHead><TableHead>Progress</TableHead><TableHead>Created</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {engagements.map(e => (
                    <TableRow tabIndex={0} onKeyDown={event => {if(event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')){event.preventDefault();event.currentTarget.click();}}} key={e.id} className="comply-tr-click" onClick={() => setOpenEngagement(e)}>
                      <TableCell data-label="Firm" className="comply-table-name">{e.firm_name}</TableCell>
                      <TableCell data-label="Type">{e.engagement_type}</TableCell>
                      <TableCell data-label="Agency">{e.agency_code ?? '—'}</TableCell>
                      <TableCell data-label="Client" className="comply-td-muted">
                        {e.customer_name ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <PersonAvatar userId={e.customer_id ?? undefined} kind="customers" name={e.customer_name} size={20} />
                            {e.customer_name}
                          </span>
                        ) : 'This business'}
                      </TableCell>
                      <TableCell data-label="Progress"><EngagementStepper status={e.status} /></TableCell>
                      <TableCell data-label="Created" className="comply-td-muted">{new Date(e.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell data-label="Actions" onClick={ev => ev.stopPropagation()}>
                        <Button variant="outline" size="sm" type="button"  onClick={() => setOpenEngagement(e)} >Open</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* Profile overlay */}
      <Sheet open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <SheetContent aria-describedby={undefined} className="comply-detail-sheet w-full sm:max-w-xl flex flex-col p-0 gap-0">
          {selected && (
            <>
              <div style={{ height: 6, background: selected.color }} />
              <SheetHeader className="comply-detail-header">
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <CompanyAvatar name={selected.name} size={48} shape="square" />
                  <div>
                    <SheetTitle style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>{selected.name}</SheetTitle>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{selected.location}</div>
                  </div>
                </div>
              </SheetHeader>
              <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6, margin: 0 }}>{selected.description}</p>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Specialties</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selected.specialties.map(s => <Badge key={s} variant={complyBadgeVariant("comply-firm-tag")}>{s}</Badge>)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Agencies Handled</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selected.agencies_handled.map(a => <Badge key={a} variant={complyBadgeVariant("comply-badge comply-badge--review")}>{a}</Badge>)}
                  </div>
                </div>
                <div className="comply-grid-2" style={{ gap: 14, marginBottom: 0 }}>
                  {[
                    { label: 'Rating', val: `${selected.rating} / 5` },
                    { label: 'Reviews', val: `${selected.review_count} clients` },
                    { label: 'Founded', val: String(selected.founded_year ?? '—') },
                    { label: 'Starting Price', val: selected.starting_price_label ?? '—' },
                  ].map(m => (
                    <div key={m.label}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{m.val}</div>
                    </div>
                  ))}
                </div>
                <Button variant="default" size="sm" type="button"  style={{alignSelf: 'flex-start'}} onClick={() => { const id = selected.id; setSelected(null); navigate(engageUrl(id)); }} >
                  <Icon name="briefcase" size={13} /> Engage this Firm
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {openEngagement && (
        <EngagementDrawer
          engagement={engagements.find(e => e.id === openEngagement.id) ?? openEngagement}
          onClose={() => setOpenEngagement(null)}
          onSendMessage={sendMessage}
          onSetMilestone={setMilestoneStatus}
          onCancel={(id) => setStatus(id, 'cancelled')}
        />
      )}
    </div>
  );
}

// ── Engage Firm page ─────────────────────────────────────────────────────────

const ENGAGE_WIZARD_STEPS = ['Engagement', 'Client & Brief', 'Review'];

export function EngageFirmPage() {
  const { firmId } = useParams<{ firmId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { firms, loading: firmsLoading } = useComplyLegalFirms();
  const { create } = useComplyLegalEngagements();

  const firm = firms.find(f => f.id === firmId);
  const prefillAgency = searchParams.get('agency');
  const prefillApplication = searchParams.get('application') ?? undefined;

  const [step, setStep] = useState(0);
  const [engagementType, setEngagementType] = useState('One-time Application Filing');
  const [agencyCode, setAgencyCode] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const effectiveAgency = agencyCode || prefillAgency || firm?.agencies_handled[0] || '';

  async function handleSend() {
    if (!firm) return;
    if (!brief.trim()) { setError('Please describe what you need help with.'); setStep(1); return; }
    setSending(true);
    setError('');
    try {
      await create({
        firm_id: firm.id, engagement_type: engagementType, agency_code: effectiveAgency || undefined,
        application_id: prefillApplication, brief: brief.trim(), customer_id: customerId ?? undefined,
      });
      navigate('/complyos/legal');
    } catch (e: any) {
      setError(e.message || 'Could not send brief.');
    } finally {
      setSending(false);
    }
  }

  if (firmsLoading) {
    return <div className="comply-page"><PageHeader crumbs={['ComplyOS', 'Legal']} titlePlain="Legal" titleEm="engagement" /><SectionLoading label="Loading firm…" /></div>;
  }
  if (!firm) {
    return (
      <div className="comply-page">
        <PageHeader crumbs={['ComplyOS', 'Legal']} titlePlain="Legal" titleEm="engagement" subtitle="Select an available legal firm to start an engagement." />
        <Banner variant="error" icon={false} className="">Firm not found.</Banner>
        <Button variant="outline" size="sm" type="button"  style={{marginTop: 12}} onClick={() => navigate('/complyos/legal')} >
          <Icon name="chevronLeft" size={13} /> Back to Legal Marketplace
        </Button>
      </div>
    );
  }

  return (
    <ComplyWizardPage
      title={`Engage ${firm.name}`}
      subtitle="Brief the firm on what you need help with"
      steps={ENGAGE_WIZARD_STEPS}
      step={step}
      backTo="/complyos/legal"
      busy={sending}
      onBack={() => setStep(s => s - 1)}
      nextDisabled={step === 1 && !brief.trim()}
      nextLabel={step === 2 ? (sending ? 'Sending…' : 'Send Brief') : undefined}
      onNext={() => { if (step < 2) setStep(s => s + 1); else handleSend(); }}
    >
      {step === 0 && (
        <>
          <WizardField label="Type of Engagement">
            <Select value={engagementType} onValueChange={setEngagementType}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="One-time Application Filing">One-time Application Filing</SelectItem>
                <SelectItem value="Annual Compliance Retainer">Annual Compliance Retainer</SelectItem>
                <SelectItem value="Legal Consultation (1 hr)">Legal Consultation (1 hr)</SelectItem>
                <SelectItem value="Document Preparation">Document Preparation</SelectItem>
                <SelectItem value="Appeal / Dispute Representation">Appeal / Dispute Representation</SelectItem>
              </SelectContent>
            </Select>
          </WizardField>
          <WizardField label="Agency">
            <Select value={effectiveAgency} onValueChange={setAgencyCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {firm.agencies_handled.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
        </>
      )}

      {step === 1 && (
        <>
          <ComplyCustomerPicker value={customerId} onChange={setCustomerId} />
          <WizardField label="Brief">
            <Textarea className="input-field" rows={3} placeholder="Describe what you need help with and any specific requirements…" value={brief} onChange={e => setBrief(e.target.value)} autoFocus />
          </WizardField>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="comply-meta-grid">
            {[
              { label: 'Firm', val: firm.name },
              { label: 'Type', val: engagementType },
              { label: 'Agency', val: effectiveAgency || '—' },
              { label: 'Client / Entity', val: customerId ? 'Selected client' : 'This business' },
            ].map(m => (
              <div key={m.label}>
                <div className="comply-meta-key">{m.label}</div>
                <div className="comply-meta-val">{m.val}</div>
              </div>
            ))}
          </div>
          <Banner variant="info" icon={false} className=""><strong>Brief: </strong>{brief}</Banner>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
          <div style={{ background: 'var(--comply-l)', border: '1px solid var(--comply-edge)', borderRadius: 'var(--r)', padding: '11px 14px', fontSize: 12.5, color: 'var(--ink2)' }}>
            <strong style={{ color: 'var(--comply)' }}>Milestone tracked</strong> — Payment milestones are tracked in-app as pending/paid/released; ComplyOS does not process payment directly.
          </div>
        </div>
      )}
    </ComplyWizardPage>
  );
}
