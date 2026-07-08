import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import './SupportSettings.css';

type RuleType = 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger';

interface Rule {
  id: string; type: RuleType; name: string; enabled: boolean; config: any;
}

interface Agent { id: string; name: string; email: string; role: string; }

const SECTIONS: { type: RuleType; title: string; icon: IconName; desc: string }[] = [
  { type: 'auto_assign', title: 'Auto-Assignment', icon: 'userCheck', desc: 'Route new tickets to agents automatically.' },
  { type: 'sla_escalation', title: 'SLA Escalation', icon: 'alertTriangle', desc: 'Notify or escalate tickets approaching or past their SLA deadline.' },
  { type: 'status_automation', title: 'Status Automation', icon: 'refresh', desc: 'Automatically close stale resolved tickets.' },
  { type: 'notification_trigger', title: 'Notification Triggers', icon: 'bell', desc: 'Send in-app notifications on ticket events.' },
];

function RuleConfigSummary({ rule, agents }: { rule: Rule; agents: Agent[] }) {
  const c = rule.config || {};
  const nameOf = (id: string) => agents.find(a => a.id === id)?.name || id;
  switch (rule.type) {
    case 'auto_assign':
      return <span>{c.strategy || 'round_robin'} · {(c.agentIds || []).length} agent{(c.agentIds || []).length === 1 ? '' : 's'}</span>;
    case 'sla_escalation':
      return <span>Escalate at {c.thresholdPercent ?? 80}% elapsed{c.escalateToRole ? ` → ${c.escalateToRole}` : c.escalateToUserId ? ` → ${nameOf(c.escalateToUserId)}` : ''}</span>;
    case 'status_automation':
      return <span>Auto-close after {c.autoCloseAfterDays ?? '—'} day{c.autoCloseAfterDays === 1 ? '' : 's'} resolved</span>;
    case 'notification_trigger':
      return <span>On {String(c.event || '—').replace('_', ' ')} → notify {c.notify === 'assignee' ? 'assignee' : c.notify === 'manager_role' ? 'managers' : 'selected users'}</span>;
  }
}

