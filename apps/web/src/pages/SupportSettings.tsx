import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import './SupportSettings.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';

type RuleType = 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger' | 'whatsapp_keyword';

interface Rule {
  id: string; type: RuleType; name: string; enabled: boolean; config: any;
}

interface Agent { id: string; name: string; email: string; role: string; }

const SECTIONS: { type: RuleType; title: string; icon: IconName; desc: string }[] = [
  { type: 'auto_assign', title: 'Auto-Assignment', icon: 'userCheck', desc: 'Route new tickets to agents automatically.' },
  { type: 'sla_escalation', title: 'SLA Escalation', icon: 'alertTriangle', desc: 'Notify or escalate tickets approaching or past their SLA deadline.' },
  { type: 'status_automation', title: 'Status Automation', icon: 'refresh', desc: 'Automatically close stale resolved tickets.' },
  { type: 'notification_trigger', title: 'Notification Triggers', icon: 'bell', desc: 'Send in-app notifications on ticket events.' },
  // Real: matched against every inbound WhatsApp message in
  // webhooks.routes.ts, sent via the same WhatsAppIntegration.sendMessage
  // every other outbound reply on this platform uses — not a decorative
  // keyword list, an actual reply goes out and is logged on the ticket.
  { type: 'whatsapp_keyword', title: 'WhatsApp Auto-Reply', icon: 'chatBubble', desc: 'Reply automatically when an inbound WhatsApp message matches a keyword.' },
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
    case 'whatsapp_keyword':
      return <span>{c.matchType === 'exact' ? 'Exact match' : c.matchType === 'starts_with' ? 'Starts with' : 'Contains'} "{c.keyword || '—'}" → auto-reply</span>;
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
  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [replyText, setReplyText] = useState('');

  const toggleAgent = (id: string) => setAgentIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

  function handleSave() {
    if (!name.trim()) return;
    const config =
      type === 'auto_assign' ? { strategy, agentIds } :
      type === 'sla_escalation' ? { thresholdPercent, escalateToRole } :
      type === 'status_automation' ? { autoCloseAfterDays } :
      type === 'whatsapp_keyword' ? { keyword: keyword.trim(), matchType, replyText: replyText.trim() } :
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
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round robin</SelectItem>
                <SelectItem value="load_based">Least open tickets</SelectItem>
                <SelectItem value="category_match">By category</SelectItem>
              </SelectContent>
            </Select>
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
            <Select value={escalateToRole} onValueChange={setEscalateToRole}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="TENANT_ADMIN">Tenant Admin</SelectItem>
                <SelectItem value="SENIOR">Senior</SelectItem>
              </SelectContent>
            </Select>
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
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new_ticket">New ticket</SelectItem>
                <SelectItem value="sla_breach">SLA breach</SelectItem>
                <SelectItem value="reassigned">Reassigned</SelectItem>
                <SelectItem value="status_changed">Status changed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ssg-field">
            <label>Notify</label>
            <Select value={notify} onValueChange={setNotify}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assignee">The ticket's assignee</SelectItem>
                <SelectItem value="manager_role">All managers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {type === 'whatsapp_keyword' && (
        <>
          <div className="ssg-field">
            <label>Keyword</label>
            <input className="input-field" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. #STATUS" />
          </div>
          <div className="ssg-field">
            <label>Match type</label>
            <Select value={matchType} onValueChange={v => setMatchType(v as any)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Message contains keyword</SelectItem>
                <SelectItem value="starts_with">Message starts with keyword</SelectItem>
                <SelectItem value="exact">Message is exactly the keyword</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ssg-field">
            <label>Auto-reply text</label>
            <textarea className="input-field" rows={3} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Sent back to the customer via WhatsApp when this rule matches." />
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
    if (!(await showConfirm(`Delete rule "${rule.name}"?`, { confirmLabel: 'Delete' }))) return;
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

  // This card used to be 4 hand-picked "channels," each with a hardcoded
  // active:true/false and a permanently-disabled Manage/Connect button that
  // did nothing — decorative status regardless of whether the tenant had
  // actually configured anything. Real channel config already exists
  // elsewhere in the platform; this card now points at the real place for
  // each, rather than pretending to be a second, non-functional copy of it.
  // Facebook Messenger is dropped entirely: support_tickets' channel column
  // has no FACEBOOK value in its schema, so there is nothing real to link —
  // wiring that in is a real integration project, not a settings toggle.
  const integrations: { name: string; icon: IconName; color: string; desc: string; to: string }[] = [
    { name: 'WhatsApp & SMS gateways', icon: 'phone', color: '#25D366', desc: 'Credentials, sender IDs and priority order — managed in the SMS app.', to: '/sms/gateways' },
    { name: 'Email ticket ingest', icon: 'mail', color: '#0569e3', desc: 'IMAP mailbox that turns incoming email into tickets — configure the mailbox in Settings.', to: '/workspace/settings?s=email' },
  ];

  return (
    <div className="ssg-root">
      <PageHeader crumbs={['Bliss', 'Settings']} titlePlain="Support" titleEm="Settings" />

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
        <p>Where each channel that feeds this inbox is actually configured.</p>
      </div>

      <div className="card ssg-integrations-card">
        {integrations.map(ig => (
          <Link key={ig.name} to={ig.to} className="ssg-integration-row" style={{ textDecoration: 'none' }}>
            <div className="ssg-integration-left">
              <div className="ssg-integration-icon" style={{ background: ig.color + '18' }}>
                <Icon name={ig.icon} size={20} color={ig.color} />
              </div>
              <div>
                <div className="ssg-integration-name">{ig.name}</div>
                <div className="ssg-integration-desc">{ig.desc}</div>
              </div>
            </div>
            <Icon name="arrowUpRight" size={16} color="var(--ink3)" />
          </Link>
        ))}
      </div>
    </div>
  );
};
