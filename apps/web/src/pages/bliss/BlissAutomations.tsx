import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { showConfirm } from '../../lib/confirm.js';

/** The real automation engine (support_rules — 4 real types, actually
 *  executed by support-rules.job.ts and inline in support.routes.ts), shown
 *  through this page's nicer WHEN/IF/THEN visual language instead of
 *  SupportSettings' plain toggle rows. This used to be 3 invented rules
 *  with made-up execution counts (412, 89, 1204) that a "Create"/"Edit"
 *  button did nothing for. The trigger/condition/action strings below are
 *  *derived* from each rule's real type+config — there's no free-form
 *  arbitrary-condition builder on the backend, so creating a rule here
 *  still means picking one of the 4 real types, same as SupportSettings did. */
type RuleType = 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger';
interface Rule { id: string; type: RuleType; name: string; enabled: boolean; config: any; }
interface Agent { id: string; name: string; }

function describeRule(rule: Rule, agents: Agent[]): { trigger: string; condition: string; action: string } {
  const c = rule.config || {};
  const nameOf = (id: string) => agents.find(a => a.id === id)?.name || id;
  switch (rule.type) {
    case 'auto_assign':
      return {
        trigger: 'WHEN a new ticket is created',
        condition: `IF strategy = ${c.strategy || 'round_robin'}`,
        action: `THEN assign among ${(c.agentIds || []).length} eligible agent(s)`,
      };
    case 'sla_escalation':
      return {
        trigger: `WHEN elapsed SLA reaches ${c.thresholdPercent ?? 80}%`,
        condition: 'IF the ticket is still open',
        action: `THEN escalate to ${c.escalateToRole ? c.escalateToRole : c.escalateToUserId ? nameOf(c.escalateToUserId) : 'a manager'}`,
      };
    case 'status_automation':
      return {
        trigger: `WHEN a ticket has been resolved for ${c.autoCloseAfterDays ?? '—'} day(s)`,
        condition: 'IF status = RESOLVED',
        action: 'THEN auto-close the ticket',
      };
    case 'notification_trigger':
      return {
        trigger: `WHEN ${String(c.event || 'an event').replace(/_/g, ' ')}`,
        condition: '—',
        action: `THEN notify ${c.notify === 'assignee' ? "the ticket's assignee" : c.notify === 'manager_role' ? 'all managers' : 'selected users'}`,
      };
  }
}

const TYPE_LABELS: Record<RuleType, string> = {
  auto_assign: 'Auto-Assignment', sla_escalation: 'SLA Escalation',
  status_automation: 'Status Automation', notification_trigger: 'Notification Trigger',
};

