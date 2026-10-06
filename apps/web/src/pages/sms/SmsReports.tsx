import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsFilterMenu, SmsListPagination, SmsListToolbar, useSmsList } from './SmsListControls.js';

interface SmsMessage {
  id: string;
  to_number: string;
  body: string;
  status: string;
  provider: string | null;
  error: string | null;
  source_app: string;
  contact_name: string | null;
  segments: number;
  created_at: string;
  delivered_at?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'queued', label: 'Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'undelivered', label: 'Undelivered' },
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  sent: 'success',
  delivered: 'success',
  queued: 'warning',
  failed: 'error',
  undelivered: 'error',
};

export function SmsReports() {
  const deepLinkedMessageRef = useRef<string | null>(new URLSearchParams(window.location.search).get('message'));
  usePageSEO('SMS Delivery Reports & Logs', 'Audit outbound SMS dispatches, carrier delivery reports (DLR), error codes, and latency.');
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SmsMessage | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const list = useSmsList(messages);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '200' });
    if (search.trim()) qs.set('search', search.trim());
    if (status) qs.set('status', status);
    apiFetch(`/v1/sms/messages?${qs.toString()}`)
      .then(res => setMessages(res.data || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const id = deepLinkedMessageRef.current;
    if (!id || loading || !messages.some(m => m.id === id)) return;
    deepLinkedMessageRef.current = null;
    const found = messages.find(m => m.id === id);
    if (found) setSelectedMessage(found);
    window.history.replaceState(null, '', window.location.pathname);
  }, [loading, messages]);

  function exportCsv() {
    downloadSmsCsv(`sms-delivery-report-${new Date().toISOString().slice(0, 10)}.csv`,
      ['To Number', 'Contact Name', 'Message', 'Carrier', 'Source App', 'Status', 'Error', 'Sent Date'],
      list.selectedItems.map(m => [m.to_number, m.contact_name, m.body, m.provider, m.source_app, m.status, m.error, m.created_at]));
  }

  async function handleRetry(m: SmsMessage) {
    setRetrying(m.id);
    try {
      await apiFetch('/v1/sms/send', {
        method: 'POST',
        body: JSON.stringify({ to: [m.to_number], body: m.body }),
      });
      showAlert('Message requeued for dispatch.');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Retry failed.');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Reports']}
        titlePlain="Delivery"
        titleEm="Reports & Logs"
        subtitle="Complete carrier delivery receipts (DLR), error code telemetry, and timestamped audit logs."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={load}>
              <Icon name="refresh" size={14} /> Refresh
            </Button>
          </div>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <SmsListToolbar search={search} onSearch={setSearch} placeholder="Search by phone, message, contact…"
          total={messages.length} page={list.page} pageSize={list.pageSize} selectedCount={list.selectedIds.size}
          activeFilterCount={status ? 1 : 0} onPageSizeChange={list.setPageSize} onExport={exportCsv}
          filterContent={() => (
            <SmsFilterMenu showClear={Boolean(status)} onClear={() => setStatus(null)}>
              <SingleSelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </SmsFilterMenu>
          )} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedMessage ? '1fr 360px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Main Log Table */}
        <SectionCard title={`Message Logs (${messages.length})`} padded={false} collapsible={false}>
          {loading ? (
            <SectionLoading />
          ) : messages.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              No messages match this filter query.
            </div>
          ) : (
            <div className="rtbl-wrap">
              <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <Checkbox checked={list.allSelected ? true : list.someSelected ? 'indeterminate' : false} onCheckedChange={list.toggleAll} aria-label="Select all filtered messages" />
                    </th>
                    {['Recipient', 'Message Content', 'Source App', 'Carrier', 'Status', 'Sent At', ''].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: 'var(--ink3)',
                          background: 'var(--bg)',
                          borderBottom: '1px solid var(--border)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.pageItems.map(m => {
                    const isSelected = selectedMessage?.id === m.id;
                    const isFailed = m.status === 'failed' || m.status === 'undelivered';
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedMessage(m)}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--teal-l)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '12px 16px' }} onClick={event => event.stopPropagation()}>
                          <Checkbox checked={list.selectedIds.has(m.id)} onCheckedChange={() => list.toggle(m.id)} aria-label={`Select message to ${m.to_number}`} />
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                          {m.contact_name || m.to_number}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontSize: 12.5,
                            color: 'var(--ink2)',
                            maxWidth: 320,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.body}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)', textTransform: 'capitalize' }}>
                          {m.source_app}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                          {m.provider ? m.provider.replace('_', ' ') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Badge variant={STATUS_VARIANT[m.status] || 'gray'}>{m.status}</Badge>
                            {m.error && <Icon name="alertTriangle" size={12} color="var(--red)" />}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {isFailed ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retrying === m.id}
                              onClick={e => {
                                e.stopPropagation();
                                handleRetry(m);
                              }}
                            >
                              <Icon name="refresh" size={11} /> Retry
                            </Button>
                          ) : (
                            <Icon name="chevronRight" size={14} color="var(--ink3)" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <SmsListPagination page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
        </SectionCard>

        {/* Selected Message Inspector Drawer */}
        {selectedMessage && (
          <div style={{ position: 'sticky', top: 20 }}>
            <SectionCard
              title="Message Telemetry"
              collapsible={false}
              action={
                <button
                  onClick={() => setSelectedMessage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex' }}
                >
                  <Icon name="x" size={14} />
                </button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Badge variant={STATUS_VARIANT[selectedMessage.status] || 'gray'}>
                    {selectedMessage.status}
                  </Badge>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    ID: {selectedMessage.id.slice(0, 8)}…
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Recipient
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    {selectedMessage.to_number}
                  </div>
                  {selectedMessage.contact_name && (
                    <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{selectedMessage.contact_name}</div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Dispatched Message
                  </div>
                  <div
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                      padding: '10px 12px',
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: 'var(--ink)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {selectedMessage.body}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                    {selectedMessage.body.length} characters · {Math.ceil(selectedMessage.body.length / 160) || 1} segment(s)
                  </div>
                </div>

                {selectedMessage.error && (
                  <div
                    style={{
                      background: 'var(--red-l)',
                      border: '1px solid var(--red)',
                      borderRadius: 'var(--r)',
                      padding: '10px 12px',
                      fontSize: 12.5,
                      color: 'var(--red)',
                    }}
                  >
                    <strong>Carrier DLR Error:</strong> {selectedMessage.error}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Carrier Gateway</span>
                    <strong>{selectedMessage.provider ? selectedMessage.provider.replace('_', ' ') : 'Generic'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Triggered App</span>
                    <strong style={{ textTransform: 'capitalize' }}>{selectedMessage.source_app}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Created At</span>
                    <span>{new Date(selectedMessage.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {(selectedMessage.status === 'failed' || selectedMessage.status === 'undelivered') && (
                  <Button onClick={() => handleRetry(selectedMessage)} disabled={retrying === selectedMessage.id}>
                    <Icon name="refresh" size={14} /> Re-send Message
                  </Button>
                )}
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}
