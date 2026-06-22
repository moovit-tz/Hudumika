import React, { useEffect, useState } from 'react';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import type {
  Declaration,
  DeclarationNotice,
  TaxLine,
  DeclarationNoticeType,
  SelectivityChannel,
  DeclarationStatus,
  NOTICE_TYPE_LABELS,
  SELECTIVITY_LABELS,
  DECLARATION_STATUS_LABELS,
} from '@clearos/types';

// ── Color maps ───────────────────────────────────────────────

const NOTICE_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  SELECTIVITY_RESULT:  { bg: 'var(--gold-l)',   color: 'var(--gold)',   icon: '🎯' },
  ASSESSMENT_NOTICE:   { bg: 'var(--blue-l)',   color: 'var(--blue)',   icon: '📊' },
  RELEASE_NOTICE:      { bg: 'var(--green-l)',  color: 'var(--green)',  icon: '✅' },
  PAYMENT_NOTICE:      { bg: 'var(--purple-l)', color: 'var(--purple)', icon: '💰' },
  QUERY_NOTICE:        { bg: 'var(--red-l)',    color: 'var(--red)',    icon: '❓' },
  AMENDMENT_NOTICE:    { bg: 'var(--gold-l)',   color: 'var(--gold)',   icon: '📝' },
  CANCELLATION_NOTICE: { bg: 'var(--red-l)',    color: 'var(--red)',    icon: '❌' },
};

const SELECTIVITY_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  GREEN:  { bg: 'var(--green-l)',  color: 'var(--green)',  label: 'Green — Direct Release' },
  YELLOW: { bg: 'var(--gold-l)',   color: 'var(--gold)',   label: 'Yellow — Documentary Check' },
  RED:    { bg: 'var(--red-l)',    color: 'var(--red)',    label: 'Red — Physical Inspection' },
  BLUE:   { bg: 'var(--blue-l)',   color: 'var(--blue)',   label: 'Blue — Post-Clearance Audit' },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT:       { bg: 'var(--bg)',       color: 'var(--ink2)' },
  VALIDATED:   { bg: 'var(--blue-l)',   color: 'var(--blue)' },
  SAVED:       { bg: 'var(--blue-l)',   color: 'var(--blue)' },
  TRANSFERRED: { bg: 'var(--gold-l)',   color: 'var(--gold)' },
  ACCEPTED:    { bg: 'var(--gold-l)',   color: 'var(--gold)' },
  ASSESSED:    { bg: 'var(--purple-l)', color: 'var(--purple)' },
  PAID:        { bg: 'var(--teal-l)',   color: 'var(--teal)' },
  RELEASED:    { bg: 'var(--green-l)',  color: 'var(--green)' },
  AMENDED:     { bg: 'var(--gold-l)',   color: 'var(--gold)' },
  CANCELLED:   { bg: 'var(--red-l)',    color: 'var(--red)' },
};

// ── Types for API response ───────────────────────────────────

interface NoticeWithTaxLines extends DeclarationNotice {
  tax_lines?: TaxLine[];
}

type ViewMode = 'list' | 'notices' | 'detail';

// ══════════════════════════════════════════════════════════════
// Main Declarations Page
// ══════════════════════════════════════════════════════════════

