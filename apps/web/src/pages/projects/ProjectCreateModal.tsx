import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { useAuth } from '../../hooks/useAuth.js';
import { apiFetch } from '../../lib/api.js';
import { rowsOf } from './projectData.js';
import type { ProjectDocumentBrief } from '@hudumika/types';
import './ProjectCreatePage.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id: string) => void;
  initialProject?: Record<string, any>;
  standalone?: boolean;
  documentBrief?: ProjectDocumentBrief;
}

const industries = [
  'construction',
  'engineering',
  'real_estate',
  'manufacturing',
  'mining',
  'energy',
  'agriculture',
  'transport',
  'public_sector',
  'ngo',
  'telecom',
  'it_software',
  'aerospace',
  'pharma',
  'professional_services',
  'general',
];

const DELIVERY_TYPES: { value: string; label: string }[] = [
  { value: 'internal', label: 'Internal Operations' },
  { value: 'customer_delivery', label: 'Customer Delivery' },
  { value: 'capital_expenditure', label: 'Capital Expenditure (CapEx)' },
  { value: 'r_and_d', label: 'Research & Development' },
  { value: 'maintenance', label: 'Operations & Maintenance' },
];

const CURRENCIES = ['TZS', 'KES', 'USD', 'EUR', 'GBP', 'UGX'];

const QUICK_TAGS = ['priority-1', 'turnkey', 'tender', 'phase-1', 'capex', 'compliance', 'epc', 'milestone-driven'];

interface ProjectBlueprint {
  id: string;
  label: string;
  industry: string;
  classification: string;
  tags: string;
  scopeHint: string;
}

const PROJECT_BLUEPRINTS: ProjectBlueprint[] = [
  {
    id: 'civil',
    label: 'Civil & Infrastructure',
    industry: 'construction',
    classification: 'customer_delivery',
    tags: 'civil, epc, milestone-driven',
    scopeHint: 'Site mobilization, civil engineering works, structural erection, quality inspections, and commissioning handover.',
  },
  {
    id: 'turnkey',
    label: 'Client Turnkey Delivery',
    industry: 'engineering',
    classification: 'customer_delivery',
    tags: 'turnkey, priority-1, client-sla',
    scopeHint: 'End-to-end client solution design, procurement, implementation, testing, and stakeholder sign-off.',
  },
  {
    id: 'digital',
    label: 'IT & Digital Rollout',
    industry: 'it_software',
    classification: 'internal',
    tags: 'digital, phase-1, agile',
    scopeHint: 'System architecture, platform configuration, data migration, security compliance review, and user onboarding.',
  },
  {
    id: 'energy',
    label: 'Energy & Utility CapEx',
    industry: 'energy',
    classification: 'capital_expenditure',
    tags: 'capex, energy, compliance',
    scopeHint: 'Power & utility asset installation, grid integration, regulatory safety certification, and operational testing.',
  },
];

