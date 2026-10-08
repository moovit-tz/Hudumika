import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgentToolSummary } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { canDecideAgentApproval, useAgentChat } from '../../hooks/useAgentChat.js';
import { PageHeader } from '../PageHeader.js';
import { Icon } from '../Icon.js';
import { Button } from '../ui/button.js';
import { Card } from '../ui/card.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { SectionLoading } from '../ui/spinner.js';
import './AgentTaskPlanner.css';

const suggestions = ['Summarize my open tasks', 'Review unpaid invoices', 'Find deals needing follow-up', 'Review my support tickets'];
const templates: Record<string, string> = {
  'route6-trip': 'Review a completed trip and prepare its invoice',
  'clearos-customs': 'Review shipment documents and identify clearance tasks',
  'finops-petti': 'Review expenses and prepare a reconciliation summary',
};

export function AgentTaskPlanner({ templateId }: { templateId?: string }) {
  const [task, setTask] = useState('');
  const [goal, setGoal] = useState('');
  const [tools, setTools] = useState<AgentToolSummary[]>([]);
  const [toolError, setToolError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const [extra, setExtra] = useState('');
  const previousTemplate = useRef(templateId);
  const agent = useAgentChat();
  const { user } = useAuth();

  useEffect(() => {
    let live = true;
    apiFetch('/v1/agent/tools').then(data => { if (live) setTools(data); })
      .catch(error => { if (live) setToolError(error.message || 'Commands could not be loaded.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (templateId !== previousTemplate.current && templateId && templates[templateId]) setTask(templates[templateId]);
    previousTemplate.current = templateId;
  }, [templateId]);

  const relevant = useMemo(() => {
    const words = goal.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !['review', 'prepare', 'please', 'want', 'with', 'from', 'that', 'this'].includes(w));
    return tools.map(tool => ({ tool, score: words.filter(word => `${tool.id} ${tool.label} ${tool.description}`.toLowerCase().includes(word)).length }))
      .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(item => item.tool);
  }, [goal, tools]);
  const commands = tools.filter(tool => `${tool.label} ${tool.description} ${tool.appId}`.toLowerCase().includes(search.toLowerCase()));
  const steps = [
    { title: 'Find the context', detail: `Locate the workspace records needed for “${goal}”. Identify missing references or details before making changes.` },
    { title: 'Review the records', detail: relevant.length ? `Use relevant commands such as ${relevant.map(tool => tool.label).join(', ')} to inspect current data and determine the next action.` : 'Ask for missing context and check which workspace tools can support the request. A matching command has not been identified yet.' },
    { title: 'Prepare the work', detail: 'Draft the requested output or proposed updates. Explain the records involved, expected changes, and any required approval.' },
    { title: 'Return the result', detail: 'Report the actual outcome from the agent runtime, including unresolved items. Any approval request appears here before the gated action continues.' },
  ];
  const plan = (value = task) => { if (!value.trim()) return; if (value.trim() !== goal) agent.reset(); setGoal(value.trim()); setTask(value.trim()); setSelected(0); };

  return <div className="agent-task-planner">
    <PageHeader crumbs={['Workspace', 'Agent']} titlePlain="What needs" titleEm="doing" subtitle="Describe a task. Review the approach, then let your workspace agent help." />
    <Card className="atp-composer">
      <form onSubmit={event => { event.preventDefault(); plan(); }}>
        <label htmlFor="agent-task">Your task</label>
        <Textarea id="agent-task" value={task} maxLength={3500} onChange={event => setTask(event.target.value)} placeholder="Search for records or describe what you want done…" disabled={agent.busy || !!agent.pendingApproval} />
        <div className="atp-composer-footer"><span><Icon name="sparkle" size={16} /> Plan first. Run when ready.</span><Button size="lg" type="submit" disabled={!task.trim() || loading || agent.busy || !!agent.pendingApproval}>Build plan <Icon name="arrowRight" size={16} /></Button></div>
      </form>
      <div className="atp-suggestions">{suggestions.map(text => <Button variant="outline" key={text} disabled={agent.busy || !!agent.pendingApproval} onClick={() => plan(text)}>{text}</Button>)}</div>
    </Card>
    {goal && <Card className="atp-plan">
      <div className="atp-plan-header"><div><span className="atp-eyebrow">Proposed approach · {steps.length} steps</span><h2>{goal}</h2><p>A preview based on your request and the command catalog. The agent may refine it after reading records.</p></div><Button size="lg" disabled={loading || !!toolError || agent.busy || !!agent.pendingApproval} onClick={() => agent.send(goal)}><Icon name="zap" size={16} />{agent.busy ? 'Working…' : agent.messages.length ? 'Run again' : 'Run task'}</Button></div>
      <div className="atp-plan-grid"><nav aria-label="Task steps">{steps.map((step, index) => <button key={step.title} type="button" aria-current={selected === index ? 'step' : undefined} className={selected === index ? 'is-selected' : ''} onClick={() => setSelected(index)} data-ui-native-button=""><span>{index + 1}</span>{step.title}<Icon name="chevronRight" size={16} /></button>)}</nav><section className="atp-step"><span className="atp-eyebrow">Step {selected + 1} · Planned</span><h3>{steps[selected].title}</h3><p>{steps[selected].detail}</p><h4>Relevant commands</h4>{relevant.length ? relevant.map(tool => <div className="atp-command" key={tool.id}><strong>{tool.label}</strong><p>{tool.description}</p><span>{tool.appId} · {tool.effect === 'read' ? 'Reads records' : 'Changes records'} · {tool.approvalPolicy === 'never' ? 'Workspace permissions apply' : 'Approval policy applies'}</span></div>) : <p>No matching command yet. Refine your task or browse the catalog below.</p>}</section></div>
    </Card>}
    {(agent.messages.length > 0 || agent.error || agent.pendingApproval) && <Card className="atp-output" aria-live="polite"><h2>Agent activity</h2>{agent.messages.map((message, index) => <div className={`atp-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'You' : 'Workspace agent'}</strong><p>{message.content}</p></div>)}{agent.busy && <SectionLoading label="The agent is reviewing your request…" />}{agent.error && <p role="alert" className="atp-error">{agent.error}</p>}{agent.pendingApproval && <div className="atp-approval"><h3>Approval needed</h3><p>{agent.pendingApproval.requestedEffect}</p><p>{agent.pendingApproval.requiredApprovals} approval(s) required from {agent.pendingApproval.approverRole}.</p>{canDecideAgentApproval(user?.role, agent.pendingApproval.approverRole) && <div className="atp-actions"><Button disabled={agent.decisionBusy} onClick={() => agent.decide('approved')}>Approve action</Button><Button variant="outline" disabled={agent.decisionBusy} onClick={() => agent.decide('rejected')}>Reject</Button></div>}</div>}<form className="atp-followup" onSubmit={event => { event.preventDefault(); if (extra.trim()) { void agent.send(extra); setExtra(''); } }}><Input aria-label="Follow-up command" placeholder="Add a follow-up command…" value={extra} maxLength={4000} onChange={event => setExtra(event.target.value)} /><Button disabled={!extra.trim() || agent.busy || !!agent.pendingApproval}>Send</Button></form></Card>}
    <div className="atp-extras"><Card className="atp-catalog"><div className="atp-section-heading"><div><h2>Workspace commands</h2><p>Search the real tools available to the agent.</p></div><Input aria-label="Search commands" placeholder="Search commands…" value={search} onChange={event => setSearch(event.target.value)} /></div>{loading ? <SectionLoading label="Loading commands…" /> : toolError ? <p role="alert" className="atp-error">{toolError}</p> : <div className="atp-catalog-list">{commands.map(tool => <button key={tool.id} disabled={agent.busy || !!agent.pendingApproval} onClick={() => setTask(`${tool.label}. `)} data-ui-native-button=""><span><strong>{tool.label}</strong><small>{tool.description}</small></span><Icon name="plus" size={16} /></button>)}{!commands.length && <p>No commands match your search.</p>}</div>}</Card><Card className="atp-automation"><Icon name="zap" size={24} /><h2>Make it repeat</h2><p>Build a workflow with a trigger, connected actions, and an execution history.</p><Button asChild size="lg"><Link to="/studio">Open Workflow Studio <Icon name="arrowRight" size={16} /></Link></Button></Card></div>
  </div>;
}