export const Declarations: React.FC = () => {
  const [view, setView] = useState<ViewMode>('list');
  const isMobile = useIsMobile();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [notices, setNotices] = useState<NoticeWithTaxLines[]>([]);
  const [selectedDecl, setSelectedDecl] = useState<(Declaration & { items?: any[]; notices?: NoticeWithTaxLines[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'items' | 'notices' | 'attachments'>('general');

  // ── Fetch data ──

  useEffect(() => {
    fetchDeclarations();
    fetchNotices();
  }, []);

  async function fetchDeclarations() {
    try {
      setLoading(true);
      const res = await apiFetch('/v1/declarations');
      setDeclarations(res.data || []);
    } catch (err) {
      console.error('Failed to fetch declarations', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNotices() {
    try {
      const res = await apiFetch('/v1/declarations/notices/list');
      setNotices(res.data || []);
    } catch (err) {
      console.error('Failed to fetch notices', err);
    }
  }

  async function openDetail(id: string) {
    try {
      const detail = await apiFetch(`/v1/declarations/${id}`);
      setSelectedDecl(detail);
      setView('detail');
      setActiveTab('general');
    } catch (err) {
      console.error('Failed to load declaration', err);
    }
  }

  async function acknowledgeNotice(noticeId: string) {
    try {
      await apiFetch(`/v1/declarations/notices/${noticeId}/acknowledge`, {
        method: 'PATCH',
      });
      fetchNotices();
    } catch (err) {
      console.error('Failed to acknowledge notice', err);
    }
  }

  // ── KPI counts ──

  const totalDeclarations = declarations.length;
  const pendingAssessment = declarations.filter(d => d.status === 'TRANSFERRED' || d.status === 'ACCEPTED').length;
  const assessed = declarations.filter(d => d.status === 'ASSESSED').length;
  const released = declarations.filter(d => d.status === 'RELEASED').length;
  const unackedNotices = notices.filter(n => !n.acknowledged).length;

  return (
    <div className="scroll-area" style={{ padding: '28px 32px' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>📋 Customs Declarations</h1>
          <p style={{ fontSize: '13px', color: 'var(--ink2)' }}>TANESW / TANCIS — Declaration management & notice tracking</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('list')}
          >
            📄 Declarations
          </button>
          <button
            className={`btn btn-sm ${view === 'notices' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('notices')}
            style={{ position: 'relative' }}
          >
            🔔 Notices
            {unackedNotices > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: '#bf3422', color: '#fff',
                fontSize: '10px', fontWeight: 700,
                width: '18px', height: '18px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {unackedNotices}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── KPI Metric Cards ── */}
      <MetricsRow cards={[
        { title: 'Total Declarations', value: String(totalDeclarations), trend: 4.2,  sub1Label: 'PENDING',  sub1Value: String(pendingAssessment), sub2Label: 'ASSESSED', sub2Value: String(assessed),       bars: spark(1,15,'up'),   barColor: 'var(--blue-l)',   barHighlight: 'var(--blue)' },
        { title: 'Released',           value: String(released),          trend: 11.8, sub1Label: 'THIS MONTH', sub1Value: String(Math.round(released*0.8)), sub2Label: 'THIS WEEK', sub2Value: String(Math.round(released*0.2)), bars: spark(2,15,'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)' },
        { title: 'Unread Notices',     value: String(unackedNotices),    trend: -5.3, sub1Label: 'ASSESSED',   sub1Value: String(assessed),   sub2Label: 'TOTAL',    sub2Value: String(totalDeclarations), bars: spark(3,15,'down'), barColor: 'var(--red-l)',    barHighlight: 'var(--red)', invertTrend: true },
      ]} />

      {/* ── View: Declaration List ── */}
      {view === 'list' && (
        <DeclarationList
          declarations={declarations}
          loading={loading}
          onSelect={openDetail}
        />
      )}

      {/* ── View: Notices Dashboard ── */}
      {view === 'notices' && (
        <NoticesDashboard
          notices={notices}
          onAcknowledge={acknowledgeNotice}
          onOpenDeclaration={openDetail}
        />
      )}

      {/* ── View: Declaration Detail ── */}
      {view === 'detail' && selectedDecl && (
        <DeclarationDetail
          declaration={selectedDecl}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBack={() => { setView('list'); setSelectedDecl(null); }}
        />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// Declaration List Component
// ══════════════════════════════════════════════════════════════

const DeclarationList: React.FC<{
  declarations: Declaration[];
  loading: boolean;
  onSelect: (id: string) => void;
}> = ({ declarations, loading, onSelect }) => {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink2)' }}>Loading declarations...</div>;
  }

  if (declarations.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
        <div style={{ fontSize: '42px', marginBottom: '16px' }}>📋</div>
        <h2 style={{ marginBottom: '8px', fontSize: '18px' }}>No Declarations Yet</h2>
        <p style={{ color: 'var(--ink2)', fontSize: '13.5px' }}>
          Create a declaration from a shipment case to start tracking your TANCIS submissions.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="rtbl-wrap">
      <table className="rtbl" style={{ fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e4e2dc' }}>
            {['TANCIS Ref', 'TANSAD No.', 'Importer', 'Status', 'Selectivity', 'CIF Value (TZS)', 'Declared', 'Items'].map(h => (
              <th key={h} style={{
                padding: '12px 14px', textAlign: 'left',
                fontSize: '10.5px', fontWeight: 600, color: 'var(--ink2)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                fontFamily: 'var(--mono)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {declarations.map((d) => {
            const statusStyle = STATUS_COLORS[d.status] || STATUS_COLORS.DRAFT;
            const selBadge = d.selectivity_channel ? SELECTIVITY_BADGE[d.selectivity_channel] : null;
            return (
              <tr
                key={d.id}
                onClick={() => onSelect(d.id)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #e4e2dc', transition: 'background 0.1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--navy)' }}>
                  {d.tancis_ref}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink2)' }}>
                  {d.tansad_number || '—'}
                </td>
                <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                  {d.importer_name}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px', borderRadius: '20px',
                    fontSize: '11px', fontWeight: 600,
                    background: statusStyle.bg, color: statusStyle.color,
                    textTransform: 'uppercase', letterSpacing: '0.03em',
                  }}>
                    {d.status}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {selBadge ? (
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: 600,
                      background: selBadge.bg, color: selBadge.color,
                    }}>
                      {d.selectivity_channel}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: '12.5px' }}>
                  {d.total_customs_value?.toLocaleString() || '0'}
                </td>
                <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--ink2)' }}>
                  {d.declared_at ? new Date(d.declared_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', textAlign: 'center' }}>
                  {d.no_of_items}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// Notices Dashboard Component
// ══════════════════════════════════════════════════════════════

const NoticesDashboard: React.FC<{
  notices: NoticeWithTaxLines[];
  onAcknowledge: (id: string) => void;
  onOpenDeclaration: (id: string) => void;
}> = ({ notices, onAcknowledge, onOpenDeclaration }) => {
  if (notices.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
        <div style={{ fontSize: '42px', marginBottom: '16px' }}>🔔</div>
        <h2 style={{ marginBottom: '8px', fontSize: '18px' }}>No Notices</h2>
        <p style={{ color: 'var(--ink2)', fontSize: '13.5px' }}>
          Declaration notices from TRA (selectivity, assessment, release) will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {notices.map((notice) => {
        const nc = NOTICE_COLORS[notice.notice_type] || NOTICE_COLORS.ASSESSMENT_NOTICE;
        const selBadge = notice.selectivity_channel ? SELECTIVITY_BADGE[notice.selectivity_channel] : null;

        return (
          <div
            key={notice.id}
            className="card"
            style={{
              borderLeft: `4px solid ${nc.color}`,
              opacity: notice.acknowledged ? 0.7 : 1,
              padding: '18px 22px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                {/* Notice header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '18px' }}>{nc.icon}</span>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px',
                    fontSize: '11px', fontWeight: 600,
                    background: nc.bg, color: nc.color,
                    textTransform: 'uppercase', letterSpacing: '0.03em',
                  }}>
                    {notice.notice_type.replace(/_/g, ' ')}
                  </span>
                  {selBadge && (
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: 600,
                      background: selBadge.bg, color: selBadge.color,
                    }}>
                      {selBadge.label}
                    </span>
                  )}
                  {!notice.acknowledged && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      fontSize: '10px', fontWeight: 700,
                      background: '#bf3422', color: '#fff',
                    }}>
                      NEW
                    </span>
                  )}
                </div>

                {/* Notice details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12.5px' }}>
                  <div>
                    <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>Notice No:</span>{' '}
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{notice.notice_number}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>TANCIS Ref:</span>{' '}
                    <span style={{ fontFamily: 'var(--mono)' }}>{notice.tancis_ref}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>Importer TIN:</span>{' '}
                    <span style={{ fontFamily: 'var(--mono)' }}>{notice.importer_tin}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>Notice Date:</span>{' '}
                    <span>{new Date(notice.notice_date).toLocaleString()}</span>
                  </div>
                </div>

                {/* Tax amount for assessment */}
                {notice.total_tax_amount && (
                  <div style={{
                    marginTop: '10px', padding: '8px 14px',
                    background: 'var(--bg)', borderRadius: '6px',
                    fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 600,
                    color: 'var(--navy)',
                  }}>
                    Total Tax: TZS {notice.total_tax_amount.toLocaleString()}
                  </div>
                )}

                {/* Tax line breakdown */}
                {notice.tax_lines && notice.tax_lines.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {['Tax Type', 'HS Code', 'Rate %', 'Base Amount', 'Tax Amount'].map(h => (
                            <th key={h} style={{
                              padding: '6px 10px', textAlign: 'left',
                              fontSize: '9.5px', fontWeight: 600, color: 'var(--ink2)',
                              textTransform: 'uppercase', borderBottom: '1px solid #e4e2dc',
                              fontFamily: 'var(--mono)',
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {notice.tax_lines.map((tl, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f0eee9' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{tl.tax_type.replace(/_/g, ' ')}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>{tl.hs_code || '—'}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>{tl.rate_percent}%</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>
                              {tl.base_amount?.toLocaleString()}
                            </td>
                            <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                              {tl.tax_amount?.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                {!notice.acknowledged && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => { e.stopPropagation(); onAcknowledge(notice.id); }}
                  >
                    ✓ Acknowledge
                  </button>
                )}
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => onOpenDeclaration(notice.declaration_id)}
                >
                  View Declaration
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// Declaration Detail Component
// ══════════════════════════════════════════════════════════════

const DeclarationDetail: React.FC<{
  declaration: Declaration & { items?: any[]; notices?: NoticeWithTaxLines[] };
  activeTab: 'general' | 'items' | 'notices' | 'attachments';
  onTabChange: (tab: 'general' | 'items' | 'notices' | 'attachments') => void;
  onBack: () => void;
}> = ({ declaration, activeTab, onTabChange, onBack }) => {
  const d = declaration;
  const statusStyle = STATUS_COLORS[d.status] || STATUS_COLORS.DRAFT;
  const selBadge = d.selectivity_channel ? SELECTIVITY_BADGE[d.selectivity_channel] : null;

  const tabs: { key: typeof activeTab; label: string; count?: number }[] = [
    { key: 'general', label: 'General' },
    { key: 'items', label: 'Items', count: d.items?.length || 0 },
    { key: 'notices', label: 'Notices', count: d.notices?.length || 0 },
    { key: 'attachments', label: 'Attached Files' },
  ];

  return (
    <div>
      {/* Back button & Header */}
      <div style={{ marginBottom: '20px' }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: '12px' }}>
          ← Back to Declarations
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '20px' }}>📋 Declaration Registration</h1>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--ink2)' }}>
            {d.tancis_ref}
          </span>
          <span style={{
            padding: '3px 10px', borderRadius: '20px',
            fontSize: '11px', fontWeight: 600,
            background: statusStyle.bg, color: statusStyle.color,
            textTransform: 'uppercase',
          }}>
            {d.status}
          </span>
          {selBadge && (
            <span style={{
              padding: '3px 10px', borderRadius: '20px',
              fontSize: '11px', fontWeight: 600,
              background: selBadge.bg, color: selBadge.color,
            }}>
              {selBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '20px',
        borderBottom: '2px solid #e4e2dc', paddingBottom: '0',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              padding: '10px 18px',
              fontSize: '13px', fontWeight: activeTab === tab.key ? 600 : 500,
              color: activeTab === tab.key ? '#0b7264' : '#7a8190',
              background: activeTab === tab.key ? 'var(--teal-l)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #0b7264' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: '6px',
              marginBottom: '-2px',
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '10px',
                padding: '1px 6px', borderRadius: '4px',
                background: activeTab === tab.key ? 'rgba(11,114,100,0.15)' : 'rgba(0,0,0,0.06)',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && <GeneralTab declaration={d} />}
      {activeTab === 'items' && <ItemsTab items={d.items || []} />}
      {activeTab === 'notices' && <NoticesTab notices={d.notices || []} />}
      {activeTab === 'attachments' && <AttachmentsTab />}
    </div>
  );
};

// ── General Tab ──────────────────────────────────────────────

const FieldRow: React.FC<{ label: string; value?: string | number | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #f0eee9', fontSize: '13px' }}>
    <span style={{ width: '200px', color: 'var(--ink2)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
    <span style={{ fontFamily: mono ? 'var(--mono)' : 'inherit', fontWeight: 500, color: 'var(--ink)' }}>
      {value ?? '—'}
    </span>
  </div>
);

const SectionHeader: React.FC<{ title: string; color?: string }> = ({ title, color = '#0b7264' }) => (
  <div style={{
    padding: '8px 14px', marginTop: '20px', marginBottom: '4px',
    background: color === '#0b7264' ? '#e3f4f1' : '#eef3ff',
    borderRadius: '6px',
    fontSize: '12px', fontWeight: 700, color,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }}>
    {title}
  </div>
);

const GeneralTab: React.FC<{ declaration: Declaration }> = ({ declaration: d }) => (
  <div className="card" style={{ padding: '24px' }}>
    {/* Header */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
      <FieldRow label="Reference No." value={d.tancis_ref} mono />
      <FieldRow label="Mode of Declaration" value={d.declaration_mode} />
      <FieldRow label="Clearing Office" value={d.clearing_office} />
    </div>

    <SectionHeader title="General" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
      <FieldRow label="Type of TANSAD Form" value={d.tansad_form_type === 'G' ? '(G) General' : d.tansad_form_type} />
      <FieldRow label="CL Plan" value={d.cl_plan} />
      <FieldRow label="No. of Items" value={d.no_of_items} mono />
      <FieldRow label="Total Package Number" value={d.total_packages} mono />
      <FieldRow label="Gross Weight (kg)" value={d.gross_weight_kg} mono />
      <FieldRow label="Net Weight (kg)" value={d.net_weight_kg} mono />
      <FieldRow label="UCR No." value={d.ucr_number} mono />
    </div>

    <SectionHeader title="Trade Operators" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
      <FieldRow label="Consignment Country" value={d.consignment_country} />
      <FieldRow label="Country of Export" value={d.country_of_export} />
      <FieldRow label="Country of Destination" value={d.country_of_destination} />
      <FieldRow label="Exporter TIN" value={d.exporter_tin} mono />
      <FieldRow label="Exporter Name" value={d.exporter_name} />
      <FieldRow label="Importer TIN" value={d.importer_tin} mono />
      <FieldRow label="Importer Name" value={d.importer_name} />
      <FieldRow label="Declarant TIN" value={d.declarant_tin} mono />
      <FieldRow label="Declarant Name" value={d.declarant_name} />
      <FieldRow label="Declarant Address" value={d.declarant_address} />
    </div>

    <SectionHeader title="Financial" color="#1849a9" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
      <FieldRow label="Delivery Term" value={d.delivery_term} />
      <FieldRow label="Invoice No." value={d.invoice_number} mono />
      <FieldRow label="Total Invoice Value" value={`${d.total_invoice_value?.toLocaleString()} ${d.invoice_currency}`} mono />
      <FieldRow label="Exchange Rate" value={`1 ${d.invoice_currency} : ${d.exchange_rate?.toLocaleString()} TZS`} mono />
      <FieldRow label="Payment Method" value={d.payment_method} />
      <FieldRow label="Payment Bank" value={d.payment_bank} />
    </div>

    <SectionHeader title="Valuation Note" color="#1849a9" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
      <FieldRow label="Freight Amount" value={`${d.freight_amount?.toLocaleString()} ${d.freight_currency}`} mono />
      <FieldRow label="Insurance Amount" value={`${d.insurance_amount?.toLocaleString()} ${d.insurance_currency}`} mono />
      <FieldRow label="Other Charges" value={`${d.other_charges?.toLocaleString()}`} mono />
      <FieldRow label="Deductions" value={`${d.deductions?.toLocaleString()}`} mono />
      <FieldRow label="Total Customs Value (CIF)" value={`TZS ${d.total_customs_value?.toLocaleString()}`} mono />
      <FieldRow label="Self Assessment" value={d.self_assessment ? 'Y' : 'N'} />
    </div>

    <SectionHeader title="Transportation" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
      <FieldRow label="Transport Mode" value={d.transport_mode} />
      <FieldRow label="Vessel Name" value={d.vessel_name} />
      <FieldRow label="B/L No." value={d.bl_number} mono />
      <FieldRow label="CRN" value={d.crn} mono />
      <FieldRow label="Arrival Date" value={d.arrival_date ? new Date(d.arrival_date).toLocaleDateString() : null} />
      <FieldRow label="Discharge Place" value={d.discharge_place} />
      <FieldRow label="Entry Office" value={d.entry_office} />
      <FieldRow label="Location of Goods" value={d.location_of_goods} />
      <FieldRow label="Total Container Count" value={d.total_container_count} mono />
      <FieldRow label="Warehouse" value={d.warehouse} />
    </div>
  </div>
);

// ── Items Tab ────────────────────────────────────────────────

const ItemsTab: React.FC<{ items: any[] }> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
        <p style={{ color: 'var(--ink2)' }}>No items added to this declaration yet.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="rtbl-wrap">
      <table className="rtbl" style={{ fontSize: '12.5px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e4e2dc' }}>
            {['Item', 'HS Code', 'Country', 'CPC', 'Brand', 'Qty', 'Customs Value', 'Stat Value'].map(h => (
              <th key={h} style={{
                padding: '10px 14px', textAlign: 'left',
                fontSize: '10px', fontWeight: 600, color: 'var(--ink2)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                fontFamily: 'var(--mono)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f0eee9' }}>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                {item.item_number}
              </td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>
                {item.hs_code}
              </td>
              <td style={{ padding: '10px 14px' }}>{item.country_of_origin}</td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)' }}>{item.cpc_code}</td>
              <td style={{ padding: '10px 14px' }}>{item.brand_name || '—'}</td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)' }}>
                {item.quantity} {item.unit_of_measure}
              </td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                {item.customs_value?.toLocaleString()}
              </td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)' }}>
                {item.statistical_value?.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

// ── Notices Tab ──────────────────────────────────────────────

const NoticesTab: React.FC<{ notices: NoticeWithTaxLines[] }> = ({ notices }) => {
  if (notices.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
        <p style={{ color: 'var(--ink2)' }}>No notices received for this declaration.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {notices.map((notice) => {
        const nc = NOTICE_COLORS[notice.notice_type] || NOTICE_COLORS.ASSESSMENT_NOTICE;
        return (
          <div key={notice.id} className="card" style={{ borderLeft: `4px solid ${nc.color}`, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '16px' }}>{nc.icon}</span>
              <span style={{
                padding: '3px 10px', borderRadius: '20px',
                fontSize: '11px', fontWeight: 600,
                background: nc.bg, color: nc.color,
                textTransform: 'uppercase',
              }}>
                {notice.notice_type.replace(/_/g, ' ')}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink2)' }}>
                {notice.notice_number}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ink2)', marginLeft: 'auto' }}>
                {new Date(notice.notice_date).toLocaleString()}
              </span>
            </div>
            {notice.total_tax_amount && (
              <div style={{
                padding: '6px 12px', background: 'var(--bg)', borderRadius: '6px',
                fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 600,
              }}>
                Total Tax: TZS {notice.total_tax_amount.toLocaleString()}
              </div>
            )}
            {notice.tax_lines && notice.tax_lines.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '8px' }}>
                <tbody>
                  {notice.tax_lines.map((tl, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0eee9' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 500, width: '140px' }}>{tl.tax_type.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)' }}>{tl.rate_percent}%</td>
                      <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)', fontWeight: 600, textAlign: 'right' }}>
                        TZS {tl.tax_amount?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Attachments Tab ──────────────────────────────────────────

const AttachmentsTab: React.FC = () => (
  <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📎</div>
    <p style={{ color: 'var(--ink2)' }}>Document attachment management coming soon.</p>
    <p style={{ color: 'var(--ink2)', fontSize: '12px', marginTop: '4px' }}>
      Upload Bill of Lading, Invoices, Permits, and Certificates here.
    </p>
  </div>
);
