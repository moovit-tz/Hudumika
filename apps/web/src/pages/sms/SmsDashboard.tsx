import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';

interface Stats {
  sentToday: number; sentThisMonth: number; deliveredThisMonth: number;
  failedThisMonth: number; totalThisMonth: number;
  gatewayConfigured: boolean; gatewayProvider: string | null;
}
interface SmsMessage {
  id: string; to_number: string; body: string; status: string; provider: string | null;
  source_app: string; contact_name: string | null; created_at: string;
}

const PROVIDER_LABELS: Record<string, string> = { africas_talking: "Africa's Talking", twilio: 'Twilio', nexmo: 'Vonage (Nexmo)', bongolive: 'BongoLive' };
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  sent: 'success', delivered: 'success', queued: 'warning', failed: 'error', undelivered: 'error',
};

export function SmsDashboard() {
  usePageSEO('SMS Dashboard', 'Send SMS through Africa\'s Talking, Twilio and more — quick sends, groups, templates and campaigns, all logged in one place.');
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/stats').then(res => res.data),
      apiFetch('/v1/sms/messages?limit=8').then(res => res.data),
    ]).then(([s, msgs]) => { setStats(s); setRecent(msgs || []); }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Dashboard']}
        titlePlain="SMS"
        titleEm="overview"
        subtitle="Quick sends, campaigns, groups and templates — every message sent through this app or triggered from elsewhere in the platform, in one place."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/sms/campaigns"><Button variant="outline"><Icon name="send" size={14} /> New campaign</Button></Link>
            <Link to="/sms/compose"><Button><Icon name="plus" size={14} /> Quick send</Button></Link>
          </div>
        }
      />

      {!stats?.gatewayConfigured && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gold-l)', border: '1px solid var(--gold-m)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
          <FeaturedIcon variant="warning" size="sm" shape="circle"><Icon name="alertTriangle" size={15} /></FeaturedIcon>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
            No SMS gateway configured yet — sends will fail until Africa's Talking or Twilio credentials are saved.
          </div>
          <Link to="/workspace/settings?s=integrations"><Button size="sm" variant="outline">Configure gateway</Button></Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Sent today', value: stats?.sentToday, icon: 'send' as const, variant: 'brand' as const },
          { label: 'Sent this month', value: stats?.sentThisMonth, icon: 'messageSquare' as const, variant: 'info' as const },
          { label: 'Delivered this month', value: stats?.deliveredThisMonth, icon: 'checkCircle' as const, variant: 'success' as const },
          { label: 'Failed this month', value: stats?.failedThisMonth, icon: 'alertTriangle' as const, variant: 'error' as const },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <FeaturedIcon variant={card.variant} size="md" shape="circle"><Icon name={card.icon} size={18} /></FeaturedIcon>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : (card.value ?? 0).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {stats?.gatewayConfigured && (
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="checkCircle" size={13} color="var(--green)" /> Gateway connected: {PROVIDER_LABELS[stats.gatewayProvider ?? ''] || stats?.gatewayProvider}
        </div>
      )}

      <SectionCard title="Recent messages" padded={false} collapsible={false} action={<Link to="/sms/reports" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>View all →</Link>}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : recent.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No messages sent yet. Try a quick send.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['To', 'Message', 'Source', 'Status', 'Sent'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {recent.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.contact_name || m.to_number}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{m.source_app}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[m.status] || 'gray'}>{m.status}</Badge></td>
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
