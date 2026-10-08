import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';

interface Stats {
  sentToday: number;
  sentThisMonth: number;
  deliveredThisMonth: number;
  failedThisMonth: number;
  totalThisMonth: number;
  gatewayConfigured: boolean;
  gatewayProvider: string | null;
  gatewayCount?: number;
}

interface SmsMessage {
  id: string;
  to_number: string;
  body: string;
  status: string;
  provider: string | null;
  source_app: string;
  contact_name: string | null;
  created_at: string;
}

interface InboundMessage {
  id: string;
  from_number: string;
  body: string;
  created_at: string;
}

interface Gateway {
  id: string;
  provider: string;
  label: string;
  sender_id: string | null;
  active: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  beem: 'Beem Africa',
  africas_talking: "Africa's Talking",
  twilio: 'Twilio',
  nexmo: 'Vonage (Nexmo)',
  bongolive: 'Beem Africa (BongoLive)',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  sent: 'success',
  delivered: 'success',
  queued: 'warning',
  failed: 'error',
  undelivered: 'error',
};

export function SmsDashboard() {
  usePageSEO(
    'SMS Overview',
    'Real-time bulk SMS delivery metrics, gateway health, campaigns telemetry, and quick message dispatch.'
  );

  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<SmsMessage[]>([]);
  const [inbound, setInbound] = useState<InboundMessage[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'today' | 'month'>('month');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/stats').then(res => res.data),
      apiFetch('/v1/sms/messages?limit=10').then(res => res.data),
      apiFetch('/v1/sms/inbound').then(res => res.data).catch(() => []),
      apiFetch('/v1/sms/gateways').then(res => res.data).catch(() => []),
    ])
      .then(([s, msgs, inMsgs, gwList]) => {
        setStats(s);
        setRecent(msgs || []);
        setInbound(inMsgs || []);
        setGateways(gwList || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSent = timeframe === 'today' ? (stats?.sentToday ?? 0) : (stats?.sentThisMonth ?? 0);
  const delivered = stats?.deliveredThisMonth ?? 0;
  const failed = stats?.failedThisMonth ?? 0;
  const deliveryRate = totalSent > 0 ? Math.round((delivered / Math.max(totalSent, 1)) * 100) : 100;

  // Breakdown metrics
  const statusCounts = useMemo(() => {
    const counts = { delivered: 0, sent: 0, queued: 0, failed: 0 };
    for (const m of recent) {
      if (m.status === 'delivered') counts.delivered++;
      else if (m.status === 'sent') counts.sent++;
      else if (m.status === 'queued') counts.queued++;
      else if (m.status === 'failed' || m.status === 'undelivered') counts.failed++;
    }
    return counts;
  }, [recent]);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Overview']}
        titlePlain="SMS"
        titleEm="Overview"
        subtitle="Live delivery telemetry, multi-carrier gateway routing, dynamic campaigns, and unified SMS logs."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 'var(--r)', padding: 3, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setTimeframe('today')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: timeframe === 'today' ? 'var(--white)' : 'transparent',
                  color: timeframe === 'today' ? 'var(--ink)' : 'var(--ink3)',
                  boxShadow: timeframe === 'today' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
               data-ui-native-button="">
                Today
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('month')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: timeframe === 'month' ? 'var(--white)' : 'transparent',
                  color: timeframe === 'month' ? 'var(--ink)' : 'var(--ink3)',
                  boxShadow: timeframe === 'month' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
               data-ui-native-button="">
                This Month
              </button>
            </div>
            <Link to="/sms/compose"><Button><Icon name="plus" size={14} /> Quick SMS</Button></Link>
            <Link to="/sms/campaigns"><Button variant="outline"><Icon name="send" size={14} /> New Campaign</Button></Link>
          </div>
        }
      />

      {/* Gateway Status Warning if no active gateway */}
      {!stats?.gatewayConfigured && !loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--gold-l)',
            border: '1px solid var(--gold)',
            borderRadius: 'var(--r)',
            padding: '12px 16px',
            marginBottom: 20,
          }}
        >
          <FeaturedIcon variant="warning" size="sm" shape="circle">
            <Icon name="alertTriangle" size={15} />
          </FeaturedIcon>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
            No active SMS gateway configured. Outbound messages cannot be routed until Africa's Talking, Twilio, or Vonage credentials are saved.
          </div>
          <Link to="/sms/gateways"><Button size="sm" variant="outline">Configure Gateway</Button></Link>
        </div>
      )}

      {/* Hero KPIs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="brand" size="md" shape="circle"><Icon name="send" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {timeframe === 'today' ? 'Sent Today' : 'Sent This Month'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>
              {loading ? '—' : totalSent.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="success" size="md" shape="circle"><Icon name="checkCircle" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Delivery Rate
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>
                {loading ? '—' : `${deliveryRate}%`}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>({delivered} delivered)</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="info" size="md" shape="circle"><Icon name="inbox" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Inbound Responses
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>
              {loading ? '—' : inbound.length.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant={failed > 0 ? 'error' : 'gray'} size="md" shape="circle">
            <Icon name="alertTriangle" size={18} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Failed / Bounced
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: failed > 0 ? 'var(--red)' : 'var(--ink)' }}>
              {loading ? '—' : failed.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Gateway & Delivery Telemetry Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 20 }}>
        {/* Delivery Success Breakdown */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Delivery Performance Ratio</div>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Carrier DLR feedback</span>
          </div>

          {/* Visual Progress Bar */}
          <div style={{ height: 10, borderRadius: 5, background: 'var(--bg)', overflow: 'hidden', display: 'flex', marginBottom: 14 }}>
            <div style={{ width: `${deliveryRate}%`, background: 'var(--green)', transition: 'width 0.4s' }} title={`Delivered: ${deliveryRate}%`} />
            <div style={{ width: `${totalSent > 0 ? Math.round((failed / totalSent) * 100) : 0}%`, background: 'var(--red)', transition: 'width 0.4s' }} title="Failed" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
              <span style={{ color: 'var(--ink2)' }}>Delivered: <strong>{delivered}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
              <span style={{ color: 'var(--ink2)' }}>Sent / In-Flight: <strong>{Math.max(0, totalSent - delivered - failed)}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
              <span style={{ color: 'var(--ink2)' }}>Failed: <strong>{failed}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />
              <span style={{ color: 'var(--ink2)' }}>Inbound: <strong>{inbound.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Carrier Routing Health */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Carrier Routing</div>
            <Link to="/sms/gateways" style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>Manage →</Link>
          </div>

          {gateways.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No gateways configured.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gateways.slice(0, 3).map(gw => (
                <div key={gw.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: gw.active ? 'var(--green)' : 'var(--ink3)' }} />
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{gw.label}</span>
                  </div>
                  <Badge variant={gw.active ? 'success' : 'gray'}>
                    {gw.sender_id || PROVIDER_LABELS[gw.provider] || gw.provider}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Outbound Messages */}
      <SectionCard
        title="Live Outbound Messages"
        padded={false}
        collapsible={false}
        action={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/sms/inbox" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
              View Inbox ({inbound.length})
            </Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="/sms/reports" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
              Full logs →
            </Link>
          </div>
        }
      >
        {loading ? (
          <SectionLoading />
        ) : recent.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No messages sent yet. Click <strong>Quick SMS</strong> or <strong>New Campaign</strong> to start dispatching.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Recipient', 'Message Content', 'Source App', 'Carrier', 'Status', 'Sent At'].map(h => (
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
                {recent.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      {m.contact_name || m.to_number}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 12.5,
                        color: 'var(--ink2)',
                        maxWidth: 360,
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
                      <Badge variant={STATUS_VARIANT[m.status] || 'gray'}>{m.status}</Badge>
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
