import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { Button } from '../components/ui/button.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensReport, LensReportStatus } from '@hudumika/types';

const STATUS_VARIANT: Record<LensReportStatus, 'error' | 'warning' | 'brand' | 'success' | 'gray'> = {
  NEW: 'error',
  TRIAGED: 'warning',
  LINKED: 'brand',
  RESOLVED: 'success',
  REJECTED: 'gray',
};

export function LensReports() {
  const [reports, setReports] = useState<LensReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LensReport | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const qs = filterStatus ? `?status=${filterStatus}` : '';
    apiFetch(`/v1/lens/reports${qs}`)
      .then((res: any) => setReports(Array.isArray(res) ? res : []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function handleTriage(createItem: boolean, nextStatus: LensReportStatus) {
    if (!selected) return;
    setTriaging(true);
    setTriageError(null);
    try {
      await apiFetch(`/v1/lens/reports/${selected.id}/triage`, {
        method: 'PATCH',
        body: JSON.stringify({
          create_lens_item: createItem,
          status: nextStatus,
          resolution_notes: resolutionNotes || undefined,
        }),
      });
      setSelected(null);
      setResolutionNotes('');
      load();
    } catch (err: any) {
      setTriageError(err?.message || 'Failed to triage report');
    } finally {
      setTriaging(false);
    }
  }

  const filtered = reports.filter(r => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.summary || '').toLowerCase().includes(q) ||
      (r.reporter_name || '').toLowerCase().includes(q) ||
      (r.reporter_email || '').toLowerCase().includes(q) ||
      r.source_app.toLowerCase().includes(q)
    );
  });

  const newCount = reports.filter(r => r.status === 'NEW').length;
  const triagedCount = reports.filter(r => r.status === 'TRIAGED' || r.status === 'LINKED').length;
  const resolvedCount = reports.filter(r => r.status === 'RESOLVED').length;

  return (
    <div className="lens-workspace">
      <PageHeader
        titlePlain="Defect reports"
        titleEm="intake"
        subtitle="Review runtime defect submissions and convert them to tracked engineering items."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Reports' }]}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Select value={filterStatus || 'all'} onValueChange={value => setFilterStatus(value === 'all' ? '' : value)}>
              <SelectTrigger style={{ minWidth: 150 }} aria-label="Filter reports by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {['NEW', 'TRIAGED', 'LINKED', 'RESOLVED', 'REJECTED'].map(status => (
                  <SelectItem key={status} value={status}>{status[0] + status.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Stats & Search Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge variant="error">
            {newCount} New {newCount === 1 ? 'Report' : 'Reports'}
          </Badge>
          <Badge variant="brand">
            {triagedCount} Triaged / Linked
          </Badge>
          <Badge variant="success">
            {resolvedCount} Resolved
          </Badge>
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none', display: 'flex', zIndex: 1 }}>
            <Icon name="search" size={14} />
          </span>
          <Input
            type="search"
            aria-label="Search reports"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search reports..."
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon"><Icon name="inbox" size={24} /></span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
              {query || filterStatus ? 'No matching defect reports' : 'No reports pending'}
            </h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0' }}>
              {query || filterStatus ? 'Try clearing your search or status filter.' : 'Defect submissions from in-app bug reporting will land here with sanitized runtime context.'}
            </p>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => (
            <div
              key={r.id}
              onClick={() => { setSelected(r); setResolutionNotes(r.resolution_notes || ''); setTriageError(null); }}
              className="card lens-record lens-record-row"
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                boxShadow: 'var(--elev-sm)',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Badge variant="brand">{r.source_app.toUpperCase()}</Badge>
                  <Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{r.title}</span>
                </div>

                <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8, lineHeight: 1.45, maxWidth: 900 }}>
                  {r.summary}
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>Reporter: {r.reporter_name || r.reporter_email || 'Staff'} ({r.reporter_role || 'Staff'})</span>
                  {r.source_route && <span>Route: <code>{r.source_route}</code></span>}
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                </div>
              </div>

              <Button size="sm" variant="outline" style={{ flexShrink: 0 }}>
                Inspect & Triage
                <Icon name="arrowRight" size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Inspect & Triage Dialog */}
      <Dialog open={Boolean(selected)} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-160">
          <DialogTitle>Triage Defect Report</DialogTitle>
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12, maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
              {triageError && (
                <div style={{ padding: '8px 12px', background: 'var(--red-l, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                  {triageError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge variant="brand">{selected.source_app.toUpperCase()}</Badge>
                <Badge variant={STATUS_VARIANT[selected.status] || 'gray'}>{selected.status}</Badge>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{selected.title}</span>
              </div>

              <div style={{ background: 'var(--bg)', padding: '14px 16px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--ink)' }}>Summary:</strong> {selected.summary}
                </div>
                {selected.steps_to_reproduce && (
                  <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--ink)' }}>Steps to reproduce:</strong> {selected.steps_to_reproduce}
                  </div>
                )}
                {selected.expected_behavior && (
                  <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--ink)' }}>Expected:</strong> {selected.expected_behavior}
                  </div>
                )}
                {selected.actual_behavior && (
                  <div style={{ lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--ink)' }}>Actual:</strong> {selected.actual_behavior}
                  </div>
                )}
              </div>

              {selected.client_context && Object.keys(selected.client_context).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, color: 'var(--ink3)' }}>
                    Client Context (Sanitized)
                  </div>
                  <pre style={{ background: 'var(--ink)', color: 'var(--white)', padding: '12px 14px', borderRadius: 6, fontSize: 11.5, overflowX: 'auto', maxHeight: 160 }}>
                    {JSON.stringify(selected.client_context, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <label htmlFor="report-triage-notes" style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, color: 'var(--ink3)' }}>
                  Resolution / Triage Notes
                </label>
                <Textarea
                  id="report-triage-notes"
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes explaining root cause, fix commit, or rejection reason"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border-light)', flexWrap: 'wrap', gap: 10 }}>
                <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={triaging}
                    onClick={() => handleTriage(false, 'REJECTED')}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={triaging}
                    onClick={() => handleTriage(false, 'RESOLVED')}
                  >
                    Mark Resolved
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={triaging}
                    onClick={() => handleTriage(true, 'LINKED')}
                  >
                    <Icon name="plus" size={14} />
                    {triaging ? 'Creating...' : 'Create Lens Issue'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensReports;
