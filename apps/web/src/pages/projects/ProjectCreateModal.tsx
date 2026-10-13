import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { apiFetch } from '../../lib/api.js';
import { rowsOf } from './projectData.js';
import type { ProjectDocumentBrief } from '@hudumika/types';

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

export const ProjectCreateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProject,
  standalone = false,
  documentBrief,
}) => {
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
          tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
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

  const formFields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Identity & Classification */}
      <SectionCard title="1. Project Identity & Classification">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
          <div>
            <label htmlFor="project-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Project Name *
            </label>
            <Input
              id="project-name"
              required
              maxLength={200}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Serengeti Phase 2 Expansion"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Industry Sector
            </label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {industries.map(ind => (
                  <SelectItem key={ind} value={ind}>
                    {ind.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Delivery Classification
            </label>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['internal', 'customer_delivery', 'capital_expenditure', 'r_and_d', 'maintenance'].map(type => (
                  <SelectItem key={type} value={type}>
                    {type.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Currency
            </label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['TZS', 'KES', 'USD', 'EUR', 'GBP', 'UGX'].map(code => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="project-scope" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Scope & Objectives
          </label>
          <Textarea
            id="project-scope"
            maxLength={5000}
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Define project deliverables, scope boundaries, and core objectives…"
          />
        </div>
      </SectionCard>

      {/* Strategic Hierarchy */}
      <SectionCard title="2. Strategic Alignment & Client">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Portfolio (Optional)
            </label>
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

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Program (Optional)
            </label>
            <Combobox
              value={program}
              onChange={setProgram}
              options={[{ value: '', label: 'No Program' }, ...programs.filter(row => !portfolio || row.portfolio_id === portfolio).map(row => ({ value: row.id, label: row.name }))]}
              placeholder="Select program"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Customer / Client (Optional)
            </label>
            <Combobox
              value={customer}
              onChange={setCustomer}
              options={[{ value: '', label: 'Internal / No Customer' }, ...customers.map(row => ({ value: row.id, label: row.name }))]}
              placeholder="Select customer"
            />
          </div>
        </div>
      </SectionCard>

      {/* Schedule, Baselines & Location */}
      <SectionCard title="3. Financial Baselines & Schedule Dates">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
          <div>
            <label htmlFor="project-budget" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
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

          <div>
            <label htmlFor="project-value" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
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

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Planned Start Date
            </label>
            <DatePicker date={parseDateOnly(start)} onChange={date => setStart(toDateOnlyString(date))} placeholder="Start date" />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Planned Target Date
            </label>
            <DatePicker date={parseDateOnly(end)} onChange={date => setEnd(toDateOnlyString(date))} placeholder="Target date" />
          </div>

          <div>
            <label htmlFor="project-location" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Site Location / Address
            </label>
            <Input
              id="project-location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Dar es Salaam, Tanzania"
            />
          </div>

          <div>
            <label htmlFor="project-tags" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
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
      </SectionCard>
    </div>
  );

  if (standalone) {
    return (
      <form onSubmit={create}>
        {formFields}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : initialProject ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent size="lg">
        <form onSubmit={create}>
          <DialogHeader>
            <DialogTitle>
              {initialProject ? 'Edit Project Details' : 'New Project Setup'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {formFields}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : initialProject ? 'Save Changes' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
