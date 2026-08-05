import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState,
  addEdge, type Connection, type Node, type Edge, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Switch } from '../../components/ui/switch.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { STUDIO_NODE_TYPES, NODE_META, type StudioNodeData } from './StudioNodes.js';
import type {
  WorkflowStudioApp, WorkflowStudioRun, WorkflowStudioNode, WorkflowStudioEdge,
  WorkflowStudioTriggerDef, WorkflowStudioActionDef, WorkflowStudioNodeType,
  WorkflowStudioTargeting,
} from '@hudumika/types';

const OPERATORS = [
  { value: 'is_not_empty',     label: 'is not empty' },
  { value: 'is_empty',         label: 'is empty' },
  { value: 'equals',           label: 'equals' },
  { value: 'not_equals',       label: 'does not equal' },
  { value: 'contains',         label: 'contains' },
  { value: 'greater_than',     label: 'is greater than' },
  { value: 'greater_or_equal', label: 'is at least' },
  { value: 'less_than',        label: 'is less than' },
  { value: 'less_or_equal',    label: 'is at most' },
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success', SIMULATED: 'info', PARTIAL: 'warning', FAILED: 'error', RUNNING: 'gray',
};

function newId(prefix: string) { return `${prefix}-${Math.random().toString(36).slice(2, 8)}`; }

/** Mirrors clearance's own option lists so the two builders offer the same words. */
const STUDIO_FREIGHT_MODES = ['sea', 'air', 'road', 'rail'] as const;
const STUDIO_CONSIGNMENT_TYPES = ['import', 'export', 'transit'] as const;

const emptyTargeting = (): WorkflowStudioTargeting => ({
  freightModes: [], consignmentTypes: [], customerIds: [], originCountries: [], destinationCountries: [],
});

const hasTargeting = (t?: WorkflowStudioTargeting): boolean =>
  !!t && (t.freightModes?.length || t.consignmentTypes?.length || t.customerIds?.length
    || t.originCountries?.length || t.destinationCountries?.length) > 0;

