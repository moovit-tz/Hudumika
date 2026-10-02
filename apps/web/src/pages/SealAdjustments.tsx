import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface CycleCount {
  id: string;
  count_ref: string;
  status: string;
  initiated_by: string | null;
  initiated_at: string;
  closed_at: string | null;
  notes: string | null;
  compartment_id: string | null;
  line_count?: number;
  variance_count?: number;
}

const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'gray'> = {
  OPEN: 'gray',
  IN_PROGRESS: 'brand',
  RECONCILING: 'warning',
  CLOSED: 'success',
  CANCELLED: 'error',
};

export function SealAdjustments() {
  const navigate = useNavigate();
  const [compartmentId] = useSealCompartmentId();
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newNotes, setNewNotes] = useState('');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/cycle-counts?${params}`)
      .then((r: any) => setCounts(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [compartmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result: any = await apiFetch('/v1/seal/cycle-counts', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId: compartmentId ?? undefined,
          notes: newNotes.trim() || undefined,
        }),
      });
      setShowNew(false);
      setNewNotes('');
      navigate(`/seal/adjustments/${result.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create cycle count.');
    } finally {
      setSaving(false);
    }
  }

  const open = counts.filter(c => ['OPEN', 'IN_PROGRESS', 'RECONCILING'].includes(c.status));
  const closed = counts.filter(c => c.status === 'CLOSED');

  const filtered = counts.filter(c =>
    !search || c.count_ref.toLowerCase().includes(search.toLowerCase()) ||
    (c.notes ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

  return (
    <div className="seal-page">
      {showNew && (
        <Dialog open onOpenChange={o => { if (!o) setShowNew(false); }}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>New Cycle Count</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate}>
              <DialogBody>
                <div>
                  <label style={lbl}>Notes (optional)</label>
                  <textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Scope, reason for count…" />
                </div>
              </DialogBody>
              <DialogFooter>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Start Count'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <PageHeader
        crumbs={['SEAL', 'Inventory', 'Cycle Counts']}
        titlePlain="Cycle"
        titleEm="counts"
        subtitle="Periodic physical inventory verification — count lots, reconcile variances, post adjustments."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Count</Button>}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active Counts',  value: open.length,    color: 'var(--teal)',  icon: 'clipboardList' },
          { label: 'Completed',      value: closed.length,  color: 'var(--green)', icon: 'checkCircle' },
          { label: 'Total Counts',   value: counts.length,  color: 'var(--ink3)',  icon: 'archive' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: k.color, opacity: 0.75 }}><Icon name={k.icon as any} size={20} /></div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar search={search} onSearch={setSearch} placeholder="Search by reference…" activeFilterCount={0} />
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : filtered.length === 0 ? (
            <div className="seal-empty">No cycle counts yet. Start one to reconcile your inventory.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Initiated By</th>
                  <th>Initiated</th>
                  <th>Closed</th>
                  <th>Lines</th>
                  <th>Variances</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="seal-table-row-clickable" onClick={() => navigate(`/seal/adjustments/${c.id}`)}>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>{c.count_ref}</td>
                    <td>
                      {c.initiated_by
                        ? <PersonAvatar userId={c.initiated_by} name="Initiator" size={22} />
                        : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>
                      }
                    </td>
                    <td style={{ fontSize: 12 }}>{new Date(c.initiated_at).toLocaleDateString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{c.closed_at ? new Date(c.closed_at).toLocaleDateString() : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{c.line_count ?? '—'}</td>
                    <td>
                      {c.variance_count != null && c.variance_count > 0
                        ? <Badge variant="warning">{c.variance_count}</Badge>
                        : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{c.variance_count ?? '—'}</span>
                      }
                    </td>
                    <td><Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>{c.status.replace(/_/g, ' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
