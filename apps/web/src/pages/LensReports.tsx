import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
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
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

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
      alert(err?.message || 'Failed to triage report');
    } finally {
      setTriaging(false);
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        title="Defect Reports Intake"
        subtitle="Triaging bugs and incident reports across all 30+ Hudumika apps and workspaces."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Reports' }]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--white)',
                fontSize: 13,
              }}
            >
              <option value="">All Statuses</option>
              <option value="NEW">New</option>
              <option value="TRIAGED">Triaged</option>
              <option value="LINKED">Linked</option>
              <option value="RESOLVED">Resolved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        }
      />

      {loading ? (
        <SectionLoading />
      ) : reports.length === 0 ? (
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No reports pending</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0' }}>
              Defect submissions from in-app reporting will land here with sanitized runtime context.
            </p>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map(r => (
            <div
              key={r.id}
              onClick={() => { setSelected(r); setResolutionNotes(r.resolution_notes || ''); }}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Badge variant="brand">{r.source_app.toUpperCase()}</Badge>
                  <Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{r.title}</span>
                </div>

                <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 6, maxWidth: 800 }}>
                  {r.summary}
                </div>

                <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', gap: 16 }}>
                  <span>Reporter: {r.reporter_name || r.reporter_email || 'Staff'} ({r.reporter_role || 'Staff'})</span>
                  {r.source_route && <span>Route: <code>{r.source_route}</code></span>}
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button size="sm" variant="outline">
                  Inspect & Triage
                  <Icon name="arrowRight" size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect & Triage Dialog */}
      <Dialog open={Boolean(selected)} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent>
          <DialogTitle>Triage Defect Report</DialogTitle>
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12, maxHeight: '75vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge variant="brand">{selected.source_app.toUpperCase()}</Badge>
                <Badge variant={STATUS_VARIANT[selected.status] || 'gray'}>{selected.status}</Badge>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{selected.title}</span>
              </div>

              <div style={{ background: 'var(--surface-hover)', padding: '12px 14px', borderRadius: 6, fontSize: 13 }}>
                <div style={{ marginBottom: 6 }}><strong>Summary:</strong> {selected.summary}</div>
                {selected.steps_to_reproduce && (
                  <div style={{ marginBottom: 6 }}><strong>Steps to reproduce:</strong> {selected.steps_to_reproduce}</div>
                )}
                {selected.expected_behavior && (
                  <div style={{ marginBottom: 6 }}><strong>Expected:</strong> {selected.expected_behavior}</div>
                )}
                {selected.actual_behavior && (
                  <div><strong>Actual:</strong> {selected.actual_behavior}</div>
                )}
              </div>

              {selected.client_context && Object.keys(selected.client_context).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, color: 'var(--ink3)' }}>
                    Client Context (Sanitized)
                  </div>
                  <pre style={{ background: 'var(--ink)', color: 'var(--white)', padding: '10px 14px', borderRadius: 6, fontSize: 11, overflowX: 'auto' }}>
                    {JSON.stringify(selected.client_context, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, color: 'var(--ink3)' }}>
                  Resolution Notes
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes explaining root cause, fix commit, or rejection reason"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    boxSizing: 'border-box',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="outline"
                    disabled={triaging}
                    onClick={() => handleTriage(false, 'REJECTED')}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    disabled={triaging}
                    onClick={() => handleTriage(false, 'RESOLVED')}
                  >
                    Mark Resolved
                  </Button>
                  <Button
                    variant="default"
                    disabled={triaging}
                    onClick={() => handleTriage(true, 'LINKED')}
                  >
                    <Icon name="plus" size={14} />
                    Promote to Lens Item
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
