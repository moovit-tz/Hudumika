import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ShipmentCase } from '@hudumika/types';
import { StatusPill, ProgressSegments } from '@hudumika/ui';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { LANE, STATUS_VARIANT, declMoney } from '../lib/declarationMeta.js';

interface ShipmentRowProps {
  shipment: ShipmentCase;
  to: string;
}

export const ShipmentRow: React.FC<ShipmentRowProps> = ({ shipment, to }) => {
  const navigate = useNavigate();
  /**
   * Risk marker. Two states get one, and only because they cost money:
   * demurrage accruing, and an SLA already breached.
   *
   * There used to be four — teal for "in progress" and green for "done" as
   * well — so every row carried a coloured bar and the colour distinguished
   * nothing. And it was a floating 3px pill with margin around it, which read
   * as a stray mark beside the row rather than part of it; it is an inset rule
   * flush to the row's edge now.
   */
  const risk = shipment.active_risk_types?.includes('DEMURRAGE') ? ' risk-red'
    : shipment.active_risk_types?.includes('SLA_BREACH') ? ' risk-amber'
    : '';

  // Calculate days elapsed
  const createdDate = new Date(shipment.created_at);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Determine if late
  const isLate = shipment.active_risk_types && shipment.active_risk_types.length > 0;

  // Attached by ShipmentService.listGroupedByCustomer; null when nothing has
  // been lodged for this shipment yet.
  const decl = (shipment as any).declaration as {
    tancis_ref: string | null; tansad_number: string | null; status: string;
    selectivity_channel: string | null; no_of_items: number | null;
    total_customs_value: string | number | null;
  } | null | undefined;
  const laneMeta = decl?.selectivity_channel ? LANE[decl.selectivity_channel] : null;

  const getInitials = (name?: string) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div
      onClick={() => navigate(to)}
      className={`ship-row${risk}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: 'var(--white)',
        minHeight: '56px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Leading spacer — mirrors TableHeader's blank th-urgency column
          (15px + 12px margin) so every column below lines up under its
          label. The risk marker itself is an inset box-shadow on the row,
          which takes no layout width, so without this every column here
          rendered ~27px left of its header. */}
      <div style={{ width: '15px', marginRight: '12px', flexShrink: 0 }} />

      {/* Ref Number */}
      <div className="sr-ref" style={{ width: '130px', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: '12px' }}>
        {shipment.ref_number}
      </div>

      {/* Type */}
      <div className="sr-type" style={{ width: '80px', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: '11px' }}>
        {shipment.type.replace('_', ' ')}
      </div>

      {/* Description — rendered before Declaration to match TableHeader's
          column order (Cargo Description, then Declaration). They used to
          be swapped here, so every row's declaration badges sat under the
          "Cargo Description" label and the goods description sat under
          "Declaration". */}
      <div className="sr-desc" style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
        <div className="sr-goods" style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shipment.goods_desc}
        </div>
        <div className="sr-vessel" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10.5px', color: 'var(--ink3)', marginTop: '2px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Icon name="ship" size={11} /> {shipment.vessel || 'N/A'} • {shipment.origin_port || 'Origin'} ➔ {shipment.dest_port || 'Dest'}
        </div>
      </div>

      {/* Declaration — TANCIS ref, filing status, TRA lane, declared value and
          item count. Carried over from /clearos/declarations, which this list
          replaces. "Not declared" is a real state, not missing data, so it is
          said plainly rather than left as an em-dash. */}
      <div className="sr-decl" style={{ width: '196px', flexShrink: 0, paddingRight: 12, minWidth: 0 }}>
        {decl ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Badge variant={STATUS_VARIANT[decl.status] ?? 'gray'}>
                {decl.status.charAt(0) + decl.status.slice(1).toLowerCase()}
              </Badge>
              {laneMeta && (
                <span title={laneMeta.hint}>
                  <Badge variant={laneMeta.variant}>{laneMeta.label}</Badge>
                </span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 3, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {decl.tancis_ref || decl.tansad_number || '—'}
              {decl.no_of_items ? ` · ${decl.no_of_items} item${decl.no_of_items === 1 ? '' : 's'}` : ''}
            </div>
            {Number(decl.total_customs_value ?? 0) > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 1 }}>
                {declMoney(decl.total_customs_value)}
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Not declared</span>
        )}
      </div>

      {/* Stage Progress Bar */}
      <div className="sr-stage" style={{ width: '160px', flexShrink: 0, padding: '0 12px' }}>
        <ProgressSegments currentStage={shipment.stage} workflowStepOrder={shipment.workflow_step_order} workflowStepCount={shipment.workflow_step_count} />
      </div>

      {/* Status Pill */}
      <div className="sr-status" style={{ width: '140px', flexShrink: 0 }}>
        {/* A shipment on a custom workflow has a workflow_steps UUID in
            `stage`, so passing it straight through printed
            "5e9ef8f3-ec93-4bb3-92c7-6d86084dc8cc" in the Status column. The
            step's own name is carried on the row for exactly this. */}
        <StatusPill stage={(shipment as any).workflow_step_name || shipment.stage} />
      </div>

      {/* Officer assigned — links to their staff profile when the shipment
          actually has one on file. stopPropagation keeps the click from also
          firing the row's own navigate-to-shipment handler. */}
      <div className="sr-officer" style={{ width: '100px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        {shipment.assigned_to ? (
          <Link
            to={`/nexushr/staff/${shipment.assigned_to}`}
            onClick={(e) => e.stopPropagation()}
            title={`Open ${shipment.assigned_officer_name || 'officer'}'s profile`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, textDecoration: 'none', color: 'inherit' }}
            onMouseEnter={(e) => (e.currentTarget.querySelector('.sro-name') as HTMLElement)?.style.setProperty('text-decoration', 'underline')}
            onMouseLeave={(e) => (e.currentTarget.querySelector('.sro-name') as HTMLElement)?.style.setProperty('text-decoration', 'none')}
          >
            <div
              className="sro-ava"
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: shipment.assigned_officer_avatar_url ? 'var(--bg)' : 'var(--navy2)',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {shipment.assigned_officer_avatar_url
                ? <img src={shipment.assigned_officer_avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : getInitials(shipment.assigned_officer_name)}
            </div>
            <div className="sro-name" style={{ fontSize: '11.5px', color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shipment.assigned_officer_name || 'Unassigned'}
            </div>
          </Link>
        ) : (
          <>
            <div
              className="sro-ava"
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--navy2)',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {getInitials(shipment.assigned_officer_name)}
            </div>
            <div className="sro-name" style={{ fontSize: '11.5px', color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Unassigned
            </div>
          </>
        )}
      </div>

      {/* Days elapsed */}
      <div className={`sr-days ${isLate ? 'late' : ''}`} style={{ width: '50px', flexShrink: 0, textAlign: 'right', fontFamily: 'var(--mono)' }}>
        {diffDays}d
      </div>

      {/* Arrow — visual indicator that row is clickable */}
      <div className="sr-arrow-btn" style={{ width: 24, height: 24, flexShrink: 0, color: 'var(--teal)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        →
      </div>
    </div>
  );
};
