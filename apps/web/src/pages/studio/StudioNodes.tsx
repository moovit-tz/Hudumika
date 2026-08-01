import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import type { WorkflowStudioNodeType } from '@hudumika/types';

/**
 * Canvas nodes for Workflow Studio.
 *
 * Accents come from the platform's own CSS variables, not from the reference
 * screenshots' indigo. A SuperAdmin sets the brand colour at
 * /admin/design-system and every derived tint follows it (CLAUDE.md); hardcoding
 * a palette here would drift the moment a tenant switches theme.
 */

export const NODE_META: Record<WorkflowStudioNodeType, { label: string; icon: IconName; accent: string; tint: string }> = {
  trigger:   { label: 'Trigger',   icon: 'zap',       accent: 'var(--green)',  tint: 'var(--green-l)' },
  condition: { label: 'Condition', icon: 'gitBranch', accent: 'var(--blue)',   tint: 'var(--blue-l)' },
  action:    { label: 'Action',    icon: 'play',      accent: 'var(--teal)',   tint: 'var(--teal-l)' },
  forEach:   { label: 'For each',  icon: 'layers',    accent: 'var(--purple)', tint: 'var(--purple-l)' },
};

export interface StudioNodeData {
  nodeType: WorkflowStudioNodeType;
  title: string;
  subtitle?: string;
  /** Registry label, e.g. "Raise a support ticket" — absent when unresolved. */
  refLabel?: string;
  /** Set when the referenced trigger/action is not in the registry. */
  unknownRef?: string;
  restricted?: boolean;
  /** Status of this node in the most recent run being viewed. */
  runStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'SIMULATED';
  runDetail?: string;
  iterations?: number;
  [key: string]: unknown;
}

const RUN_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  SUCCESS:   { label: 'Ran',       color: 'var(--green)',  bg: 'var(--green-l)' },
  FAILED:    { label: 'Failed',    color: 'var(--red)',    bg: 'var(--red-l)' },
  SKIPPED:   { label: 'Skipped',   color: 'var(--ink3)',   bg: 'var(--surface-2, rgba(0,0,0,.04))' },
  SIMULATED: { label: 'Simulated', color: 'var(--blue)',   bg: 'var(--blue-l)' },
};

export function StudioNode({ data, selected }: { data: StudioNodeData; selected?: boolean }) {
  const meta = NODE_META[data.nodeType] ?? NODE_META.action;
  const badge = data.runStatus ? RUN_BADGE[data.runStatus] : null;

  return (
    <div
      className="studio-node"
      style={{
        borderColor: selected ? meta.accent : 'var(--border)',
        // The selection ring uses the node type's canonical soft tint token
        // rather than a hand-picked color-mix percentage, so it follows the
        // live brand colour like every other tint in the app (CLAUDE.md).
        boxShadow: selected ? `0 0 0 4px ${meta.tint}` : undefined,
      }}
    >
      {data.nodeType !== 'trigger' && <Handle type="target" position={Position.Top} className="studio-handle" />}

      <div className="studio-node-head">
        <span className="studio-node-pill" style={{ background: meta.tint, color: meta.accent }}>
          <Icon name={meta.icon} size={11} color={meta.accent} /> {meta.label}
        </span>
        {data.restricted && (
          <span className="studio-node-pill" style={{ background: 'var(--gold-l)', color: 'var(--gold)' }} title="Writes to a regulated ledger — restricted action">
            <Icon name="lock" size={10} color="var(--gold)" /> Restricted
          </span>
        )}
        {badge && (
          <span className="studio-node-pill" style={{ background: badge.bg, color: badge.color, marginLeft: 'auto' }}>
            {badge.label}{data.iterations ? ` ×${data.iterations}` : ''}
          </span>
        )}
      </div>

      <div className="studio-node-title">{data.title}</div>

      {data.unknownRef ? (
        // Never silently render a node bound to something that does not exist —
        // that is precisely how 21 workflows sat ACTIVE on triggers nothing emits.
        <div className="studio-node-warn">
          <Icon name="alertCircle" size={12} color="var(--red)" />
          <span><code>{data.unknownRef}</code> is not in the registry — this step cannot run.</span>
        </div>
      ) : data.refLabel ? (
        <div className="studio-node-sub">{data.refLabel}</div>
      ) : null}

      {data.runDetail && <div className="studio-node-detail">{data.runDetail}</div>}

      <Handle type="source" position={Position.Bottom} className="studio-handle" />
    </div>
  );
}

export const STUDIO_NODE_TYPES = { studio: StudioNode };
