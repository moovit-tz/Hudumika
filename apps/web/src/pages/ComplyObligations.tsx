import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useComplyObligations, useComplyAgencyDirectory } from '../hooks/useComply.js';
import type { CompObligation } from '@hudumika/types';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { ComplyCustomerPicker } from './ComplyCustomerPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import './ComplyOS.css';
import { showConfirm } from '../lib/confirm.js';

type Filter = 'all' | 'active' | 'pending' | 'expired' | 'not-started';

const FILTER_OPTS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'active',      label: 'Active'      },
  { key: 'pending',     label: 'Pending'     },
  { key: 'expired',     label: 'Lapsed'      },
  { key: 'not-started', label: 'Not Started' },
];

const AGENCY_CLASS_ICON: Record<string, IconName> = {
  gov: 'building', tax: 'barChart', social: 'users', reg: 'scale', fin: 'trendingUp',
};

function statusBadgeClass(status: string) {
  if (status === 'not-started') return 'comply-badge--draft';
  if (status === 'pending')     return 'comply-badge--pending';
  return `comply-badge--${status}`;
}

function statusLabel(status: string) {
  if (status === 'not-started') return 'Not Started';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ComplyObligations() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const { obligations, loading, error, refresh, update, remove } = useComplyObligations();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleFulfil(o: CompObligation) {
    setBusyId(o.id);
    try {
      await update(o.id, { status: 'active', last_fulfilled_date: toDateOnlyString(new Date()) });
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(o: CompObligation) {
    if (!(await showConfirm(`Delete obligation "${o.name}"?`, { confirmLabel: 'Delete' }))) return;
    setBusyId(o.id);
    try {
      await remove(o.id);
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'all' ? obligations : obligations.filter(o => o.status === filter);

  const stats = {
    active:         obligations.filter(o => o.status === 'active').length,
    pending:        obligations.filter(o => o.status === 'pending').length,
    expired:        obligations.filter(o => o.status === 'expired').length,
    'not-started':  obligations.filter(o => o.status === 'not-started').length,
  };

  // Group visible obligations by agency
  const groups: Record<string, CompObligation[]> = {};
  visible.forEach(o => {
    if (!groups[o.agency_code]) groups[o.agency_code] = [];
    groups[o.agency_code].push(o);
  });

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Compliance Obligations']} 
        titlePlain="Compliance"
        titleEm="obligations"
        subtitle={<> {obligations.filter(o => o.mandatory).length} mandatory ·{' '}
            {obligations.filter(o => !o.mandatory).length} optional across {Object.keys(groups).length} agencies </>}
        actions={
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={refresh} title="Refresh obligations">
            <Icon name="refresh" size={13} />
          </button>
          <button type="button" className="comply-btn-secondary" onClick={() => navigate('/complyos/obligations/new')}>
            <Icon name="plus" size={14} /> Add Obligation
          </button>
          <Link to="/complyos/applications" className="comply-btn-primary">
            <Icon name="plus" size={14} /> New Application
          </Link>
        </div>
        }
      />

      {error && <div className="comply-note comply-note--error">Failed to load obligations: {error}</div>}

      {/* Summary KPIs */}
      <div className="comply-kpis comply-kpis--4col">
        {[
          { val: String(stats.active),          label: 'Active & Current', kind: 'up'     as const },
          { val: String(stats.pending),         label: 'Pending Renewal',  kind: 'warn'   as const },
          { val: String(stats.expired),         label: 'Lapsed / Overdue', kind: 'danger' as const },
          { val: String(stats['not-started']),  label: 'Not Yet Started',  kind: 'up'     as const },
        ].map(k => (
          <div key={k.label} className="comply-kpi">
            <div className={`comply-kpi-val${k.kind === 'danger' && Number(k.val) > 0 ? ' comply-kpi-delta--danger' : k.kind === 'warn' && Number(k.val) > 0 ? ' comply-kpi-delta--warn' : ''}`}>{k.val}</div>
            <div className="comply-kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="comply-filters">
        {FILTER_OPTS.map(f => (
          <button key={f.key} type="button" className={`comply-filter-btn${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key !== 'all' && ` (${stats[f.key as keyof typeof stats] ?? 0})`}
          </button>
        ))}
      </div>

      {loading && <div className="comply-empty-hint">Loading obligations…</div>}

      {/* Grouped list */}
      {!loading && Object.entries(groups).map(([agency, obls]) => (
        <div key={agency} className="comply-card comply-mb-16">
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">
              <span className="comply-card-title-row">
                <Icon name={AGENCY_CLASS_ICON[obls[0].agency_class] ?? 'building'} size={15} color="var(--comply)" />
                {agency}
              </span>
            </h3>
            <span className="comply-oblig-count">
              {obls.filter(o => o.status === 'active').length}/{obls.length} active
            </span>
          </div>
          <div>
            {obls.map(o => (
              <div key={o.id} className="comply-oblig-row">
                <div className={`comply-oblig-icon comply-agency--${o.agency_class}`}>
                  <Icon name={AGENCY_CLASS_ICON[o.agency_class] ?? 'fileText'} size={16} />
                </div>
                <div className="comply-oblig-flex-body">
                  <div className="comply-oblig-name">
                    {o.name}
                    {!o.mandatory && <span className="comply-optional-badge">Optional</span>}
                  </div>
                  <div className="comply-oblig-agency">
                    {o.frequency}{o.due_date ? ` · Due: ${new Date(o.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                  </div>
                </div>
                <div className="comply-oblig-actions-row">
                  <span className={`comply-badge ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span>
                  {(o.status === 'not-started' || o.status === 'expired' || o.status === 'pending') && (
                    <>
                      <Link to="/complyos/applications" className="comply-btn-primary comply-btn-sm">
                        Apply
                      </Link>
                      <button type="button" className="comply-btn-secondary comply-btn-sm" disabled={busyId === o.id} onClick={() => handleFulfil(o)} title="Mark as fulfilled">
                        <Icon name="check" size={12} />
                      </button>
                    </>
                  )}
                  <button type="button" title="Delete obligation" disabled={busyId === o.id} onClick={() => handleDelete(o)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && visible.length === 0 && (
        <div className="comply-card">
          <div className="comply-empty-hint">No obligations match this filter.</div>
        </div>
      )}

    </div>
  );
}

// ── Add Obligation page ──────────────────────────────────────────────────────

const ADD_OBLIG_STEPS = ['Obligation', 'Schedule'];

export function AddObligationPage() {
  const navigate = useNavigate();
  const { create } = useComplyObligations();
  const { agencies } = useComplyAgencyDirectory();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [agencyCode, setAgencyCode] = useState('');
  const [frequency, setFrequency] = useState('Annual');
  const [mandatory, setMandatory] = useState(true);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveAgency = agencyCode || agencies[0]?.code || '';

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const code = `OB-${effectiveAgency}-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)}-${Date.now().toString(36).toUpperCase()}`;
      await create({
        obligation_code: code, agency_code: effectiveAgency, name: name.trim(), frequency, mandatory,
        due_date: dueDate ? toDateOnlyString(dueDate) : null, customer_id: customerId,
      });
      navigate('/complyos/obligations');
    } catch (e: any) {
      setError(e.message || 'Could not create obligation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ComplyWizardPage
      title="Add Obligation"
      steps={ADD_OBLIG_STEPS}
      step={step}
      backTo="/complyos/obligations"
      busy={saving}
      onBack={() => setStep(0)}
      nextDisabled={step === 0 && !name.trim()}
      nextLabel={step === 1 ? (saving ? 'Creating…' : 'Create Obligation') : undefined}
      onNext={() => { if (step === 0) setStep(1); else handleCreate(); }}
    >
      {step === 0 && (
        <>
          <WizardField label="Obligation Name">
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Annual Company Return" autoFocus />
          </WizardField>
          <WizardField label="Agency">
            <Select value={effectiveAgency} onValueChange={setAgencyCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {agencies.map(a => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
        </>
      )}
      {step === 1 && (
        <>
          <WizardField label="Frequency">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Once">Once</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Semi-annual">Semi-annual</SelectItem>
                <SelectItem value="Annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </WizardField>
          <WizardField label="Due Date (optional)">
            <DatePicker date={dueDate} onChange={setDueDate} />
          </WizardField>
          <WizardField label="Mandatory">
            <Select value={mandatory ? 'yes' : 'no'} onValueChange={v => setMandatory(v === 'yes')}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Mandatory</SelectItem>
                <SelectItem value="no">Optional</SelectItem>
              </SelectContent>
            </Select>
          </WizardField>
          <ComplyCustomerPicker value={customerId} onChange={setCustomerId} />
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </>
      )}
    </ComplyWizardPage>
  );
}
