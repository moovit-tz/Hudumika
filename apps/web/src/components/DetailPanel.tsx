import React, { useEffect, useState } from 'react';
import { nameColor as avatarColor, nameInitials as initials } from '../lib/identity.js';
import { Link } from 'react-router-dom';
import type { ClearanceStage } from '@hudumika/types';
import { CLEARANCE_STAGES, STAGE_LABELS } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';

interface DetailPanelProps {
  shipmentId: string | null;
  onClose: () => void;
  onUpdate: () => void;
  userRole: string;
}

// `initials` now comes from lib/identity — see the import at the top.

function relTime(iso?: string | null): string {
  if (!iso) return '�';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function fmtTZS(n: number): string {
  return 'TZS ' + n.toLocaleString('en-TZ');
}

// The local palette and hash are gone: seven colours and a shift-hash here
// against six and a sum-hash in NexusHR, so an officer shown on a shipment was
// a different colour from the same officer in their own staff record. Four out
// of five real names disagreed.

export const DetailPanel: React.FC<DetailPanelProps> = ({ shipmentId, onClose }) => {
  const [shipment, setShipment] = useState<any | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!shipmentId) return;
    setLoading(true);
    setShipment(null);
    setError(null);
    apiFetch(`/v1/shipments/${shipmentId}`)
      .then(data => setShipment(data))
      .catch((err: any) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  if (!shipmentId) return null;

  // Custom-workflow shipments (workflow_step_count set) render progress from
  // their own step position instead of indexing into the fixed 18-stage
  // list, which is meaningless once `stage` is a workflow_steps.id.
  const isCustomWorkflow = shipment?.workflow_step_count !== undefined && shipment?.workflow_step_order !== undefined;
  const stageCount = isCustomWorkflow ? shipment.workflow_step_count : CLEARANCE_STAGES.length;
  const stageIdx   = isCustomWorkflow ? shipment.workflow_step_order : (shipment ? CLEARANCE_STAGES.indexOf(shipment.stage as ClearanceStage) : -1);
  const stagePct   = stageIdx >= 0 ? Math.round((stageIdx + 1) / stageCount * 100) : 0;
  const stageLabel = isCustomWorkflow
    ? (shipment.workflow_step_name || shipment.stage)
    : (shipment?.stage ? (STAGE_LABELS[shipment.stage as ClearanceStage] || shipment.stage) : '�');
  const isOverdue  = shipment?.sla_deadline && new Date(shipment.sla_deadline) < new Date();

  const selCh = shipment?.selectivity_channel;
  const channelCfg =
    selCh === 'GREEN'  ? { label: 'Green Channel',  color: '#059669', bg: '#ecfdf5', icon: 'checkCircle' as const } :
    selCh === 'YELLOW' ? { label: 'Yellow Channel', color: '#ca8a04', bg: '#fef9c3', icon: 'alertTriangle' as const } :
    selCh === 'RED'    ? { label: 'Red Channel',    color: '#dc2626', bg: '#fee2e2', icon: 'alertTriangle' as const } :
    selCh === 'BLUE'   ? { label: 'Blue Channel',   color: '#2563eb', bg: '#dbeafe', icon: 'info' as const } : null;

  const docs       = shipment?.documents     || [];
  const msgs       = shipment?.messages      || [];
  const expenses   = shipment?.expenses      || [];
  const history    = shipment?.stage_history || [];
  const containers: any[] = shipment?.containers || [];
  const riskTypes: string[] = shipment?.active_risk_types || [];

  const lastMsg  = msgs.length  > 0 ? msgs[msgs.length - 1]         : null;
  const lastHist = history.length > 0 ? history[history.length - 1] : null;
  const totalCharges = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const verifiedDocs = docs.filter((d: any) => d.status === 'VERIFIED').length;

  const hasRisk = riskTypes.length > 0;
  const activeColor = hasRisk ? '#dc2626' : 'var(--teal)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', fontFamily: 'var(--font)' }}>

      {/* -- Header -- */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, color: 'var(--teal)', letterSpacing: '0.05em' }}>
          {loading ? 'Loading�' : (shipment?.ref_number || '�')}
        </span>
        <button type="button" title="Close panel" onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Icon name="x" size={16} color="var(--ink3)" />
        </button>
      </div>

      {error && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--red)' }}>{error}</div>}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[80, 55, 70, 45, 90, 60].map((w, i) => (
            <div key={i} style={{ height: 11, borderRadius: 4, background: 'var(--border)', width: `${w}%`, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {/* -- Body -- */}
      {shipment && (
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Title */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 5 }}>
              {shipment.goods_desc || 'No description'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
              {shipment.customer_name}{shipment.type ? ` � ${shipment.type.replace(/_/g, ' ')}` : ''}
            </div>
          </div>

          {/* Badges row */}
          {(channelCfg || shipment.tansad_number || hasRisk) && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {channelCfg && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: channelCfg.color, background: channelCfg.bg, borderRadius: 20, padding: '3px 10px' }}>
                  <Icon name={channelCfg.icon} size={12} color={channelCfg.color} />
                  {channelCfg.label}
                </span>
              )}
              {riskTypes.map((r: string) => (
                <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '3px 10px' }}>
                  <Icon name="alertTriangle" size={11} color="#dc2626" />
                  {r}
                </span>
              ))}
              {shipment.tansad_number && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#2563eb', fontWeight: 700, background: '#dbeafe', padding: '3px 9px', borderRadius: 6 }}>
                  {shipment.tansad_number}
                </span>
              )}
            </div>
          )}

          {/* Stage progress */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: hasRisk ? '#dc2626' : 'var(--ink)' }}>
                {stageLabel}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{stagePct}% complete</span>
            </div>
            {/* Bar */}
            <div style={{ height: 5, borderRadius: 99, background: 'var(--bg)', overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${stagePct}%`, background: activeColor, transition: 'width 0.4s' }} />
            </div>
            {/* Dots */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: stageCount }, (_, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: i <= stageIdx ? activeColor : 'var(--border)',
                }} />
              ))}
            </div>
          </div>

          {/* 2�2 stats grid */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'DOCUMENTS', value: `${docs.length}${verifiedDocs ? ` (${verifiedDocs} verified)` : ''}` },
              { label: 'MESSAGES',  value: `${msgs.length} update${msgs.length !== 1 ? 's' : ''}` },
              { label: 'CHARGES',   value: totalCharges > 0 ? fmtTZS(totalCharges) : '�' },
              { label: 'RECEIVED',  value: '�' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em', marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Shipment info */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {shipment.bl_number && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--ink3)', fontSize: 12 }}>B/L: </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{shipment.bl_number}</span>
              </div>
            )}
            {shipment.vessel && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--ink3)', fontSize: 12 }}>Vessel: </span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{shipment.vessel}</span>
              </div>
            )}
            {containers.length > 0 && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--ink3)', fontSize: 12 }}>Containers: </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>
                  {containers.map((c: any) => c.number || String(c)).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Last Update */}
          {(lastMsg || lastHist) && (() => {
            const isMsg = !!lastMsg;
            const update = isMsg ? lastMsg : lastHist;
            const name   = isMsg
              ? (update.author_name || update.sender_name || 'Agent')
              : (lastHist.user_name || shipment.assigned_officer_name || 'Officer');
            const time   = relTime(update.created_at || update.entered_at);
            const body   = isMsg
              ? (update.content || update.body)
              : (lastHist.note || STAGE_LABELS[lastHist.stage as ClearanceStage] || lastHist.stage);
            const bg = avatarColor(name);

            return (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Last Update
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: bg, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {initials(name)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{time}</div>
                  </div>
                </div>
                {body && (
                  <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 8 }}>{body}</div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 10px', background: 'var(--bg)' }}>
                    Internal
                  </span>
                  {isMsg && (
                    <span style={{ fontSize: 11, color: '#059669', border: '1px solid #a7f3d0', borderRadius: 20, padding: '2px 10px', background: '#ecfdf5' }}>
                      WhatsApp
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Assigned + CTA */}
          <div style={{ padding: '14px 16px 24px' }}>
            {shipment.assigned_officer_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Assigned:</span>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: avatarColor(shipment.assigned_officer_name),
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, border: '2px solid var(--white)',
                }}>
                  {initials(shipment.assigned_officer_name)}
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{shipment.assigned_officer_name}</span>
              </div>
            )}

            <Link
              to={`/clearos/clearance/${shipmentId}`}
              title="Open full shipment view"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '14px 16px',
                background: 'var(--teal)', color: '#fff',
                border: 'none', borderRadius: 9,
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)', textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              Open Full View
              <Icon name="arrowRight" size={16} color="#fff" />
            </Link>

            {isOverdue && (
              <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>
                ? Overdue � {new Date(shipment.sla_deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
