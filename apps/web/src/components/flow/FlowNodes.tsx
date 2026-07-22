import React from 'react';
import { Handle, Position, EdgeProps, Edge, getBezierPath, BaseEdge } from '@xyflow/react';
import { Icon } from '../Icon.js';
import type { IconName } from '../Icon.js';

type AddEdgeData = { label?: string; onAddClick?: (id: string, event: React.MouseEvent) => void };

/* ── Shared kind metadata (also used by the properties sidebar) ──── */
export type ActionKind = 'webhook' | 'field' | 'assignee' | 'notify' | 'delay';
export type StatusKind = 'status' | 'condition';

export const ACTION_KIND_META: Record<ActionKind, { icon: IconName; label: string; accent: string }> = {
  webhook:  { icon: 'link',          label: 'Webhook / HTTP',     accent: '#3b82f6' },
  field:    { icon: 'sidebar',       label: 'Set Field',          accent: '#f59e0b' },
  assignee: { icon: 'user',          label: 'Assign To',          accent: '#8b5cf6' },
  notify:   { icon: 'messageSquare', label: 'Send Notification',  accent: '#ec4899' },
  delay:    { icon: 'clock',         label: 'Delay / Wait',       accent: '#6b7280' },
};

export const STATUS_KIND_META: Record<StatusKind, { icon: IconName; label: string; accent: string }> = {
  status:    { icon: 'flag',   label: 'Status Badge', accent: '#10b981' },
  condition: { icon: 'puzzle', label: 'Condition',    accent: '#ef4444' },
};

export const TRIGGER_OPTIONS: { value: string; label: string; icon: IconName }[] = [
  { value: 'manual',   label: 'Manually',    icon: 'zap' },
  { value: 'template', label: 'Use Template', icon: 'copy' },
  { value: 'webhook',  label: 'Webhook',      icon: 'link' },
  { value: 'schedule', label: 'Schedule',     icon: 'clock' },
];

/* ── Trigger Node ────────────────────────────────────────────────── */
export function TriggerNode({ data, selected }: { data: any, selected: boolean }) {
  const active = data.triggerType || 'manual';
  return (
    <div className={`aia-node aia-node-trigger-card ${selected ? 'selected' : ''}`}>
      <div className="aia-node-trigger-title">
        {data.title || 'How are task being added to this project?'}
      </div>

      {TRIGGER_OPTIONS.map(opt => (
        <div key={opt.value} className={`aia-node-trigger ${active === opt.value ? 'active' : ''}`}>
          <span className="aia-node-trigger-label">
            <Icon name={opt.icon} size={13} color={active === opt.value ? 'var(--blue)' : 'var(--ink3)'} />
            {opt.label}
          </span>
          <Icon name="arrowRight" size={14} color="var(--ink3)" />
        </div>
      ))}

      <Handle type="source" position={Position.Bottom} className="aia-handle" />
    </div>
  );
}

/* ── Action Node ─────────────────────────────────────────────────── */
export function ActionNode({ data, selected }: { data: any, selected: boolean }) {
  const meta = ACTION_KIND_META[data.kind as ActionKind];
  const icon = meta?.icon || (data.icon as IconName) || 'zap';
  const accent = meta?.accent || 'var(--ink3)';
  return (
    <div className="aia-node-wrapper">
      <Handle type="target" position={Position.Top} className="aia-handle" />
      <div
        className={`aia-node-action ${selected ? 'selected' : ''}`}
        style={{ background: `${accent}1a`, borderColor: selected ? 'var(--blue)' : `${accent}33` }}
      >
        <Icon name={icon} size={20} color={accent} />
      </div>
      <div className="aia-node-action-label">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="aia-handle" />
    </div>
  );
}

/* ── Status Node ─────────────────────────────────────────────────── */
export function StatusNode({ data, selected }: { data: any, selected: boolean }) {
  const isSuccess = data.status === 'success';
  const meta = STATUS_KIND_META[data.kind as StatusKind];
  const icon = data.icon || meta?.icon || 'check';
  return (
    <div className="aia-node-wrapper" style={{ position: 'relative' }}>
      <Handle type="target" position={Position.Top} className="aia-handle" />
      <div className={`aia-node-status ${isSuccess ? 'success' : ''} ${selected ? 'selected' : ''}`}>
        <Icon name={icon} size={14} color={isSuccess ? 'white' : 'var(--ink3)'} />
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} className="aia-handle" />
    </div>
  );
}

/* ── Custom Edge with Add Button ─────────────────────────────────── */
export function AddEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data
}: EdgeProps<Edge<AddEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2, stroke: '#d1d5db' }} />
      <foreignObject
        width={100}
        height={40}
        x={labelX - 50}
        y={labelY - 20}
        style={{ pointerEvents: 'none' }}
        requiredExtensions="http://www.w3.org/1999/xhtml"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          <button
            className="edgebutton"
            onClick={(event) => {
              event.stopPropagation();
              data?.onAddClick?.(id, event);
            }}
            style={{ pointerEvents: 'all' }}
          >
            +
          </button>
          {data?.label && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink3)', fontWeight: 500, pointerEvents: 'none', background: 'var(--bg)', padding: '0 4px' }}>
              {data.label}
            </span>
          )}
        </div>
      </foreignObject>
    </>
  );
}
