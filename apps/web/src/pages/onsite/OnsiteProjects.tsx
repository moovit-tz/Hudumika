import React, { useEffect, useState } from 'react';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteProject } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteProjects() {
  const [projects, setProjects] = useState<OnsiteProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#4361ee');
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = () => {
    setLoading(true);
    apiFetch('/v1/onsite/projects')
      .then(setProjects)
      .catch((err: any) => setError(err.message ?? 'Failed to load projects'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/projects', {
        method: 'POST',
        body: JSON.stringify({ name, description, color }),
      });
      setShowAddModal(false);
      setName('');
      setDescription('');
      fetchProjects();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create project', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async (id: string, projectName: string) => {
    if (!(await showConfirm(`Are you sure you want to delete project "${projectName}"?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/projects/${id}`, { method: 'DELETE' });
      fetchProjects();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete project', { variant: 'error' });
    }
  };

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Projects</h1>
          <p>Organize infrastructure resources into client or team project containers.</p>
        </div>
        <div className="onsite-header-actions">
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading projects…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="folder" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No projects created yet</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            Create a project to group your domains, servers, and applications together.
          </p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Create First Project
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {projects.map((p) => (
            <div key={p.id} className="onsite-card" style={{ borderLeft: `4px solid ${p.color || '#4361ee'}` }}>
              <div className="onsite-card-header">
                <h3 className="onsite-card-title">{p.name}</h3>
                <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDeleteProject(p.id, p.name)}>
                  <Icon name="trash2" size={14} />
                </button>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', margin: 0 }}>
                {p.description || 'No description provided.'}
              </p>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
                Created {new Date(p.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Project Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Create Project</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="e.g. Acme Corp Portal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>Description</label>
                <textarea
                  className="onsite-textarea"
                  placeholder="Client infrastructure for Acme Corp"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="onsite-form-group">
                <label>Group Accent Color</label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: '60px', height: '36px', padding: 0, border: 'none', cursor: 'pointer' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