function CreateRuleForm({ agents, onCancel, onSave, saving }: {
  agents: Agent[]; onCancel: () => void; onSave: (type: RuleType, name: string, config: any) => void; saving: boolean;
}) {
  const [type, setType] = useState<RuleType>('auto_assign');
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('round_robin');
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [thresholdPercent, setThresholdPercent] = useState(80);
  const [escalateToRole, setEscalateToRole] = useState('MANAGER');
  const [autoCloseAfterDays, setAutoCloseAfterDays] = useState(3);
  const [event, setEvent] = useState('new_ticket');
  const [notify, setNotify] = useState('assignee');

  function handleSave() {
    if (!name.trim()) return;
    const config =
      type === 'auto_assign' ? { strategy, agentIds } :
      type === 'sla_escalation' ? { thresholdPercent, escalateToRole } :
      type === 'status_automation' ? { autoCloseAfterDays } :
      { event, notify };
    onSave(type, name.trim(), config);
  }

  return (
    <SectionCard title="New Automation Rule">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Rule type</label>
          <Select value={type} onValueChange={v => setType(v as RuleType)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABELS) as RuleType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Name</label>
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Round-robin support" />
        </div>

        {type === 'auto_assign' && (
          <>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">Round robin</SelectItem>
                  <SelectItem value="load_based">Least open tickets</SelectItem>
                  <SelectItem value="category_match">By category</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Eligible agents</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {agents.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No eligible agents found.</span>}
                {agents.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px' }}>
                    <input type="checkbox" checked={agentIds.includes(a.id)} onChange={() => setAgentIds(prev => prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id])} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {type === 'sla_escalation' && (
          <>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Escalate when elapsed % of SLA reaches</label>
              <input type="number" className="input-field" min={1} max={100} value={thresholdPercent} onChange={e => setThresholdPercent(Number(e.target.value) || 80)} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Escalate to role</label>
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
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Auto-close resolved tickets after (days)</label>
            <input type="number" className="input-field" min={1} value={autoCloseAfterDays} onChange={e => setAutoCloseAfterDays(Number(e.target.value) || 1)} />
          </div>
        )}

        {type === 'notification_trigger' && (
          <>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Event</label>
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
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Notify</label>
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="default" size="sm" disabled={!name.trim() || saving} onClick={handleSave}>{saving ? 'Saving…' : 'Create rule'}</Button>
        </div>
      </div>
    </SectionCard>
  );
}

export const BlissAutomations: React.FC = () => {
  const { user } = useAuth();
  const canManage = MGMT_ROLES.includes(user?.role as any);
  const [rules, setRules] = useState<Rule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const isMobile = useMediaQuery('(max-width: 900px)');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([apiFetch('/v1/support/rules'), apiFetch('/v1/support/agents')])
      .then(([r, a]: any) => {
        const list: Rule[] = Array.isArray(r) ? r : [];
        setRules(list);
        setAgents(Array.isArray(a) ? a : []);
        setSelectedId(prev => (prev && list.some(x => x.id === prev)) ? prev : (list[0]?.id ?? null));
      })
      .catch(() => { setRules([]); setAgents([]); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const selectedRule = rules.find(r => r.id === selectedId) || null;

  async function handleToggle(rule: Rule) {
    try {
      await apiFetch(`/v1/support/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch {}
  }
  async function handleDelete(rule: Rule) {
    if (!(await showConfirm(`Delete rule "${rule.name}"?`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/support/rules/${rule.id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== rule.id));
      setSelectedId(prev => prev === rule.id ? null : prev);
    } catch {}
  }
  async function handleCreate(type: RuleType, name: string, config: any) {
    setSaving(true);
    try {
      const created: any = await apiFetch('/v1/support/rules', { method: 'POST', body: JSON.stringify({ type, name, config }) });
      setRules(prev => [...prev, created]);
      setSelectedId(created.id);
      setCreating(false);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '20px 24px', background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Bliss', 'Automations']}
        titlePlain="Workflow"
        titleEm="Automations"
        subtitle="Real rules — auto-assignment, SLA escalation, status automation and notification triggers — actually executed by a background job, not a decorative list."
        actions={canManage ? (
          <Button variant="default" size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Create Automation Rule
          </Button>
        ) : undefined}
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: 20 }}>
        <SectionCard title="Active Automation Workflows">
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
          ) : rules.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No automation rules yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rules.map(rule => {
                const d = describeRule(rule, agents);
                return (
                  <div key={rule.id} onClick={() => setSelectedId(rule.id)}
                    style={{
                      padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)',
                      background: selectedId === rule.id ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer',
                      borderLeft: selectedId === rule.id ? '4px solid var(--teal)' : '1px solid var(--border)',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{rule.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant={rule.enabled ? 'success' : 'gray'}>{rule.enabled ? 'ACTIVE' : 'PAUSED'}</Badge>
                        {canManage && (
                          <button type="button" title="Delete rule" onClick={e => { e.stopPropagation(); handleDelete(rule); }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}>
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11.5, fontFamily: 'var(--mono)', flexWrap: 'wrap' }}>
                      <span style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: 'var(--teal)' }}>{d.trigger}</span>
                      <span style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: '#2563eb' }}>{d.condition}</span>
                      <span style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: '#047857' }}>{d.action}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {creating ? (
          <CreateRuleForm agents={agents} saving={saving} onCancel={() => setCreating(false)} onSave={handleCreate} />
        ) : selectedRule ? (
          <SectionCard title="Rule Inspector (WHEN -> IF -> THEN)">
            {(() => {
              const d = describeRule(selectedRule, agents);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ border: '2px dashed var(--teal)', borderRadius: 'var(--r)', padding: 14, background: 'rgba(13, 148, 136, 0.05)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 4 }}>1. WHEN (Trigger)</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{d.trigger}</div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>↓</div>
                  <div style={{ border: '2px dashed #2563eb', borderRadius: 'var(--r)', padding: 14, background: 'rgba(37, 99, 235, 0.05)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', marginBottom: 4 }}>2. IF (Condition)</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{d.condition}</div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>↓</div>
                  <div style={{ border: '2px dashed #047857', borderRadius: 'var(--r)', padding: 14, background: 'rgba(4, 120, 87, 0.05)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#047857', textTransform: 'uppercase', marginBottom: 4 }}>3. THEN (Action)</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{d.action}</div>
                  </div>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Type: <strong>{TYPE_LABELS[selectedRule.type]}</strong></span>
                    {canManage && (
                      <Button variant="outline" size="sm" onClick={() => handleToggle(selectedRule)}>{selectedRule.enabled ? 'Pause' : 'Activate'}</Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </SectionCard>
        ) : (
          <SectionCard title="Rule Inspector">
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Select a rule to inspect it.</div>
          </SectionCard>
        )}
      </div>
    </div>
  );
};
