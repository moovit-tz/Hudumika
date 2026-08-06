import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  Panel,
} from '@xyflow/react';

type FlowNode = Node<{ label: string; job_title: string | null; department: string | null; email: string | null; phone: string | null; color: string; avatar_color: string; parent_id: string | null }, 'person'>;
type FlowEdge = Edge;
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

/* ─── Types ─────────────────────────────────────────────── */
interface OrgNode {
  id: string;
  label: string;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  avatar_color: string;
  parent_id: string | null;
  position_x: number;
  position_y: number;
  color: string;
  node_type: string;
  user_id: string | null;
}

interface EditForm {
  label: string;
  job_title: string;
  department: string;
  email: string;
  phone: string;
  color: string;
  parent_id: string;
}

const DEPT_COLORS: Record<string, string> = {
  Executive: '#7c3aed',
  Operations: '#0891b2',
  Finance: '#059669',
  HR: '#f59e0b',
  Sales: '#ef4444',
  IT: '#6366f1',
  Legal: '#84cc16',
  Logistics: '#0ea5e9',
  Clearance: '#14b8a6',
};

const NODE_WIDTH  = 220;
const NODE_HEIGHT = 90;

/* ─── Dagre auto-layout ──────────────────────────────────── */
function applyDagreLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

/* ─── Custom org-chart node ──────────────────────────────── */
function OrgPersonNode({ data, selected }: NodeProps<FlowNode>) {
  const d = data;
  const initials = d.label.split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase();
  return (
    <div style={{
      width: NODE_WIDTH,
      background: '#fff',
      borderRadius: 12,
      border: `2px solid ${selected ? d.color : 'rgba(0,0,0,0.08)'}`,
      boxShadow: selected
        ? `0 0 0 3px ${d.color}33, 0 8px 32px rgba(0,0,0,0.14)`
        : '0 4px 16px rgba(0,0,0,0.08)',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s, border-color 0.2s',
      cursor: 'default',
      fontFamily: 'var(--font)',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: d.color, width: 10, height: 10, border: '2px solid #fff', top: -6 }} />

      {/* Color accent bar */}
      <div style={{ height: 4, background: d.color }} />

      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: d.color + '22', border: `2px solid ${d.color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 800, color: d.color, letterSpacing: '-0.01em',
        }}>
          {initials}
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.label}
          </div>
          {d.job_title && (
            <div style={{ fontSize: 11, color: d.color, fontWeight: 600, marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.job_title}
            </div>
          )}
          {d.department && (
            <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.department}
            </div>
          )}
        </div>
      </div>

      {d.email && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 14px',
          fontSize: 10.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="mail" size={10} color="var(--ink3)" />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.email}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ background: d.color, width: 10, height: 10, border: '2px solid #fff', bottom: -6 }} />
    </div>
  );
}

const nodeTypes = { person: OrgPersonNode as React.ComponentType<NodeProps> };

/* ─── Convert API data → ReactFlow nodes + edges ─────────── */
function toFlow(apiNodes: OrgNode[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = apiNodes.map(n => ({
    id: n.id,
    type: 'person',
    position: { x: n.position_x, y: n.position_y },
    data: {
      label:       n.label,
      job_title:   n.job_title,
      department:  n.department,
      email:       n.email,
      phone:       n.phone,
      color:       n.color,
      avatar_color: n.avatar_color,
      parent_id:   n.parent_id,
    },
    dragHandle: '.react-flow__node',
  })) as FlowNode[];
  const edges: FlowEdge[] = apiNodes
    .filter(n => n.parent_id)
    .map(n => ({
      id: `e_${n.parent_id}_${n.id}`,
      source: n.parent_id!,
      target: n.id,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#cbd5e1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
    }));
  return { nodes, edges };
}

/* ─── Sidebar panel ──────────────────────────────────────── */
interface SidebarProps {
  node: FlowNode | null;
  allNodes: FlowNode[];
  onClose: () => void;
  onSave: (id: string, form: EditForm) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

function Sidebar({ node, allNodes, onClose, onSave, onDelete, saving }: SidebarProps) {
  const d = node?.data;
  const [form, setForm] = useState<EditForm>({
    label:      d?.label      ?? '',
    job_title:  d?.job_title  ?? '',
    department: d?.department ?? '',
    email:      d?.email      ?? '',
    phone:      d?.phone      ?? '',
    color:      d?.color      ?? '#0891b2',
    parent_id:  d?.parent_id  ?? '',
  });

  useEffect(() => {
    if (d) {
      setForm({
        label:      d.label      ?? '',
        job_title:  d.job_title  ?? '',
        department: d.department ?? '',
        email:      d.email      ?? '',
        phone:      d.phone      ?? '',
        color:      d.color      ?? '#0891b2',
        parent_id:  d.parent_id  ?? '',
      });
    }
  }, [node?.id]);

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (!node) return null;

  const palette = ['#7c3aed','#0891b2','#059669','#f59e0b','#ef4444','#6366f1','#14b8a6','#0ea5e9','#ec4899','#84cc16'];
  const possibleParents = allNodes.filter(n => n.id !== node?.id);

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 320,
      background: 'var(--white)', borderLeft: '1px solid var(--border)',
      zIndex: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: form.color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="user" size={17} color={form.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Edit Node</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Update role or person details</div>
        </div>
        <button type="button" title="Close" onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
        {/* Color picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Accent Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {palette.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--ink)' : '3px solid transparent', cursor: 'pointer', transition: 'border-color 0.15s' }} />
            ))}
          </div>
        </div>

        {[
          { key: 'label'     as const, label: 'Name / Role',   placeholder: 'e.g. Jane Doe'         },
          { key: 'job_title' as const, label: 'Job Title',     placeholder: 'e.g. Operations Manager' },
          { key: 'department'as const, label: 'Department',    placeholder: 'e.g. Logistics'         },
          { key: 'email'     as const, label: 'Email',         placeholder: 'email@company.com'      },
          { key: 'phone'     as const, label: 'Phone',         placeholder: '+255 7xx xxx xxx'       },
        ].map(({ key, label, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>{label}</label>
            <input value={form[key]} onChange={set(key)} placeholder={placeholder}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, borderRadius: 7,
                border: '1px solid var(--border)', fontFamily: 'var(--font)', color: 'var(--ink)',
                background: 'var(--bg)', outline: 'none' }} />
          </div>
        ))}

        {/* Reports to */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Reports To</label>
          <Combobox
            options={[{ value: '', label: '— No parent (top level) —' }, ...possibleParents.map(n => ({ value: n.id, label: n.data.label }))]}
            value={form.parent_id} onChange={v => setForm(f => ({ ...f, parent_id: v }))}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onSave(node.id, form)} disabled={saving}
          style={{ flex: 1, padding: '9px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
            background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={() => onDelete(node.id)} disabled={saving}
          style={{ padding: 'var(--ds-btn-py) 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', cursor: 'pointer',
            background: 'none', color: 'var(--red)', fontSize: 13, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="trash" size={14} color="var(--red)" />
        </button>
      </div>
    </div>
  );
}

/* ─── Main OrgChart page ─────────────────────────────────── */
export const OrgChart: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [apiData, setApiData] = useState<OrgNode[]>([]);
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ label: '', job_title: '', department: '', color: '#0891b2', parent_id: '' });
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load ── */
  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/org-chart')
      .then((data: OrgNode[]) => {
        setApiData(data);
        const { nodes: n, edges: e } = toFlow(data);
        setNodes(n);
        setEdges(e);
      })
      .catch((err: any) => setError(err?.message || 'Failed to load the org chart.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Auto-save positions after drag (debounced 1.5s) ── */
  const scheduleSave = useCallback((updatedNodes: FlowNode[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch('/v1/org-chart/bulk-positions', {
          method: 'POST',
          body: JSON.stringify({
            nodes: updatedNodes.map(n => ({ id: n.id, position_x: n.position.x, position_y: n.position.y })),
          }),
        });
        setDirty(false);
      } catch (err: any) {
        setDirty(false);
        setError(err?.message || 'Failed to save node positions.');
      }
    }, 1500);
  }, []);

  const handleNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    onNodesChange(changes);
    const hasPosition = changes.some(c => c.type === 'position' && c.dragging === false);
    if (hasPosition) {
      setDirty(true);
      setNodes(cur => { scheduleSave(cur); return cur; });
    }
  }, [onNodesChange, scheduleSave]);

  /* ── Connect two nodes (set parent) ── */
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    // Update parent in API
    apiFetch(`/v1/org-chart/${connection.target}`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_id: connection.source }),
    }).then(() => load()).catch((err: any) => setError(err?.message || 'Failed to update reporting line.'));
  }, [load]);

  /* ── Node click → open sidebar ── */
  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setSelected(node);
  }, []);

  const onPaneClick = useCallback(() => setSelected(null), []);

  /* ── Save from sidebar ── */
  const onSaveNode = useCallback(async (id: string, form: EditForm) => {
    setSaving(true);
    try {
      await apiFetch(`/v1/org-chart/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label:      form.label,
          job_title:  form.job_title  || null,
          department: form.department || null,
          email:      form.email      || null,
          phone:      form.phone      || null,
          color:      form.color,
          avatar_color: form.color,
          parent_id:  form.parent_id  || null,
        }),
      });
      load();
      setSelected(null);
    } catch (err: any) { setError(err?.message || 'Failed to save changes.'); }
    finally { setSaving(false); }
  }, [load]);

  /* ── Delete node ── */
  const onDeleteNode = useCallback(async (id: string) => {
    if (!(await showConfirm('Remove this node? Children will be re-parented up.', { confirmLabel: 'Remove' }))) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/org-chart/${id}`, { method: 'DELETE' });
      load();
      setSelected(null);
    } catch (err: any) { setError(err?.message || 'Failed to delete node.'); }
    finally { setSaving(false); }
  }, [load]);

  /* ── Add new node ── */
  const onAddNode = useCallback(async () => {
    if (!addForm.label.trim()) return;
    setSaving(true);
    try {
      const viewportCenter = { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 };
      await apiFetch('/v1/org-chart', {
        method: 'POST',
        body: JSON.stringify({
          label:      addForm.label,
          job_title:  addForm.job_title  || null,
          department: addForm.department || null,
          color:      addForm.color,
          avatar_color: addForm.color,
          parent_id:  addForm.parent_id  || null,
          position_x: viewportCenter.x,
          position_y: viewportCenter.y,
        }),
      });
      setAddForm({ label: '', job_title: '', department: '', color: '#0891b2', parent_id: '' });
      setShowAdd(false);
      load();
    } catch (err: any) { setError(err?.message || 'Failed to add node.'); }
    finally { setSaving(false); }
  }, [addForm, load]);

  /* ── Auto layout ── */
  const autoLayout = useCallback(() => {
    const laid = applyDagreLayout(nodes, edges);
    setNodes(laid);
    setDirty(true);
    scheduleSave(laid);
  }, [nodes, edges, scheduleSave]);

  const palette = ['#7c3aed','#0891b2','#059669','#f59e0b','#ef4444','#6366f1','#14b8a6','#0ea5e9'];

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)', color: 'var(--ink3)' }}>
      <div style={{ textAlign: 'center' }}>
        <Icon name="activity" size={28} color="var(--teal)" />
        <div style={{ marginTop: 12, fontSize: 14 }}>Loading org chart…</div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'var(--bg)' }}>
      <PageHeader
        crumbs={['NexusHR', 'Org Chart']}
        titlePlain="Reporting"
        titleEm="structure"
        subtitle="Who reports to whom, from the contracts on file."
      />
      {/* ── Toolbar ── */}
      <div style={{ padding: '10px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(124,58,237,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="users" size={16} color="#7c3aed" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>Organization Chart</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Drag nodes · click to edit · connect to set reporting lines</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && (
            <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={11} color="#f59e0b" /> Auto-saving…
            </span>
          )}
          <button type="button" onClick={autoLayout}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 12px', borderRadius: 'var(--r)',
              border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="zap" size={13} color="var(--ink2)" /> Auto Layout
          </button>
          <button type="button" onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)',
              border: 'none', background: 'var(--teal)', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="userPlus" size={13} color="#fff" /> Add Node
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{ padding: '9px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, zIndex: 5 }}>
          <Icon name="alertCircle" size={14} color="var(--red)" />
          <span style={{ fontSize: 12.5, color: 'var(--red)', flex: 1 }}>{error}</span>
          <button type="button" title="Dismiss" onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}>
            <Icon name="x" size={14} color="var(--red)" />
          </button>
        </div>
      )}

      {/* ── Canvas + Sidebar ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#cbd5e1', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 14, height: 14 },
          }}
          style={{ background: '#f8fafc' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={24} size={1.5} />
          <Controls style={{ boxShadow: 'var(--elev)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }} />
          <MiniMap
            nodeColor={(n) => (n.data as any).color ?? '#0891b2'}
            style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--white)' }}
            pannable
            zoomable
          />

          {/* Legend */}
          <Panel position="top-left">
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
              padding: '10px 14px', boxShadow: 'var(--elev)', maxWidth: 220 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Departments</div>
              {Object.entries(DEPT_COLORS).slice(0, 6).map(([dept, color]) => (
                <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{dept}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--ink3)' }}>
                Drag nodes to reposition · Drag handle→handle to connect
              </div>
            </div>
          </Panel>
        </ReactFlow>

        {/* Sidebar */}
        {selected && (
          <Sidebar
            node={selected}
            allNodes={nodes}
            onClose={() => setSelected(null)}
            onSave={onSaveNode}
            onDelete={onDeleteNode}
            saving={saving}
          />
        )}
      </div>

      {/* ── Add Node Modal ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, padding: '24px 28px', width: 420,
            boxShadow: 'var(--elev-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: addForm.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="userPlus" size={17} color={addForm.color} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Add Node</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Add a person or role to the chart</div>
              </div>
              <button type="button" title="Close" onClick={() => setShowAdd(false)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }}>Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {palette.map(c => (
                  <button key={c} type="button" onClick={() => setAddForm(f => ({ ...f, color: c }))}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: addForm.color === c ? '3px solid var(--ink)' : '3px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {[
              { key: 'label'      as const, label: 'Name / Role *', placeholder: 'e.g. Amina Hassan' },
              { key: 'job_title'  as const, label: 'Job Title',     placeholder: 'e.g. Customs Officer' },
              { key: 'department' as const, label: 'Department',    placeholder: 'e.g. Clearance' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>{label}</label>
                <input value={addForm[key]} onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 7,
                    border: '1px solid var(--border)', fontFamily: 'var(--font)', color: 'var(--ink)',
                    background: 'var(--bg)', outline: 'none' }} />
              </div>
            ))}

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Reports To</label>
              <Combobox
                options={[{ value: '', label: '— No parent (top level) —' }, ...nodes.map(n => ({ value: n.id, label: n.data.label }))]}
                value={addForm.parent_id} onChange={v => setAddForm(f => ({ ...f, parent_id: v }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
                  background: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button type="button" onClick={onAddNode} disabled={saving || !addForm.label.trim()}
                style={{ flex: 2, padding: '10px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--font)',
                  opacity: !addForm.label.trim() ? 0.5 : 1 }}>
                {saving ? 'Adding…' : 'Add to Chart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
