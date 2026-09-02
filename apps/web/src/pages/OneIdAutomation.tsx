// ─── OneIdAutomation.tsx — Ondi Enterprise · Automation ───────────
// Two real, hardcoded joiner/leaver rules (subscribers/ondi.subscribers.ts)
// — not a generic workflow engine, that's Studio. This page configures the
// one thing that's actually configurable (which role new joiners get) and
// shows a real log of what automation has done, rather than a settings
// panel with toggles nothing reads.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface AutomationData {
  default_role_id: string | null;
  available_roles: { id: string; name: string }[];
  log: { id: string; rule: 'joiner_default_role' | 'leaver_revoke_access'; summary: string; created_at: string; user_name: string }[];
}

function fmt(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const OneIdAutomation: React.FC = () => {
  const [data, setData] = useState<AutomationData | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try { setData(await apiFetch('/v1/oneid/org/automation')); } catch { setData(null); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function updateDefaultRole(roleId: string | null) {
    setSaving(true);
    try {
      await apiFetch('/v1/oneid/org/automation', { method: 'PATCH', body: JSON.stringify({ default_role_id: roleId }) });
      await reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Access"
        titleEm="automation"
        subtitle="Real hooks on the moments that already matter — someone joining, someone leaving."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
        <SectionCard title="Joiner — new employees">
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
            When someone accepts a staff invitation, automatically grant them this role. Leave unset and nothing happens automatically — no invented default.
          </div>
          {data === null ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
          ) : (
            <Select value={data.default_role_id ?? '__none__'} onValueChange={v => updateDefaultRole(v === '__none__' ? null : v)} disabled={saving}>
              <SelectTrigger style={{ minWidth: 260 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No default role</SelectItem>
                {data.available_roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </SectionCard>

        <SectionCard title="Leaver — deactivated accounts">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="checkCircle" size={17} color="var(--green)" />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
              Always on. The moment an account is deactivated — from here or from NexusHR — Ondi automatically revokes its role grants, authorized apps, and active sessions. Nothing is left standing against a deactivated account.
            </div>
          </div>
        </SectionCard>

        <SectionCard padded={false} title="Automation log">
          {data === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
          {data?.log.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Nothing has run yet.</div>}
          {data?.log.map((l, i, arr) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: l.rule === 'joiner_default_role' ? 'var(--teal-l)' : 'var(--gold-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={l.rule === 'joiner_default_role' ? 'userPlus' : 'userMinus'} size={15} color={l.rule === 'joiner_default_role' ? 'var(--teal)' : 'var(--gold)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)' }}><strong style={{ fontWeight: 600 }}>{l.user_name}</strong> — {l.summary}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{fmt(l.created_at)}</div>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
};

export default OneIdAutomation;
