import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LensCycle } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Banner } from '../components/ui/alert.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';

export function LensCycles() {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<LensCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    status: 'PLANNING',
  });

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<LensCycle[]>('/v1/lens/cycles')
      .then(res => {
        setCycles(Array.isArray(res) ? res : []);
        setError('');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const cycle = await apiFetch<LensCycle>('/v1/lens/cycles', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
          status: form.status,
        }),
      });
      setCycles(current => [cycle, ...current]);
      setOpen(false);
      setForm({ name: '', start_date: '', end_date: '', status: 'PLANNING' });
    } catch (err: any) {
      setSaveError(err?.message || 'Could not create cycle.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, nextStatus: string) {
    setActionError(null);
    try {
      const updated = await apiFetch<LensCycle>(`/v1/lens/cycles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setCycles(current => current.map(c => c.id === id ? updated : c));
    } catch (err: any) {
      setActionError(err?.message || 'Could not update cycle status');
    }
  }

  const activeCycle = cycles.find(c => c.status === 'ACTIVE');
  const planningCycles = cycles.filter(c => c.status === 'PLANNING' || !c.status);
  const completedCycles = cycles.filter(c => c.status === 'CLOSED');

  return (
    <div className="lens-workspace">
      <PageHeader
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Cycles' }]}
        titlePlain="Planning"
        titleEm="cycles"
        subtitle="Time-boxed iteration schedules, cycle goals, and sprint delivery."
        actions={
          <Button size="sm" onClick={() => { setForm({ name: '', start_date: '', end_date: '', status: 'PLANNING' }); setSaveError(''); setOpen(true); }}>
            <Icon name="plus" size={16} />
            New Cycle
          </Button>
        }
      />

      {/* Cycle Stats Banner */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge variant="brand">
          {cycles.length} Total Cycles
        </Badge>
        <Badge variant="success">
          {activeCycle ? `Active: ${activeCycle.name}` : 'No Active Cycle'}
        </Badge>
        <Badge variant="info">
          {planningCycles.length} In Planning
        </Badge>
        <Badge variant="gray">
          {completedCycles.length} Completed
        </Badge>
      </div>

      {actionError && (
        <div style={{ marginTop: 12 }}>
          <Banner variant="error" title="Action failed">{actionError}</Banner>
        </div>
      )}

      {loading ? (
        <SectionLoading />
      ) : error ? (
        <Banner variant="error" title="Cycles unavailable">{error}</Banner>
      ) : cycles.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon"><Icon name="calendar" size={24} /></span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No cycles planned</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              Create an engineering cycle to set iteration dates and organize sprint commitments.
            </p>
            <Button size="sm" onClick={() => setOpen(true)}>Create First Cycle</Button>
          </div>
        </SectionCard>
      ) : (
        <div className="lens-record-grid">
          {cycles.map(cycle => {
            const isActive = cycle.status === 'ACTIVE';
            const isCompleted = cycle.status === 'CLOSED';
            return (
              <article
                key={cycle.id}
                className="card lens-record"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '18px 20px',
                  borderRadius: 'var(--r-lg)',
                  border: isActive ? '2px solid var(--teal)' : '1px solid var(--border)',
                  background: 'var(--white)',
                  boxShadow: isActive ? 'var(--elev)' : 'var(--elev-sm)',
                  position: 'relative',
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Badge variant={isActive ? 'success' : isCompleted ? 'gray' : 'brand'}>
                      {cycle.status || 'PLANNING'}
                    </Badge>
                    <span style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="calendar" size={13} />
                      {cycle.start_date || cycle.end_date
                        ? `${cycle.start_date ? new Date(cycle.start_date).toLocaleDateString() : 'Start pending'} – ${cycle.end_date ? new Date(cycle.end_date).toLocaleDateString() : 'End pending'}`
                        : 'Dates pending'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px 0', color: 'var(--ink)' }}>
                    {cycle.name}
                  </h3>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isActive && !isCompleted && (
                      <Button size="xs" variant="default" onClick={() => handleUpdateStatus(cycle.id, 'ACTIVE')}>
                        Start Cycle
                      </Button>
                    )}
                    {isActive && (
                      <Button size="xs" variant="outline" onClick={() => handleUpdateStatus(cycle.id, 'COMPLETED')}>
                        Complete Cycle
                      </Button>
                    )}
                  </div>

                  <Button variant="outline" size="sm" onClick={() => navigate(`/lens?q=${encodeURIComponent(cycle.name)}`)}>
                    View Items
                    <Icon name="arrowRight" size={14} />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* New Cycle Dialog */}
      <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next); }}>
        <DialogContent>
          <DialogTitle>Create Planning Cycle</DialogTitle>
          <DialogDescription>Define an engineering iteration timeframe and targets.</DialogDescription>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {saveError && (
              <div style={{ padding: '8px 12px', background: 'var(--red-l, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {saveError}
              </div>
            )}

            <div>
              <label htmlFor="cycle-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Cycle Name *
              </label>
              <Input
                id="cycle-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Cycle 42 — Core Platform Reliability"
                maxLength={200}
                required
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="cycle-start" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                  Start Date
                </label>
                <Input
                  id="cycle-start"
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="cycle-end" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                  End Date
                </label>
                <Input
                  id="cycle-end"
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cycle-status" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Initial Status
              </label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger id="cycle-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNING">Planning</SelectItem>
                  <SelectItem value="ACTIVE">Active (Start Now)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="default" disabled={saving || !form.name.trim()}>
                {saving ? 'Creating...' : 'Create Cycle'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensCycles;
