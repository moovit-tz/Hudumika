import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import type { ProjectIndustry, ProjectType, ProjectPortfolio, ProjectProgram } from '@hudumika/types';

interface ProjectCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newProjectId: string) => void;
}

const INDUSTRY_OPTIONS: { id: ProjectIndustry; label: string; icon: string; desc: string }[] = [
  { id: 'construction', label: 'Construction & Civil Engineering', icon: 'hardHat', desc: 'BOQ, RFIs, Daily Site Diary, Subcontractor claims, HSE incidents' },
  { id: 'engineering', label: 'Heavy Engineering & Infrastructure', icon: 'wrench', desc: 'Structural calculations, Engineering reviews, CAD gates' },
  { id: 'real_estate', label: 'Real Estate & Property Development', icon: 'building', desc: 'Unit sales inventory, Buyer milestones, Phased handovers' },
  { id: 'manufacturing', label: 'Manufacturing & Plant Operations', icon: 'box', desc: 'Multi-level BOM, Production work orders, Scrap tracking' },
  { id: 'mining', label: 'Mining, Metals & Extraction', icon: 'layers', desc: 'Concession blocks, Equipment telemetry, Environmental compliance' },
  { id: 'energy', label: 'Energy, Oil & Renewables', icon: 'zap', desc: 'Grid interconnects, Power purchase agreements, Safety gates' },
  { id: 'ngo', label: 'NGO & International Development', icon: 'globe', desc: 'Results framework / Logframe, OVI metrics, Donor tracking' },
  { id: 'it_software', label: 'IT, Cloud & DevOps Software', icon: 'cpu', desc: 'Sprint planning, DORA telemetry, Release gates, CI/CD' },
  { id: 'general', label: 'General Corporate & Turnkey Projects', icon: 'briefcase', desc: 'Standard WBS, Earned Value, Governance & Deliverables' },
];

export const ProjectCreateModal: React.FC<ProjectCreateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [portfolios, setPortfolios] = useState<ProjectPortfolio[]>([]);
  const [programs, setPrograms] = useState<ProjectProgram[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    ref: `PRJ-${Math.floor(1000 + Math.random() * 9000)}`,
    industry: 'construction' as ProjectIndustry,
    project_type: 'capital_expenditure' as ProjectType,
    portfolio_id: '__none__',
    program_id: '__none__',
    customer_id: '__none__',
    color: '#0d7a6b',
    contract_value: 50000000,
    baseline_budget: 42000000,
    currency: 'KES',
    start_date: new Date().toISOString().split('T')[0],
    target_date: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
    location_address: 'Nairobi, Kenya',
    latitude: -1.286389,
    longitude: 36.817223,
    description: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    apiFetch('/v1/project-os/portfolios').then(res => setPortfolios(Array.isArray(res) ? res : res.data || [])).catch(() => setPortfolios([]));
    apiFetch('/v1/project-os/programs').then(res => setPrograms(Array.isArray(res) ? res : res.data || [])).catch(() => setPrograms([]));
    apiFetch('/v1/crm/customers').then(res => setCustomers(Array.isArray(res) ? res : res.data || [])).catch(() => setCustomers([]));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      showAlert('Project Name is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const payload: any = {
        id,
        name: formData.name.trim(),
        color: formData.color,
        industry: formData.industry,
        project_type: formData.project_type,
        contract_value: Number(formData.contract_value) || 0,
        baseline_budget: Number(formData.baseline_budget) || 0,
        current_budget: Number(formData.baseline_budget) || 0,
        currency: formData.currency,
        start_date: formData.start_date || null,
        target_date: formData.target_date || null,
        location_address: formData.location_address || null,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        description: formData.description || null,
      };

      if (formData.portfolio_id !== '__none__') payload.portfolio_id = formData.portfolio_id;
      if (formData.program_id !== '__none__') payload.program_id = formData.program_id;
      if (formData.customer_id !== '__none__') payload.customer_id = formData.customer_id;

      await apiFetch('/v1/tasks/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showAlert(`Project "${formData.name}" successfully created!`, { variant: 'success' });
      onSuccess(id);
    } catch {
      // apiFetch handles errors
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--white)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 780,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-subtle)',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--teal)', letterSpacing: '0.05em' }}>
              Hudumika Project OS
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>
              Create Enterprise Project
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Industry Selection */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: 8 }}>
              Select Industry Pack *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {INDUSTRY_OPTIONS.map((ind) => {
                const isSelected = formData.industry === ind.id;
                return (
                  <div
                    key={ind.id}
                    onClick={() => setFormData({ ...formData, industry: ind.id })}
                    style={{
                      border: `2px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--teal-l)' : 'var(--white)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: isSelected ? 'var(--teal)' : 'var(--ink3)' }}>
                        <Icon name={ind.icon as any} size={16} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--teal-d)' : 'var(--ink)' }}>
                        {ind.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.3 }}>
                      {ind.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project Identity */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Project Name *</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                placeholder="e.g. Menengai Geothermal Phase 2 Transmission"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Project Code / Ref</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                value={formData.ref}
                onChange={(e) => setFormData({ ...formData, ref: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Project Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  style={{ width: 38, height: 38, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>{formData.color}</span>
              </div>
            </div>
          </div>

          {/* Governance Hierarchy */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Portfolio</label>
              <Select value={formData.portfolio_id} onValueChange={(val) => setFormData({ ...formData, portfolio_id: val })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select Portfolio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Portfolio Assigned</SelectItem>
                  {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Program</label>
              <Select value={formData.program_id} onValueChange={(val) => setFormData({ ...formData, program_id: val })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select Program" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Program Assigned</SelectItem>
                  {programs.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name} ({pr.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Project Classification</label>
              <Select value={formData.project_type} onValueChange={(val) => setFormData({ ...formData, project_type: val as ProjectType })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="capital_expenditure">Capital Expenditure (CAPEX)</SelectItem>
                  <SelectItem value="customer_delivery">Customer Delivery Contract</SelectItem>
                  <SelectItem value="internal">Internal Operational</SelectItem>
                  <SelectItem value="r_and_d">R&D / Product Innovation</SelectItem>
                  <SelectItem value="maintenance">SLA / Facility Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Financials & Budget */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Contract Value ({formData.currency})</label>
              <input
                type="number"
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                value={formData.contract_value}
                onChange={(e) => setFormData({ ...formData, contract_value: Number(e.target.value) })}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Baseline Budget (BAC)</label>
              <input
                type="number"
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                value={formData.baseline_budget}
                onChange={(e) => setFormData({ ...formData, baseline_budget: Number(e.target.value) })}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Currency</label>
              <Select value={formData.currency} onValueChange={(val) => setFormData({ ...formData, currency: val })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
                  <SelectItem value="UGX">UGX — Ugandan Shilling</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Start Date</label>
              <input
                type="date"
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Target Completion Date</label>
              <input
                type="date"
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Site Location / Address</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                placeholder="e.g. Plot 408, Olkaria Road, Naivasha"
                value={formData.location_address}
                onChange={(e) => setFormData({ ...formData, location_address: e.target.value })}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Project Charter / Scope Summary</label>
            <textarea
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
              rows={2}
              placeholder="Key strategic objectives, contractual constraints, and executive goals"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            background: 'var(--bg-subtle)',
          }}
        >
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating Project OS...' : 'Create Project'}
          </Button>
        </div>
      </div>
    </div>
  );
};
