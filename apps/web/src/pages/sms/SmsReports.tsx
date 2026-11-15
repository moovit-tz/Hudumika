import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsListPagination, useSmsList } from './SmsListControls.js';
import './Sms.css';

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

const STATUS_FILTERS = [
  'ALL',
  'PENDING',
  'QUEUED',
  'SCHEDULED',
  'SENT',
  'FAILED',
  'BOUNCED',
  'CANCELLED',
] as const;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  sent: 'success',
  delivered: 'success',
  queued: 'warning',
  pending: 'warning',
  scheduled: 'warning',
  failed: 'error',
  undelivered: 'error',
  bounced: 'error',
  cancelled: 'gray',
};

export function SmsReports() {
  const deepLinkedMessageRef = useRef<string | null>(new URLSearchParams(window.location.search).get('message'));
  usePageSEO('Send History & Delivery Reports', 'Audit outbound message dispatches, carrier delivery reports (DLR), error codes, and latency.');

  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [appliedRecipient, setAppliedRecipient] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeStatus, setActiveStatus] = useState<string>('ALL');
  const [selectedMessage, setSelectedMessage] = useState<SmsMessage | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '200' });
    if (appliedRecipient.trim()) qs.set('search', appliedRecipient.trim());
    if (activeStatus !== 'ALL') qs.set('status', activeStatus.toLowerCase());
    qs.set('offset', '0');
    apiFetch(`/v1/sms/messages?${qs.toString()}`)
      .then((res) => {
        const rows = res.data || [];
        setMessages(rows);
        setHasMore(rows.length === 200);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [appliedRecipient, activeStatus]);

  const loadMore = async () => {
    const qs = new URLSearchParams({ limit: '200', offset: String(messages.length) });
    if (appliedRecipient.trim()) qs.set('search', appliedRecipient.trim());
    if (activeStatus !== 'ALL') qs.set('status', activeStatus.toLowerCase());
    try {
      const res = await apiFetch(`/v1/sms/messages?${qs.toString()}`);
      const rows: SmsMessage[] = res.data || [];
      setMessages(current => [...current, ...rows]);
      setHasMore(rows.length === 200);
    } catch (err: any) {
      showAlert(err.message || 'Could not load older messages.');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = deepLinkedMessageRef.current;
    if (!id || loading || !messages.some((m) => m.id === id)) return;
    deepLinkedMessageRef.current = null;
    const found = messages.find((m) => m.id === id);
    if (found) setSelectedMessage(found);
    window.history.replaceState(null, '', window.location.pathname);
  }, [loading, messages]);

  const list = useSmsList(messages);

  function exportCsv() {
    downloadSmsCsv(
      `send-history-${new Date().toISOString().slice(0, 10)}.csv`,
      ['To Number', 'Contact Name', 'Message', 'Carrier', 'Source App', 'Status', 'Error', 'Queued Date', 'Delivered Date'],
      list.selectedItems.map((m) => [
        m.to_number,
        m.contact_name,
        m.body,
        m.provider,
        m.source_app,
        m.status,
        m.error,
        m.created_at,
        m.delivered_at || '',
      ])
    );
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedRecipient(recipientQuery);
  };

  return (
    <div className="sms-container">
      <PageHeader
        crumbs={[{ label: 'SMS & Messaging', to: '/sms' }, 'Send history']}
        titlePlain="Send"
        titleEm="History"
        subtitle="Every message this workspace sent, newest first. Open one to see how it got there."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {list.selectedIds.size > 0 && (
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Icon name="download" size={13} /> Export {list.selectedIds.size} Selected
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <Icon name="refresh" size={13} /> Refresh
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar matching Image 1 */}
      <SectionCard padded collapsible={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Top Inputs: Recipient Search & Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            {/* Recipient Search */}
            <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 260px' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5, marginBottom: 6 }}>
                RECIPIENT
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  placeholder="name@example.com or phone…"
                  style={{ fontSize: 13 }}
                />
                <Button type="submit" variant="outline">
                  Search
                </Button>
              </div>
            </form>

            {/* From Date */}
            <div style={{ width: 160 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5, marginBottom: 6 }}>
                <Icon name="calendar" size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> FROM
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ fontSize: 12.5 }}
              />
            </div>

            {/* To Date */}
            <div style={{ width: 160 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5, marginBottom: 6 }}>
                <Icon name="calendar" size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> TO
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ fontSize: 12.5 }}
              />
            </div>
          </div>

          {/* Status Pills matching Image 1 */}
          <div className="sms-filter-pills">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                className={`sms-filter-pill ${activeStatus === s ? 'active' : ''}`}
                onClick={() => setActiveStatus(s)}
                data-ui-native-button=""
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Main Table & Slide-over Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedMessage ? '1fr 380px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Table matching Image 1 */}
        <SectionCard padded={false} collapsible={false}>
          {loading ? (
            <SectionLoading />
          ) : messages.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 14 }}>
              This workspace has not sent any message yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ width: 44, padding: '12px 16px' }}>
                      <Checkbox
                        checked={list.allSelected ? true : list.someSelected ? 'indeterminate' : false}
                        onCheckedChange={list.toggleAll}
                        aria-label="Select all messages"
                      />
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      RECIPIENT
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      STATUS
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      QUEUED
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      DELIVERY
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.pageItems.map((m) => {
                    const isSelected = selectedMessage?.id === m.id;
                    const statusLower = m.status.toLowerCase();
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
                        <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={list.selectedIds.has(m.id)}
                            onCheckedChange={() => list.toggle(m.id)}
                            aria-label={`Select message to ${m.to_number}`}
                          />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
                            {m.contact_name || m.to_number}
                          </div>
                          {m.contact_name && (
                            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{m.to_number}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={STATUS_VARIANT[statusLower] || 'gray'}>
                            {m.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--ink2)' }}>
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--ink3)' }}>
                          {m.delivered_at
                            ? new Date(m.delivered_at).toLocaleString()
                            : m.error
                            ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>Failed: {m.error}</span>
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <SmsListPagination page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
          {hasMore && <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Button variant="outline" onClick={loadMore}>Load older messages</Button></div>}
        </SectionCard>

        {/* Selected Message Inspector */}
        {selectedMessage && (
          <div style={{ position: 'sticky', top: 20 }}>
            <SectionCard
              title="Message Details"
              collapsible={false}
              action={
                <button aria-label="Close"
                  onClick={() => setSelectedMessage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex' }}
                  data-ui-native-button=""
                >
                  <Icon name="x" size={14} />
                </button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Badge variant={STATUS_VARIANT[selectedMessage.status.toLowerCase()] || 'gray'}>
                    {selectedMessage.status.toUpperCase()}
                  </Badge>
                  <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
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
                    <strong>Carrier Error:</strong> {selectedMessage.error}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Carrier Provider</span>
                    <strong>{selectedMessage.provider ? selectedMessage.provider.replace('_', ' ') : 'Local Gateway'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Source App</span>
                    <strong style={{ textTransform: 'capitalize' }}>{selectedMessage.source_app}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink3)' }}>Queued Timestamp</span>
                    <span>{new Date(selectedMessage.created_at).toLocaleString()}</span>
                  </div>
                  {selectedMessage.delivered_at && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink3)' }}>Delivered Timestamp</span>
                      <span>{new Date(selectedMessage.delivered_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {(selectedMessage.status.toLowerCase() === 'failed' || selectedMessage.status.toLowerCase() === 'undelivered') && (
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
