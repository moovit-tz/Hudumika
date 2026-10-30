import {Banner} from '../components/ui/alert.js';
import {SearchToolbar} from '../components/ui/filter-dropdown.js';
import { Input } from '../components/ui/input.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { Card,CardHeader,CardTitle,CardDescription,CardContent } from '../components/ui/card.js';
import { SectionLoading } from '../components/ui/spinner.js';
import React, { useEffect, useRef, useState } from 'react';
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
import './ComplyObligations.css';
import { showConfirm } from '../lib/confirm.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';

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
  const deepLinkedObligationRef = useRef<string | null>(new URLSearchParams(window.location.search).get('obligation'));
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [search,setSearch]=useState('');
  const [agencyFilter,setAgencyFilter]=useState('all');
  const { obligations, loading, error, refresh, update, remove } = useComplyObligations();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focusedObligationId, setFocusedObligationId] = useState<string | null>(null);

  useEffect(() => {
    const id = deepLinkedObligationRef.current;
    if (!id || loading || !obligations.some(obligation => obligation.id === id)) return;
    deepLinkedObligationRef.current = null;
    setFocusedObligationId(id);
    setFilter('all');
    setSearch('');setAgencyFilter('all');
    window.history.replaceState(null, '', window.location.pathname);
    window.setTimeout(() => document.getElementById(`obligation-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, [loading, obligations]);

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

  const query=search.trim().toLowerCase();
  const visible = obligations.filter(o=>(filter==='all'||o.status===filter)&&(agencyFilter==='all'||o.agency_code===agencyFilter)&&(!query||`${o.name} ${o.agency_code} ${o.obligation_code} ${o.frequency}`.toLowerCase().includes(query))).sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999')||a.name.localeCompare(b.name));
  const agencies=[...new Set(obligations.map(o=>o.agency_code))].sort();

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
    <div className="comply-page comply-obligations-page">
      <PageHeader crumbs={['ComplyOS','Obligations']} titlePlain="Compliance" titleEm="obligations" subtitle="Track recurring requirements, review deadlines and record fulfilment."
        actions={<div className="comply-action-row"><Button variant="outline" size="icon" disabled={loading} onClick={()=>void refresh()} aria-label="Refresh obligations"><Icon name="refresh" size={14}/></Button><Button size="sm" onClick={()=>navigate('/complyos/obligations/new')}><Icon name="plus" size={14}/>Add obligation</Button></div>}/>
      {error&&<Banner variant="error" action={<Button variant="outline" size="sm" onClick={()=>void refresh()}>Retry obligations</Button>}>Failed to load obligations: {error}</Banner>}
      <Card className="obligations-register">
        <CardHeader className="obligations-register-header"><div><CardTitle>Obligation register</CardTitle><CardDescription>{loading?'Loading your requirements…':`${obligations.length} recorded requirements · ${agencies.length} agencies`}</CardDescription></div><Button asChild variant="outline" size="sm"><Link to="/complyos/applications">Applications<Icon name="arrowRight" size={13}/></Link></Button></CardHeader>
        <CardContent className="obligations-register-body">
          <div className="obligations-status-strip" aria-label="Recorded obligation status">{FILTER_OPTS.map(f=><Button key={f.key} size="sm" variant={filter===f.key?'secondary':'ghost'} aria-pressed={filter===f.key} onClick={()=>setFilter(f.key)}>{f.label}<Badge variant={f.key==='expired'?'error':'gray'}>{loading||error?'—':f.key==='all'?obligations.length:stats[f.key]}</Badge></Button>)}</div>
          <div className="obligations-toolbar"><SearchToolbar search={search} onSearch={setSearch} placeholder="Search requirements or references…" activeFilterCount={0}/><Select value={agencyFilter} onValueChange={setAgencyFilter}><SelectTrigger aria-label="Filter obligations by agency"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All agencies</SelectItem>{agencies.map(agency=><SelectItem key={agency} value={agency}>{agency}</SelectItem>)}</SelectContent></Select></div>
          <div className="obligations-register-caption"><span>{loading?'Loading…':error?'Register unavailable':`${visible.length} matching requirements`}</span><span>Earliest due date first</span>{(query||filter!=='all'||agencyFilter!=='all')&&<Button variant="ghost" size="xs" onClick={()=>{setFilter('all');setSearch('');setAgencyFilter('all');}}>Clear filters</Button>}</div>
          {loading?<SectionLoading label="Loading obligations…"/>:!error&&Object.entries(groups).map(([agency,obls])=><section className="obligations-agency" key={agency} aria-label={`${agency} obligations`}>
            <div className="obligations-agency-heading"><Icon name={AGENCY_CLASS_ICON[obls[0].agency_class]??'building'} size={15}/><h2>{agency}</h2><span>{obls.length} requirements</span></div>
            <ul>{obls.map(o=><li id={`obligation-${o.id}`} key={o.id} aria-current={focusedObligationId===o.id?'true':undefined} className="obligations-record">
              <div className="obligations-record-main"><div className="obligations-record-title"><strong>{o.name}</strong>{!o.mandatory&&<Badge variant="gray">Optional</Badge>}</div><span>{o.obligation_code} · {o.frequency}{o.last_fulfilled_date?` · Last recorded ${new Date(o.last_fulfilled_date).toLocaleDateString('en-GB')}`:''}</span></div>
              <div className="obligations-record-deadline"><small>Next recorded deadline</small><strong>{o.due_date?new Date(o.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'No date set'}</strong></div>
              <Badge variant={complyBadgeVariant(`comply-badge ${statusBadgeClass(o.status)}`)}>{statusLabel(o.status)}</Badge>
              <div className="obligations-record-actions">{o.status!=='active'&&<Button variant="outline" size="sm" disabled={busyId!==null} onClick={()=>void handleFulfil(o)} aria-label={`Record fulfilment for ${o.name}`}><Icon name="check" size={13}/>{busyId===o.id?'Saving…':'Record fulfilled'}</Button>}<Tip label="Delete obligation"><Button variant="ghost" size="icon" disabled={busyId!==null} onClick={()=>void handleDelete(o)} aria-label={`Delete ${o.name}`}><Icon name="trash" size={14}/></Button></Tip></div>
            </li>)}</ul>
          </section>)}
          {!loading&&!error&&!visible.length&&<div className="obligations-empty"><Icon name="clipboardList" size={26}/><h3>{obligations.length?'No matching requirements':'Build your obligation register'}</h3><p>{obligations.length?'Try another search or clear the filters.':'Add your first requirement with its agency, frequency and next deadline.'}</p>{!obligations.length&&<Button asChild size="sm"><Link to="/complyos/obligations/new">Add first obligation</Link></Button>}</div>}
          <div className="obligations-register-footer"><Icon name="info" size={14}/><span>Status and fulfilment are workspace records. Recording fulfilment does not verify an authority submission or advance the next deadline.</span></div>
        </CardContent>
      </Card>
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
            <Input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Annual Company Return" autoFocus />
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
