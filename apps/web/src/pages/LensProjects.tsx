import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
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
  const [query, setQuery] = useState('');

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

  const filtered = projects.filter(p => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  });

  const activeCount = projects.filter(p => p.is_active !== false).length;

  return (
    <div className="lens-workspace">
      <PageHeader
        titlePlain="Engineering"
        titleEm="projects"
        subtitle="Manage product repositories, engineering domains, and release tracks."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Projects' }]}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button size="sm" onClick={() => setOpenModal(true)}>
              <Icon name="plus" size={16} />
              New Project
            </Button>
          </div>
        }
      />

      {/* Quick summary & search bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge variant="brand">
            {projects.length} Total {projects.length === 1 ? 'Project' : 'Projects'}
          </Badge>
          <Badge variant="success">
            {activeCount} Active
          </Badge>
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none', display: 'flex', zIndex: 1 }}>
            <Icon name="search" size={14} />
          </span>
          <Input
            type="search"
            aria-label="Search projects"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects..."
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon"><Icon name="folder" size={24} /></span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
              {query ? 'No matching projects' : 'No projects registered'}
            </h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              {query ? 'Try a different search term or clear the filter.' : 'Create a project to bind repositories, track cycle velocity, and group engineering issues.'}
            </p>
            {query ? (
              <Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear Search</Button>
            ) : (
              <Button size="sm" onClick={() => setOpenModal(true)}>Create Project</Button>
            )}
          </div>
        </SectionCard>
      ) : (
        <div className="lens-record-grid">
          {filtered.map(p => (
            <div
              key={p.id}
              className="card lens-record"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '16px 18px',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                boxShadow: 'var(--elev-sm)',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Badge variant="brand">{p.key}</Badge>
                  <span style={{ fontSize: 12, color: p.is_active !== false ? 'var(--green)' : 'var(--ink3)', fontWeight: 600 }}>
                    {p.is_active !== false ? '● Active' : '○ Archived'}
                  </span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)', lineHeight: 1.3 }}>
                  {p.name}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 16px 0', lineHeight: 1.5, minHeight: 38 }}>
                  {p.description || 'No description provided.'}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  {p.lead_id ? `Lead: ${p.lead_id}` : 'Unassigned'}
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
              <div style={{ padding: '8px 12px', background: 'var(--red-l, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div>
              <label htmlFor="project-key" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Project Key *
              </label>
              <Input
                id="project-key"
                type="text"
                value={form.key}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))}
                placeholder="e.g. HUD, PLAT, COMPLY"
                maxLength={8}
                required
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label htmlFor="project-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Project Name *
              </label>
              <Input
                id="project-name"
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Platform Infrastructure"
                required
              />
            </div>
            <div>
              <label htmlFor="project-desc" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Description
              </label>
              <Textarea
                id="project-desc"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Brief summary of domain ownership and scope"
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
