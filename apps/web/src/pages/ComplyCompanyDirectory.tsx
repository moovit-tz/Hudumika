import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { formatDashedDigits9 } from '../lib/complyBrelaFormat.js';
import type { Customer } from '@hudumika/types';
import './ComplyOS.css';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';

type EditableField = 'name' | 'contact_name' | 'email' | 'phone_wa' | 'tax_id' | 'entity_type' | 'registration_status' | 'registered_address' | 'incorporation_date';

const EDITABLE_FIELDS: { key: EditableField; label: string; type?: 'text' | 'date' | 'digits9' }[] = [
  { key: 'name', label: 'Company Name' },
  { key: 'entity_type', label: 'Entity Type' },
  { key: 'registration_status', label: 'Registration Status' },
  { key: 'tax_id', label: 'TIN Number', type: 'digits9' },
  { key: 'registered_address', label: 'Registered Address' },
  { key: 'incorporation_date', label: 'Incorporation Date', type: 'date' },
  { key: 'contact_name', label: 'Contact Person' },
  { key: 'email', label: 'Email' },
  { key: 'phone_wa', label: 'Phone (WhatsApp)' },
];

export function ComplyCompanyDirectory() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'list' | 'profile'>('list');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch('/v1/customers')
      .then(res => setCompanies((res.data || []).filter((c: Customer) => c.source === 'brela_import')))
      .catch(err => setError(err.message || 'Failed to load company directory'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openProfile = (company: Customer) => {
    setSelected(company);
    setEditMode(false);
    setForm({
      name: company.name || '',
      contact_name: company.contact_name || '',
      email: company.email || '',
      phone_wa: company.phone_wa || '',
      tax_id: (company.tax_id || '').replace(/\D/g, ''),
      entity_type: company.entity_type || '',
      registration_status: company.registration_status || '',
      registered_address: company.registered_address || '',
      incorporation_date: company.incorporation_date || '',
    });
    setView('profile');
  };

  const backToList = () => {
    setView('list');
    setSelected(null);
    setEditMode(false);
  };

  const handleFieldChange = (key: EditableField, type: EditableField extends string ? 'text' | 'date' | 'digits9' | undefined : never, value: string) => {
    if (type === 'digits9') {
      setForm(f => ({ ...f, [key]: value.replace(/\D/g, '').slice(0, 9) }));
    } else {
      setForm(f => ({ ...f, [key]: value }));
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/v1/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setSelected(updated);
      setCompanies(cs => cs.map(c => (c.id === updated.id ? updated : c)));
      setEditMode(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save company profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company: Customer) => {
    if (!(await showConfirm(`Delete ${company.name}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/customers/${company.id}`, { method: 'DELETE' });
      setCompanies(cs => cs.filter(c => c.id !== company.id));
      if (selected?.id === company.id) backToList();
    } catch (err: any) {
      setError(err.message || 'Failed to delete company');
    }
  };

  // Promotes a draft (active:false) profile into a real, usable CRM
  // customer — visible from this moment on in ClearOS/Finance/other apps'
  // customer pickers, which filter out active:false rows.
  const handleMarkComplete = async (company: Customer) => {
    try {
      const updated = await apiFetch(`/v1/customers/${company.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
      });
      setCompanies(cs => cs.map(c => (c.id === updated.id ? updated : c)));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to move company to CRM');
    }
  };

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Company Directory']}
        titlePlain="Company"
        titleEm="directory"
        subtitle="Companies captured from BRELA Search. Drafts are a holding layer only you can see here — review and mark a profile complete to move it into the CRM shared across every Hudumika app."
        actions={
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => navigate('/complyos/brela-search')}>
            <Icon name="search" size={13} />
            <span>BRELA Search</span>
          </button>
        </div>
        }
      />

      {error && (
        <div className="comply-note comply-note--error comply-note--icon comply-mb-24">
          <Icon name="alertTriangle" size={15} />
          <span>{error}</span>
        </div>
      )}

      {view === 'list' && (
        <div className="comply-kpis comply-mb-24">
          <div className="comply-kpi">
            <div className="comply-kpi-val">{loading ? '—' : companies.length}</div>
            <div className="comply-kpi-label">Total Imported</div>
          </div>
          <div className="comply-kpi">
            <div className={`comply-kpi-val${companies.filter(c => !c.active).length > 0 ? ' comply-kpi-delta--warn' : ''}`}>
              {loading ? '—' : companies.filter(c => !c.active).length}
            </div>
            <div className="comply-kpi-label">Draft — Holding Layer</div>
          </div>
          <div className="comply-kpi">
            <div className="comply-kpi-val comply-kpi-delta--up">{loading ? '—' : companies.filter(c => c.active).length}</div>
            <div className="comply-kpi-label">In CRM</div>
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="comply-card">
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">
              <span className="comply-card-title-row"><Icon name="briefcase" size={15} color="var(--comply)" /> Companies</span>
            </h3>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{companies.length} imported</span>
          </div>
          <div className="comply-card-body">
            <table className="comply-table">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Name</th>
                  <th style={{ width: 130 }}>TIN Number</th>
                  <th style={{ width: 160 }}>Entity Type</th>
                  <th style={{ width: 100 }}>CRM Status</th>
                  <th>Registered Address</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="comply-empty-hint" style={{ textAlign: 'center' }}>Loading…</td></tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="comply-empty-hint" style={{ textAlign: 'center' }}>
                      No companies imported yet. Use <strong>BRELA Search</strong> to find and import one.
                    </td>
                  </tr>
                ) : (
                  companies.map(c => (
                    <tr key={c.id} onClick={() => openProfile(c)} style={{ cursor: 'pointer' }}>
                      <td className="comply-table-name">{c.name}</td>
                      <td className="comply-td-mono">{formatDashedDigits9(c.tax_id)}</td>
                      <td style={{ fontSize: 12.5 }}>{c.entity_type || '—'}</td>
                      <td>
                        <span className={`comply-badge comply-badge--${c.active ? 'active' : 'pending'}`}>
                          {c.active ? 'In CRM' : 'Draft'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, lineHeight: 1.4 }}>{c.registered_address || '—'}</td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {!c.active && (
                          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => handleMarkComplete(c)} title="Mark Complete — move to CRM">
                            <Icon name="checkCircle" size={13} />
                          </button>
                        )}
                        <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => handleDelete(c)} title="Delete" style={{ marginLeft: 6 }}>
                          <Icon name="trash" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'profile' && selected && (
        <div className="comply-card">
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">
              <span className="comply-card-title-row">
                <Icon name="checkCircle" size={16} color="var(--comply)" /> {selected.name}
                <span className={`comply-badge comply-badge--${selected.active ? 'active' : 'pending'} comply-badge-ml`}>
                  {selected.active ? 'In CRM' : 'Draft'}
                </span>
              </span>
            </h3>
            <div className="comply-action-row">
              <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={backToList}>
                <Icon name="arrowLeft" size={13} />
                <span>Back to Directory</span>
              </button>
              {editMode ? (
                <>
                  <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => openProfile(selected)} disabled={saving}>
                    <span>Cancel</span>
                  </button>
                  <button type="button" className="comply-btn-primary comply-btn-sm" onClick={handleSave} disabled={saving}>
                    <Icon name="check" size={13} />
                    <span>{saving ? 'Saving…' : 'Save'}</span>
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => setEditMode(true)}>
                    <Icon name="edit" size={13} />
                    <span>Edit</span>
                  </button>
                  {!selected.active && (
                    <button type="button" className="comply-btn-primary comply-btn-sm" onClick={() => handleMarkComplete(selected)}>
                      <Icon name="checkCircle" size={13} />
                      <span>Mark Complete — Move to CRM</span>
                    </button>
                  )}
                  <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => handleDelete(selected)}>
                    <Icon name="trash" size={13} />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ padding: 20 }}>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {EDITABLE_FIELDS.map(f => (
                  <div className="comply-field-row" key={f.key}>
                    <label className="comply-field-label">{f.label}</label>
                    {f.type === 'date' ? (
                      <DatePicker
                        date={form[f.key] ? new Date(form[f.key]) : undefined}
                        onChange={d => setForm(prev => ({ ...prev, [f.key]: d ? toDateOnlyString(d) : '' }))}
                      />
                    ) : (
                      <input
                        type="text"
                        className="input-field"
                        value={form[f.key] ?? ''}
                        onChange={e => handleFieldChange(f.key, f.type, e.target.value)}
                        inputMode={f.type === 'digits9' ? 'numeric' : undefined}
                        pattern={f.type === 'digits9' ? '[0-9]*' : undefined}
                        maxLength={f.type === 'digits9' ? 9 : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="comply-meta-grid" style={{ marginBottom: 0 }}>
                <div>
                  <div className="comply-meta-key">TIN Number</div>
                  <div className="comply-meta-val comply-meta-val--mono">{formatDashedDigits9(selected.tax_id)}</div>
                </div>
                <div>
                  <div className="comply-meta-key">Entity Type</div>
                  <div className="comply-meta-val">{selected.entity_type || '—'}</div>
                </div>
                <div>
                  <div className="comply-meta-key">Registration Status</div>
                  <div className="comply-meta-val">{selected.registration_status || '—'}</div>
                </div>
                <div>
                  <div className="comply-meta-key">Incorporation Date</div>
                  <div className="comply-meta-val">{selected.incorporation_date || '—'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="comply-meta-key">Registered Address</div>
                  <div className="comply-meta-val">{selected.registered_address || '—'}</div>
                </div>
                <div>
                  <div className="comply-meta-key">Contact Person</div>
                  <div className="comply-meta-val">{selected.contact_name || '—'}</div>
                </div>
                <div>
                  <div className="comply-meta-key">Email</div>
                  <div className="comply-meta-val">{selected.email || '—'}</div>
                </div>
                <div>
                  <div className="comply-meta-key">Phone (WhatsApp)</div>
                  <div className="comply-meta-val">{selected.phone_wa || '—'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
