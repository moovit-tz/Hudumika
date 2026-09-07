import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Icon } from '../../components/Icon.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { apiFetch } from '../../lib/api.js';

/** Real customer directory — this used to be 3 hand-invented records with
 *  fake lifetime values and fake account managers. Every field here now
 *  comes from the real `customers` table (migration 134's real profile
 *  fields: account_status, client_type, country, website — collected by
 *  the Customers app's edit form for a while) plus two real aggregates:
 *  ticket counts from support_tickets and lifetime value summed from
 *  FinOps' actual sales_invoice_lines (support.routes.ts GET /customers). */
interface CustomerRecord {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  phone_wa: string | null;
  country: string | null;
  city: string | null;
  client_type: string | null;
  account_status: string;
  website: string | null;
  created_at: string;
  assigned_officer_name: string | null;
  total_conversations: number;
  open_tickets: number;
  lifetime_value: number;
}

interface TicketSummary {
  id: string; ref: string; subject: string; status: string; priority: string;
  updated_at?: string; created_at: string; assigned_to?: string;
}

interface ShipmentSummary {
  id: string; ref_number: string; goods_desc?: string; stage: string; type?: string; updated_at?: string;
}

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const STATUS_CFG: Record<string, { variant: 'success' | 'gray' | 'warning' }> = {
  Active: { variant: 'success' }, Inactive: { variant: 'gray' }, Suspended: { variant: 'warning' },
};