function formatLabel(raw: string): string {
  return raw.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return `${currency} 0`;
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export const ProjectCreateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProject,
  standalone = false,
  documentBrief,
}) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('general');
  const [classification, setClassification] = useState('internal');
  const [currency, setCurrency] = useState('TZS');
  const [budget, setBudget] = useState('');
  const [value, setValue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');

  const [portfolio, setPortfolio] = useState('');
  const [program, setProgram] = useState('');
  const [customer, setCustomer] = useState('');
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<'all' | 1 | 2 | 3>('all');
  const appliedDraft = useRef('');

  useEffect(() => {
    if (!documentBrief || initialProject) { appliedDraft.current = ''; return; }
    const draftKey = JSON.stringify([documentBrief.name, documentBrief.source_ids]);
    if (appliedDraft.current === draftKey) return;
    appliedDraft.current = draftKey;
    setName(documentBrief.name);
    setDescription(documentBrief.description);
    setIndustry(documentBrief.industry);
    setClassification(documentBrief.project_type);
    setCurrency(documentBrief.currency || 'TZS');
    setBudget(documentBrief.baseline_budget == null ? '' : String(documentBrief.baseline_budget));
    setValue(documentBrief.contract_value == null ? '' : String(documentBrief.contract_value));
    setStart(documentBrief.start_date || '');
    setEnd(documentBrief.target_date || '');
    setLocation(documentBrief.location_address || '');
    setTags(documentBrief.tags.join(', '));
  }, [documentBrief, initialProject]);

  useEffect(() => {
    if (!initialProject) return;
    const p = initialProject;
    setName(p.name || '');
    setDescription(p.description || '');
    setIndustry(p.industry || 'general');
    setClassification(p.project_type || 'internal');
    setCurrency(p.currency || 'TZS');
    setBudget(String(p.baseline_budget ?? 0));
    setValue(String(p.contract_value ?? 0));
    setStart(p.start_date?.slice(0, 10) || '');
    setEnd(p.target_date?.slice(0, 10) || '');
    setLocation(p.location_address || '');
    setTags((p.custom_fields?.tags || []).join(', '));
    setPortfolio(p.portfolio_id || '');
    setProgram(p.program_id || '');
    setCustomer(p.customer_id || '');
  }, [initialProject]);

  useEffect(() => {
    if (!isOpen) return;
    Promise.allSettled([
      apiFetch('/v1/project-os/portfolios'),
      apiFetch('/v1/project-os/programs'),
      apiFetch('/v1/customers'),
    ]).then(results => {
      if (results[0].status === 'fulfilled') setPortfolios(rowsOf(results[0].value));
      if (results[1].status === 'fulfilled') setPrograms(rowsOf(results[1].value));
      if (results[2].status === 'fulfilled') setCustomers(rowsOf(results[2].value));
    });
  }, [isOpen]);

  const parsedTags = useMemo(
    () => tags.split(',').map(t => t.trim()).filter(Boolean),
    [tags]
  );

  const toggleQuickTag = (tag: string) => {
    const exists = parsedTags.some(t => t.toLowerCase() === tag.toLowerCase());
    const next = exists
      ? parsedTags.filter(t => t.toLowerCase() !== tag.toLowerCase())
      : [...parsedTags, tag];
    setTags(next.join(', '));
  };

  const applyBlueprint = (bp: ProjectBlueprint) => {
    setActiveBlueprint(bp.id);
    setIndustry(bp.industry);
    setClassification(bp.classification);
    if (!tags.trim()) setTags(bp.tags);
    if (!description.trim()) setDescription(bp.scopeHint);
  };

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === customer),
    [customers, customer]
  );

  const selectedPortfolio = useMemo(
    () => portfolios.find(p => p.id === portfolio),
    [portfolios, portfolio]
  );

  const selectedProgram = useMemo(
    () => programs.find(p => p.id === program),
    [programs, program]
  );

  const numBudget = Number(budget) || 0;
  const numValue = Number(value) || 0;
  const projectedMargin = numValue - numBudget;
  const marginPct = numValue > 0 ? Math.round((projectedMargin / numValue) * 100) : null;

  const durationDays = useMemo(() => {
    if (!start || !end || end < start) return null;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return null;
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
  }, [start, end]);

  const step1Done = Boolean(name.trim() && industry && classification);
  const step2Done = Boolean(portfolio || program || customer || classification === 'internal');
  const step3Done = Boolean((numBudget > 0 || numValue > 0) || (start && end));

  const readinessScore = useMemo(() => {
    let pts = 0;
    if (name.trim()) pts += 30;
    if (description.trim()) pts += 15;
    if (industry && classification) pts += 15;
    if (portfolio || customer || classification === 'internal') pts += 15;
    if (numBudget > 0 || numValue > 0) pts += 15;
    if (start && end && end >= start) pts += 10;
    return Math.min(100, pts);
  }, [name, description, industry, classification, portfolio, customer, numBudget, numValue, start, end]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (start && end && end < start) {
      setError('Target date must be on or after start date');
      return;
    }
    setSaving(true);
    try {
      const id = initialProject?.id || crypto.randomUUID();
      const result = await apiFetch(initialProject ? `/v1/tasks/projects/${id}` : '/v1/tasks/projects', {
        method: initialProject ? 'PATCH' : 'POST',
        body: JSON.stringify({
          id,
          name: name.trim(),
          description,
          ...(documentBrief ? { document_brief: {
            ...documentBrief,
            ...Object.fromEntries(['scope', 'deliverables', 'requirements', 'risks', 'missing_information'].map(key => [key, documentBrief[key as 'scope'].map(item => item.trim()).filter(Boolean)])),
          } } : {}),
          industry,
          project_type: classification,
          currency,
          baseline_budget: Number(budget) || 0,
          contract_value: Number(value) || 0,
          startDate: start || null,
          targetDate: end || null,
          location_address: location,
          portfolio_id: portfolio || null,
          program_id: program || null,
          customerId: customer || null,
          tags: parsedTags,
        }),
      });
      onSuccess(result.data?.id || id);
    } catch (err: any) {
      setError(err.message || 'Unable to create project');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const showSection1 = stepFilter === 'all' || stepFilter === 1;
  const showSection2 = stepFilter === 'all' || stepFilter === 2;
  const showSection3 = stepFilter === 'all' || stepFilter === 3;

  const formSections = (
    <div className="pcp-main-col">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Quick Industry Blueprints (only when creating a new project) */}
      {!initialProject && (
        <div className="pcp-blueprints-bar" role="region" aria-label="Quick industry templates">
          <span className="pcp-blueprints-label">
            <Icon name="wand" size={13} color="var(--teal)" /> Quick Blueprint:
          </span>
          {PROJECT_BLUEPRINTS.map(bp => (
            <button
              key={bp.id}
              type="button"
              className={`pcp-blueprint-pill${activeBlueprint === bp.id ? ' is-active' : ''}`}
              onClick={() => applyBlueprint(bp)}
            >
              {bp.label}
            </button>
          ))}
        </div>
      )}

      {/* Stepper Filter Ribbon */}
      {standalone && (
        <div className="pcp-stepper-bar">
          <div className="pcp-stepper-steps" role="tablist" aria-label="Project setup sections">
            <button
              type="button"
              role="tab"
              aria-selected={stepFilter === 'all'}
              className={`pcp-step-pill${stepFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setStepFilter('all')}
            >
              <Icon name="layoutGrid" size={13} />
              <span>All Sections</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={stepFilter === 1}
              className={`pcp-step-pill${stepFilter === 1 ? ' is-active' : ''}${step1Done ? ' is-done' : ''}`}
              onClick={() => setStepFilter(1)}
            >
              <span className="pcp-step-num">{step1Done ? <Icon name="check" size={11} /> : '1'}</span>
              <span>Identity & Scope</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={stepFilter === 2}
              className={`pcp-step-pill${stepFilter === 2 ? ' is-active' : ''}${step2Done ? ' is-done' : ''}`}
              onClick={() => setStepFilter(2)}
            >
              <span className="pcp-step-num">{step2Done ? <Icon name="check" size={11} /> : '2'}</span>
              <span>Strategic Alignment</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={stepFilter === 3}
              className={`pcp-step-pill${stepFilter === 3 ? ' is-active' : ''}${step3Done ? ' is-done' : ''}`}
              onClick={() => setStepFilter(3)}
            >
              <span className="pcp-step-num">{step3Done ? <Icon name="check" size={11} /> : '3'}</span>
              <span>Financials & Schedule</span>
            </button>
          </div>
          <Badge variant={step1Done ? 'brand' : 'gray'}>
            {readinessScore}% Configured
          </Badge>
        </div>
      )}

      {/* 1. Identity & Classification */}
      {showSection1 && (
        <section className="pcp-section-card">
          <div className="pcp-section-header">
            <div className="pcp-section-header-left">
              <FeaturedIcon variant="brand" size="md">
                <Icon name="briefcase" size={18} />
              </FeaturedIcon>
              <div>
                <h2 className="pcp-section-title">1. Project Identity & Classification</h2>
                <p className="pcp-section-subtitle">Core project title, industry vertical, delivery model, and executive scope.</p>
              </div>
            </div>
            <Badge variant={name.trim() ? 'success' : 'brand'}>
              {name.trim() ? 'Ready' : 'Required'}
            </Badge>
          </div>

          <div className="pcp-section-body">
            <div className="pcp-field-grid">
              <div className="pcp-field pcp-field--full">
                <div className="pcp-label-row">
                  <label htmlFor="project-name" className="pcp-label">
                    Project Name <span className="pcp-label-req">*</span>
                  </label>
                  <span className="pcp-field-hint">{name.length}/200</span>
                </div>
                <Input
                  id="project-name"
                  required
                  maxLength={200}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Serengeti Phase 2 Expansion"
                />
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Industry Sector</label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map(ind => (
                      <SelectItem key={ind} value={ind}>
                        {formatLabel(ind)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Delivery Classification</label>
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Reporting Currency</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(code => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pcp-field">
              <div className="pcp-label-row">
                <label htmlFor="project-scope" className="pcp-label">
                  Scope & Objectives
                </label>
                <span className="pcp-field-hint">{description.length}/5000 characters</span>
              </div>
              <Textarea
                id="project-scope"
                maxLength={5000}
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Define project deliverables, scope boundaries, and core objectives…"
              />
            </div>

            {stepFilter === 1 && (
              <div className="pcp-step-nav">
                <Button type="button" size="sm" onClick={() => setStepFilter(2)}>
                  Next: Strategic Alignment <Icon name="chevronRight" size={14} />
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. Strategic Hierarchy & Client */}
      {showSection2 && (
        <section className="pcp-section-card">
          <div className="pcp-section-header">
            <div className="pcp-section-header-left">
              <FeaturedIcon variant="info" size="md">
                <Icon name="layers" size={18} />
              </FeaturedIcon>
              <div>
                <h2 className="pcp-section-title">2. Strategic Alignment & Client</h2>
                <p className="pcp-section-subtitle">Link this project to an executive portfolio, program umbrella, or external client account.</p>
              </div>
            </div>
            <Badge variant={portfolio || program || customer ? 'brand' : 'gray'}>
              {portfolio || program || customer ? 'Linked' : 'Optional'}
            </Badge>
          </div>

          <div className="pcp-section-body">
            <div className="pcp-field-grid">
              <div className="pcp-field">
                <label className="pcp-label">Portfolio (Optional)</label>
                <Combobox
                  value={portfolio}
                  onChange={id => {
                    setPortfolio(id);
                    setProgram('');
                  }}
                  options={[{ value: '', label: 'No Portfolio (Standalone)' }, ...portfolios.map(row => ({ value: row.id, label: row.name }))]}
                  placeholder="Select portfolio"
                />
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Program (Optional)</label>
                <Combobox
                  value={program}
                  onChange={setProgram}
                  options={[{ value: '', label: 'No Program' }, ...programs.filter(row => !portfolio || row.portfolio_id === portfolio).map(row => ({ value: row.id, label: row.name }))]}
                  placeholder="Select program"
                />
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Customer / Client (Optional)</label>
                <Combobox
                  value={customer}
                  onChange={setCustomer}
                  options={[{ value: '', label: 'Internal / No Customer' }, ...customers.map(row => ({ value: row.id, label: row.name }))]}
                  placeholder="Select customer"
                />
              </div>
            </div>

            {selectedCustomer && (
              <div className="pcp-context-strip">
                <div className="pcp-context-strip-info">
                  <PersonAvatar
                    kind="customers"
                    userId={selectedCustomer.id}
                    name={selectedCustomer.name || 'Client'}
                    size={30}
                    hideStatus
                  />
                  <div className="pcp-context-strip-info-body">
                    <div className="pcp-context-strip-name">
                      {selectedCustomer.name}
                    </div>
                    <div className="pcp-context-strip-sub">
                      Linked Customer Account {selectedCustomer.email ? `· ${selectedCustomer.email}` : ''}
                    </div>
                  </div>
                </div>
                <Badge variant="brand">Client Linked</Badge>
              </div>
            )}

            {stepFilter === 2 && (
              <div className="pcp-step-nav--between">
                <Button type="button" variant="outline" size="sm" onClick={() => setStepFilter(1)}>
                  <Icon name="chevronLeft" size={14} /> Previous
                </Button>
                <Button type="button" size="sm" onClick={() => setStepFilter(3)}>
                  Next: Financials & Schedule <Icon name="chevronRight" size={14} />
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. Financial Baselines, Schedule & Location */}
      {showSection3 && (
        <section className="pcp-section-card">
          <div className="pcp-section-header">
            <div className="pcp-section-header-left">
              <FeaturedIcon variant="success" size="md">
                <Icon name="dollarSign" size={18} />
              </FeaturedIcon>
              <div>
                <h2 className="pcp-section-title">3. Financial Baselines, Schedule & Tags</h2>
                <p className="pcp-section-subtitle">Establish cost baselines, contract revenue, target milestones, and site location.</p>
              </div>
            </div>
            {durationDays !== null ? (
              <Badge variant="brand">
                <Icon name="clock" size={11} /> {durationDays}d window
              </Badge>
            ) : (
              <Badge variant="gray">Baselines</Badge>
            )}
          </div>

          <div className="pcp-section-body">
            <div className="pcp-field-grid">
              <div className="pcp-field">
                <label htmlFor="project-budget" className="pcp-label">
                  Baseline Budget ({currency})
                </label>
                <Input
                  id="project-budget"
                  type="number"
                  min="0"
                  step="any"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="pcp-field">
                <label htmlFor="project-value" className="pcp-label">
                  Contract Value ({currency})
                </label>
                <Input
                  id="project-value"
                  type="number"
                  min="0"
                  step="any"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Planned Start Date</label>
                <DatePicker
                  date={parseDateOnly(start)}
                  onChange={date => setStart(toDateOnlyString(date))}
                  placeholder="Start date"
                />
              </div>

              <div className="pcp-field">
                <label className="pcp-label">Planned Target Date</label>
                <DatePicker
                  date={parseDateOnly(end)}
                  onChange={date => setEnd(toDateOnlyString(date))}
                  placeholder="Target date"
                />
              </div>

              <div className="pcp-field">
                <label htmlFor="project-location" className="pcp-label">
                  Site Location / Address
                </label>
                <Input
                  id="project-location"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Dar es Salaam, Tanzania"
                />
              </div>

              <div className="pcp-field">
                <label htmlFor="project-tags" className="pcp-label">
                  Tags (Comma separated)
                </label>
                <Input
                  id="project-tags"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="e.g. priority-1, civil, phase-2"
                />
              </div>
            </div>

            {/* Quick Tag Suggestions */}
            <div className="pcp-field">
              <span className="pcp-field-hint">Quick tags — click to toggle:</span>
              <div className="pcp-tag-pills">
                {QUICK_TAGS.map(qt => {
                  const active = parsedTags.some(t => t.toLowerCase() === qt.toLowerCase());
                  return (
                    <button
                      key={qt}
                      type="button"
                      className={`pcp-tag-btn${active ? ' is-selected' : ''}`}
                      onClick={() => toggleQuickTag(qt)}
                    >
                      <Icon name={active ? 'check' : 'plus'} size={11} />
                      {qt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Financial & Schedule Telemetry Strip */}
            {(numBudget > 0 || numValue > 0 || durationDays !== null) && (
              <div className="pcp-fin-strip">
                <div className="pcp-fin-metric">
                  <span className="pcp-fin-metric-label">Baseline Cost</span>
                  <span className="pcp-fin-metric-val">{formatMoney(numBudget, currency)}</span>
                </div>
                <div className="pcp-fin-metric">
                  <span className="pcp-fin-metric-label">Contract Value</span>
                  <span className="pcp-fin-metric-val">{formatMoney(numValue, currency)}</span>
                </div>
                <div className="pcp-fin-metric">
                  <span className="pcp-fin-metric-label">Projected Variance</span>
                  <span
                    className="pcp-fin-metric-val"
                    style={{
                      color:
                        numValue === 0 && numBudget === 0
                          ? 'var(--ink)'
                          : projectedMargin >= 0
                          ? 'var(--green)'
                          : 'var(--red)',
                    }}
                  >
                    {formatMoney(projectedMargin, currency)}
                    {marginPct !== null ? ` (${marginPct}%)` : ''}
                  </span>
                </div>
                {durationDays !== null && (
                  <div className="pcp-fin-metric">
                    <span className="pcp-fin-metric-label">Planned Duration</span>
                    <span className="pcp-fin-metric-val">
                      {durationDays} days ({Math.max(1, Math.round(durationDays / 7))} wks)
                    </span>
                  </div>
                )}
              </div>
            )}

            {stepFilter === 3 && (
              <div className="pcp-step-nav--between">
                <Button type="button" variant="outline" size="sm" onClick={() => setStepFilter(2)}>
                  <Icon name="chevronLeft" size={14} /> Previous
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setStepFilter('all')}>
                  Review All Sections
                </Button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );

  if (standalone) {
    return (
      <form onSubmit={create}>
        <div className="pcp-workspace-grid">
          {formSections}

          {/* Sticky Right Sidebar: Live Project Charter Preview */}
          <aside className="pcp-side-col" aria-label="Project charter summary">
            <div className="pcp-charter-card">
              <div className="pcp-charter-banner">
                <div className="pcp-charter-kicker">
                  <span className="pcp-charter-kicker-label">
                    <Icon name="sparkle" size={12} /> Project Charter Preview
                  </span>
                  <Badge variant="brand">{currency}</Badge>
                </div>
                <div className="pcp-charter-name">
                  {name.trim() || 'Untitled Project'}
                </div>
                <div className="pcp-charter-badges">
                  <Badge variant="brand">{formatLabel(industry)}</Badge>
                  <Badge variant="gray">{formatLabel(classification)}</Badge>
                  {documentBrief && (
                    <Badge variant="success">
                      <Icon name="check" size={11} /> AI Brief Attached
                    </Badge>
                  )}
                </div>
              </div>

              <div className="pcp-charter-body">
                <div className="pcp-readiness-bar-wrap">
                  <div className="pcp-readiness-top">
                    <span>Charter Readiness</span>
                    <span className="pcp-readiness-pct">{readinessScore}%</span>
                  </div>
                  <div className="pcp-readiness-track">
                    <div className="pcp-readiness-fill" style={{ width: `${readinessScore}%` }} />
                  </div>
                </div>

                <div className="pcp-charter-row">
                  <span className="pcp-charter-row-label">Project Lead</span>
                  <span className="pcp-charter-row-val pcp-charter-lead">
                    <PersonAvatar
                      userId={user?.id}
                      name={user?.name || user?.email || 'Workspace Lead'}
                      size={24}
                    />
                    {user?.name || 'Workspace Lead'}
                  </span>
                </div>

                <div className="pcp-charter-rows">
                  <div className="pcp-charter-row">
                    <span className="pcp-charter-row-label">Portfolio</span>
                    <span className="pcp-charter-row-val">{selectedPortfolio?.name || 'Standalone'}</span>
                  </div>
                  {selectedProgram && (
                    <div className="pcp-charter-row">
                      <span className="pcp-charter-row-label">Program</span>
                      <span className="pcp-charter-row-val">{selectedProgram.name}</span>
                    </div>
                  )}
                  <div className="pcp-charter-row">
                    <span className="pcp-charter-row-label">Client</span>
                    <span className="pcp-charter-row-val">{selectedCustomer?.name || 'Internal'}</span>
                  </div>
                  <div className="pcp-charter-row">
                    <span className="pcp-charter-row-label">Baseline Budget</span>
                    <span className="pcp-charter-row-val">{formatMoney(numBudget, currency)}</span>
                  </div>
                  <div className="pcp-charter-row">
                    <span className="pcp-charter-row-label">Contract Value</span>
                    <span className="pcp-charter-row-val">{formatMoney(numValue, currency)}</span>
                  </div>
                  <div className="pcp-charter-row">
                    <span className="pcp-charter-row-label">Schedule</span>
                    <span className="pcp-charter-row-val">
                      {start || 'TBD'} → {end || 'TBD'}
                    </span>
                  </div>
                  {location.trim() && (
                    <div className="pcp-charter-row">
                      <span className="pcp-charter-row-label">Site Location</span>
                      <span className="pcp-charter-row-val">{location.trim()}</span>
                    </div>
                  )}
                </div>

                {parsedTags.length > 0 && (
                  <div className="pcp-charter-tags">
                    {parsedTags.map(tag => (
                      <Badge key={tag} variant="brand">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="pcp-charter-footer">
                <Button type="submit" disabled={saving || !name.trim()} className="pcp-btn-full">
                  {saving && <ButtonSpinner />}
                  {saving ? 'Saving…' : initialProject ? 'Save changes' : 'Create project'}
                </Button>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="pcp-btn-full">
                  Cancel
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </form>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent size="xl">
        <form onSubmit={create} className="pcp-dialog-form">
          <DialogHeader>
            <DialogTitle>
              {initialProject ? 'Edit Project Details' : 'New Project Setup'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="pcp-dialog-body">
            {formSections}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <ButtonSpinner />}
              {saving ? 'Saving…' : initialProject ? 'Save Changes' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
