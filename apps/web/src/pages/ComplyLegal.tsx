import React, { useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyLegalFirms, useComplyLegalEngagements } from '../hooks/useComply.js';
import type { CompLegalFirm, CompLegalEngagement } from '@hudumika/types';
import './ComplyOS.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { ComplyCustomerPicker } from './ComplyCustomerPicker.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar, CompanyAvatar } from '../components/PersonAvatar.js';

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
  if (status === 'cancelled') return <span className="comply-badge comply-badge--draft">Cancelled</span>;
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
    <div className="comply-overlay comply-overlay--end" onClick={onClose}>
      <div className="comply-drawer" onClick={e => e.stopPropagation()}>
        <div className="comply-panel-hdr">
          <div>
            <div className="comply-panel-hdr-title">{engagement.firm_name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{engagement.engagement_type}{engagement.agency_code ? ` · ${engagement.agency_code}` : ''}{engagement.customer_name ? ` · ${engagement.customer_name}` : ''}</div>
          </div>
          <button type="button" title="Close" className="comply-close-btn" onClick={onClose}><Icon name="x" size={18} /></button>
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
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
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
                <div key={m.id || m.created_at} style={{ alignSelf: m.sender_type === 'tenant' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.sender_type === 'tenant' ? 'var(--comply-l)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 3 }}>{m.sender_type === 'tenant' ? 'You' : engagement.firm_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>{m.body}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input-field" style={{ flex: 1 }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Send a message to the firm…" onKeyDown={e => { if (e.key === 'Enter') handleSend(); }} />
              <button type="button" className="comply-btn-primary comply-btn-sm" disabled={sending} onClick={handleSend}>
                <Icon name="send" size={13} />
              </button>
            </div>
          </div>

          {engagement.status !== 'completed' && engagement.status !== 'cancelled' && (
            <button type="button" className="comply-btn-secondary" style={{ alignSelf: 'flex-start', color: 'var(--red)' }} disabled={cancelling} onClick={handleCancel}>
              <Icon name="x" size={13} color="var(--red)" /> {cancelling ? 'Cancelling…' : 'Cancel Engagement'}
            </button>
          )}
        </div>
      </div>
    </div>
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
        crumbs={['ComplyOS', 'Legal Firm Marketplace']}
        titlePlain="Legal Firm"
        titleEm="marketplace"
        subtitle="Engage vetted legal firms to handle your compliance applications"
      />

      <div className="comply-filters" style={{ marginBottom: 18 }}>
        <button type="button" className={`comply-filter-btn${tab === 'firms' ? ' active' : ''}`} onClick={() => setTab('firms')}>Browse Firms</button>
        <button type="button" className={`comply-filter-btn${tab === 'engagements' ? ' active' : ''}`} onClick={() => setTab('engagements')}>
          My Engagements {engagements.length > 0 && `(${engagements.length})`}
        </button>
      </div>

      {tab === 'firms' && (
        <>
          {prefillAgency && (
            <div className="comply-note" style={{ marginBottom: 16 }}>
              <Icon name="briefcase" size={16} />
              <span>Showing firms that can help with {prefillAgency}
                {prefillApplication ? ' for your application' : ''} — pick a firm below and click Engage.</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }}>
                <Icon name="search" size={14} />
              </span>
              <input
                type="search"
                placeholder="Search firms or location…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div className="comply-filters">
            {SPECIALTIES_FILTER.map(s => (
              <button key={s} type="button" className={`comply-filter-btn${specialty === s ? ' active' : ''}`} onClick={() => setSpecialty(s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="comply-firm-grid">
            {firmsLoading && <div className="comply-empty">Loading firms…</div>}
            {!firmsLoading && visible.map(firm => (
              <div key={firm.id} className="comply-firm-card">
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
                    {firm.specialties.map(s => <span key={s} className="comply-firm-tag">{s}</span>)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Handles</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {firm.agencies_handled.map(a => <span key={a} className="comply-badge comply-badge--review">{a}</span>)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{firm.starting_price_label}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => setSelected(firm)}>Profile</button>
                    <button type="button" className="comply-btn-primary comply-btn-sm" onClick={() => navigate(engageUrl(firm.id))}>Engage</button>
                  </div>
                </div>
              </div>
            ))}
            {!firmsLoading && visible.length === 0 && (
              <div className="comply-empty" style={{ gridColumn: '1/-1' }}>No firms match your filters.</div>
            )}
          </div>
        </>
      )}

      {tab === 'engagements' && (
        <div className="comply-card">
          <div className="comply-card-body">
            {engagements.length === 0 ? (
              <div className="comply-empty">No engagements yet — browse firms and click Engage to get started.</div>
            ) : (
              <table className="comply-table">
                <thead>
                  <tr>
                    <th>Firm</th><th>Type</th><th>Agency</th><th>Client</th><th>Progress</th><th>Created</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map(e => (
                    <tr key={e.id} className="comply-tr-click" onClick={() => setOpenEngagement(e)}>
                      <td className="comply-table-name">{e.firm_name}</td>
                      <td>{e.engagement_type}</td>
                      <td>{e.agency_code ?? '—'}</td>
                      <td className="comply-td-muted">
                        {e.customer_name ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <PersonAvatar userId={e.customer_id ?? undefined} kind="customers" name={e.customer_name} size={20} />
                            {e.customer_name}
                          </span>
                        ) : 'This business'}
                      </td>
                      <td><EngagementStepper status={e.status} /></td>
                      <td className="comply-td-muted">{new Date(e.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td onClick={ev => ev.stopPropagation()}>
                        <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => setOpenEngagement(e)}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Profile overlay */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div
            style={{ width: 480, maxWidth: '100%', background: 'var(--white)', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: 6, background: selected.color }} />
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <CompanyAvatar name={selected.name} size={48} shape="square" />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{selected.location}</div>
                </div>
              </div>
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} onClick={() => setSelected(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6, margin: 0 }}>{selected.description}</p>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Specialties</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.specialties.map(s => <span key={s} className="comply-firm-tag">{s}</span>)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Agencies Handled</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.agencies_handled.map(a => <span key={a} className="comply-badge comply-badge--review">{a}</span>)}
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
              <button type="button" className="comply-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => { const id = selected.id; setSelected(null); navigate(engageUrl(id)); }}>
                <Icon name="briefcase" size={13} /> Engage this Firm
              </button>
            </div>
          </div>
        </div>
      )}

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
    return <div className="comply-page"><div className="comply-empty-hint">Loading firm…</div></div>;
  }
  if (!firm) {
    return (
      <div className="comply-page">
        <div className="comply-note comply-note--error">Firm not found.</div>
        <button type="button" className="comply-btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate('/complyos/legal')}>
          <Icon name="chevronLeft" size={13} /> Back to Legal Marketplace
        </button>
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
            <textarea className="input-field" rows={3} placeholder="Describe what you need help with and any specific requirements…" value={brief} onChange={e => setBrief(e.target.value)} autoFocus />
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
          <div className="comply-note"><strong>Brief: </strong>{brief}</div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
          <div style={{ background: 'var(--comply-l)', border: '1px solid var(--comply-edge)', borderRadius: 9, padding: '11px 14px', fontSize: 12.5, color: 'var(--ink2)' }}>
            <strong style={{ color: 'var(--comply)' }}>Milestone tracked</strong> — Payment milestones are tracked in-app as pending/paid/released; ComplyOS does not process payment directly.
          </div>
        </div>
      )}
    </ComplyWizardPage>
  );
}
