import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { MetricCard } from '../../components/MetricCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { apiError, CHANNEL_ICON, CHANNEL_LABEL, fmtNum, fmtWhen, pct, StatusBadge, type CampaignStatus, type Channel } from './pulseShared.js';
import './Pulse.css';

interface Overview {
  days: number;
  current: Record<string, number>;
  previous: Record<string, number>;
  counts: Record<string, number>;
  recent: {
    id: string;
    name: string;
    channel: Channel;
    status: CampaignStatus;
    sent_at: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    sent: number;
    opened: number;
    clicked: number;
  }[];
  daily: { day: string; n: number }[];
  results: Record<string, number>;
  growth: Record<string, number>;
  channels: { channel: Channel; sent: number; opened: number; clicked: number; unsubscribed: number }[];
  journeys: { id: string; name: string; status: string; active: number; finished: number }[];
  warnings: { level: 'warn' | 'info'; text: string; link?: string }[];
}

/** Percentage change, or undefined when there's no previous period to compare with. */
function change(cur: number, prev: number) {
  return prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : undefined;
}

const rate = (n: number, of: number) => (of ? n / of : 0);
const money = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0');

const TIMEFRAMES = [
  { value: '7', label: '7D' },
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
  { value: '365', label: '1Y' },
];

export function PulseOverview() {
  usePageSEO('Pulse Marketing Overview', 'Cross-channel marketing analytics, email, SMS and WhatsApp campaign performance, customer journeys, and touch attribution.');
  const navigate = useNavigate();
  const [days, setDays] = useState('30');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    apiFetch(`/v1/pulse/overview?days=${days}`)
      .then((r: any) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
  }, [days]);

  const header = (
    <PageHeader
      crumbs={[{ label: 'Marketing', to: '/pulse' }, 'Overview']}
      titlePlain="Marketing"
      titleEm="Overview"
      subtitle="Cross-channel campaign analytics, automated customer journeys, and full-funnel attribution."
      actions={
        <div className="pulse-header-bar">
          {/* Segmented Timeframe Switcher */}
          <div className="pulse-time-toggle" role="group" aria-label="Select reporting period">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`pulse-time-btn ${days === t.value ? 'active' : ''}`}
                onClick={() => setDays(t.value)}
                data-ui-native-button=""
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Quick Action Buttons */}
          <Button variant="outline" size="sm" onClick={() => navigate('/pulse/journeys/new')}>
            <Icon name="gitBranch" size={13} /> New Journey
          </Button>
          <Button size="sm" onClick={() => navigate('/pulse/campaigns/new')}>
            <Icon name="plus" size={13} /> New Campaign
          </Button>
        </div>
      }
    />
  );

  if (error) {
    return (
      <div className="pulse-page">
        {header}
        <div className="pulse-note pulse-note-warn" role="status">
          <strong>Unable to load marketing overview</strong>
          <p style={{ margin: '4px 0 0' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pulse-page">
        {header}
        <SectionLoading />
      </div>
    );
  }

  const c = data.current, p = data.previous, r = data.results;
  const vs = `vs previous ${data.days} days`;
  const openNow = rate(c.opened, c.email_sent), openPrev = rate(p.opened, p.email_sent);
  const clickNow = rate(c.clicked, c.sent), clickPrev = rate(p.clicked, p.sent);
  const totalSentVolume = c.sent || 1;
  const deliveryHealthPct = c.sent > 0 ? Math.max(0, 100 - Math.round(((c.bounced || 0) / c.sent) * 100)) : 100;
  const nothingYet = !c.sent && !data.recent.length && !data.journeys.length;

  const columns: TableColumn<Overview['recent'][number]>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (x) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--teal)',
              flexShrink: 0,
            }}
          >
            <Icon name={CHANNEL_ICON[x.channel]} size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{x.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{CHANNEL_LABEL[x.channel]}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (x) => <StatusBadge status={x.status} />,
    },
    {
      key: 'when',
      header: 'Dispatched',
      hideAt: 'sm',
      render: (x) => <span style={{ color: 'var(--ink2)' }}>{fmtWhen(x.sent_at ?? x.started_at ?? x.scheduled_at)}</span>,
    },
    {
      key: 'sent',
      header: 'Recipients',
      align: 'right',
      render: (x) => <strong style={{ color: 'var(--ink)' }}>{fmtNum(x.sent)}</strong>,
    },
    {
      key: 'opened',
      header: 'Open Rate',
      align: 'right',
      hideAt: 'md',
      render: (x) => (
        <span style={{ fontWeight: 600, color: x.channel === 'email' ? 'var(--ink)' : 'var(--ink3)' }}>
          {x.channel === 'email' ? pct(x.opened, x.sent) : '—'}
        </span>
      ),
    },
    {
      key: 'clicked',
      header: 'CTR',
      align: 'right',
      hideAt: 'md',
      render: (x) => (
        <Badge variant={x.clicked > 0 ? 'brand' : 'gray'}>
          {pct(x.clicked, x.sent)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="pulse-page">
      {header}

      {/* Warnings & Optimization Alerts */}
      {data.warnings.length > 0 && (
        <div className="pulse-note pulse-note-warn" role="status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alertTriangle" size={16} color="var(--amber, #f59e0b)" />
            <strong style={{ fontSize: 13 }}>Marketing Deliverability & Health Checks</strong>
          </div>
          <ul style={{ margin: '8px 0 0', paddingInlineStart: 24, fontSize: 13 }}>
            {data.warnings.map((w, i) => (
              <li key={i}>
                {w.text}
                {w.link && (
                  <> — <Link to={w.link} style={{ fontWeight: 600, color: 'var(--teal)' }}>Review details</Link></>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nothingYet ? (
        <SectionCard title="Get started with Pulse Marketing" collapsible={false}>
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginBottom: 20 }}>
              Launch targeted multi-channel campaigns, trigger automated customer journeys, and measure conversions across sales pipelines.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--card-radius, 14px)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="users" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>1. Build an Audience</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>
                    Filter your CRM leads, contacts, or customers by activity, tags, or purchase history.
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/pulse/audiences/new')} style={{ marginTop: 'auto' }}>
                  Create Audience
                </Button>
              </div>

              <div style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--card-radius, 14px)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>2. Dispatch a Campaign</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>
                    Compose rich personalized Email, SMS, or WhatsApp messages with real-time preview.
                  </div>
                </div>
                <Button variant="default" size="sm" onClick={() => navigate('/pulse/campaigns/new')} style={{ marginTop: 'auto' }}>
                  Draft Campaign
                </Button>
              </div>

              <div style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--card-radius, 14px)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="clipboard" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>3. Capture Inbound Leads</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>
                    Embed customizable lead forms on your website to automatically capture and tag prospects.
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/pulse/forms')} style={{ marginTop: 'auto' }}>
                  Website Forms
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : (
        <>
          {/* Executive Top Metric Cards */}
          <div className="pulse-metrics">
            <MetricCard
              title="Messages sent"
              value={fmtNum(c.sent)}
              trend={change(c.sent, p.sent)}
              comparisonLabel={vs}
              sub1Label="Completed campaigns"
              sub1Value={fmtNum(data.counts.sent_campaigns)}
              sub2Label="Scheduled / Sending"
              sub2Value={fmtNum(data.counts.active)}
              bars={data.daily.length > 1 ? data.daily.map((d) => d.n) : undefined}
              icon="send"
              emphasis="primary"
            />
            <MetricCard
              title="Email open rate"
              value={pct(c.opened, c.email_sent)}
              trend={openPrev ? change(openNow, openPrev) : undefined}
              comparisonLabel={vs}
              sub1Label="Unique opened"
              sub1Value={fmtNum(c.opened)}
              sub2Label="Emails delivered"
              sub2Value={fmtNum(c.email_sent)}
              progress={c.email_sent > 0 ? Math.min(100, Math.round((c.opened / c.email_sent) * 100)) : 0}
              icon="mail"
            />
            <MetricCard
              title="Click-through rate"
              value={pct(c.clicked, c.sent)}
              trend={clickPrev ? change(clickNow, clickPrev) : undefined}
              comparisonLabel={vs}
              sub1Label="Total clicks"
              sub1Value={fmtNum(c.clicked)}
              sub2Label="Click-to-open"
              sub2Value={pct(c.clicked, c.opened)}
              progress={c.sent > 0 ? Math.min(100, Math.round((c.clicked / c.sent) * 100)) : 0}
              icon="link"
            />
            <MetricCard
              title="Delivery health"
              value={`${deliveryHealthPct}%`}
              trend={change(c.unsubscribed, p.unsubscribed)}
              invertTrend
              comparisonLabel="unsubscribes vs prev"
              sub1Label="Unsubscribed"
              sub1Value={fmtNum(c.unsubscribed)}
              sub2Label="Bounced"
              sub2Value={fmtNum(c.bounced)}
              icon="users"
            />
          </div>

          {/* Commercial Impact & Pipeline Attribution Banner */}
          <SectionCard
            title="Commercial Revenue & Pipeline Touch Attribution"
            collapsible={false}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/pulse/attribution')}>
                Full Touch Attribution <Icon name="chevronRight" size={13} style={{ marginLeft: 4 }} />
              </Button>
            }
          >
            <div className="pulse-commercial-grid">
              <div className="pulse-commercial-card">
                <div className="pulse-commercial-head">
                  <span className="pulse-commercial-title">Leads Generated</span>
                  <div className="pulse-commercial-icon">
                    <Icon name="users" size={16} />
                  </div>
                </div>
                <div>
                  <div className="pulse-commercial-value">{fmtNum(r.leads)}</div>
                  <div className="pulse-commercial-sub">
                    {r.all_leads > 0 ? `${pct(r.leads, r.all_leads)} of ${fmtNum(r.all_leads)} total leads` : 'Direct campaign touches'}
                  </div>
                </div>
              </div>

              <div className="pulse-commercial-card">
                <div className="pulse-commercial-head">
                  <span className="pulse-commercial-title">Deals Closed</span>
                  <div className="pulse-commercial-icon">
                    <Icon name="checkCircle" size={16} />
                  </div>
                </div>
                <div>
                  <div className="pulse-commercial-value">{fmtNum(r.deals)}</div>
                  <div className="pulse-commercial-sub">
                    Pipeline value: <strong style={{ color: 'var(--ink)' }}>{money(r.deal_value)}</strong>
                  </div>
                </div>
              </div>

              <div className="pulse-commercial-card">
                <div className="pulse-commercial-head">
                  <span className="pulse-commercial-title">Attributed Revenue</span>
                  <div className="pulse-commercial-icon">
                    <Icon name="creditCard" size={16} />
                  </div>
                </div>
                <div>
                  <div className="pulse-commercial-value" style={{ color: 'var(--teal)' }}>
                    {money(r.paid)}
                  </div>
                  <div className="pulse-commercial-sub">
                    Last-touch credit · 90-day window
                  </div>
                </div>
              </div>

              <div className="pulse-commercial-card">
                <div className="pulse-commercial-head">
                  <span className="pulse-commercial-title">Net Audience Growth</span>
                  <div className="pulse-commercial-icon">
                    <Icon name="trendingUp" size={16} />
                  </div>
                </div>
                <div>
                  <div className="pulse-commercial-value">+{fmtNum(data.growth.opted_in)}</div>
                  <div className="pulse-commercial-sub">
                    {fmtNum(data.growth.opted_out)} unsubscribed · {fmtNum(data.growth.bounced)} bounced
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Split Row: Channel Breakdown and Customer Journeys */}
          <div className="pulse-split">
            {/* By Channel */}
            <SectionCard title="Performance by Channel" padded={false} collapsible={false}>
              {data.channels.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  No messages sent in this reporting timeframe.
                </div>
              ) : (
                <div>
                  {data.channels.map((ch) => {
                    const share = Math.round((ch.sent / totalSentVolume) * 100);
                    return (
                      <div key={ch.channel} className="pulse-channel-row">
                        <div className="pulse-channel-info">
                          <div className="pulse-channel-icon-wrap">
                            <Icon name={CHANNEL_ICON[ch.channel]} size={16} color="var(--teal)" />
                          </div>
                          <div>
                            <div className="pulse-channel-name">{CHANNEL_LABEL[ch.channel]}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                              {share}% of dispatches
                            </div>
                          </div>
                        </div>

                        <div className="pulse-channel-stats">
                          <div className="pulse-channel-metric">
                            <span className="pulse-channel-metric-label">Sent</span>
                            <span className="pulse-channel-metric-val">{fmtNum(ch.sent)}</span>
                          </div>

                          <div className="pulse-channel-metric">
                            <span className="pulse-channel-metric-label">Open Rate</span>
                            <span className="pulse-channel-metric-val">
                              {ch.channel === 'email' ? pct(ch.opened, ch.sent) : '—'}
                            </span>
                          </div>

                          <div className="pulse-channel-metric">
                            <span className="pulse-channel-metric-label">Click Rate</span>
                            <span className="pulse-channel-metric-val">
                              {pct(ch.clicked, ch.sent)}
                            </span>
                          </div>

                          <div className="pulse-channel-metric">
                            <span className="pulse-channel-metric-label">Unsub Rate</span>
                            <span className="pulse-channel-metric-val" style={{ color: 'var(--ink3)' }}>
                              {ch.channel === 'email' ? pct(ch.unsubscribed, ch.sent) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Active Automated Journeys */}
            <SectionCard
              title="Automated Journeys"
              collapsible={false}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/pulse/journeys')}>
                  All journeys ({data.journeys.length}) →
                </Button>
              }
            >
              {data.journeys.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                  <Icon name="gitBranch" size={24} color="var(--ink3)" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    No automated journeys active
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, marginBottom: 12 }}>
                    Trigger automated sequences based on customer actions and dates.
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate('/pulse/journeys/new')}>
                    Launch from Template
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.journeys.map((j) => (
                    <div
                      key={j.id}
                      className="pulse-journey-item"
                      onClick={() => navigate(`/pulse/journeys/${j.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="pulse-journey-main">
                        <div className="pulse-journey-icon">
                          <Icon name="gitBranch" size={14} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="pulse-journey-title" title={j.name}>
                            {j.name}
                          </div>
                          <div className="pulse-journey-meta">
                            <strong>{fmtNum(j.active)}</strong> in flight · <strong>{fmtNum(j.finished)}</strong> completed
                          </div>
                        </div>
                      </div>
                      <Badge variant={j.status === 'paused' ? 'warning' : 'brand'}>
                        {j.status === 'paused' ? 'Paused' : 'Active'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Recent Campaigns Performance Stream */}
          <SectionCard
            title="Recent Campaigns Performance"
            padded={false}
            collapsible={false}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/pulse/campaigns')}>
                All Campaigns ({data.counts.sent_campaigns}) →
              </Button>
            }
          >
            <DataTable
              columns={columns}
              rows={data.recent}
              empty={!data.recent.length}
              emptyIcon="send"
              emptyTitle="No campaigns sent yet"
              onRowClick={(x) => navigate(`/pulse/campaigns/${x.id}`)}
            />
          </SectionCard>
        </>
      )}
    </div>
  );
}
