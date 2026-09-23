import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import type { AdvancedSearchQuery } from './AdvancedEmailSearch.js';

interface EmailFilterActions {
  skipInbox?: boolean;
  archive?: boolean;
  star?: boolean;
  markRead?: boolean;
  delete?: boolean;
  label?: string;
}
interface EmailFilterRow {
  id: string;
  criteria: AdvancedSearchQuery;
  actions: EmailFilterActions;
}

function summarizeCriteria(c: AdvancedSearchQuery): string {
  const parts: string[] = [];
  if (c.from) parts.push(`from:${c.from}`);
  if (c.to) parts.push(`to:${c.to}`);
  if (c.subject) parts.push(`subject:${c.subject}`);
  if (c.hasWords) parts.push(`"${c.hasWords}"`);
  if (c.doesntHave) parts.push(`-"${c.doesntHave}"`);
  if (c.hasAttachment) parts.push('has:attachment');
  return parts.join(' ') || '(any message)';
}

const EMPTY_ACTIONS: EmailFilterActions = {};

/**
 * Filters (email_filters, migration 495) — a saved criteria+action rule,
 * applied going forward at IMAP ingest (imap-email-ingest.job.ts) and
 * optionally retroactively. `pendingCriteria`, when set, means the user hit
 * "Create filter" from the Advanced Search popover — pre-fills the new-
 * filter form with exactly what they just searched, matching Gmail's own
 * dual-purpose search/filter form. `onConsumePending` clears it once used
 * so navigating away and back doesn't keep re-opening the form.
 */
export function FilterManager({ labelDefs, pendingCriteria, onConsumePending }: {
  labelDefs: { name: string }[];
  pendingCriteria?: AdvancedSearchQuery | null;
  onConsumePending?: () => void;
}) {
  const [filters, setFilters] = useState<EmailFilterRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [criteria, setCriteria] = useState<AdvancedSearchQuery>({});
  const [actions, setActions] = useState<EmailFilterActions>(EMPTY_ACTIONS);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/v1/email/filters').then(res => setFilters(Array.isArray(res) ? res : [])).catch(() => setFilters([]));
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (pendingCriteria) {
      setCriteria(pendingCriteria);
      setActions(EMPTY_ACTIONS);
      setAdding(true);
      onConsumePending?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCriteria]);

  async function save() {
    if (!Object.values(criteria).some(v => v !== undefined && v !== '')) return showAlert('Add at least one criterion.');
    if (!Object.values(actions).some(Boolean)) return showAlert('Choose at least one action.');
    setSaving(true);
    try {
      const res = await apiFetch('/v1/email/filters', {
        method: 'POST',
        body: JSON.stringify({ criteria, actions, applyToExisting }),
      });
      if (res.appliedCount > 0) showAlert(`Filter saved — applied to ${res.appliedCount} existing message(s).`, { variant: 'success' });
      setAdding(false);
      setCriteria({});
      setActions(EMPTY_ACTIONS);
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to save filter.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/v1/email/filters/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to delete filter.');
    }
  }

  if (filters === null) return <p className="em-settings-hint">Loading filters…</p>;

  return (
    <div>
      <div className="em-label-manage-list">
        {filters.map(f => (
          <div key={f.id} className="em-label-manage-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 13 }}>{summarizeCriteria(f.criteria)}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="em-attach-chip-remove" onClick={() => remove(f.id)}><Icon name="trash" size={13} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(f.actions.archive || f.actions.skipInbox) && <Badge variant="gray">Skip inbox</Badge>}
              {f.actions.star && <Badge variant="warning">Star it</Badge>}
              {f.actions.markRead && <Badge variant="info">Mark as read</Badge>}
              {f.actions.label && <Badge variant="brand">Label: {f.actions.label}</Badge>}
              {f.actions.delete && <Badge variant="error">Delete it</Badge>}
            </div>
          </div>
        ))}
        {filters.length === 0 && !adding && <p className="em-settings-hint">No filters yet.</p>}
      </div>

      {adding ? (
        <div className="em-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, marginTop: 10 }}>
          <div className="em-settings-section-hdr" style={{ marginBottom: 0 }}>When a message matches…</div>
          <div className="em-settings-row"><span className="em-compose-label">From</span><input className="em-compose-input em-settings-input" value={criteria.from ?? ''} onChange={e => setCriteria({ ...criteria, from: e.target.value || undefined })} /></div>
          <div className="em-settings-row"><span className="em-compose-label">To</span><input className="em-compose-input em-settings-input" value={criteria.to ?? ''} onChange={e => setCriteria({ ...criteria, to: e.target.value || undefined })} /></div>
          <div className="em-settings-row"><span className="em-compose-label">Subject</span><input className="em-compose-input em-settings-input" value={criteria.subject ?? ''} onChange={e => setCriteria({ ...criteria, subject: e.target.value || undefined })} /></div>
          <div className="em-settings-row"><span className="em-compose-label">Has the words</span><input className="em-compose-input em-settings-input" value={criteria.hasWords ?? ''} onChange={e => setCriteria({ ...criteria, hasWords: e.target.value || undefined })} /></div>
          <label className="em-compose-receipt-row">
            <input type="checkbox" checked={!!criteria.hasAttachment} onChange={e => setCriteria({ ...criteria, hasAttachment: e.target.checked || undefined })} />
            Has attachment
          </label>

          <div className="em-settings-section-hdr" style={{ marginBottom: 0, marginTop: 6 }}>Do this…</div>
          <label className="em-compose-receipt-row"><input type="checkbox" checked={!!actions.skipInbox} onChange={e => setActions({ ...actions, skipInbox: e.target.checked })} /> Skip the inbox (archive it)</label>
          <label className="em-compose-receipt-row"><input type="checkbox" checked={!!actions.star} onChange={e => setActions({ ...actions, star: e.target.checked })} /> Star it</label>
          <label className="em-compose-receipt-row"><input type="checkbox" checked={!!actions.markRead} onChange={e => setActions({ ...actions, markRead: e.target.checked })} /> Mark as read</label>
          <label className="em-compose-receipt-row"><input type="checkbox" checked={!!actions.delete} onChange={e => setActions({ ...actions, delete: e.target.checked })} /> Delete it</label>
          <div className="em-settings-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!actions.label} onChange={e => setActions({ ...actions, label: e.target.checked ? (labelDefs[0]?.name ?? '') : undefined })} />
              Apply the label:
            </label>
            {actions.label !== undefined && (
              <select className="em-compose-input em-settings-input" value={actions.label} onChange={e => setActions({ ...actions, label: e.target.value })}>
                {labelDefs.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
            )}
          </div>
          <label className="em-compose-receipt-row">
            <input type="checkbox" checked={applyToExisting} onChange={e => setApplyToExisting(e.target.checked)} />
            Also apply to matching conversations already in your mailbox
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create filter'}</button>
            <button type="button" className="em-text-btn" onClick={() => { setAdding(false); setCriteria({}); setActions(EMPTY_ACTIONS); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="em-text-btn" onClick={() => setAdding(true)}>+ New filter</button>
      )}
    </div>
  );
}
