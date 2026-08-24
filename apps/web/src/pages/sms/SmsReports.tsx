import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';

interface SmsMessage {
  id: string; to_number: string; body: string; status: string; provider: string | null;
  error: string | null; source_app: string; contact_name: string | null; segments: number; created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'queued', label: 'Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'undelivered', label: 'Undelivered' },
];
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  sent: 'success', delivered: 'success', queued: 'warning', failed: 'error', undelivered: 'error',
};

export function SmsReports() {
  usePageSEO('SMS Reports', 'Full outbound SMS history across quick sends, campaigns, and every app in the platform that sends SMS.');
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '100' });
    if (search.trim()) qs.set('search', search.trim());
    if (status) qs.set('status', status);
    apiFetch(`/v1/sms/messages?${qs.toString()}`).then(res => setMessages(res.data || [])).catch(() => setMessages([])).finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Reports']}
        titlePlain="Message"
        titleEm="history"
        subtitle="Every SMS sent through this app or triggered from anywhere else in the platform — quick sends, campaigns, shipment notifications, Studio workflows, support replies."
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, justifyContent: 'space-between' }}>
        <SingleSelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search number, message, contact…" style={{ maxWidth: 320 }} />
      </div>

      <SectionCard title="Messages" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No messages match this filter.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['To', 'Message', 'Source', 'Provider', 'Status', 'Sent'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {messages.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }} title={m.error || undefined}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.contact_name || m.to_number}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)', textTransform: 'capitalize' }}>{m.source_app}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{m.provider ? m.provider.replace('_', ' ') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge variant={STATUS_VARIANT[m.status] || 'gray'}>{m.status}</Badge>
                    {m.error && <Icon name="alertTriangle" size={12} color="var(--red)" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(m.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
