import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';

interface Campaign {
  id: string;
  name: string;
  body: string;
  status: string;
  group_id: string | null;
  template_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  created_at: string;
}

interface SmsMessage {
  id: string;
  to_number: string;
  status: string;
  error: string | null;
  contact_name: string | null;
  provider: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray' | 'info'> = {
  draft: 'gray',
  scheduled: 'info',
  sending: 'warning',
  sent: 'success',
  failed: 'error',
  cancelled: 'gray',
  queued: 'warning',
  delivered: 'success',
  undelivered: 'error',
};

export function SmsCampaignDetail() {
  usePageSEO('Campaign Telemetry & Logs', 'Granular carrier delivery report and per-recipient audit for SMS campaign.');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/v1/sms/campaigns/${id}`).then(res => res.data),
      apiFetch(`/v1/sms/messages?campaignId=${id}&limit=200`).then(res => res.data || []),
    ])
      .then(([c, msgs]) => {
        setCampaign(c);
        setMessages(msgs);
      })
      .catch(() => setCampaign(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  async function sendNow() {
    if (!campaign) return;
    if (
      !(await showConfirm(`Send "${campaign.name}" to all recipients in the target group immediately?`, {
        title: 'Launch Campaign?',
        confirmLabel: 'Send now',
      }))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/campaigns/${campaign.id}/send`, { method: 'POST' });
      showAlert('Campaign dispatch initiated.');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to dispatch.');
    }
  }

  async function remove() {
    if (!campaign) return;
    if (
      !(await showConfirm(`"${campaign.name}" and its logs will be permanently deleted.`, {
        title: 'Delete campaign?',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/campaigns/${campaign.id}`, { method: 'DELETE' });
      navigate('/sms/campaigns');
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete.');
    }
  }

  function exportCsv() {
    if (messages.length === 0) return;
    const csvContent =
      'Recipient,Contact Name,Status,Carrier,Error,Sent At\n' +
      messages
        .map(m => `"${m.to_number}","${m.contact_name || ''}","${m.status}","${m.provider || ''}","${m.error || ''}","${m.created_at}"`)
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `campaign-${campaign?.name || id}-report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const counts = useMemo(() => {
    return messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [messages]);

  const delivered = counts.delivered ?? 0;
  const sent = (counts.sent ?? 0) + delivered;
  const failed = (counts.failed ?? 0) + (counts.undelivered ?? 0);
  const total = Math.max(messages.length || campaign?.total_recipients || 1, 1);
  const deliveryPct = Math.round((delivered / total) * 100);

  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      const matchSearch =
        !search.trim() ||
        m.to_number.toLowerCase().includes(search.toLowerCase()) ||
        (m.contact_name && m.contact_name.toLowerCase().includes(search.toLowerCase())) ||
        (m.error && m.error.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      return true;
    });
  }, [messages, search, statusFilter]);

  if (loading) return <SectionLoading />;
  if (!campaign) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>
        Campaign not found. <Link to="/sms/campaigns">Back to campaigns</Link>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Campaigns', campaign.name]}
        titlePlain="Campaign"
        titleEm={campaign.name}
        subtitle={campaign.body}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {messages.length > 0 && (
              <Button variant="outline" onClick={exportCsv}>
                <Icon name="download" size={14} /> Export CSV
              </Button>
            )}
            {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
              <Button onClick={sendNow}>
                <Icon name="send" size={14} /> Send Now
              </Button>
            )}
            {campaign.status !== 'sending' && (
              <Button variant="ghost" onClick={remove}>
                <Icon name="trash" size={14} color="var(--red)" />
              </Button>
            )}
          </div>
        }
      />

      {/* Meta Bar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          background: 'var(--white)',
          padding: '12px 18px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          marginBottom: 20,
        }}
      >
        <Badge variant={STATUS_VARIANT[campaign.status] || 'gray'}>{campaign.status}</Badge>
        <span style={{ fontSize: 13, color: 'var(--ink)' }}>
          <strong>{campaign.total_recipients}</strong> target recipient(s)
        </span>
        {campaign.scheduled_at && (
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
            Scheduled for: <strong>{new Date(campaign.scheduled_at).toLocaleString()}</strong>
          </span>
        )}
        {campaign.sent_at && (
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
            Sent: <strong>{new Date(campaign.sent_at).toLocaleString()}</strong>
          </span>
        )}
      </div>

      {/* Telemetry Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <FeaturedIcon variant="warning" size="sm" shape="circle"><Icon name="clock" size={15} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Queued / Pending</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{counts.queued ?? 0}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <FeaturedIcon variant="brand" size="sm" shape="circle"><Icon name="send" size={15} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Dispatched</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{sent}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <FeaturedIcon variant="success" size="sm" shape="circle"><Icon name="checkCircle" size={15} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Delivered ({deliveryPct}%)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{delivered}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <FeaturedIcon variant={failed > 0 ? 'error' : 'gray'} size="sm" shape="circle"><Icon name="alertTriangle" size={15} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Failed / Bounced</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: failed > 0 ? 'var(--red)' : 'var(--ink)' }}>{failed}</div>
          </div>
        </div>
      </div>

      {/* Recipient Search & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: 'All Recipients' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'sent', label: 'In-Flight / Sent' },
            { id: 'failed', label: 'Failed' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--badge-radius)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${statusFilter === f.id ? 'var(--teal)' : 'var(--border)'}`,
                background: statusFilter === f.id ? 'var(--teal-l)' : 'var(--white)',
                color: statusFilter === f.id ? 'var(--teal)' : 'var(--ink2)',
              }}
             data-ui-native-button="">
              {f.label}
            </button>
          ))}
        </div>

        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by phone, name, or carrier error…"
          style={{ maxWidth: 280 }}
        />
      </div>

      {/* Recipients Log Table */}
      <SectionCard title="Per-Recipient Telemetry" padded={false} collapsible={false}>
        {messages.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            This campaign has not been dispatched yet. Click <strong>Send Now</strong> to broadcast to target group.
          </div>
        ) : filteredMessages.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>
            No recipients match the filter criteria.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Recipient Number', 'Contact Name', 'Carrier Route', 'Status', 'Carrier Feedback', 'Dispatched At'].map(h => (
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
                {filteredMessages.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      {m.to_number}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>
                      {m.contact_name || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {m.provider ? m.provider.replace('_', ' ') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={STATUS_VARIANT[m.status] || 'gray'}>{m.status}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: m.error ? 'var(--red)' : 'var(--ink3)' }}>
                      {m.error || 'Delivered OK'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
