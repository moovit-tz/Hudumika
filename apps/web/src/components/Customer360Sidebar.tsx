import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import type { IconName } from './Icon.js';
import './Customer360Sidebar.css';

interface Asset {
  id: string;
  asset_type: 'BANK_ACCOUNT' | 'CREDIT_CARD' | 'INSURANCE_POLICY' | 'LOAN';
  asset_ref: string;
  status: string;
  metadata?: any;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  bill_date: string;
  due_date: string;
}

interface Shipment {
  id: string;
  ref_number: string;
  goods_desc?: string;
  stage: string;
  bl_number?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  updated_at: string;
}

export interface CustomerContext {
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_wa?: string;
  customer_company?: string;
  customer_country?: string;
  kyc_status?: string;
  assets?: Asset[];
  invoices?: Invoice[];
  shipments?: Shipment[];
  // Filled when AI suggestion is fetched
  aiSuggestion?: string;
}

type Tab = 'profile' | 'invoices' | 'shipments' | 'ai' | 'timeline';

function TabBtn({ id, label, icon, active, onClick }: { id: Tab; label: string; icon: IconName; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="c360-tab"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      title={label}
    >
      <Icon name={icon} size={15} strokeWidth={1.75} />
      <span className="c360-tab-label">{label}</span>
    </button>
  );
}

const STAGE_COLORS: Record<string, string> = {
  BOOKING: '#6366f1', DOCS_RECEIVED: '#3b82f6', CUSTOMS: '#f59e0b',
  INSPECTION: '#ef4444', CLEARED: '#10b981', DELIVERED: '#10b981', CLOSED: '#94a3b8',
};

const INV_STATUS_COLORS: Record<string, string> = {
  Paid: '#10b981', Pending: '#3b82f6', Overdue: '#ef4444', Partial: '#f59e0b', Draft: '#94a3b8',
};

