import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LensItem } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';

export function LensRoadmap() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LensItem[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [query, setQuery] = useState('');

  // New Epic modal
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    title: '',
    body: '',
    project_id: '',
    status: 'OPEN',
    severity: 'NORMAL',
    confidence: 'CONFIRMED',
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<any>('/v1/lens/items?kind=EPIC&include_closed=1'),
      apiFetch<any>('/v1/lens/projects').catch(() => []),
    ])
      .then(([itemRes, projRes]) => {
        const list = Array.isArray(itemRes) ? itemRes : itemRes?.data ?? [];
        setItems(list);
        setProjects(Array.isArray(projRes) ? projRes : []);
        setError('');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setSaveError('An Epic title is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await apiFetch('/v1/lens/items', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'EPIC',
          title: form.title.trim(),
          body: form.body.trim() || null,
          project_id: form.project_id || null,
          status: form.status,
          severity: form.severity,
          confidence: form.confidence,
        }),
      });
      setOpenModal(false);
      setForm({ title: '', body: '', project_id: '', status: 'OPEN', severity: 'NORMAL', confidence: 'CONFIRMED' });
      load();
    } catch (err: any) {
      setSaveError(err?.message || 'Could not create epic');
    } finally {
      setSaving(false);
    }
  }

  const filtered = items.filter(it => {
    if (statusFilter !== 'ALL' && it.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return it.title.toLowerCase().includes(q) || it.ref.toLowerCase().includes(q) || (it.body || '').toLowerCase().includes(q);
    }
    return true;
  });

  const activeEpics = items.filter(i => i.status !== 'DONE' && i.status !== 'WONTFIX').length;
  const completedEpics = items.filter(i => i.status === 'DONE').length;

  return (
    <div className="lens-workspace">
      <PageHeader
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Roadmap' }]}
        titlePlain="Product"
        titleEm="roadmap"
        subtitle="Track strategic engineering epics from planning through verification and release."
        actions={
          <Button size="sm" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            New Epic
          </Button>
        }
      />

      {/* Summary & Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge variant="brand">
            {items.length} Total Epics
          </Badge>
          <Badge variant="info">
            {activeEpics} In Flight
          </Badge>
          <Badge variant="success">
            {completedEpics} Completed
          </Badge>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger style={{ minWidth: 140 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="BLOCKED">Blocked</SelectItem>
              <SelectItem value="DONE">Completed</SelectItem>
            </SelectContent>
          </Select>

          <div style={{ position: 'relative', width: 220 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none', display: 'flex', zIndex: 1 }}>
              <Icon name="search" size={14} />
            </span>
            <Input
              type="search"
              aria-label="Search epics"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search epics..."
              style={{ paddingLeft: 30 }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : error ? (
        <Banner variant="error" title="Roadmap unavailable">{error}</Banner>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon"><Icon name="map" size={24} /></span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
              {query || statusFilter !== 'ALL' ? 'No matching epics found' : 'No epics planned yet'}
            </h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              {query || statusFilter !== 'ALL' ? 'Adjust your status filter or search query.' : 'Create an epic to organize major feature initiatives and cross-cutting milestones.'}
            </p>
            {query || statusFilter !== 'ALL' ? (
              <Button size="sm" variant="outline" onClick={() => { setQuery(''); setStatusFilter('ALL'); }}>Clear Filters</Button>
            ) : (
              <Button size="sm" onClick={() => setOpenModal(true)}>Create First Epic</Button>
            )}
          </div>
        </SectionCard>
      ) : (
        <div className="lens-record-grid">
          {filtered.map(epic => (
            <article
              key={epic.id}
              className="card lens-record"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '18px 20px',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                boxShadow: 'var(--elev-sm)',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{epic.ref}</span>
                    <Badge variant="brand">EPIC</Badge>
                  </div>
                  <Badge variant={epic.status === 'DONE' ? 'success' : epic.status === 'IN_PROGRESS' ? 'brand' : epic.status === 'BLOCKED' ? 'error' : 'gray'}>
                    {epic.status.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)', lineHeight: 1.35 }}>
                  <Link to={`/lens/items/${encodeURIComponent(epic.ref)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {epic.title}
                  </Link>
                </h3>

                {epic.body && (
                  <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 16px 0', lineHeight: 1.5, minHeight: 38 }}>
                    {epic.body}
                  </p>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Opened {new Date(epic.created_at).toLocaleDateString()}
                </span>
                <Button variant="outline" size="sm" onClick={() => navigate(`/lens/items/${encodeURIComponent(epic.ref)}`)}>
                  View Epic
                  <Icon name="arrowRight" size={14} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* New Epic Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogTitle>Create Strategic Epic</DialogTitle>
          <form onSubmit={handleCreateEpic} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {saveError && (
              <div style={{ padding: '8px 12px', background: 'var(--red-l, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {saveError}
              </div>
            )}

            <div>
              <label htmlFor="epic-title" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Epic Title *
              </label>
              <Input
                id="epic-title"
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Multi-Tenant Cross-Border Freight Gateway"
                required
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="epic-project" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                  Project
                </label>
                <Select value={form.project_id || '__none__'} onValueChange={v => setForm(f => ({ ...f, project_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger id="epic-project"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="epic-status" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                  Status
                </label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="epic-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="BLOCKED">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label htmlFor="epic-desc" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Epic Description & Scope
              </label>
              <Textarea
                id="epic-desc"
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={4}
                placeholder="Describe key outcomes, business motivation, and acceptance criteria"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Button>
              <Button type="submit" variant="default" disabled={saving || !form.title.trim()}>
                {saving ? 'Creating...' : 'Create Epic'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensRoadmap;
