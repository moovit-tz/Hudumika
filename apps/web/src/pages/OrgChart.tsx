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

interface StaffMember {
  id: string;
  name: string;
  role: string;
  dept?: string;
  email?: string;
  phone?: string;
}

interface FlowNodeData {
  label: string;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  color: string;
  avatar_color: string;
  parent_id: string | null;
  sub_reports_count: number;
  user_id: string | null;
  onAddChild?: (id: string) => void;
  [key: string]: unknown;
}

type FlowNode = Node<FlowNodeData, 'person'>;
type FlowEdge = Edge;

interface EditForm {
  label: string;
  job_title: string;
  department: string;
  email: string;
  phone: string;
  color: string;
  parent_id: string;
  user_id: string;
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

const NODE_WIDTH  = 230;
const NODE_HEIGHT = 110;

/* ─── Dagre auto-layout ──────────────────────────────────── */
function applyDagreLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90, marginx: 50, marginy: 50 });
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
function OrgPersonNode({ id, data, selected }: NodeProps<FlowNode>) {
  const d = data;
  const initials = d.label.split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase();

  return (
    <div style={{
      width: NODE_WIDTH,
      background: '#ffffff',
      borderRadius: 12,
      border: `2px solid ${selected ? d.color : 'rgba(0,0,0,0.08)'}`,
      boxShadow: selected
        ? `0 0 0 3px ${d.color}33, 0 10px 30px rgba(0,0,0,0.14)`
        : '0 4px 18px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      fontFamily: 'var(--font)',
      position: 'relative',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: d.color, width: 10, height: 10, border: '2px solid #fff', top: -6 }} />

      {/* Color accent top bar */}
      <div style={{ height: 4, background: d.color }} />

      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
          background: `${d.color}18`, border: `2px solid ${d.color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: d.color, letterSpacing: '-0.01em',
        }}>
          {initials}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25,
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '1px 7px', borderRadius: 4, background: `${d.color}12`, color: d.color, fontSize: 10, fontWeight: 700 }}>
              <span>•</span> {d.department}
            </div>
          )}
        </div>
      </div>

      {/* Sub-reports count badge / Quick add bar */}
      <div style={{
        borderTop: '1px solid #f1f5f9',
        padding: '6px 12px',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 10.5,
      }}>
        {d.sub_reports_count > 0 ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink2)', background: 'rgba(0,0,0,0.06)', padding: '2px 8px', borderRadius: 10 }}>
            +{d.sub_reports_count} report{d.sub_reports_count !== 1 ? 's' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Individual contributor</span>
        )}

        {d.onAddChild && (
          <button type="button" onClick={(e) => { e.stopPropagation(); d.onAddChild?.(id); }}
            title="Add subordinate report under this person"
            style={{
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '2px 6px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--teal)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}>
            <Icon name="plus" size={10} color="var(--teal)" /> Report
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: d.color, width: 10, height: 10, border: '2px solid #fff', bottom: -6 }} />
    </div>
  );
}

const nodeTypes = { person: OrgPersonNode as unknown as React.ComponentType<NodeProps> };

/* ─── Convert API data → ReactFlow nodes + edges ─────────── */
function toFlow(apiNodes: OrgNode[], onAddChild?: (id: string) => void): { nodes: FlowNode[]; edges: FlowEdge[] } {
  // Count sub-reports for each node
  const reportCounts: Record<string, number> = {};
  apiNodes.forEach(n => {
    if (n.parent_id) {
      reportCounts[n.parent_id] = (reportCounts[n.parent_id] || 0) + 1;
    }
  });

  const nodes: FlowNode[] = apiNodes.map(n => ({
    id: n.id,
    type: 'person',
    position: { x: n.position_x, y: n.position_y },
    data: {
      label:             n.label,
      job_title:         n.job_title,
      department:        n.department,
      email:             n.email,
      phone:             n.phone,
      color:             n.color || DEPT_COLORS[n.department || ''] || '#0891b2',
      avatar_color:       n.avatar_color || '#0891b2',
      parent_id:         n.parent_id,
      sub_reports_count: reportCounts[n.id] || 0,
      user_id:           n.user_id,
      onAddChild,
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
      style: { stroke: '#94a3b8', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 14, height: 14 },
    }));

  return { nodes, edges };
}

/* ─── Sidebar Drawer ──────────────────────────────────────── */
interface SidebarProps {
  node: FlowNode | null;
  allNodes: FlowNode[];
  staffList: StaffMember[];
  onClose: () => void;
  onSave: (id: string, form: EditForm) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

function Sidebar({ node, allNodes, staffList, onClose, onSave, onDelete, saving }: SidebarProps) {
  const d = node?.data;
  const [form, setForm] = useState<EditForm>({
    label:      d?.label      ?? '',
    job_title:  d?.job_title  ?? '',
    department: d?.department ?? '',
    email:      d?.email      ?? '',
    phone:      d?.phone      ?? '',
    color:      d?.color      ?? '#0891b2',
    parent_id:  d?.parent_id  ?? '',
    user_id:    d?.user_id    ?? '',
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
        user_id:    d.user_id    ?? '',
      });
    }
  }, [node?.id]);

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (!node) return null;

  const palette = ['#7c3aed','#0891b2','#059669','#f59e0b','#ef4444','#6366f1','#14b8a6','#0ea5e9','#ec4899','#84cc16'];
  const possibleParents = allNodes.filter(n => n.id !== node?.id);
  const directReports = allNodes.filter(n => n.data.parent_id === node?.id);

  const handleStaffSelect = (staffId: string) => {
    const s = staffList.find(x => x.id === staffId);
    if (s) {
      setForm(f => ({
        ...f,
        user_id: s.id,
        label: s.name,
        job_title: s.role || f.job_title,
        department: s.dept || f.department,
        email: s.email || f.email,
        phone: s.phone || f.phone,
      }));
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 340,
      background: 'var(--white)', borderLeft: '1px solid var(--border)',
      zIndex: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '-6px 0 28px rgba(0,0,0,0.08)',
    }}>
      {/* Drawer Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: form.color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="user" size={18} color={form.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>{form.label || 'Edit Role'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{form.job_title || 'Organization Member'}</div>
        </div>
        <button type="button" title="Close" onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Drawer Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {/* Link Staff Member */}
        {staffList.length > 0 && (
          <div style={{ marginBottom: 18, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
              Link to Staff Directory Member
            </label>
            <Combobox
              options={[{ value: '', label: '— Custom / Unlinked Node —' }, ...staffList.map(s => ({ value: s.id, label: `${s.name} (${s.role})` }))]}
              value={form.user_id}
              onChange={handleStaffSelect}
            />
          </div>
        )}

        {/* Accent Color picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Accent Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {palette.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--ink)' : '3px solid transparent', cursor: 'pointer', transition: 'border-color 0.15s' }} />
            ))}
          </div>
        </div>

        {[
          { key: 'label'     as const, label: 'Name / Role Title *', placeholder: 'e.g. Susan Smith'     },
          { key: 'job_title' as const, label: 'Job Title',           placeholder: 'e.g. Head of Operations' },
          { key: 'department'as const, label: 'Department',          placeholder: 'e.g. Operations'       },
          { key: 'email'     as const, label: 'Email Address',       placeholder: 'susan@company.com'     },
          { key: 'phone'     as const, label: 'Phone Number',        placeholder: '+255 700 000 000'      },
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
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Reports To (Direct Manager)</label>
          <Combobox
            options={[{ value: '', label: '— Top Level (CEO / Board) —' }, ...possibleParents.map(n => ({ value: n.id, label: `${n.data.label} (${n.data.job_title || 'Node'})` }))]}
            value={form.parent_id} onChange={v => setForm(f => ({ ...f, parent_id: v }))}
          />
        </div>

        {/* Direct Subordinates List */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Direct Subordinates ({directReports.length})
          </div>
          {directReports.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>No direct reports connected.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {directReports.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.data.color }} />
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.data.label}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)', marginLeft: 'auto' }}>{r.data.job_title || r.data.department}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
        <button type="button" onClick={() => onSave(node.id, form)} disabled={saving || !form.label.trim()}
          style={{ flex: 1, padding: '10px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
            background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={() => onDelete(node.id)} disabled={saving}
          style={{ padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', cursor: 'pointer',
            background: 'none', color: 'var(--red)', fontSize: 13, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="trash" size={15} color="var(--red)" />
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
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filterDept, setFilterDept] = useState('');
  const [addForm, setAddForm] = useState({ label: '', job_title: '', department: '', color: '#0891b2', parent_id: '', user_id: '' });
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Quick Add Child Handler ── */
  const handleAddChildClick = useCallback((parentId: string) => {
    setAddForm({ label: '', job_title: '', department: '', color: '#0891b2', parent_id: parentId, user_id: '' });
    setShowAdd(true);
  }, []);

  /* ── Load ── */
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/org-chart'),
      apiFetch('/v1/hr/staff').catch(() => []),
    ])
      .then(([data, staff]: [OrgNode[], any[]]) => {
        setApiData(data);
        if (Array.isArray(staff)) setStaffList(staff);

        const { nodes: n, edges: e } = toFlow(data, handleAddChildClick);
        setNodes(n);
        setEdges(e);
      })
      .catch((err: any) => setError(err?.message || 'Failed to load the org chart.'))
      .finally(() => setLoading(false));
  }, [handleAddChildClick]);

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

  /* ── Connect two nodes (set parent relationship) ── */
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
          label:        form.label,
          job_title:    form.job_title    || null,
          department:   form.department   || null,
          email:        form.email        || null,
          phone:        form.phone        || null,
          color:        form.color,
          avatar_color: form.color,
          parent_id:    form.parent_id    || null,
          user_id:      form.user_id      || null,
        }),
      });
      load();
      setSelected(null);
    } catch (err: any) { setError(err?.message || 'Failed to save changes.'); }
    finally { setSaving(false); }
  }, [load]);

  /* ── Delete node ── */
  const onDeleteNode = useCallback(async (id: string) => {
    if (!(await showConfirm('Remove this node? Children will be re-parented to its manager.', { confirmLabel: 'Remove' }))) return;
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
      const viewportCenter = { x: 250 + Math.random() * 200, y: 250 + Math.random() * 150 };
      await apiFetch('/v1/org-chart', {
        method: 'POST',
        body: JSON.stringify({
          label:        addForm.label,
          job_title:    addForm.job_title  || null,
          department:   addForm.department || null,
          color:        addForm.color,
          avatar_color: addForm.color,
          parent_id:    addForm.parent_id  || null,
          user_id:      addForm.user_id    || null,
          position_x:   viewportCenter.x,
          position_y:   viewportCenter.y,
        }),
      });
      setAddForm({ label: '', job_title: '', department: '', color: '#0891b2', parent_id: '', user_id: '' });
      setShowAdd(false);
      load();
    } catch (err: any) { setError(err?.message || 'Failed to add node.'); }
    finally { setSaving(false); }
  }, [addForm, load]);

  /* ── Sync staff from directory ── */
  const syncStaff = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch('/v1/org-chart/sync-staff', { method: 'POST' });
      load();
    } catch (err: any) { setError(err?.message || 'Failed to sync staff directory.'); }
    finally { setSaving(false); }
  }, [load]);

  /* ── Reset default tree ── */
  const resetChart = useCallback(async () => {
    if (!(await showConfirm('Reset org chart to default sample structure?', { confirmLabel: 'Reset' }))) return;
    setSaving(true);
    try {
      await apiFetch('/v1/org-chart/reset', { method: 'POST' });
      load();
    } catch (err: any) { setError(err?.message || 'Failed to reset chart.'); }
    finally { setSaving(false); }
  }, [load]);

  /* ── Auto layout ── */
  const autoLayout = useCallback(() => {
    const laid = applyDagreLayout(nodes, edges);
    setNodes(laid);
    setDirty(true);
    scheduleSave(laid);
  }, [nodes, edges, scheduleSave]);

  const palette = ['#7c3aed','#0891b2','#059669','#f59e0b','#ef4444','#6366f1','#14b8a6','#0ea5e9'];

  // Filter nodes by department if selected
  const displayedNodes = filterDept
    ? nodes.map(n => ({ ...n, hidden: n.data.department !== filterDept && n.data.parent_id !== null }))
    : nodes;

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)', color: 'var(--ink3)' }}>
      <div style={{ textAlign: 'center' }}>
        <Icon name="activity" size={28} color="var(--teal)" />
        <div style={{ marginTop: 12, fontSize: 14 }}>Loading organization structure…</div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'var(--bg)' }}>
      <PageHeader
        crumbs={['NexusHR', 'Org Chart']}
        titlePlain="Organization"
        titleEm="chart"
        subtitle="Who reports to whom — drag nodes, connect handles to set reporting lines, or sync staff directory."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            {dirty && (
              <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                <Icon name="clock" size={11} color="#f59e0b" /> Auto-saving…
              </span>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={syncStaff} disabled={saving} title="Import unlinked staff from HR directory">
              <Icon name="users" size={13} /> Sync Staff
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={autoLayout} title="Auto-organize graph hierarchy">
              <Icon name="zap" size={13} /> Auto Layout
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setAddForm({ label: '', job_title: '', department: '', color: '#0891b2', parent_id: '', user_id: '' }); setShowAdd(true); }}>
              <Icon name="userPlus" size={13} color="#fff" /> Add Node
            </button>
          </div>
        }
      />

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
          nodes={displayedNodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 14, height: 14 },
          }}
          style={{ background: '#f8fafc' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#cbd5e1" gap={24} size={1.5} />
          <Controls style={{ boxShadow: 'var(--elev)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }} />
          <MiniMap
            nodeColor={(n) => (n.data as any).color ?? '#0891b2'}
            style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--white)' }}
            pannable
            zoomable
          />

          {/* Department Filter & Stats Panel */}
          <Panel position="top-left">
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
              padding: '10px 14px', boxShadow: 'var(--elev)', maxWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Filter Department
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'rgba(8,145,178,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                  {nodes.length} Nodes
                </span>
              </div>

              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', marginBottom: 8 }}>
                <option value="">All Departments</option>
                {Object.keys(DEPT_COLORS).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(DEPT_COLORS).slice(0, 5).map(([dept, color]) => (
                  <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink2)', padding: '2px 6px', borderRadius: 4, background: `${color}12` }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                    {dept}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Drag handle → connect manager</span>
                <button type="button" onClick={resetChart} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--red)', textDecoration: 'underline' }}>
                  Reset
                </button>
              </div>
            </div>
          </Panel>
        </ReactFlow>

        {/* Sidebar Drawer */}
        {selected && (
          <Sidebar
            node={selected}
            allNodes={nodes}
            staffList={staffList}
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
          <div style={{ background: 'var(--white)', borderRadius: 14, padding: '24px 28px', width: 440,
            boxShadow: 'var(--elev-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: addForm.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="userPlus" size={17} color={addForm.color} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Add Person / Role</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Create a custom node or import from Staff Directory</div>
              </div>
              <button type="button" title="Close" onClick={() => setShowAdd(false)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            {/* Import from Staff selector */}
            {staffList.length > 0 && (
              <div style={{ marginBottom: 14, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', display: 'block', marginBottom: 6 }}>
                  Quick Import from Employee Directory
                </label>
                <Combobox
                  options={[{ value: '', label: '— Select Staff Member —' }, ...staffList.map(s => ({ value: s.id, label: `${s.name} (${s.role})` }))]}
                  value={addForm.user_id}
                  onChange={(staffId) => {
                    const s = staffList.find(x => x.id === staffId);
                    if (s) {
                      setAddForm(f => ({
                        ...f,
                        user_id: s.id,
                        label: s.name,
                        job_title: s.role || f.job_title,
                        department: s.dept || f.department,
                      }));
                    }
                  }}
                />
              </div>
            )}

            {/* Accent Color */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }}>Accent Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {palette.map(c => (
                  <button key={c} type="button" onClick={() => setAddForm(f => ({ ...f, color: c }))}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: addForm.color === c ? '3px solid var(--ink)' : '3px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {[
              { key: 'label'      as const, label: 'Name / Role Title *', placeholder: 'e.g. Susan Smith' },
              { key: 'job_title'  as const, label: 'Job Title',           placeholder: 'e.g. Head of Design' },
              { key: 'department' as const, label: 'Department',          placeholder: 'e.g. Design' },
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
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Reports To (Direct Manager)</label>
              <Combobox
                options={[{ value: '', label: '— Top Level (No parent) —' }, ...nodes.map(n => ({ value: n.id, label: `${n.data.label} (${n.data.job_title || 'Node'})` }))]}
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
