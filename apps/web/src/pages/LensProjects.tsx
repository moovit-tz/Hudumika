import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensProject } from '@hudumika/types';

export function LensProjects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<LensProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ key: '', name: '', description: '', lead_id: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/lens/projects')
      .then((res: any) => setProjects(Array.isArray(res) ? res : []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key.trim() || !form.name.trim()) {
      setError('Key and Name are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/v1/lens/projects', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setOpenModal(false);
      setForm({ key: '', name: '', description: '', lead_id: '' });
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        title="Engineering Projects"
        subtitle="Manage product repositories, engineering domains, and release tracks."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Projects' }]}
        actions={
          <Button variant="default" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            New Project
          </Button>
        }
      />

      {loading ? (
        <SectionLoading />
      ) : projects.length === 0 ? (
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No projects registered</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              Create a project to bind repositories, track cycle velocity, and group engineering issues.
            </p>
            <Button variant="default" onClick={() => setOpenModal(true)}>Create Project</Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <div
              key={p.id}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '20px',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Badge variant="brand">{p.key}</Badge>
                  <span style={{ fontSize: 12, color: p.is_active ? 'var(--green)' : 'var(--ink3)', fontWeight: 600 }}>
                    {p.is_active ? '● Active' : '○ Archived'}
                  </span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                  {p.name}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 16px 0', lineHeight: 1.5, minHeight: 40 }}>
                  {p.description || 'No description provided.'}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  {p.lead_id ? `Lead: ${p.lead_id}` : 'Unassigned Lead'}
                </span>
                <Button variant="outline" size="sm" onClick={() => navigate(`/lens?project_id=${p.id}`)}>
                  View Issues
                  <Icon name="arrowRight" size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogTitle>Create Engineering Project</DialogTitle>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--red-light, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Project Key *
              </label>
              <input
                type="text"
                value={form.key}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))}
                placeholder="e.g. HUD, PLAT, COMPLY"
                maxLength={8}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Project Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Platform Infrastructure"
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Brief summary of domain ownership and scope"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Button>
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensProjects;
