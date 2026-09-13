import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../Icon.js';
import type { IconName } from '../Icon.js';
import { PersonAvatar } from '../PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';

type SubjectType = 'lead' | 'deal' | 'customer';
type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'stage_change' | 'created';

interface Activity {
  id: string;
  type: ActivityType;
  body: string;
  actor_id?: string;
  actor_name?: string;
  created_at: string;
}

const TYPE_CFG: Record<ActivityType, { icon: IconName; color: string; bg: string; label: string }> = {
  call:         { icon: 'phone',      color: 'var(--blue)',  bg: 'var(--blue-l)',  label: 'Call' },
  email:        { icon: 'mail',       color: 'var(--teal)',  bg: 'var(--teal-l)',  label: 'Email' },
  meeting:      { icon: 'users',      color: 'var(--purple)', bg: 'var(--purple-l)', label: 'Meeting' },
  note:         { icon: 'fileText',   color: 'var(--gold)',  bg: 'var(--gold-l)',  label: 'Note' },
  stage_change: { icon: 'arrowRight', color: 'var(--ink3)',  bg: 'var(--bg)',      label: 'Stage change' },
  created:      { icon: 'sparkle',    color: 'var(--green)', bg: 'var(--green-l)', label: 'Created' },
};

const MANUAL_TYPES: ActivityType[] = ['call', 'email', 'meeting', 'note'];

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Shared chronological interaction history for a lead, deal or customer —
 * the CRM gap-analysis's "Next" tier item #1. One component, mounted on
 * all three subject types, backed by the single crm_activities table
 * (migration 449) so a deal converted from a lead can eventually show both
 * histories without a second component to build.
 */
export function ActivityTimeline({ subjectType, subjectId, currentUserId }: {
  subjectType: SubjectType; subjectId: string; currentUserId?: string;
}) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [type, setType] = useState<ActivityType>('note');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/v1/crm/activity?subject_type=${subjectType}&subject_id=${subjectId}`)
      .then((rows: Activity[]) => setActivities(Array.isArray(rows) ? rows : []))
      .catch(() => setActivities([]));
  }, [subjectType, subjectId]);

  useEffect(() => { setActivities(null); load(); }, [load]);

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/crm/activity', {
        method: 'POST',
        body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, type, body: body.trim() }),
      });
      setBody('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to log activity');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await showConfirm('Delete this activity entry?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/crm/activity/${id}`, { method: 'DELETE' });
      setActivities(prev => (prev ?? []).filter(a => a.id !== id));
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Select value={type} onValueChange={v => setType(v as ActivityType)}>
          <SelectTrigger style={{ width: 118, height: 36, flexShrink: 0 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {MANUAL_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_CFG[t].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <textarea
          className="input-field"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={`Log a ${TYPE_CFG[type].label.toLowerCase()}…`}
          rows={2}
          style={{ flex: 1, resize: 'vertical', minHeight: 36 }}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={saving || !body.trim()} onClick={submit} style={{ flexShrink: 0 }}>
          {saving ? '…' : 'Log'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {activities === null ? (
          <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '8px 0' }}>Loading activity…</div>
        ) : activities.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '8px 0' }}>Nothing logged yet.</div>
        ) : (
          activities.map(a => {
            const cfg = TYPE_CFG[a.type];
            const canDelete = MANUAL_TYPES.includes(a.type) && (a.actor_id === currentUserId || !currentUserId);
            return (
              <div key={a.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Icon name={cfg.icon} size={12} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}>{a.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    {a.actor_id && <PersonAvatar userId={a.actor_id} name={a.actor_name || ''} size={16} />}
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{a.actor_name || 'System'} · {fmtWhen(a.created_at)}</span>
                  </div>
                </div>
                {canDelete && (
                  <button type="button" onClick={() => remove(a.id)} title="Delete"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, flexShrink: 0, alignSelf: 'flex-start' }}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