export const BlissCustomerCRM: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tickets' | 'shipments'>('overview');
  const [search, setSearch] = useState('');
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const isMobile = useMediaQuery('(max-width: 900px)');

  const load = useCallback(() => {
    setLoading(true);
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    apiFetch(`/v1/support/customers${qs}`)
      .then((rows: any) => {
        const list = Array.isArray(rows) ? rows : [];
        setCustomers(list);
        setSelectedId(prev => (prev && list.some((c: CustomerRecord) => c.id === prev)) ? prev : (list[0]?.id ?? null));
      })
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const selectedCust = customers.find(c => c.id === selectedId) || null;

  useEffect(() => {
    if (!selectedCust) { setTickets([]); setShipments([]); return; }
    setTicketsLoading(true);
    apiFetch(`/v1/support/tickets?customer_id=${selectedCust.id}`)
      .then((r: any) => setTickets(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false));
    setShipmentsLoading(true);
    apiFetch(`/v1/shipments?customer_id=${selectedCust.id}&limit=50`)
      .then((r: any) => setShipments(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setShipments([]))
      .finally(() => setShipmentsLoading(false));
  }, [selectedCust?.id]);

  return (
    <div className="crm-root" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      <PageHeader
        crumbs={['Bliss', 'CRM']}
        titlePlain="Customer"
        titleEm="Profiles"
        subtitle="Contact records, conversation history and shipments — pulled from the real customer, ticket and shipment tables, not a separate copy."
        actions={
          <Link to="/customers" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm"><Icon name="externalLink" size={13} /> Full Customers app</Button>
          </Link>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: 20 }}>
        <SectionCard padded={false} title="Customer Directory">
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <input className="input-field" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}
            {!loading && customers.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No customers found.</div>
            )}
            {customers.map(c => (
              <div key={c.id} onClick={() => { setSelectedId(c.id); setActiveTab('overview'); }}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--border)',
                  background: selectedId === c.id ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer',
                  borderLeft: selectedId === c.id ? '3px solid var(--teal)' : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PersonAvatar userId={c.id} kind="customers" name={c.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.contact_name || c.email || '—'}
                    </div>
                  </div>
                  {c.open_tickets > 0 && <Badge variant="error">{c.open_tickets}</Badge>}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!selectedCust ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)', fontSize: 13, background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              {loading ? 'Loading…' : 'Select a customer to view their profile.'}
            </div>
          ) : (
            <>
              <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--elev)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <PersonAvatar userId={selectedCust.id} kind="customers" name={selectedCust.name} size={54} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{selectedCust.name}</h2>
                        <Badge variant={STATUS_CFG[selectedCust.account_status]?.variant ?? 'gray'}>{selectedCust.account_status}</Badge>
                        {selectedCust.client_type && <Badge variant="gray">{selectedCust.client_type}</Badge>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
                        {[selectedCust.city, selectedCust.country].filter(Boolean).join(', ') || '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedCust.email && (
                      <a href={`mailto:${selectedCust.email}`} style={{ textDecoration: 'none' }}>
                        <Button variant="outline" size="sm"><Icon name="mail" size={13} /> Email</Button>
                      </a>
                    )}
                    {selectedCust.phone_wa && (
                      <a href={`https://wa.me/${selectedCust.phone_wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <Button variant="outline" size="sm"><Icon name="chatBubble" size={13} /> WhatsApp</Button>
                      </a>
                    )}
                    <Link to={`/bliss/inbox?customer_id=${selectedCust.id}`} style={{ textDecoration: 'none' }}>
                      <Button variant="default" size="sm"><Icon name="plus" size={13} /> New Ticket</Button>
                    </Link>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, background: 'var(--bg)', padding: 12, borderRadius: 'var(--r)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Lifetime Value</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{money(selectedCust.lifetime_value)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Total Conversations</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{selectedCust.total_conversations}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Open Tickets</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: selectedCust.open_tickets > 0 ? 'var(--red)' : 'var(--green)' }}>{selectedCust.open_tickets}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Account Manager</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{selectedCust.assigned_officer_name || <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>Unassigned</span>}</div>
                  </div>
                </div>
              </div>

              <SectionCard padded={false}>
                <div style={{ borderBottom: '1px solid var(--border)', padding: '0 16px', overflowX: 'auto' }}>
                  <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
                    <TabsList style={{ background: 'transparent' }}>
                      <TabsTrigger value="overview">Overview &amp; Info</TabsTrigger>
                      <TabsTrigger value="tickets">Support Tickets{tickets.length > 0 ? ` (${tickets.length})` : ''}</TabsTrigger>
                      <TabsTrigger value="shipments">Cargo &amp; Shipments{shipments.length > 0 ? ` (${shipments.length})` : ''}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div style={{ padding: 20 }}>
                  {activeTab === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Contact Details</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                          <div><strong style={{ color: 'var(--ink3)' }}>Contact person:</strong> {selectedCust.contact_name || '—'}</div>
                          <div><strong style={{ color: 'var(--ink3)' }}>Email:</strong> {selectedCust.email || '—'}</div>
                          <div><strong style={{ color: 'var(--ink3)' }}>Phone:</strong> {selectedCust.phone || '—'}</div>
                          <div><strong style={{ color: 'var(--ink3)' }}>WhatsApp:</strong> {selectedCust.phone_wa || '—'}</div>
                          <div><strong style={{ color: 'var(--ink3)' }}>Location:</strong> {[selectedCust.city, selectedCust.country].filter(Boolean).join(', ') || '—'}</div>
                          {selectedCust.website && <div><strong style={{ color: 'var(--ink3)' }}>Website:</strong> <a href={selectedCust.website} target="_blank" rel="noreferrer">{selectedCust.website}</a></div>}
                          <div><strong style={{ color: 'var(--ink3)' }}>Customer since:</strong> {new Date(selectedCust.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Recent Tickets</h4>
                        {ticketsLoading ? (
                          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading…</div>
                        ) : tickets.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No conversations yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                            {tickets.slice(0, 4).map(t => (
                              <div key={t.id} style={{ borderLeft: '2px solid var(--teal)', paddingLeft: 10 }}>
                                <div style={{ fontWeight: 700 }}>{t.subject}</div>
                                <div style={{ color: 'var(--ink3)' }}>#{t.ref} · {t.status} · {new Date(t.updated_at || t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'tickets' && (
                    ticketsLoading ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink3)', fontSize: 13 }}>Loading…</div> :
                    tickets.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink3)', fontSize: 13 }}>No tickets for this customer.</div> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {tickets.map(t => (
                          <Link key={t.id} to={`/bliss/inbox?id=${t.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{t.subject}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>#{t.ref}</div>
                            </div>
                            <Badge variant={t.status === 'OPEN' ? 'error' : t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'success' : 'warning'}>{t.status}</Badge>
                          </Link>
                        ))}
                      </div>
                    )
                  )}

                  {activeTab === 'shipments' && (
                    shipmentsLoading ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink3)', fontSize: 13 }}>Loading…</div> :
                    shipments.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink3)', fontSize: 13 }}>No shipments for this customer.</div> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {shipments.map(s => (
                          <Link key={s.id} to={`/shipments?search=${s.ref_number}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{s.ref_number}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{s.goods_desc || '—'}</div>
                            </div>
                            <Badge variant="gray">{s.stage}</Badge>
                          </Link>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
