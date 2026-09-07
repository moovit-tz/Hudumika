import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { Switch } from './ui/switch.js';
import { PersonAvatar } from './PersonAvatar.js';
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
  aiSuggestion?: string;
}

type Tab = 'profile' | 'invoices' | 'shipments' | 'ai';

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
  context, ticketId, onUseAiReply, onClose, onUpdateCustomer, hideHeader,
}: {
  context?: CustomerContext;
  ticketId?: string;
  onUseAiReply?: (text: string) => void;
  onClose?: () => void;
  onUpdateCustomer?: (updated: Partial<CustomerContext>) => void;
  hideHeader?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string>('');
  const [aiIsMock, setAiIsMock] = useState(true);

  // CRM Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [lifecycleStage, setLifecycleStage] = useState('Customer');
  const [teamRouter, setTeamRouter] = useState('Customer Success & Support');
  const [aiCopilotActive, setAiCopilotActive] = useState(true);
  const [tags, setTags] = useState<string[]>(['Shopify Merchant', 'Automated Cart Recovery', 'QR-Connected']);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingProps, setSavingProps] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setTab('profile');
    setAiSuggestion('');
    if (context) {
      const parts = (context.customer_name || '').split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setEmail(context.customer_email || '');
      setPhone(context.customer_phone || context.customer_wa || '');
    }
  }, [context?.customer_id]);

  const handleSaveProperties = async () => {
    setSavingProps(true);
    const fullName = `${firstName} ${lastName}`.trim() || context?.customer_name || 'Customer';
    try {
      if (context?.customer_id) {
        await apiFetch(`/v1/customers/${context.customer_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: fullName,
            email,
            phone,
          }),
        }).catch(() => null);
      }
      if (onUpdateCustomer) {
        onUpdateCustomer({
          customer_name: fullName,
          customer_email: email,
          customer_phone: phone,
        });
      }
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch {}
    setSavingProps(false);
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const tag = newTagInput.trim();
      if (!tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

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

  const { customer_id, customer_name, customer_email, customer_phone, customer_wa, customer_company,
    customer_country, kyc_status, invoices = [], shipments = [] } = context;

  return (
    <div className="c360-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font)', background: 'var(--white)', borderLeft: '1px solid var(--border)', overflowY: 'auto' }}>
      
      {/* ── Top Bar Header ── */}
      {!hideHeader && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="user" size={16} color="var(--teal)" strokeWidth={2} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Contact Profile Details</span>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} title="Close details">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      )}

      {/* ── Big Contact Header Profile Card ── */}
      <div style={{ padding: '20px 18px', textAlign: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        {/* The hardcoded green "Online" dot this used to draw was never real
            — a customer has no login session to be online in, so PersonAvatar
            correctly shows none at all (kind='customers') rather than a lie. */}
        <div style={{ width: 64, height: 64, margin: '0 auto 12px' }}>
          <PersonAvatar userId={customer_id} kind="customers" name={customer_name || 'Customer'} size={64} />
        </div>

        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>{customer_name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', fontWeight: 500, marginBottom: 8 }}>{customer_phone || customer_wa || customer_email || '—'}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ background: 'var(--green-l)', color: 'var(--green)', fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.04em', textTransform: 'uppercase', border: '1px solid var(--green)' }}>
            CUSTOMER
          </span>
          {kyc_status && (
            <Badge variant={kyc_status === 'VERIFIED' ? 'success' : 'warning'}>
              KYC {kyc_status}
            </Badge>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--r)',
              border: '1px solid var(--border)', background: isMuted ? 'var(--red-l)' : 'var(--white)',
              color: isMuted ? 'var(--red)' : 'var(--ink2)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.15s'
            }}>
            <Icon name="bell" size={13} />
            {isMuted ? 'Muted' : 'Mute Contact'}
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(customer_phone || customer_email || '')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
              borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)',
              color: 'var(--ink2)', cursor: 'pointer'
            }}
            title="Copy Contact Info">
            <Icon name="copy" size={13} />
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs (Profile, Invoices, Shipments, AI) ── */}
      <div className="c360-tabs">
        {([
          { id: 'profile', label: 'CRM Details', icon: 'user' },
          { id: 'invoices', label: 'Invoices', icon: 'invoice' },
          { id: 'shipments', label: 'Shipments', icon: 'ship' },
          { id: 'ai', label: 'AI Copilot', icon: 'sparkle' },
        ] as { id: Tab; label: string; icon: IconName }[]).map(t => (
          <TabBtn key={t.id} id={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {tab === 'profile' && (
          <>
            {/* 1. AI Assistant Control */}
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="sparkle" size={14} color="var(--teal)" />
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Assistant Control</span>
                </div>
                <Switch checked={aiCopilotActive} onCheckedChange={c => setAiCopilotActive(c === true)} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                {aiCopilotActive ? 'AI Copilot Chat auto-suggests replies & drafts.' : 'Auto-reply disabled for this contact.'}
              </div>
            </div>

            {/* 2. Assigned Team Router */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Assigned Team Router
              </label>
              <select
                value={teamRouter}
                onChange={e => setTeamRouter(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
                  background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, outline: 'none'
                }}>
                <option value="Customer Success & Support">Customer Success & Support</option>
                <option value="Technical Operations">Technical Operations</option>
                <option value="Billing & Financials">Billing & Financials</option>
                <option value="Logistics & Customs">Logistics & Customs</option>
              </select>
            </div>

            {/* 3. CRM Information Form */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Icon name="fileText" size={14} color="var(--ink3)" />
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CRM Information</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>First Name</label>
                    <input className="input-field" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Last Name</label>
                    <input className="input-field" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Email Address</label>
                  <input className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Phone Number</label>
                  <input className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255..." />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Lifecycle Stage</label>
                  <select
                    value={lifecycleStage}
                    onChange={e => setLifecycleStage(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
                      background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, outline: 'none'
                    }}>
                    <option value="Customer">Customer</option>
                    <option value="Lead">Lead</option>
                    <option value="Prospect">Prospect</option>
                    <option value="VIP">VIP Enterprise</option>
                    <option value="Subscriber">Subscriber</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveProperties}
                  disabled={savingProps}
                  style={{
                    marginTop: 6, padding: '9px 16px', background: 'var(--ink)', color: 'var(--white)',
                    border: 'none', borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s'
                  }}>
                  {savingProps ? 'Saving…' : savedToast ? '✓ Properties Saved!' : '✓ Save Properties'}
                </button>
              </div>
            </div>

            {/* 4. Contact Tags */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Contact Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {tags.map(tag => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                    borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)'
                  }}>
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'flex', alignItems: 'center' }}>
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                className="input-field"
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="+ Type tag name and hit Enter…"
                style={{ fontSize: 11.5 }}
              />
            </div>

            {/* 5. E-Commerce Store Context */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, background: 'var(--bg)', padding: 12, borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  E-Commerce Store Context
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'var(--green-l)', padding: '2px 6px', borderRadius: 10, border: '1px solid var(--green)' }}>
                  ● Connected
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                No active cart or orders found for this contact.
              </div>
            </div>

            {/* 6. Channel Details Footer */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong style={{ color: 'var(--ink2)' }}>Channel:</strong> WhatsApp Multi-Device QR ({customer_wa || customer_phone || '+1555-0144'})</div>
                <div><strong style={{ color: 'var(--ink2)' }}>Chat ID:</strong> {customer_phone || customer_wa || 'Chat-10928'}</div>
              </div>
              <a
                href={`https://wa.me/${(customer_wa || customer_phone || '').replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '9px 12px', background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 'var(--r)',
                  color: 'var(--green)', fontSize: 12, fontWeight: 800, textDecoration: 'none'
                }}>
                <Icon name="chatBubble" size={14} /> Live Demo & Support (+9195097 38426)
              </a>
            </div>
          </>
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

                <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, marginBottom: 12, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 10, right: 12, opacity: 0.4 }}><Icon name="sparkle" size={20} /></div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink)', paddingRight: 24 }}>{aiSuggestion}</div>
                </div>

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
      </div>
    </div>
  );
}