export function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('return');

  const [workflow, setWorkflow] = useState<WorkflowStudioApp | null>(null);
  const [triggers, setTriggers] = useState<WorkflowStudioTriggerDef[]>([]);
  const [actions, setActions] = useState<WorkflowStudioActionDef[]>([]);
  const [runs, setRuns] = useState<WorkflowStudioRun[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [viewedRun, setViewedRun] = useState<WorkflowStudioRun | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Which single pane is visible below 1024px. Ignored by CSS on desktop,
  // where all three columns show at once.
  const [pane, setPane] = useState<'steps' | 'canvas' | 'details'>('canvas');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const triggerById = useMemo(() => new Map(triggers.map(t => [t.id, t])), [triggers]);
  const actionById = useMemo(() => new Map(actions.map(a => [a.id, a])), [actions]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((r: any) => setCustomers(Array.isArray(r) ? r : r.data ?? r.customers ?? []))
      .catch(() => setCustomers([]));
  }, []);

  // ── load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [wf, tr, ac, rn] = await Promise.all([
          apiFetch(`/v1/workflow-studio/apps/${id}`),
          apiFetch('/v1/workflow-studio/triggers'),
          apiFetch('/v1/workflow-studio/actions'),
          apiFetch(`/v1/workflow-studio/apps/${id}/runs`).catch(() => ({ data: [] })),
        ]);
        if (!alive) return;
        setWorkflow(wf.data);
        setTriggers(tr.data ?? []);
        setActions(ac.data ?? []);
        setRuns(rn.data ?? []);
        setError('');
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Could not load this workflow.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // Project the stored graph onto the canvas whenever the workflow, the
  // registries, or the run being inspected changes.
  useEffect(() => {
    if (!workflow) return;
    const stepByNode = new Map<string, { status: any; detail?: string; count: number }>();
    for (const s of viewedRun?.step_results ?? []) {
      const prev = stepByNode.get(s.node_id);
      stepByNode.set(s.node_id, {
        status: prev && prev.status === 'FAILED' ? prev.status : s.status,
        detail: (s.error ?? (s.output?.detail as string | undefined)) ?? prev?.detail,
        count: (prev?.count ?? 0) + 1,
      });
    }

    setNodes(workflow.nodes.map((n, i) => {
      const ref = n.type === 'trigger' ? triggerById.get(n.eventOrAction ?? workflow.trigger_event)
        : n.type === 'action' ? actionById.get(n.eventOrAction ?? '')
        : null;
      const needsRef = n.type === 'trigger' || n.type === 'action';
      const step = stepByNode.get(n.id);
      // A node titled the same as its registry entry needs no second line.
      const refLabel = ref?.label && ref.label !== n.title ? ref.label : undefined;
      return {
        id: n.id,
        type: 'studio',
        position: n.position ?? { x: 80, y: 60 + i * 150 },
        data: {
          nodeType: n.type,
          title: n.title || n.eventOrAction || n.id,
          refLabel: refLabel ?? (n.type === 'condition'
            ? `${n.config?.field ?? '—'} ${OPERATORS.find(o => o.value === n.config?.operator)?.label ?? n.config?.operator ?? ''} ${n.config?.value ?? ''}`.trim()
            : n.type === 'forEach' ? `over ${n.config?.over ?? '—'} as ${n.config?.as ?? 'item'}` : undefined),
          unknownRef: needsRef && !ref ? (n.eventOrAction ?? workflow.trigger_event) : undefined,
          restricted: (ref as WorkflowStudioActionDef | undefined)?.restricted,
          runStatus: step?.status,
          runDetail: step?.detail,
          iterations: step && step.count > 1 ? step.count : undefined,
        } satisfies StudioNodeData,
      };
    }));

    setEdges(workflow.edges.map(e => ({
      id: e.id, source: e.source, target: e.target, label: e.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: 'var(--border-strong, #cbd5e1)', strokeWidth: 1.6 },
    })));
  }, [workflow, triggerById, actionById, viewedRun, setNodes, setEdges]);

  // ── graph mutation ──────────────────────────────────────────────────────
  const patchWorkflow = useCallback((fn: (w: WorkflowStudioApp) => WorkflowStudioApp) => {
    setWorkflow(w => (w ? fn(w) : w));
    setDirty(true);
  }, []);

  const addNode = useCallback((type: WorkflowStudioNodeType, refId?: string, title?: string) => {
    setPane('canvas');   // show the step that was just added
    patchWorkflow(w => {
      const nid = newId(type);
      const last = w.nodes[w.nodes.length - 1];
      const node: WorkflowStudioNode = {
        id: nid, type, title: title ?? NODE_META[type].label,
        eventOrAction: refId, config: type === 'action' ? { input: {} } : {},
        position: { x: last?.position?.x ?? 80, y: (last?.position?.y ?? 0) + 150 },
      };
      const edge: WorkflowStudioEdge[] = last ? [{ id: newId('e'), source: last.id, target: nid }] : [];
      return { ...w, nodes: [...w.nodes, node], edges: [...w.edges, ...edge] };
    });
  }, [patchWorkflow]);

  const updateNode = useCallback((nodeId: string, patch: Partial<WorkflowStudioNode>) => {
    patchWorkflow(w => ({ ...w, nodes: w.nodes.map(n => (n.id === nodeId ? { ...n, ...patch } : n)) }));
  }, [patchWorkflow]);

  /** Toggles one value in a targeting list, creating the object if absent. */
  const patchTargeting = useCallback((key: 'freightModes' | 'consignmentTypes', value: string) => {
    patchWorkflow(w => {
      const cur = { ...emptyTargeting(), ...w.targeting };
      const list = cur[key];
      return { ...w, targeting: { ...cur, [key]: list.includes(value) ? list.filter(x => x !== value) : [...list, value] } };
    });
  }, [patchWorkflow]);

  const removeNode = useCallback((nodeId: string) => {
    patchWorkflow(w => ({
      ...w,
      nodes: w.nodes.filter(n => n.id !== nodeId),
      edges: w.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }));
    setSelectedId(null);
  }, [patchWorkflow]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    setEdges(eds => addEdge({ ...c, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    patchWorkflow(w => ({ ...w, edges: [...w.edges, { id: newId('e'), source: c.source!, target: c.target! }] }));
  }, [patchWorkflow, setEdges]);

  // Persist canvas drags back onto the stored positions.
  const onNodeDragStop = useCallback((_e: unknown, node: Node) => {
    patchWorkflow(w => ({ ...w, nodes: w.nodes.map(n => (n.id === node.id ? { ...n, position: node.position } : n)) }));
  }, [patchWorkflow]);

  // ── persistence & runs ──────────────────────────────────────────────────
  async function save() {
    if (!workflow) return;
    setBusy('save'); setError('');
    try {
      const res = await apiFetch(`/v1/workflow-studio/apps/${workflow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: workflow.name, description: workflow.description,
          trigger_event: workflow.trigger_event, nodes: workflow.nodes, edges: workflow.edges,
          targeting: workflow.targeting ?? {},
        }),
      });
      setWorkflow(res.data); setDirty(false);
    } catch (e: any) { setError(e?.message ?? 'Save failed.'); }
    setBusy(null);
  }

  async function setStatus(status: WorkflowStudioApp['status']) {
    if (!workflow) return;
    setBusy('status'); setError('');
    try {
      const res = await apiFetch(`/v1/workflow-studio/apps/${workflow.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setWorkflow(w => (w ? { ...w, status: res.data.status } : w));
    } catch (e: any) { setError(e?.message ?? 'Could not change status.'); }
    setBusy(null);
  }

  async function run(simulate: boolean) {
    if (!workflow) return;
    setBusy(simulate ? 'dry' : 'live'); setError('');
    try {
      const trigger = triggerById.get(workflow.trigger_event);
      const res = await apiFetch(`/v1/workflow-studio/apps/${workflow.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ simulate, payload: trigger?.samplePayload ?? {} }),
      });
      setRuns(r => [res.data, ...r]);
      setViewedRun(res.data);
    } catch (e: any) { setError(e?.message ?? 'Run failed.'); }
    setBusy(null);
  }

  const selectedNode = workflow?.nodes.find(n => n.id === selectedId) ?? null;
  const selectedAction = selectedNode?.type === 'action' ? actionById.get(selectedNode.eventOrAction ?? '') : undefined;
  const currentTrigger = workflow ? triggerById.get(workflow.trigger_event) : undefined;
  const targetingIsSet = hasTargeting(workflow?.targeting);
  // Targeting is resolved from the shipment an event is about. A trigger that
  // carries something else can never satisfy it, and the server skips the
  // workflow rather than running it unrestricted — so say so here, before the
  // author activates something that would silently never fire.
  const triggerCarriesShipment = currentTrigger?.entityType === 'shipment';

  if (loading) return <div style={{ padding: 40, color: 'var(--ink3)' }}>Loading workflow…</div>;
  if (!workflow) return <div style={{ padding: 40, color: 'var(--red)' }}>{error || 'Workflow not found.'}</div>;

  const contextFields = currentTrigger ? Object.keys(currentTrigger.samplePayload).map(k => `payload.${k}`) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="studio-topbar">
        <button type="button" onClick={() => navigate(returnTo ?? '/studio')} className="studio-icon-btn" style={{ border: '1px solid var(--border)' }}>
          <Icon name="arrowLeft" size={14} /> {returnTo ? 'Back' : 'Workflows'}
        </button>
        <input
          value={workflow.name}
          onChange={e => patchWorkflow(w => ({ ...w, name: e.target.value }))}
          className="studio-title-input"
        />
        <Badge variant={workflow.status === 'ACTIVE' ? 'success' : workflow.status === 'PAUSED' ? 'warning' : 'gray'}>{workflow.status}</Badge>
        {dirty && <span style={{ fontSize: 11.5, color: 'var(--gold)' }}>Unsaved changes</span>}

        <div className="studio-topbar-actions">
          <Button type="button" variant="outline" size="sm" disabled={busy === 'dry'} onClick={() => run(true)}>
            <Icon name="play" size={13} /> {busy === 'dry' ? 'Simulating…' : 'Dry run'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy === 'live'} onClick={() => run(false)}
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
            {busy === 'live' ? 'Running…' : 'Run for real'}
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} title={workflow.supersedes_subscriber ? `Activating stands down the ${workflow.supersedes_subscriber} code subscriber` : undefined}>
            <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>Active</span>
            <Switch checked={workflow.status === 'ACTIVE'} disabled={busy === 'status'} onCheckedChange={v => setStatus(v ? 'ACTIVE' : 'DRAFT')} />
          </div>
          <Button type="button" size="sm" disabled={!dirty || busy === 'save'} onClick={save}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '9px 16px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 12.5, borderBottom: '1px solid var(--border)' }}>{error}</div>
      )}
      {workflow.supersedes_subscriber && (
        <div style={{ padding: '8px 16px', background: 'var(--blue-l)', color: 'var(--ink2)', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="info" size={14} color="var(--blue)" />
          <span>
            Replaces the <code>{workflow.supersedes_subscriber}</code> code subscriber. While this is <strong>Draft</strong> the code path keeps running;
            activating hands over — exactly one of the two runs at any time.
          </span>
        </div>
      )}

      <div className="studio-panes" role="tablist" aria-label="Editor panes">
        {([['steps', 'Add a step'], ['canvas', 'Canvas'], ['details', selectedNode ? 'Step' : 'Workflow']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={pane === id}
            className="studio-pane-btn" onClick={() => setPane(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="studio-shell" data-pane={pane}>
        {/* ── Palette ─────────────────────────────────────────────── */}
        <div className="studio-col studio-col-left">
          <div className="studio-panel-head"><span className="studio-panel-title">Add a step</span></div>
          <div className="studio-scroll">
            <div className="studio-group-label">Logic</div>
            <button type="button" className="studio-item" onClick={() => addNode('condition', undefined, 'Only continue if…')}>
              <Icon name="gitBranch" size={15} color="var(--blue)" />
              <span><span className="studio-item-name">Condition</span><span className="studio-item-desc">Stop unless a field matches.</span></span>
            </button>
            <button type="button" className="studio-item" onClick={() => addNode('forEach', undefined, 'For each…')}>
              <Icon name="layers" size={15} color="var(--purple)" />
              <span><span className="studio-item-name">For each</span><span className="studio-item-desc">Repeat the steps below for every item in a collection.</span></span>
            </button>

            <div className="studio-group-label">Actions</div>
            {actions.length === 0 && <div className="studio-item-desc" style={{ padding: '0 4px' }}>No actions available.</div>}
            {actions.map(a => (
              <button key={a.id} type="button" className="studio-item" onClick={() => addNode('action', a.id, a.label)}>
                <Icon name="play" size={15} color={a.color} />
                <span>
                  <span className="studio-item-app" style={{ color: a.color }}>{a.appName}</span>
                  <span className="studio-item-name" style={{ display: 'block' }}>{a.label}</span>
                  <span className="studio-item-desc">{a.description}</span>
                  {a.restricted && <Badge variant="warning" style={{ marginTop: 5 }}>Restricted</Badge>}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Canvas ──────────────────────────────────────────────── */}
        <div className="studio-col studio-col-mid">
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={STUDIO_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_e, n) => { setSelectedId(n.id); setPane('details'); }}
              onPaneClick={() => setSelectedId(null)}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} color="var(--border)" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable position="bottom-right"
                style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 8, width: 140, height: 92 }} />
            </ReactFlow>
            {workflow.nodes.length === 0 && (
              <div className="studio-empty">
                <Icon name="layers" size={26} color="var(--ink3)" />
                <div>This workflow has no steps yet. Add one from the left.</div>
              </div>
            )}
          </div>

          {/* ── Run log ───────────────────────────────────────────── */}
          <div className="studio-runlog">
            <div className="studio-panel-head">
              <span className="studio-panel-title">Runs</span>
              {/* run_count counts real runs only — dry runs deliberately do not
                  increment it, so showing it alone next to a visible simulated
                  run reads as a contradiction. */}
              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                {runs.length} shown · {workflow.run_count} real
                {workflow.last_run_at ? ` · last ${new Date(workflow.last_run_at).toLocaleString()}` : ''}
              </span>
            </div>
            <div className="studio-scroll" style={{ padding: 8 }}>
              {runs.length === 0 && <div className="studio-item-desc" style={{ padding: 8 }}>No runs recorded yet.</div>}
              {runs.map(r => (
                <div key={r.id}>
                  <div className={`studio-run-row ${viewedRun?.id === r.id ? 'is-active' : ''}`} onClick={() => setViewedRun(viewedRun?.id === r.id ? null : r)}>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status}</Badge>
                    <span className="studio-run-mono">{r.trigger_source}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--ink3)', fontSize: 11.5 }}>
                      {r.duration_ms}ms · {new Date(r.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {viewedRun?.id === r.id && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, margin: '6px 0 10px', overflow: 'hidden' }}>
                      {r.error_message && (
                        <div style={{ padding: '8px 10px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 11.5 }}>{r.error_message}</div>
                      )}
                      {r.step_results.map((s, i) => (
                        <div className="studio-step" key={`${s.node_id}-${i}`}>
                          <Badge variant={s.status === 'SUCCESS' ? 'success' : s.status === 'FAILED' ? 'error' : s.status === 'SIMULATED' ? 'info' : 'gray'}>{s.status}</Badge>
                          <span style={{ color: 'var(--ink)' }}>
                            {s.iteration ? <span className="studio-run-mono">#{s.iteration} </span> : null}
                            {s.title}
                            {(s.error || s.output?.detail) && (
                              <span style={{ display: 'block', color: s.error ? 'var(--red)' : 'var(--ink3)', fontSize: 11.5, marginTop: 2 }}>
                                {s.error ?? String(s.output?.detail)}
                              </span>
                            )}
                          </span>
                          <span className="studio-run-mono">{s.duration_ms}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Inspector ───────────────────────────────────────────── */}
        <div className="studio-col studio-col-right">
          <div className="studio-panel-head">
            <span className="studio-panel-title">{selectedNode ? 'Step' : 'Workflow'}</span>
            {selectedNode && (
              <button type="button" className="studio-icon-btn" style={{ color: 'var(--red)' }} onClick={() => removeNode(selectedNode.id)}>
                <Icon name="trash" size={13} color="var(--red)" /> Remove
              </button>
            )}
          </div>
          <div className="studio-scroll">
            {!selectedNode ? (
              <>
                <div className="studio-field">
                  <label className="studio-field-label">Description</label>
                  <Textarea value={workflow.description ?? ''} rows={3}
                    onChange={e => patchWorkflow(w => ({ ...w, description: e.target.value }))} />
                </div>
                <div className="studio-field">
                  <label className="studio-field-label">Trigger</label>
                  <Select value={workflow.trigger_event} onValueChange={v => patchWorkflow(w => ({ ...w, trigger_event: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {triggers.map(t => <SelectItem key={t.id} value={t.id}>{t.appName} — {t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="studio-field-hint">
                    {currentTrigger
                      ? currentTrigger.description
                      : <span style={{ color: 'var(--red)' }}>“{workflow.trigger_event}” is not a registered trigger — nothing emits it, so this workflow can never run.</span>}
                  </div>
                </div>
                {/* Targeting — borrowed from clearance workflows (migration 168).
                    Until this existed an automation could say which event fires
                    it but never which shipments it applies to. */}
                <div className="studio-section">
                  <div className="studio-section-title">Only for these shipments</div>
                  <div className="studio-field-hint" style={{ marginBottom: 9 }}>
                    Leave everything empty and this runs for every {currentTrigger?.label?.toLowerCase() ?? 'matching'} event.
                    Narrow it and only shipments matching <strong>all</strong> the categories you set will run it.
                  </div>

                  <div className="studio-field">
                    <label className="studio-field-label">Freight mode</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {STUDIO_FREIGHT_MODES.map(m => {
                        const on = (workflow.targeting?.freightModes ?? []).includes(m);
                        return (
                          <button key={m} type="button" className={`studio-chip ${on ? 'sel' : ''}`}
                            onClick={() => patchTargeting('freightModes', m)}>{m}</button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="studio-field">
                    <label className="studio-field-label">Consignment type</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {STUDIO_CONSIGNMENT_TYPES.map(c => {
                        const on = (workflow.targeting?.consignmentTypes ?? []).includes(c);
                        return (
                          <button key={c} type="button" className={`studio-chip ${on ? 'sel' : ''}`}
                            onClick={() => patchTargeting('consignmentTypes', c)}>{c}</button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="studio-field">
                    <label className="studio-field-label">Customer</label>
                    <Combobox
                      options={[
                        { value: '__none__', label: 'Any customer' },
                        ...customers.map(c => ({ value: c.id, label: c.name })),
                      ]}
                      value={(workflow.targeting?.customerIds ?? [])[0] ?? '__none__'}
                      onChange={v => patchWorkflow(w => ({
                        ...w,
                        targeting: { ...emptyTargeting(), ...w.targeting, customerIds: v === '__none__' ? [] : [v] },
                      }))}
                      placeholder="Any customer"
                      searchPlaceholder="Search customers…"
                      emptyText="No customers found."
                    />
                  </div>

                  {/* Only when the trigger is registered but is about something
                      other than a shipment. An unregistered trigger already has
                      a louder, more accurate error on the Trigger field above,
                      and two overlapping explanations help nobody. */}
                  {targetingIsSet && currentTrigger && !triggerCarriesShipment && (
                    <div style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'var(--gold-l)', border: '1px solid var(--gold-l)', fontSize: 11.5, color: 'var(--ink2)' }}>
                      <Icon name="alertTriangle" size={14} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        <strong>{currentTrigger?.label ?? workflow.trigger_event}</strong> is not about a shipment, so these
                        filters can never be checked — this workflow would be skipped every time. Clear the targeting, or pick a
                        shipment trigger.
                      </span>
                    </div>
                  )}
                </div>

                {contextFields.length > 0 && (
                  <div className="studio-section">
                    <div className="studio-section-title">Available fields</div>
                    <div className="studio-field-hint" style={{ marginBottom: 8 }}>
                      Reference these in any step with <code>{'{{…}}'}</code>. The trigger's app also loads the related record — e.g. <code>{'{{shipment.refNumber}}'}</code>.
                    </div>
                    {contextFields.map(f => (
                      <div key={f} className="studio-run-mono" style={{ padding: '3px 0' }}>{`{{${f}}}`}</div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="studio-field">
                  <label className="studio-field-label">Title</label>
                  <Input value={selectedNode.title} onChange={e => updateNode(selectedNode.id, { title: e.target.value })} />
                </div>

                {selectedNode.type === 'condition' && (
                  <>
                    <div className="studio-field">
                      <label className="studio-field-label">Field</label>
                      <Input value={selectedNode.config?.field ?? ''} placeholder="shipment.assignedTo"
                        onChange={e => updateNode(selectedNode.id, { config: { ...selectedNode.config, field: e.target.value } })} />
                      <div className="studio-field-hint">A path into the event payload or the loaded record — no braces here.</div>
                    </div>
                    <div className="studio-field">
                      <label className="studio-field-label">Operator</label>
                      <Select value={selectedNode.config?.operator ?? 'is_not_empty'}
                        onValueChange={v => updateNode(selectedNode.id, { config: { ...selectedNode.config, operator: v } })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {!['is_empty', 'is_not_empty'].includes(selectedNode.config?.operator ?? 'is_not_empty') && (
                      <div className="studio-field">
                        <label className="studio-field-label">Value</label>
                        <Input value={selectedNode.config?.value ?? ''}
                          onChange={e => updateNode(selectedNode.id, { config: { ...selectedNode.config, value: e.target.value } })} />
                      </div>
                    )}
                  </>
                )}

                {selectedNode.type === 'forEach' && (
                  <>
                    <div className="studio-field">
                      <label className="studio-field-label">Collection</label>
                      <Input value={selectedNode.config?.over ?? ''} placeholder="trips"
                        onChange={e => updateNode(selectedNode.id, { config: { ...selectedNode.config, over: e.target.value } })} />
                      <div className="studio-field-hint">
                        A collection loaded by the trigger's app, such as <code>trips</code> or <code>suspendedLots</code>. Studio never queries tables itself.
                      </div>
                    </div>
                    <div className="studio-field">
                      <label className="studio-field-label">Name each item</label>
                      <Input value={selectedNode.config?.as ?? 'item'}
                        onChange={e => updateNode(selectedNode.id, { config: { ...selectedNode.config, as: e.target.value } })} />
                      <div className="studio-field-hint">Steps below can then use <code>{`{{${selectedNode.config?.as ?? 'item'}.id}}`}</code>.</div>
                    </div>
                    <div className="studio-field-hint" style={{ color: 'var(--gold)' }}>
                      Every step after this one repeats per item. Nested loops are not supported.
                    </div>
                  </>
                )}

                {selectedNode.type === 'action' && (
                  <>
                    <div className="studio-field">
                      <label className="studio-field-label">Action</label>
                      <Select value={selectedNode.eventOrAction ?? ''}
                        onValueChange={v => updateNode(selectedNode.id, { eventOrAction: v })}>
                        <SelectTrigger><SelectValue placeholder="Choose an action" /></SelectTrigger>
                        <SelectContent>
                          {actions.map(a => <SelectItem key={a.id} value={a.id}>{a.appName} — {a.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedAction ? (
                      <div className="studio-section">
                        <div className="studio-section-title">Inputs</div>
                        {selectedAction.restricted && (
                          <div className="studio-field-hint" style={{ color: 'var(--gold)', marginBottom: 10 }}>
                            This action writes to a regulated ledger.
                            {selectedAction.requiredEntitlement && ` It also requires the “${selectedAction.requiredEntitlement}” entitlement, checked on every run.`}
                          </div>
                        )}
                        {selectedAction.inputs.map(inp => (
                          <div className="studio-field" key={inp.name}>
                            <label className="studio-field-label">
                              {inp.name}{inp.required && <span className="studio-req"> *</span>}
                            </label>
                            <Input
                              value={String(selectedNode.config?.input?.[inp.name] ?? '')}
                              placeholder={inp.required ? 'Required' : 'Optional'}
                              onChange={e => updateNode(selectedNode.id, {
                                config: { ...selectedNode.config, input: { ...(selectedNode.config?.input ?? {}), [inp.name]: e.target.value } },
                              })}
                            />
                          </div>
                        ))}
                        <div className="studio-field-hint">
                          Values accept <code>{'{{…}}'}</code> references. Anything left blank is sent as empty and validated when the step runs.
                        </div>
                      </div>
                    ) : (
                      <div className="studio-field-hint" style={{ color: 'var(--red)' }}>
                        This step references <code>{selectedNode.eventOrAction}</code>, which is not in the action registry. It cannot run.
                      </div>
                    )}
                  </>
                )}

                {selectedNode.type === 'trigger' && (
                  <div className="studio-field-hint">
                    The trigger is set on the workflow itself — deselect this step to change it.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
