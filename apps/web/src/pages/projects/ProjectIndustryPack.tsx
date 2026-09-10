import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import type { ProjectIndustry, ProjectIndustryData } from '@hudumika/types';

interface ProjectIndustryPackProps {
  projectId: string;
  industry: ProjectIndustry;
  currency?: string;
}

export const ProjectIndustryPack: React.FC<ProjectIndustryPackProps> = ({
  projectId,
  industry,
  currency = 'KES',
}) => {
  const [subTab, setSubTab] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ProjectIndustryData[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Construction Form States
  const [boqItem, setBoqItem] = useState({
    item_no: '',
    description: '',
    unit: 'm3',
    quantity: 100,
    unit_rate: 1500,
    actual_quantity: 0,
  });

  const [rfiItem, setRfiItem] = useState({
    rfi_no: `RFI-${Math.floor(1000 + Math.random() * 9000)}`,
    subject: '',
    question: '',
    spec_section: 'Structural Concrete (03 30 00)',
    assigned_to: 'Principal Structural Engineer',
    cost_impact: 'None',
    schedule_impact_days: 0,
    status: 'submitted',
  });

  const [siteDiary, setSiteDiary] = useState({
    date: new Date().toISOString().split('T')[0],
    weather: 'Sunny / Clear 28°C',
    ground_condition: 'Dry / Stable',
    manpower_count: 48,
    trades: 'Masons: 18, Steel-fixers: 14, Carpenters: 8, Laborers: 8',
    equipment_active: '2x Tower Cranes, 1x Excavator CAT 320, 3x Concrete Mixers',
    work_completed: 'Completed pouring 45m3 C30 concrete for Level 3 slab section B.',
    delays_incidents: 'No safety incidents reported. 100% PPE adherence.',
  });

  // Manufacturing BOM State
  const [bomItem, setBomItem] = useState({
    part_no: `PN-${Math.floor(10000 + Math.random() * 90000)}`,
    name: '',
    material_spec: 'Stainless Steel 316L',
    quantity_per_unit: 1,
    unit_cost: 450,
    lead_time_days: 14,
    supplier: 'Precision Components Ltd',
    in_stock: 50,
  });

  // Real Estate Unit State
  const [unitItem, setUnitItem] = useState({
    unit_no: 'A-304',
    floor: '3rd Floor',
    unit_type: '2 Bedroom Luxury Apartment',
    area_sqft: 1150,
    price: 12500000,
    status: 'available',
    buyer_name: '',
    deposit_paid: 0,
  });

  // NGO Logframe State
  const [logframeItem, setLogframeItem] = useState({
    level: 'Outcome',
    statement: 'Increased sustainable clean water access for 25,000 rural residents',
    indicator: '% of households with access to safe water within 500m',
    baseline: '32%',
    target: '85% by Q4',
    verification_source: 'Quarterly Community Water Board Audits',
    assumptions: 'Local aquifer recharge rates remain stable; local county support',
  });

  // IT Sprint / DevOps State
  const [sprintItem, setSprintItem] = useState({
    sprint_name: 'Sprint 24 — Core Platform Hardening',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    goal: 'Ship EVM engine, stage gate signoffs, and high-performance WBS tree',
    story_points_committed: 84,
    story_points_completed: 62,
    deployment_frequency: 'Daily (2.4 deploys/day)',
    lead_time_for_changes: '3.2 hours',
    change_failure_rate: '0.8%',
  });

  // Set default subtabs based on industry
  useEffect(() => {
    if (['construction', 'engineering', 'infrastructure'].includes(industry)) {
      setSubTab('boq');
    } else if (industry === 'manufacturing') {
      setSubTab('bom');
    } else if (industry === 'real_estate') {
      setSubTab('units');
    } else if (industry === 'ngo') {
      setSubTab('logframe');
    } else if (['it_software', 'telecom'].includes(industry)) {
      setSubTab('sprints');
    } else {
      setSubTab('deliverables_checklist');
    }
  }, [industry]);

  const loadIndustryData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/v1/project-os/projects/${projectId}/industry-data?dataType=${subTab}`);
      setRecords(Array.isArray(res) ? res : res.data || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, subTab]);

  useEffect(() => {
    loadIndustryData();
  }, [loadIndustryData]);

  const handleSaveRecord = async () => {
    setSaving(true);
    let recordData: any = {};
    if (subTab === 'boq') recordData = boqItem;
    else if (subTab === 'rfis') recordData = rfiItem;
    else if (subTab === 'site_diary') recordData = siteDiary;
    else if (subTab === 'bom') recordData = bomItem;
    else if (subTab === 'units') recordData = unitItem;
    else if (subTab === 'logframe') recordData = logframeItem;
    else if (subTab === 'sprints') recordData = sprintItem;
    else recordData = { title: 'General Industry Checklist Item', status: 'Completed', timestamp: new Date().toISOString() };

    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/industry-data`, {
        method: 'POST',
        body: JSON.stringify({
          industry,
          data_type: subTab,
          record_data: recordData,
        }),
      });
      setShowAddModal(false);
      loadIndustryData();
      showAlert('Industry record created successfully', { variant: 'success' });
    } catch {
      // apiFetch handles errors
    } finally {
      setSaving(false);
    }
  };

  const isConstruction = ['construction', 'engineering', 'infrastructure', 'mining', 'energy'].includes(industry);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Industry Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #0f766e 100%)',
          borderRadius: 14,
          padding: '20px 24px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 4px 20px rgba(15, 118, 110, 0.15)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10.5,
                textTransform: 'uppercase',
                fontWeight: 800,
                letterSpacing: '0.08em',
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 8px',
                borderRadius: 4,
              }}
            >
              Enterprise Industry Pack
            </span>
            <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>
              {industry.toUpperCase().replace('_', ' ')}
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {isConstruction && 'Civil & Construction Engineering Workspace'}
            {industry === 'manufacturing' && 'Manufacturing BOM & Production Operations'}
            {industry === 'real_estate' && 'Real Estate Development & Units Matrix'}
            {industry === 'ngo' && 'Results-Based Management & Logframe Studio'}
            {['it_software', 'telecom'].includes(industry) && 'DevOps, Sprints & DORA Metrics Cockpit'}
            {!isConstruction && !['manufacturing', 'real_estate', 'ngo', 'it_software', 'telecom'].includes(industry) && `${industry.replace('_', ' ').toUpperCase()} Modular Tools`}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>
            Tailored industry data schemas, compliance registers, engineering logs, and verifiable field records.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            style={{ background: '#ffffff', color: '#064e3b', fontWeight: 700, border: 'none' }}
          >
            <Icon name="plus" size={15} style={{ marginRight: 6 }} />
            Add {subTab.toUpperCase().replace('_', ' ')} Record
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, overflowX: 'auto' }}>
        {isConstruction && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('boq')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'boq' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'boq' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="fileText" size={15} /> Bill of Quantities (BOQ)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('rfis')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'rfis' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'rfis' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="helpCircle" size={15} /> Request For Information (RFI)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('site_diary')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'site_diary' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'site_diary' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="calendar" size={15} /> Daily Site Diary & Incidents
            </button>
          </>
        )}

        {industry === 'manufacturing' && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('bom')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'bom' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'bom' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Bill of Materials (BOM)
            </button>
          </>
        )}

        {industry === 'real_estate' && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('units')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'units' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'units' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Unit Inventory & Sales Matrix
            </button>
          </>
        )}

        {industry === 'ngo' && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('logframe')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'logframe' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'logframe' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Results Framework (Logframe)
            </button>
          </>
        )}

        {['it_software', 'telecom'].includes(industry) && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('sprints')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'sprints' ? 'var(--teal)' : 'var(--white)',
                color: subTab === 'sprints' ? '#ffffff' : 'var(--ink2)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Sprint Cockpit & DORA Metrics
            </button>
          </>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <SectionLoading />
      ) : (
        <div>
          {/* BOQ TABLE VIEW */}
          {subTab === 'boq' && (
            <SectionCard title="Bill of Quantities (BOQ) Master Schedule" collapsible={false}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700 }}>Item No</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700 }}>Description</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700 }}>Unit</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700 }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700 }}>Unit Rate ({currency})</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700 }}>Estimated Total</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700 }}>Actual Qty Done</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700 }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--ink3)' }}>
                          No BOQ lines registered yet. Click &quot;Add BOQ Record&quot; to establish the quantities schedule.
                        </td>
                      </tr>
                    ) : (
                      records.map((r) => {
                        const data = r.record_data || {};
                        const estTotal = (Number(data.quantity) || 0) * (Number(data.unit_rate) || 0);
                        const progress = data.quantity > 0 ? Math.min(100, Math.round(((data.actual_quantity || 0) / data.quantity) * 100)) : 0;
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 700 }}>{data.item_no || '1.01'}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{data.description}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Created: {new Date(r.created_at).toLocaleDateString()}</div>
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px 14px', color: 'var(--ink3)' }}>{data.unit}</td>
                            <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 600 }}>{Number(data.quantity || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'right', padding: '12px 14px' }}>{Number(data.unit_rate || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700, color: 'var(--teal)' }}>
                              {estTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 600 }}>{Number(data.actual_quantity || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                              <Badge variant={progress >= 100 ? 'success' : progress > 0 ? 'brand' : 'gray'}>
                                {progress}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* RFI VIEW */}
          {subTab === 'rfis' && (
            <SectionCard title="Engineering & Architectural Request For Information (RFI) Register" collapsible={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {records.length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 32, color: 'var(--ink3)' }}>
                    No RFIs logged for this project.
                  </div>
                ) : (
                  records.map((r) => {
                    const data = r.record_data || {};
                    return (
                      <div
                        key={r.id}
                        style={{
                          background: 'var(--white)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--teal)' }}>{data.rfi_no || 'RFI-001'}</span>
                          <Badge variant={data.status === 'closed' ? 'success' : data.status === 'answered' ? 'brand' : 'warning'}>
                            {(data.status || 'submitted').toUpperCase()}
                          </Badge>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>{data.subject}</div>
                        <div style={{ fontSize: 13, color: 'var(--ink2)', background: 'var(--bg-subtle)', padding: 10, borderRadius: 6 }}>
                          {data.question}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5, color: 'var(--ink3)' }}>
                          <div>Spec: <strong style={{ color: 'var(--ink)' }}>{data.spec_section}</strong></div>
                          <div>Assigned: <strong style={{ color: 'var(--ink)' }}>{data.assigned_to}</strong></div>
                          <div>Cost Impact: <strong style={{ color: 'var(--ink)' }}>{data.cost_impact || 'None'}</strong></div>
                          <div>Schedule Delay: <strong style={{ color: 'var(--ink)' }}>{data.schedule_impact_days || 0} days</strong></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </SectionCard>
          )}

          {/* SITE DIARY VIEW */}
          {subTab === 'site_diary' && (
            <SectionCard title="Daily Site Operations, Manpower & Incident Logs" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {records.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--ink3)' }}>
                    No daily site diary entries recorded.
                  </div>
                ) : (
                  records.map((r) => {
                    const data = r.record_data || {};
                    return (
                      <div
                        key={r.id}
                        style={{
                          background: 'var(--white)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 18,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Icon name="calendar" size={16} style={{ color: 'var(--teal)' }} />
                            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Date: {data.date}</span>
                          </div>
                          <Badge variant="brand">{data.weather}</Badge>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 14 }}>
                          <div style={{ background: 'var(--bg-subtle)', padding: 12, borderRadius: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Manpower ({data.manpower_count} Total)</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>{data.trades}</div>
                          </div>
                          <div style={{ background: 'var(--bg-subtle)', padding: 12, borderRadius: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Active Heavy Machinery</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>{data.equipment_active}</div>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Work Performed Today:</div>
                          <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 2 }}>{data.work_completed}</div>
                        </div>
                        {data.delays_incidents && (
                          <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
                            <strong>Incidents / Health & Safety:</strong> {data.delays_incidents}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </SectionCard>
          )}

          {/* MANUFACTURING BOM VIEW */}
          {subTab === 'bom' && (
            <SectionCard title="Engineering Bill of Materials (BOM) Parts Tree" collapsible={false}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Part No</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Component Name</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Material Spec</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>Qty / Assembly</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>Unit Cost ({currency})</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Supplier</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px' }}>Lead Time</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>In Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const d = r.record_data || {};
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>{d.part_no}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{d.name}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{d.material_spec}</td>
                          <td style={{ textAlign: 'right', padding: '12px 14px' }}>{d.quantity_per_unit}</td>
                          <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 600 }}>{Number(d.unit_cost || 0).toLocaleString()}</td>
                          <td style={{ padding: '12px 14px' }}>{d.supplier}</td>
                          <td style={{ textAlign: 'center', padding: '12px 14px' }}>{d.lead_time_days} days</td>
                          <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700 }}>{d.in_stock}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* REAL ESTATE UNITS VIEW */}
          {subTab === 'units' && (
            <SectionCard title="Real Estate Units Inventory & Sales Status" collapsible={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {records.map((r) => {
                  const d = r.record_data || {};
                  return (
                    <div
                      key={r.id}
                      style={{
                        background: 'var(--white)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 16,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--teal)' }}>Unit {d.unit_no}</span>
                        <Badge variant={d.status === 'sold' ? 'success' : d.status === 'reserved' ? 'warning' : 'brand'}>
                          {(d.status || 'available').toUpperCase()}
                        </Badge>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{d.unit_type}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{d.floor} • {d.area_sqft} Sq.Ft</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginTop: 12 }}>
                        {currency} {Number(d.price || 0).toLocaleString()}
                      </div>
                      {d.buyer_name && (
                        <div style={{ fontSize: 12, color: 'var(--ink2)', background: 'var(--bg-subtle)', padding: 8, borderRadius: 6, marginTop: 8 }}>
                          Buyer: <strong>{d.buyer_name}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* NGO LOGFRAME VIEW */}
          {subTab === 'logframe' && (
            <SectionCard title="Results-Based Management (RBM) Logical Framework" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {records.map((r) => {
                  const d = r.record_data || {};
                  return (
                    <div
                      key={r.id}
                      style={{
                        background: 'var(--white)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 16,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Badge variant="brand">{d.level || 'Outcome'}</Badge>
                        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{d.statement}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13, marginTop: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 700 }}>INDICATOR</div>
                          <div style={{ fontWeight: 600 }}>{d.indicator}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 700 }}>BASELINE / TARGET</div>
                          <div>{d.baseline} → <strong style={{ color: 'var(--teal)' }}>{d.target}</strong></div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 700 }}>VERIFICATION MEANS</div>
                          <div>{d.verification_source}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 700 }}>CRITICAL ASSUMPTIONS</div>
                          <div>{d.assumptions}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* IT SPRINT & DORA COCKPIT */}
          {subTab === 'sprints' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>DEPLOYMENT FREQUENCY</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>Daily (Elite)</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 2 }}>2.4 production builds / day</div>
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>LEAD TIME FOR CHANGES</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>3.2 Hours</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 2 }}>Commit to deploy pipeline</div>
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>CHANGE FAILURE RATE</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>0.8%</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 2 }}>Automated rollbacks & health checks</div>
                </div>
              </div>

              <SectionCard title="Active Sprint Execution" collapsible={false}>
                {records.map((r) => {
                  const d = r.record_data || {};
                  return (
                    <div key={r.id} style={{ padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{d.sprint_name}</h4>
                        <Badge variant="brand">{d.start_date} to {d.end_date}</Badge>
                      </div>
                      <p style={{ fontSize: 13.5, color: 'var(--ink2)', margin: '6px 0 12px' }}>{d.goal}</p>
                      <div style={{ display: 'flex', gap: 16, fontSize: 13, fontWeight: 600 }}>
                        <div>Committed Story Points: <strong>{d.story_points_committed}</strong></div>
                        <div>Completed: <strong style={{ color: 'var(--teal)' }}>{d.story_points_completed}</strong></div>
                        <div>Velocity: <strong>{Math.round(((d.story_points_completed || 0) / (d.story_points_committed || 1)) * 100)}%</strong></div>
                      </div>
                    </div>
                  );
                })}
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* CREATE RECORD MODAL */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 580,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Add New {subTab.toUpperCase().replace('_', ' ')} Record
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* FORM PER SUBTAB */}
            {subTab === 'boq' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Item No</label>
                    <input
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={boqItem.item_no}
                      onChange={(e) => setBoqItem({ ...boqItem, item_no: e.target.value })}
                      placeholder="e.g. 2.04"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Unit of Measure</label>
                    <input
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={boqItem.unit}
                      onChange={(e) => setBoqItem({ ...boqItem, unit: e.target.value })}
                      placeholder="m3, tonnes, lm, nr"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Description</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    value={boqItem.description}
                    onChange={(e) => setBoqItem({ ...boqItem, description: e.target.value })}
                    placeholder="Provide detailed material & engineering specification"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Contract Quantity</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={boqItem.quantity}
                      onChange={(e) => setBoqItem({ ...boqItem, quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Unit Rate ({currency})</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={boqItem.unit_rate}
                      onChange={(e) => setBoqItem({ ...boqItem, unit_rate: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            )}

            {subTab === 'rfis' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>RFI Subject</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    value={rfiItem.subject}
                    onChange={(e) => setRfiItem({ ...rfiItem, subject: e.target.value })}
                    placeholder="e.g. Clarification on Column Rebar Lap Length at Grid 4-D"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Question / Technical Query</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    rows={3}
                    value={rfiItem.question}
                    onChange={(e) => setRfiItem({ ...rfiItem, question: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Spec Section</label>
                    <input
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={rfiItem.spec_section}
                      onChange={(e) => setRfiItem({ ...rfiItem, spec_section: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Assigned Consultant</label>
                    <input
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={rfiItem.assigned_to}
                      onChange={(e) => setRfiItem({ ...rfiItem, assigned_to: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {subTab === 'site_diary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Date</label>
                    <input
                      type="date"
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={siteDiary.date}
                      onChange={(e) => setSiteDiary({ ...siteDiary, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Weather & Temp</label>
                    <input
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      value={siteDiary.weather}
                      onChange={(e) => setSiteDiary({ ...siteDiary, weather: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Trades & Manpower Count</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    value={siteDiary.trades}
                    onChange={(e) => setSiteDiary({ ...siteDiary, trades: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Equipment Active</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    value={siteDiary.equipment_active}
                    onChange={(e) => setSiteDiary({ ...siteDiary, equipment_active: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Works Executed Today</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    value={siteDiary.work_completed}
                    onChange={(e) => setSiteDiary({ ...siteDiary, work_completed: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Other generic modal content */}
            {!['boq', 'rfis', 'site_diary'].includes(subTab) && (
              <div style={{ padding: '12px 0', color: 'var(--ink2)' }}>
                Confirm adding active schema record for {subTab.toUpperCase()}.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleSaveRecord} disabled={saving}>
                {saving ? 'Saving...' : 'Save Record'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
