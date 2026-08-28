import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background, addEdge, applyNodeChanges, applyEdgeChanges,
  Connection, Node, Edge, NodeChange, EdgeChange, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Icon } from '../components/Icon.js';
import {
  TriggerNode, ActionNode, StatusNode, AddEdge,
  ACTION_KIND_META, STATUS_KIND_META, TRIGGER_OPTIONS,
} from '../components/flow/FlowNodes.js';
import type { ActionKind, StatusKind } from '../components/flow/FlowNodes.js';
import { Popover, PopoverContent, PopoverAnchor } from '../components/ui/popover.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';

type FlowNodeData = {
  title?: string;
  label?: string;
  icon?: string;
  status?: 'pending' | 'success' | 'failed';
  kind?: ActionKind | StatusKind;
  triggerType?: string;
  config?: Record<string, any>;
};
type FlowNode = Node<FlowNodeData>;
type Workflow = { id: string; name: string; nodes: FlowNode[]; edges: Edge[] };

const STORAGE_KEY = 'hudumika_automations_v1';

const initialNodes: FlowNode[] = [
  { id: '1', type: 'triggerNode', position: { x: 300, y: 40 }, data: { title: 'How are tasks being added to this project?', triggerType: 'manual' } },
  { id: '10', type: 'actionNode', position: { x: 120, y: 220 }, data: { kind: 'webhook', label: 'Call Box API', config: { method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', query: '{"source":"hudumika-automation"}' } } },
  { id: '9', type: 'actionNode', position: { x: 560, y: 220 }, data: { kind: 'delay', label: 'Wait 1 hour', config: { duration: 1, unit: 'hours' } } },
  { id: '2', type: 'actionNode', position: { x: 340, y: 340 }, data: { kind: 'field', label: 'Set status: To do', config: { object: 'Task', field: 'status', value: 'To do' } } },
  { id: '3', type: 'actionNode', position: { x: 190, y: 480 }, data: { kind: 'notify', label: 'Notify team', config: { channel: 'in-app', message: 'A new task needs attention.' } } },
  { id: '4', type: 'actionNode', position: { x: 340, y: 480 }, data: { kind: 'assignee', label: 'Assign owner', config: { assignee: 'round-robin', notify: true } } },
  { id: '5', type: 'actionNode', position: { x: 490, y: 480 }, data: { kind: 'field', label: 'Set priority', config: { object: 'Task', field: 'priority', value: 'Normal' } } },
  { id: '6', type: 'statusNode', position: { x: 190, y: 620 }, data: { kind: 'status', label: 'Finish', status: 'pending' } },
  { id: '7', type: 'statusNode', position: { x: 340, y: 620 }, data: { kind: 'condition', label: 'Overdue > 2 days?', status: 'success', config: { field: 'due_date', operator: 'greater_than', value: '2 days' } } },
  { id: '8', type: 'statusNode', position: { x: 490, y: 620 }, data: { kind: 'status', label: 'Feedback', status: 'pending' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'addEdge', data: { label: 'Add trigger' } },
  { id: 'e2-3', source: '2', target: '3', type: 'addEdge' },
  { id: 'e2-4', source: '2', target: '4', type: 'addEdge' },
  { id: 'e2-5', source: '2', target: '5', type: 'addEdge' },
  { id: 'e3-6', source: '3', target: '6', type: 'addEdge' },
  { id: 'e4-7', source: '4', target: '7', type: 'addEdge' },
  { id: 'e5-8', source: '5', target: '8', type: 'addEdge' },
  { id: 'e1-9', source: '1', target: '9', type: 'addEdge' },
  { id: 'e1-10', source: '1', target: '10', type: 'addEdge' }
];

function defaultState(): { workflows: Workflow[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.workflows) && parsed.workflows.length) {
        const activeId = parsed.workflows.some((w: Workflow) => w.id === parsed.activeId)
          ? parsed.activeId
          : parsed.workflows[0].id;
        return { workflows: parsed.workflows, activeId };
      }
    }
  } catch { /* corrupt/absent storage — fall back to defaults */ }
  return { workflows: [{ id: 'wf-1', name: 'Automation 1', nodes: initialNodes, edges: initialEdges }], activeId: 'wf-1' };
}

export function AIAutomations() {
  const [state, setState] = useState<{ workflows: Workflow[]; activeId: string }>(defaultState);
  const { workflows, activeId } = state;
  const activeWorkflow = workflows.find(w => w.id === activeId) ?? workflows[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateActiveWorkflow = useCallback((fn: (wf: Workflow) => Workflow) => {
    setState(s => ({ ...s, workflows: s.workflows.map(w => w.id === s.activeId ? fn(w) : w) }));
  }, []);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'setup' | 'integration' | 'testing'>('setup');
  const [testRunMessage, setTestRunMessage] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Popover state (add-node menu)
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuEdgeId, setMenuEdgeId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });

  // Try AI panel state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAddClick = useCallback((edgeId: string, event: React.MouseEvent) => {
    setMenuEdgeId(edgeId);
    setMenuAnchor({ x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }, []);

  const nodeTypes = useMemo(() => ({
    triggerNode: TriggerNode,
    actionNode: ActionNode,
    statusNode: StatusNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    addEdge: (props: any) => <AddEdge {...props} data={{ ...props.data, onAddClick: handleAddClick }} />
  }), [handleAddClick]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    updateActiveWorkflow(wf => ({ ...wf, nodes: applyNodeChanges(changes, wf.nodes) as FlowNode[] }));
  }, [updateActiveWorkflow]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    updateActiveWorkflow(wf => ({ ...wf, edges: applyEdgeChanges(changes, wf.edges) }));
  }, [updateActiveWorkflow]);

  const onConnect = useCallback((params: Connection | Edge) => {
    updateActiveWorkflow(wf => ({ ...wf, edges: addEdge({ ...params, type: 'addEdge' }, wf.edges) }));
  }, [updateActiveWorkflow]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
    setSidebarTab('setup');
    setTestRunMessage(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const selectedNode = useMemo(
    () => activeWorkflow.nodes.find(n => n.id === selectedNodeId),
    [activeWorkflow.nodes, selectedNodeId]
  );

  const updateNode = useCallback((patch: Partial<FlowNodeData>) => {
    if (!selectedNodeId) return;
    updateActiveWorkflow(wf => ({
      ...wf,
      nodes: wf.nodes.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n),
    }));
  }, [selectedNodeId, updateActiveWorkflow]);

  const updateConfig = useCallback((key: string, value: any) => {
    if (!selectedNodeId) return;
    updateActiveWorkflow(wf => ({
      ...wf,
      nodes: wf.nodes.map(n => n.id === selectedNodeId
        ? { ...n, data: { ...n.data, config: { ...(n.data.config || {}), [key]: value } } }
        : n),
    }));
  }, [selectedNodeId, updateActiveWorkflow]);

  const addNewNode = useCallback((type: 'actionNode' | 'statusNode', kind: ActionKind | StatusKind) => {
    if (!menuEdgeId) return;
    updateActiveWorkflow(wf => {
      const edgeToSplit = wf.edges.find(e => e.id === menuEdgeId);
      if (!edgeToSplit) return wf;
      const sourceNode = wf.nodes.find(n => n.id === edgeToSplit.source);
      const targetNode = wf.nodes.find(n => n.id === edgeToSplit.target);
      if (!sourceNode || !targetNode) return wf;

      const newNodeId = `new-${Date.now()}`;
      const newX = (sourceNode.position.x + targetNode.position.x) / 2;
      const newY = (sourceNode.position.y + targetNode.position.y) / 2;
      const meta = type === 'actionNode' ? ACTION_KIND_META[kind as ActionKind] : STATUS_KIND_META[kind as StatusKind];

      const newNode: FlowNode = {
        id: newNodeId,
        type,
        position: { x: newX, y: newY },
        data: type === 'actionNode'
          ? { kind, label: meta.label, config: {} }
          : { kind, label: meta.label, status: 'pending', config: {} },
      };

      const edge1 = { id: `e${sourceNode.id}-${newNodeId}`, source: sourceNode.id, target: newNodeId, type: 'addEdge' };
      const edge2 = { id: `e${newNodeId}-${targetNode.id}`, source: newNodeId, target: targetNode.id, type: 'addEdge' };

      return {
        ...wf,
        nodes: [...wf.nodes, newNode],
        edges: wf.edges.filter(e => e.id !== menuEdgeId).concat(edge1, edge2),
      };
    });
    setMenuOpen(false);
  }, [menuEdgeId, updateActiveWorkflow]);

  const handleNewPage = useCallback(() => {
    const id = `wf-${Date.now()}`;
    const name = `Automation ${workflows.length + 1}`;
    const starter: FlowNode[] = [
      { id: `n-${Date.now()}`, type: 'triggerNode', position: { x: 300, y: 120 }, data: { title: 'New Automation', triggerType: 'manual' } },
    ];
    setState(s => ({ workflows: [...s.workflows, { id, name, nodes: starter, edges: [] }], activeId: id }));
    setSelectedNodeId(null);
  }, [workflows.length]);

  const switchWorkflow = useCallback((id: string) => {
    setState(s => ({ ...s, activeId: id }));
    setSelectedNodeId(null);
  }, []);

  const closeWorkflow = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setState(s => {
      if (s.workflows.length <= 1) return s;
      const remaining = s.workflows.filter(w => w.id !== id);
      const activeId = s.activeId === id ? remaining[0].id : s.activeId;
      return { workflows: remaining, activeId };
    });
  }, []);

  const renameWorkflow = useCallback((id: string, name: string) => {
    setState(s => ({ ...s, workflows: s.workflows.map(w => w.id === id ? { ...w, name: name || w.name } : w) }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch('/v1/ai/automations/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const steps = Array.isArray(res.steps) ? res.steps.slice(0, 6) : [];
      const triggerNode: FlowNode = {
        id: `n-${Date.now()}`, type: 'triggerNode', position: { x: 300, y: 40 },
        data: { title: res.trigger?.title || aiPrompt, triggerType: 'manual' },
      };
      const stepNodes: FlowNode[] = steps.map((s: any, i: number) => {
        const kind: ActionKind = ACTION_KIND_META[s.kind as ActionKind] ? s.kind : 'field';
        return {
          id: `n-${Date.now()}-${i}`, type: 'actionNode', position: { x: 300, y: 200 + i * 140 },
          data: { kind, label: s.label || ACTION_KIND_META[kind].label, config: {} },
        };
      });
      const newNodes = [triggerNode, ...stepNodes];
      const newEdges: Edge[] = newNodes.slice(0, -1).map((n, i) => ({
        id: `e-${n.id}-${newNodes[i + 1].id}`, source: n.id, target: newNodes[i + 1].id, type: 'addEdge',
      }));
      updateActiveWorkflow(wf => ({ ...wf, nodes: newNodes, edges: newEdges }));
      setSelectedNodeId(null);
      setAiOpen(false);
      setAiPrompt('');
    } catch (e: any) {
      setAiError(e.message || 'Failed to generate automation.');
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiLoading, updateActiveWorkflow]);

  const runTest = useCallback(async () => {
    if (!testMode) {
      setTestRunMessage('Turn on Testing mode to run a test.');
      return;
    }
    if (!selectedNode) return;
    const label = selectedNode.data.label || selectedNode.data.title || 'Step';

    if (selectedNode.type === 'actionNode' && selectedNode.data.kind === 'webhook') {
      const cfg = selectedNode.data.config || {};
      if (!cfg.url) { setTestRunMessage('Add a URL before running this step.'); return; }
      const method = (cfg.method || 'POST').toUpperCase();
      setTestRunning(true);
      setTestRunMessage(null);
      const started = performance.now();
      try {
        const res = await fetch(cfg.url, {
          method,
          headers: method === 'GET' || method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
          body: method === 'GET' || method === 'DELETE' ? undefined : (cfg.query || '{}'),
        });
        const ms = Math.round(performance.now() - started);
        const bodyText = await res.text();
        setTestRunMessage(`${method} ${cfg.url} → ${res.status} ${res.statusText} (${ms}ms)\n${bodyText.slice(0, 400)}`);
      } catch (e: any) {
        setTestRunMessage(`Request failed: ${e.message}`);
      } finally {
        setTestRunning(false);
      }
      return;
    }

    setTestRunMessage(`Simulated: "${label}" would run here. (Only Webhook / HTTP steps make a real network call in this panel.)`);
  }, [testMode, selectedNode]);

  return (
    <>
    <PageHeader
      crumbs={['AI', 'Automations']}
      titlePlain="AI"
      titleEm="automations"
      subtitle="Build automated workflows triggered by events across the platform."
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary btn-sm" style={{ padding: 'var(--ds-btn-py-xs) 10px', height: 28, fontSize: 12 }} onClick={handleNewPage}>
            New page <Icon name="plus" size={12} style={{ marginLeft: 4 }} />
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)', fontWeight: 500, cursor: 'pointer' }} onClick={() => setTestMode(t => !t)}>
            Testing mode:
            <div className={`aia-toggle ${testMode ? 'on' : ''}`}>
              <div className="aia-toggle-knob" />
            </div>
          </label>
        </div>
      }
    />
    <div className={`aia-container ${testMode ? 'test-mode' : ''}`}>
      {/* ── Toolbar ── */}
      <div className="aia-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <button className="btn btn-secondary btn-sm" style={{ padding: 6, height: 32, width: 32 }} title="Share"><Icon name="send" size={16} /></button>
          <button className="btn btn-secondary btn-sm" style={{ padding: 6, height: 32, width: 32 }} title="Settings"><Icon name="settings" size={16} /></button>
          <button className="aia-btn-try-ai" onClick={() => setAiOpen(o => !o)}>
            <Icon name="sparkle" size={14} /> Try AI
          </button>

          {aiOpen && (
            <div className="aia-ai-panel">
              <div className="aia-ai-panel-title"><Icon name="sparkle" size={14} color="#ec4899" /> Describe your automation</div>
              <textarea
                className="aia-ai-textarea"
                placeholder='e.g. "When a shipment clears customs, notify the client and assign a delivery driver"'
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={3}
              />
              {aiError && <div className="aia-ai-error">{aiError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setAiOpen(false)}>Cancel</button>
                <button className="aia-btn-try-ai" style={{ opacity: aiLoading ? 0.7 : 1 }} onClick={handleGenerate} disabled={aiLoading}>
                  {aiLoading ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Workflow Tabs ── */}
      <div className="aia-tabs">
        {workflows.map(wf => (
          <div
            key={wf.id}
            className={`aia-tab ${wf.id === activeId ? 'active' : ''}`}
            onClick={() => switchWorkflow(wf.id)}
            onDoubleClick={() => setRenamingId(wf.id)}
          >
            {renamingId === wf.id ? (
              <input
                autoFocus
                className="aia-tab-rename"
                defaultValue={wf.name}
                onBlur={e => { renameWorkflow(wf.id, e.target.value.trim()); setRenamingId(null); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span>{wf.name}</span>
            )}
            {workflows.length > 1 && (
              <span className="aia-tab-close" onClick={e => closeWorkflow(wf.id, e)}>
                <Icon name="x" size={11} />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Main Canvas & Sidebar ── */}
      <div className="aia-main-body">
        <div className="aia-canvas-wrapper">
          {testMode && <div className="aia-test-banner"><Icon name="play" size={12} /> Test mode — changes won't affect live data</div>}
          <ReactFlow
            nodes={activeWorkflow.nodes}
            edges={activeWorkflow.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            attributionPosition="bottom-left"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="var(--border)" />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'triggerNode') return 'var(--bg)';
                if (node.type === 'statusNode' && node.data.status === 'success') return '#10b981';
                return 'var(--white)';
              }}
              maskColor="rgba(100, 116, 139, 0.25)"
            />
          </ReactFlow>

          {/* Hidden anchor for popover */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverAnchor asChild>
              <div style={{ position: 'absolute', left: menuAnchor.x - 250, top: menuAnchor.y - 120, width: 1, height: 1, pointerEvents: 'none' }} />
            </PopoverAnchor>
            <PopoverContent className="aia-add-menu" align="center" side="right" sideOffset={10}>
              {(Object.keys(ACTION_KIND_META) as ActionKind[]).map(kind => (
                <button key={kind} className="aia-add-menu-item" onClick={() => addNewNode('actionNode', kind)}>
                  <Icon name={ACTION_KIND_META[kind].icon} size={16} color={ACTION_KIND_META[kind].accent} /> {ACTION_KIND_META[kind].label}
                </button>
              ))}
              <div className="aia-add-menu-divider" />
              <button className="aia-add-menu-item" onClick={() => addNewNode('statusNode', 'condition')}>
                <Icon name={STATUS_KIND_META.condition.icon} size={16} color={STATUS_KIND_META.condition.accent} /> {STATUS_KIND_META.condition.label}
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Properties Sidebar ── */}
        {selectedNode && (
          <div className="aia-sidebar">
            <div className="aia-sidebar-header">
              <input
                type="text"
                value={selectedNode.data.label || selectedNode.data.title || 'Settings'}
                onChange={(e) => updateNode(selectedNode.type === 'triggerNode' ? { title: e.target.value } : { label: e.target.value })}
                style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--ink)', border: 'none', background: 'transparent', outline: 'none', width: '100%' }}
              />
              <button onClick={() => setSelectedNodeId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="aia-sidebar-content">
              {/* Tabs */}
              <div className="aia-sidebar-tabs">
                <button className={sidebarTab === 'setup' ? 'active' : ''} onClick={() => setSidebarTab('setup')}>
                  <Icon name="check" size={12} style={{ marginRight: 4 }} /> Setup
                </button>
                <button className={sidebarTab === 'integration' ? 'active' : ''} onClick={() => setSidebarTab('integration')}>
                  <Icon name="link" size={12} style={{ marginRight: 4 }} /> Integration
                </button>
                <button className={sidebarTab === 'testing' ? 'active' : ''} onClick={() => setSidebarTab('testing')}>
                  <Icon name="play" size={12} style={{ marginRight: 4 }} /> Testing
                </button>
              </div>

              {sidebarTab === 'setup' && (
                <SetupFields selectedNode={selectedNode} updateNode={updateNode} updateConfig={updateConfig} />
              )}

              {sidebarTab === 'integration' && (
                <div className="aia-sidebar-note">
                  {selectedNode.type === 'actionNode' && selectedNode.data.kind === 'webhook' ? (
                    <>
                      <p>This step calls an external URL when it runs.</p>
                      <label className="aia-field-label">Endpoint</label>
                      <input type="text" className="input-field" value={selectedNode.data.config?.url || ''} onChange={e => updateConfig('url', e.target.value)} style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
                    </>
                  ) : (
                    <p>No external integration is attached to this step yet. Choose the "Webhook / HTTP" step type to call an external API.</p>
                  )}
                </div>
              )}

              {sidebarTab === 'testing' && (
                <div className="aia-sidebar-note">
                  <p>
                    {selectedNode.type === 'actionNode' && selectedNode.data.kind === 'webhook'
                      ? 'Fires a real HTTP request to the URL configured in Setup and shows the real response.'
                      : 'Run this step in isolation to confirm it behaves as expected before publishing.'}
                  </p>
                  <button className="btn btn-secondary btn-sm" onClick={runTest} disabled={testRunning} style={{ width: '100%', justifyContent: 'center', opacity: testRunning ? 0.7 : 1 }}>
                    <Icon name="play" size={13} style={{ marginRight: 6 }} /> {testRunning ? 'Running…' : 'Run test'}
                  </button>
                  {testRunMessage && <div className="aia-test-result" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{testRunMessage}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/* ── Type-aware Setup fields ─────────────────────────────────────── */
function SetupFields({ selectedNode, updateNode, updateConfig }: {
  selectedNode: FlowNode;
  updateNode: (patch: Partial<FlowNodeData>) => void;
  updateConfig: (key: string, value: any) => void;
}) {
  const cfg = selectedNode.data.config || {};

  if (selectedNode.type === 'triggerNode') {
    return (
      <div style={{ marginBottom: 20 }}>
        <label className="aia-field-label">Trigger type</label>
        {TRIGGER_OPTIONS.map(opt => (
          <div
            key={opt.value}
            className={`aia-node-trigger ${selectedNode.data.triggerType === opt.value ? 'active' : ''}`}
            onClick={() => updateNode({ triggerType: opt.value })}
            style={{ cursor: 'pointer' }}
          >
            <span className="aia-node-trigger-label">
              <Icon name={opt.icon} size={13} color={selectedNode.data.triggerType === opt.value ? 'var(--blue)' : 'var(--ink3)'} />
              {opt.label}
            </span>
            {selectedNode.data.triggerType === opt.value && <Icon name="check" size={14} color="var(--blue)" />}
          </div>
        ))}
      </div>
    );
  }

  if (selectedNode.type === 'actionNode') {
    const kind = (selectedNode.data.kind || 'webhook') as ActionKind;
    return (
      <>
        <div style={{ marginBottom: 20 }}>
          <label className="aia-field-label">Step type</label>
          <Select value={kind} onValueChange={v => updateNode({ kind: v as ActionKind })}>
            <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ACTION_KIND_META) as ActionKind[]).map(k => (
                <SelectItem key={k} value={k}>{ACTION_KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {kind === 'webhook' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">HTTP Method</label>
              <Select value={cfg.method || 'POST'} onValueChange={v => updateConfig('method', v)}>
                <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="URL" icon="globe">
              <input type="text" className="input-field" placeholder="https://api.example.com/hook" value={cfg.url || ''} onChange={e => updateConfig('url', e.target.value)} style={{ paddingLeft: 34, height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </Field>
            <Field label="Query / body" icon="layers">
              <input type="text" className="input-field" placeholder="Insert data" value={cfg.query || ''} onChange={e => updateConfig('query', e.target.value)} style={{ paddingLeft: 34, height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </Field>
          </>
        )}

        {kind === 'field' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Object</label>
              <Select value={cfg.object || 'Task'} onValueChange={v => updateConfig('object', v)}>
                <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Task">Task</SelectItem>
                  <SelectItem value="Shipment">Shipment</SelectItem>
                  <SelectItem value="Invoice">Invoice</SelectItem>
                  <SelectItem value="Contact">Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Field name</label>
              <input type="text" className="input-field" value={cfg.field || ''} onChange={e => updateConfig('field', e.target.value)} style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">New value</label>
              <input type="text" className="input-field" value={cfg.value || ''} onChange={e => updateConfig('value', e.target.value)} style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </div>
          </>
        )}

        {kind === 'assignee' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Assign to</label>
              <Select value={cfg.assignee || 'round-robin'} onValueChange={v => updateConfig('assignee', v)}>
                <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round-robin">Round robin</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="team-lead">Team lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!cfg.notify} onChange={e => updateConfig('notify', e.target.checked)} />
              Notify assignee
            </label>
          </>
        )}

        {kind === 'notify' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Channel</label>
              <Select value={cfg.channel || 'in-app'} onValueChange={v => updateConfig('channel', v)}>
                <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-app">In-app</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Message</label>
              <textarea className="input-field" rows={3} value={cfg.message || ''} onChange={e => updateConfig('message', e.target.value)} style={{ fontSize: 13, backgroundColor: 'var(--bg)', border: 'none', padding: 8, width: '100%', resize: 'vertical' }} />
            </div>
          </>
        )}

        {kind === 'delay' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label className="aia-field-label">Duration</label>
              <input type="number" min={1} className="input-field" value={cfg.duration ?? 1} onChange={e => updateConfig('duration', Number(e.target.value))} style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="aia-field-label">Unit</label>
              <Select value={cfg.unit || 'hours'} onValueChange={v => updateConfig('unit', v)}>
                <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </>
    );
  }

  if (selectedNode.type === 'statusNode') {
    const kind = (selectedNode.data.kind || 'status') as StatusKind;
    return (
      <>
        <div style={{ marginBottom: 20 }}>
          <label className="aia-field-label">Node type</label>
          <Select value={kind} onValueChange={v => updateNode({ kind: v as StatusKind })}>
            <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_KIND_META) as StatusKind[]).map(k => (
                <SelectItem key={k} value={k}>{STATUS_KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {kind === 'status' && (
          <div style={{ marginBottom: 20 }}>
            <label className="aia-field-label">State</label>
            <Select value={selectedNode.data.status || 'pending'} onValueChange={v => updateNode({ status: v as any })}>
              <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {kind === 'condition' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Field</label>
              <input type="text" className="input-field" value={cfg.field || ''} onChange={e => updateConfig('field', e.target.value)} style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Operator</label>
              <Select value={cfg.operator || 'equals'} onValueChange={v => updateConfig('operator', v)}>
                <SelectTrigger className="input-field" style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="not_equals">Not equals</SelectItem>
                  <SelectItem value="greater_than">Greater than</SelectItem>
                  <SelectItem value="less_than">Less than</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="aia-field-label">Value</label>
              <input type="text" className="input-field" value={cfg.value || ''} onChange={e => updateConfig('value', e.target.value)} style={{ height: 36, fontSize: 13, backgroundColor: 'var(--bg)', border: 'none' }} />
            </div>
          </>
        )}
      </>
    );
  }

  return null;
}

function Field({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label className="aia-field-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <Icon name={icon as any} size={14} color="var(--ink3)" style={{ position: 'absolute', left: 12, top: 11 }} />
        {children}
      </div>
    </div>
  );
}