export function Customer360Sidebar({
  context, ticketId, onUseAiReply,
}: {
  context?: CustomerContext;
  ticketId?: string;
  onUseAiReply?: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string>('');
  const [aiIsMock, setAiIsMock] = useState(true);

  useEffect(() => {
    setTab('profile');
    setAiSuggestion('');
  }, [context?.customer_id]);

  const fetchAI = async () => {
    if (!ticketId) return;
    setAiLoading(true);
    try {
      const res: any = await apiFetch(`/v1/support/tickets/${ticketId}/ai-suggest`, { method: 'POST' });
      setAiSuggestion(res.suggestion || '');
      setAiIsMock(res.is_mock !== false);
    } catch (err: any) {
      setAiSuggestion(err?.message || 'Unable to generate AI suggestion at this time.');
      setAiIsMock(true);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'ai' && !aiSuggestion && ticketId) {
      fetchAI();
    }
  }, [tab, ticketId]);

  if (!context) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)', gap: 12 }}>
        <Icon name="user" size={40} strokeWidth={1.25} />
        <p style={{ fontSize: 13, textAlign: 'center', padding: '0 20px', lineHeight: 1.5 }}>
          Select a conversation to view customer intelligence
        </p>
      </div>
    );
  }

  const { customer_name, customer_email, customer_phone, customer_wa, customer_company,
    customer_country, kyc_status, assets = [], invoices = [], shipments = [] } = context;

  const totalDue = invoices.filter(i => i.status === 'Overdue' || i.status === 'Pending')
    .reduce((sum, i) => sum + Number(i.total_amount || 0), 0);

  return (
    <div className="c360-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font)', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 18px 12px', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), #6366f1)', color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {customer_name?.charAt(0)?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer_name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer_company || customer_country || 'Individual Client'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {kyc_status && (
            <Badge variant={kyc_status === 'VERIFIED' ? 'success' : 'warning'}>
              <Icon name={kyc_status === 'VERIFIED' ? 'checkCircle' : 'alertTriangle'} size={11} /> KYC {kyc_status}
            </Badge>
          )}
          {totalDue > 0 && (
            <Badge variant="error">
              ${(totalDue / 1000).toFixed(0)}K Due
            </Badge>
          )}
          {shipments.some(s => s.stage !== 'CLOSED' && s.stage !== 'DELIVERED') && (
            <Badge variant="info">
              <Icon name="ship" size={11} /> Active Shipment
            </Badge>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="c360-tabs">
        {([
          { id: 'profile', label: 'Profile', icon: 'user' },
          { id: 'invoices', label: 'Invoices', icon: 'invoice' },
          { id: 'shipments', label: 'Shipments', icon: 'ship' },
          { id: 'ai', label: 'AI', icon: 'sparkle' },
          { id: 'timeline', label: 'Timeline', icon: 'clock' },
        ] as { id: Tab; label: string; icon: IconName }[]).map(t => (
          <TabBtn key={t.id} id={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Contact */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contact</div>
              {customer_email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name="mail" size={14} color="var(--ink3)" />
                  <a href={`mailto:${customer_email}`} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer_email}</a>
                </div>
              )}
              {(customer_wa || customer_phone) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="smartphone" size={14} color="var(--ink3)" />
                  <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{customer_wa || customer_phone}</span>
                  <a href={`https://wa.me/${(customer_wa || customer_phone || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#25d366', background: 'var(--green-l)', padding: '2px 7px', borderRadius: 8, textDecoration: 'none' }}>
                    WhatsApp ↗
                  </a>
                </div>
              )}
            </div>

            {/* Assets */}
            {assets.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Financial Assets <span style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 6, padding: '1px 6px', fontSize: 9 }}>{assets.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {assets.map((a, i) => {
                    const iconMap: Record<string, IconName> = { BANK_ACCOUNT: 'bankNote', CREDIT_CARD: 'creditCard', INSURANCE_POLICY: 'shield', LOAN: 'briefcase' };
                    const colorMap: Record<string, string> = { BANK_ACCOUNT: '#3b82f6', CREDIT_CARD: '#10b981', INSURANCE_POLICY: '#8b5cf6', LOAN: '#f59e0b' };
                    return (
                      <div key={a.id || i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Icon name={iconMap[a.asset_type] || 'package'} size={14} color={colorMap[a.asset_type]} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: colorMap[a.asset_type] }}>{a.asset_type.replace('_', ' ')}</span>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: a.status === 'ACTIVE' ? '#10b981' : 'var(--ink3)', background: a.status === 'ACTIVE' ? '#ecfdf5' : 'var(--bg)', padding: '2px 6px', borderRadius: 6 }}>{a.status}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink2)', fontFamily: 'monospace', marginBottom: a.metadata?.balance != null ? 4 : 0 }}>{a.asset_ref}</div>
                        {a.metadata?.balance != null && (
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>
                            {a.metadata?.currency || 'TZS'} {Number(a.metadata.balance).toLocaleString()}
                          </div>
                        )}
                        {a.metadata?.expires_at && (
                          <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>⏱ Expires: {new Date(a.metadata.expires_at).toLocaleDateString()}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── INVOICES TAB ── */}
        {tab === 'invoices' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1 }}>Recent Invoices</div>
              <Link to="/finance/billing" style={{ fontSize: 10, color: 'var(--teal)', textDecoration: 'none', fontWeight: 700 }}>View all ↗</Link>
            </div>
            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink3)', fontSize: 12 }}>No invoices found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invoices.map((inv) => (
                  <div key={inv.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{inv.invoice_number}</div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: INV_STATUS_COLORS[inv.status] || '#64748b', background: `${INV_STATUS_COLORS[inv.status]}20`, padding: '2px 7px', borderRadius: 8 }}>{inv.status}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: inv.status === 'Overdue' ? '#ef4444' : 'var(--teal)', marginBottom: 2 }}>
                      TZS {Number(inv.total_amount || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SHIPMENTS TAB ── */}
        {tab === 'shipments' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1 }}>Active Shipments</div>
              <Link to="/shipments" style={{ fontSize: 10, color: 'var(--teal)', textDecoration: 'none', fontWeight: 700 }}>View all ↗</Link>
            </div>
            {shipments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink3)', fontSize: 12 }}>No shipments found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shipments.map((s) => (
                  <Link key={s.id} to={`/shipments/${s.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{s.ref_number}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: STAGE_COLORS[s.stage] || '#64748b', background: `${STAGE_COLORS[s.stage]}20`, padding: '2px 7px', borderRadius: 8 }}>{s.stage}</span>
                      </div>
                      {s.goods_desc && <div style={{ fontSize: 11, color: 'var(--ink2)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goods_desc}</div>}
                      {(s.port_of_loading || s.port_of_discharge) && (
                        <div style={{ fontSize: 10, color: 'var(--ink3)' }}>
                          {s.port_of_loading} → {s.port_of_discharge}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AI TAB ── */}
        {tab === 'ai' && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>AI Smart Reply</div>
            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><Icon name="sparkle" size={24} color="var(--teal)" /></div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Generating suggestion…</div>
              </div>
            ) : aiSuggestion ? (
              <div>
                {/* Real-AI vs template disclosure — a human deciding whether
                    to trust this before clicking "Use This Reply" needs to
                    know which one they're looking at. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {aiIsMock ? (
                    <Badge variant="warning">
                      <Icon name="alertTriangle" size={11} />
                      Template reply — AI not configured
                    </Badge>
                  ) : (
                    <Badge variant="success">
                      <Icon name="sparkle" size={11} />
                      AI-drafted reply
                    </Badge>
                  )}
                </div>

                {/* Suggestion card */}
                <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #ecfdf5)', border: '1px solid #86efac', borderRadius: 10, padding: 14, marginBottom: 12, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 10, right: 12, opacity: 0.4 }}><Icon name="sparkle" size={20} /></div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--navy)', paddingRight: 24 }}>{aiSuggestion}</div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {onUseAiReply && (
                    <button
                      type="button"
                      onClick={() => onUseAiReply(aiSuggestion)}
                      style={{ flex: 1, padding: 'var(--ds-btn-py) 12px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      ✓ Use This Reply
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchAI}
                    style={{ padding: 'var(--ds-btn-py) 12px', background: 'var(--white)', color: 'var(--ink2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    ↺ Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><Icon name="sparkle" size={36} color="var(--teal)" strokeWidth={1.25} /></div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>Generate an AI-powered reply suggestion based on this conversation</div>
                <button type="button" onClick={fetchAI}
                  style={{ padding: 'var(--ds-btn-py) 20px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  Generate Suggestion
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {tab === 'timeline' && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Activity Timeline</div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              {([
                { icon: 'tag', label: 'Ticket opened', time: 'Today, 11:31', color: '#6366f1' },
                { icon: 'mail', label: 'Message sent by customer', time: 'Today, 11:31', color: '#3b82f6' },
                { icon: 'user', label: 'Agent replied', time: 'Today, 12:01', color: '#10b981' },
                { icon: 'ship', label: 'Linked shipment CLR-2026-0001 updated', time: 'Yesterday', color: 'var(--gold)' },
                { icon: 'fileText', label: 'Invoice INV-2026-0008 sent', time: '3 days ago', color: 'var(--red)' },
              ] as { icon: IconName; label: string; time: string; color: string }[]).map((e, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: 16, paddingLeft: 16 }}>
                  <div style={{ position: 'absolute', left: -6, top: 2, width: 12, height: 12, borderRadius: '50%', background: e.color, border: '2px solid var(--white)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                    <Icon name={e.icon} size={12} color={e.color} /> {e.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>{e.time}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
