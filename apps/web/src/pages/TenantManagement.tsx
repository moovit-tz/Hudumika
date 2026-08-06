import React, { useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { CompanyCard } from '../components/CompanyCard.js';
import { CompanyForm } from '../components/CompanyForm.js';
import { PageHeader } from '../components/PageHeader.js';

export const TenantManagement: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCompany, setEditCompany] = useState<any>(null);
  const [filter, setFilter] = useState('');

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/tenants');
      // Ensure we always set an array; API may return undefined on error or empty response
      setCompanies(res.data ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreate = async (data: any) => {
    await apiFetch('/v1/tenants', { method: 'POST', body: JSON.stringify(data) });
    setShowForm(false);
    fetchCompanies();
  };

  const handleUpdate = async (id: string, data: any) => {
    await apiFetch(`/v1/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setEditCompany(null);
    fetchCompanies();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/v1/tenants/${id}`, { method: 'DELETE' });
    fetchCompanies();
  };

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ padding: '0 0 24px',}}>
      <PageHeader
        crumbs={['Admin', 'Tenants']}
        titlePlain="Tenant"
        titleEm="management"
      />
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Filter companies..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', maxWidth: '300px' }}
        />
      </div>
      <button
        onClick={() => setShowForm(true)}
        style={{
          background: 'var(--teal)',
          color: '#fff',
          border: 'none',
          padding: 'var(--ds-btn-py) 16px',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '16px', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
      >
        + New Company
      </button>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {filteredCompanies.map((c) => (
              <CompanyCard
                key={c.id}
                company={c}
                onEdit={() => setEditCompany(c)}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <CompanyForm
          onClose={() => setShowForm(false)}
          onSubmit={handleCreate}
        />
      )}

      {editCompany && (
        <CompanyForm
          initialData={editCompany}
          onClose={() => setEditCompany(null)}
          onSubmit={(data: any) => handleUpdate(editCompany.id, data)}
        />
      )}
    </div>
  );
};
