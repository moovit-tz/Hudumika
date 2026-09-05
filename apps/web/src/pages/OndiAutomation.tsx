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

export const OndiAutomation: React.FC = () => {
  const [data, setData] = useState<AutomationData | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try { setData(await apiFetch('/v1/ondi/org/automation')); } catch { setData(null); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function updateDefaultRole(roleId: string | null) {
    setSaving(true);
    try {
      await apiFetch('/v1/ondi/org/automation', { method: 'PATCH', body: JSON.stringify({ default_role_id: roleId }) });
      await reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const defaultRoleName = data?.available_roles.find(r => r.id === data.default_role_id)?.name || 'None Set';

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Access"
        titleEm="automation"
        subtitle="Automated lifecycle hooks for employee onboarding and offboarding security triggers."
      />

      {/* KPI Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Joiner Hook</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfeff', color: 'var(--teal)' }}><Icon name="userPlus" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ fontSize: 20, color: 'var(--teal)' }}>{defaultRoleName}</span>
            <span className="ondi-kpi-sub">default new role</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Leaver Hook</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}><Icon name="checkCircle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ fontSize: 20, color: '#047857' }}>Active</span>
            <span className="ondi-kpi-sub">instant revocation</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Execution Log</span>
            <div className="ondi-kpi-icon-box"><Icon name="activity" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{data ? data.log.length : 0}</span>
            <span className="ondi-kpi-sub">automation events</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
        <SectionCard title="Joiner — New Employees Onboarding">
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
            When someone accepts a workspace invitation, automatically grant them this role upon sign-in.
          </div>
          {data === null ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading configuration…</div>
          ) : (
            <Select value={data.default_role_id ?? '__none__'} onValueChange={v => updateDefaultRole(v === '__none__' ? null : v)} disabled={saving}>
              <SelectTrigger style={{ minWidth: 280 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No default role (manual grant required)</SelectItem>
                {data.available_roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </SectionCard>

        <SectionCard title="Leaver — Offboarding & Account Deactivation">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: '#ecfdf5', padding: 16, borderRadius: 10, border: '1px solid rgba(4,120,87,0.2)' }}>
            <Icon name="checkCircle" size={20} color="#047857" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: '#047857', lineHeight: 1.55 }}>
              <strong>Always Active:</strong> The moment an account is deactivated (from Ondi or NexusHR), Ondi instantly revokes its role grants, authorized app tokens, and active sessions. No standing credentials remain on deactivated accounts.
            </div>
          </div>
        </SectionCard>

        <SectionCard padded={false} title="Automation Execution Log">
          {data === null && <div style={{ padding: 24, fontSize: 13, color: 'var(--ink3)' }}>Loading log…</div>}
          {data?.log.length === 0 && <div style={{ padding: 36, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No automation actions recorded yet.</div>}
          <div style={{ overflowX: 'auto' }}>
            <table className="ondi-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Member</th>
                  <th>Summary</th>
                  <th style={{ textAlign: 'right' }}>Executed</th>
                </tr>
              </thead>
              <tbody>
                {data?.log.map(l => (
                  <tr key={l.id}>
                    <td>
                      <span className={`ondi-status-pill ${l.rule === 'joiner_default_role' ? 'success' : 'warning'}`}>
                        {l.rule === 'joiner_default_role' ? 'Joiner Grant' : 'Leaver Revoke'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{l.user_name}</td>
                    <td style={{ color: 'var(--ink2)' }}>{l.summary}</td>
                    <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12 }}>{fmt(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default OndiAutomation;
