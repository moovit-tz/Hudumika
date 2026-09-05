import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';

interface Campaign {
  id: string; name: string; body: string; status: string; group_id: string | null;
  scheduled_at: string | null; sent_at: string | null; total_recipients: number; created_at: string;
}
interface SmsMessage { id: string; to_number: string; status: string; error: string | null; contact_name: string | null; created_at: string; }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray' | 'info'> = {
  draft: 'gray', scheduled: 'info', sending: 'warning', sent: 'success', failed: 'error', cancelled: 'gray',
  queued: 'warning', delivered: 'success', undelivered: 'error',
};

export function SmsCampaignDetail() {
  usePageSEO('Campaign detail', 'Campaign delivery status and per-recipient results.');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/v1/sms/campaigns/${id}`).then(res => setCampaign(res.data)),
      apiFetch(`/v1/sms/messages?campaignId=${id}&limit=200`).then(res => setMessages(res.data || [])),
    ]).catch(() => setCampaign(null)).finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  async function sendNow() {
    if (!campaign) return;
    if (!await showConfirm(`Send "${campaign.name}" to its target group right now?`, { title: 'Send campaign?', confirmLabel: 'Send now' })) return;
    await apiFetch(`/v1/sms/campaigns/${campaign.id}/send`, { method: 'POST' }).catch(() => {});
    load();
  }

  async function remove() {
    if (!campaign) return;
    if (!await showConfirm(`"${campaign.name}" will be permanently removed.`, { title: 'Delete campaign?', variant: 'danger', confirmLabel: 'Delete' })) return;
    await apiFetch(`/v1/sms/campaigns/${campaign.id}`, { method: 'DELETE' });
    navigate('/sms/campaigns');
  }

  if (loading) return <SectionLoading />;
  if (!campaign) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>Campaign not found. <Link to="/sms/campaigns">Back to campaigns</Link></div>;

  const counts = messages.reduce<Record<string, number>>((acc, m) => { acc[m.status] = (acc[m.status] ?? 0) + 1; return acc; }, {});

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Campaigns', campaign.name]}
        titlePlain={campaign.name.split(' ').slice(0, -1).join(' ') || 'Campaign'}
        titleEm={campaign.name.split(' ').slice(-1)[0] || campaign.name}
        subtitle={campaign.body}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {(campaign.status === 'draft' || campaign.status === 'scheduled') && <Button onClick={sendNow}><Icon name="send" size={14} /> Send now</Button>}
            {campaign.status !== 'sending' && <Button variant="ghost" onClick={remove}><Icon name="trash" size={14} color="var(--red)" /></Button>}
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <Badge variant={STATUS_VARIANT[campaign.status] || 'gray'}>{campaign.status}</Badge>
        <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{campaign.total_recipients} recipient(s)</span>
        {campaign.scheduled_at && <span style={{ fontSize: 13, color: 'var(--ink3)' }}>Scheduled for {new Date(campaign.scheduled_at).toLocaleString()}</span>}
        {campaign.sent_at && <span style={{ fontSize: 13, color: 'var(--ink3)' }}>Sent {new Date(campaign.sent_at).toLocaleString()}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Queued', value: counts.queued ?? 0, variant: 'warning' as const, icon: 'clock' as const },
          { label: 'Sent', value: (counts.sent ?? 0) + (counts.delivered ?? 0), variant: 'success' as const, icon: 'send' as const },
          { label: 'Delivered', value: counts.delivered ?? 0, variant: 'success' as const, icon: 'checkCircle' as const },
          { label: 'Failed', value: (counts.failed ?? 0) + (counts.undelivered ?? 0), variant: 'error' as const, icon: 'alertTriangle' as const },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <FeaturedIcon variant={card.variant} size="sm" shape="circle"><Icon name={card.icon} size={15} /></FeaturedIcon>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="Recipients" padded={false} collapsible={false}>
        {messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Not sent yet — no per-recipient results.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Recipient', 'Status', 'Error', 'When'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {messages.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.contact_name || m.to_number}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[m.status] || 'gray'}>{m.status}</Badge></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--red)' }}>{m.error || '—'}</td>
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