function RuleForm({ type, agents, onCancel, onSave, saving }: {
  type: RuleType; agents: Agent[]; onCancel: () => void; onSave: (name: string, config: any) => void; saving: boolean;
}) {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('round_robin');
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [thresholdPercent, setThresholdPercent] = useState(80);
  const [escalateToRole, setEscalateToRole] = useState('MANAGER');
  const [autoCloseAfterDays, setAutoCloseAfterDays] = useState(3);
  const [event, setEvent] = useState('new_ticket');
  const [notify, setNotify] = useState('assignee');

  const toggleAgent = (id: string) => setAgentIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

  function handleSave() {
    if (!name.trim()) return;
    const config =
      type === 'auto_assign' ? { strategy, agentIds } :
      type === 'sla_escalation' ? { thresholdPercent, escalateToRole } :
      type === 'status_automation' ? { autoCloseAfterDays } :
      { event, notify };
    onSave(name.trim(), config);
  }

  return (
    <div className="ssg-form">
      <div className="ssg-field">
        <label>Rule name</label>
        <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Round-robin support" />
      </div>

      {type === 'auto_assign' && (
        <>
          <div className="ssg-field">
            <label>Strategy</label>
            <select className="input-field" value={strategy} onChange={e => setStrategy(e.target.value)}>
              <option value="round_robin">Round robin</option>
              <option value="load_based">Least open tickets</option>
              <option value="category_match">By category</option>
            </select>
          </div>
          <div className="ssg-field">
            <label>Eligible agents</label>
            <div className="ssg-agent-picker">
              {agents.length === 0 && <span className="ssg-hint">No eligible agents found for this tenant.</span>}
              {agents.map(a => (
                <label key={a.id} className="ssg-agent-chip">
                  <input type="checkbox" checked={agentIds.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {type === 'sla_escalation' && (
        <>
          <div className="ssg-field">
            <label>Escalate when elapsed % of SLA reaches</label>
            <input type="number" className="input-field" min={1} max={100} value={thresholdPercent} onChange={e => setThresholdPercent(Number(e.target.value) || 80)} />
          </div>
          <div className="ssg-field">
            <label>Escalate to role</label>
            <select className="input-field" value={escalateToRole} onChange={e => setEscalateToRole(e.target.value)}>
              <option value="MANAGER">Manager</option>
              <option value="TENANT_ADMIN">Tenant Admin</option>
              <option value="SENIOR">Senior</option>
            </select>
          </div>
        </>
      )}

      {type === 'status_automation' && (
        <div className="ssg-field">
          <label>Auto-close resolved tickets after (days)</label>
          <input type="number" className="input-field" min={1} value={autoCloseAfterDays} onChange={e => setAutoCloseAfterDays(Number(e.target.value) || 1)} />
        </div>
      )}

      {type === 'notification_trigger' && (
        <>
          <div className="ssg-field">
            <label>Event</label>
            <select className="input-field" value={event} onChange={e => setEvent(e.target.value)}>
              <option value="new_ticket">New ticket</option>
              <option value="sla_breach">SLA breach</option>
              <option value="reassigned">Reassigned</option>
              <option value="status_changed">Status changed</option>
            </select>
          </div>
          <div className="ssg-field">
            <label>Notify</label>
            <select className="input-field" value={notify} onChange={e => setNotify(e.target.value)}>
              <option value="assignee">The ticket's assignee</option>
              <option value="manager_role">All managers</option>
            </select>
          </div>
        </>
      )}

      <div className="ssg-form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim() || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Create rule'}
        </button>
      </div>
    </div>
  );
}

export const SupportSettings: React.FC = () => {
  const { user } = useAuth();
  const canManage = MGMT_ROLES.includes(user?.role as any);

  const [rules, setRules] = useState<Rule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState<RuleType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([
        apiFetch('/v1/support/rules'),
        apiFetch('/v1/support/agents'),
      ]);
      setRules(Array.isArray(r) ? r : []);
      setAgents(Array.isArray(a) ? a : []);
    } catch { /* leave lists empty — real error shown only on write actions */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(rule: Rule) {
    try {
      await apiFetch(`/v1/support/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err: any) {
      setError(err?.message || 'Failed to update rule');
    }
  }

  async function handleDelete(rule: Rule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await apiFetch(`/v1/support/rules/${rule.id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== rule.id));
    } catch (err: any) {
      setError(err?.message || 'Failed to delete rule');
    }
  }

  async function handleSave(type: RuleType, name: string, config: any) {
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch('/v1/support/rules', { method: 'POST', body: JSON.stringify({ type, name, config }) });
      setRules(prev => [...prev, created]);
      setOpenForm(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to create rule');
    } finally {
      setSaving(false);
    }
  }

  const integrations: { name: string; icon: IconName; color: string; desc: string; active: boolean }[] = [
    { name: 'WhatsApp Cloud API', icon: 'phone', color: '#25D366', desc: 'Connect WhatsApp Business for two-way messaging.', active: true },
    { name: 'Facebook Messenger', icon: 'messageSquare', color: '#0084FF', desc: 'Receive and reply to Facebook page messages.', active: false },
    { name: 'Email Helpdesk', icon: 'mail', color: '#0569e3', desc: 'Convert incoming emails to tickets.', active: true },
    { name: 'Live Chat Widget', icon: 'messageSquare', color: 'var(--teal)', desc: 'Embed live chat on your website.', active: true },
  ];

  return (
    <div className="ssg-root">
      <PageHeader crumbs={['Support', 'Settings']} titlePlain="Support" titleEm="Settings" />

      <div className="ssg-section-hdr">
        <h3>Rules &amp; Workflows</h3>
        <p>Automate assignment, SLA escalation, status transitions, and notifications around real ticket data.</p>
      </div>

      {error && <div className="ssg-error">{error}</div>}

      {loading ? (
        <div className="ssg-hint">Loading rules…</div>
      ) : (
        <div className="ssg-rules-grid">
          {SECTIONS.map(section => {
            const sectionRules = rules.filter(r => r.type === section.type);
            return (
              <div key={section.type} className="card ssg-rule-card">
                <div className="ssg-rule-card-hdr">
                  <div className="ssg-rule-card-icon"><Icon name={section.icon} size={18} /></div>
                  <div>
                    <div className="ssg-rule-card-title">{section.title}</div>
                    <div className="ssg-rule-card-desc">{section.desc}</div>
                  </div>
                </div>

                {sectionRules.length === 0 && openForm !== section.type && (
                  <div className="ssg-hint">No rules yet.</div>
                )}

                {sectionRules.map(rule => (
                  <div key={rule.id} className="ssg-rule-row">
                    <label className="ssg-toggle">
                      <input type="checkbox" checked={rule.enabled} onChange={() => handleToggle(rule)} disabled={!canManage} />
                      <span className="ssg-toggle-track" />
                    </label>
                    <div className="ssg-rule-row-body">
                      <div className="ssg-rule-row-name">{rule.name}</div>
                      <div className="ssg-rule-row-summary"><RuleConfigSummary rule={rule} agents={agents} /></div>
                    </div>
                    {canManage && (
                      <button type="button" className="ssg-rule-delete" title="Delete rule" onClick={() => handleDelete(rule)}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                ))}

                {canManage && (
                  openForm === section.type ? (
                    <RuleForm type={section.type} agents={agents} saving={saving}
                      onCancel={() => setOpenForm(null)}
                      onSave={(name, config) => handleSave(section.type, name, config)} />
                  ) : (
                    <button type="button" className="ssg-add-rule-btn" onClick={() => setOpenForm(section.type)}>
                      <Icon name="plus" size={13} /> Add rule
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="ssg-section-hdr" style={{ marginTop: 32 }}>
        <h3>Channels &amp; Integrations</h3>
        <p>Connect external channels to route customer messages into your unified inbox.</p>
      </div>

      <div className="card ssg-integrations-card">
        {integrations.map(ig => (
          <div key={ig.name} className="ssg-integration-row">
            <div className="ssg-integration-left">
              <div className="ssg-integration-icon" style={{ background: ig.color + '18' }}>
                <Icon name={ig.icon} size={20} color={ig.color} />
              </div>
              <div>
                <div className="ssg-integration-name">{ig.name}</div>
                <div className="ssg-integration-desc">{ig.desc}</div>
              </div>
            </div>
            <button type="button" className={`btn btn-sm${ig.active ? ' btn-secondary' : ' btn-primary'}`} disabled>
              {ig.active ? 'Manage' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
