import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { MetricCard } from '../../components/MetricCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { DataTable, type RowAction, type TableColumn } from '../../components/ui/DataTable.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiError, CHANNEL_LABEL, CHANNEL_ICON, fmtNum, fmtWhen, pct, StatusBadge, type CampaignStatus, type Channel } from './pulseShared.js';

interface Row {
  id: string; name: string; channel: Channel; status: CampaignStatus; subject: string | null;
  scheduled_at: string | null; sent_at: string | null; started_at: string | null; created_at: string;
  segment_name: string | null; created_by: string | null; created_by_name: string | null; created_by_avatar: string | null;
  total_recipients: number; sent: number; opened: number; clicked: number;
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sending', label: 'Sending' },
  { key: 'draft', label: 'Draft' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const CHANNEL_FILTERS: { key: 'all' | Channel; label: string }[] = [
  { key: 'all', label: 'All channels' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export function PulseCampaigns() {
  usePageSEO('Campaigns', 'Send targeted Email, SMS, and WhatsApp broadcasts and track opens, clicks, and unsubscribes.');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState<'all' | Channel>('all');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/pulse/campaigns').then((r: any) => { setRows(r.data ?? []); setError(undefined); })
      .catch((e) => setError(apiError(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const duplicateCampaign = useCallback(async (row: Row) => {
    try {
      const res: any = await apiFetch(`/v1/pulse/campaigns/${row.id}/duplicate`, { method: 'POST' });
      showAlert(`Duplicated "${row.name}" as a new draft.`, { variant: 'success' });
      if (res?.data?.id) {
        navigate(`/pulse/campaigns/${res.data.id}/edit`);
      } else {
        load();
      }
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    }
  }, [load, navigate]);

  const deleteCampaign = useCallback(async (row: Row) => {
    const ok = await showConfirm(`Delete "${row.name}"? This cannot be undone.`, {
      title: 'Delete campaign',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`/v1/pulse/campaigns/${row.id}`, { method: 'DELETE' });
      showAlert(`Deleted "${row.name}".`, { variant: 'success' });
      load();
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    }
  }, [load]);

  const stats = useMemo(() => {
    let totalSent = 0;
    let totalEmailSent = 0;
    let totalOpened = 0;
    let totalClicked = 0;
    let sentCount = 0;
    let scheduledCount = 0;
    let draftCount = 0;
    let failedCount = 0;

    for (const r of rows) {
      totalSent += r.sent ?? 0;
      totalClicked += r.clicked ?? 0;
      if (r.channel === 'email') {
        totalEmailSent += r.sent ?? 0;
        totalOpened += r.opened ?? 0;
      }
      if (r.status === 'sent') sentCount += 1;
      else if (r.status === 'scheduled' || r.status === 'sending') scheduledCount += 1;
      else if (r.status === 'draft') draftCount += 1;
      else if (r.status === 'failed' || r.status === 'cancelled') failedCount += 1;
    }

    const openPct = totalEmailSent > 0 ? Math.min(100, Math.round((totalOpened / totalEmailSent) * 100)) : 0;
    const clickPct = totalSent > 0 ? Math.min(100, Math.round((totalClicked / totalSent) * 100)) : 0;

    return { totalSent, totalEmailSent, totalOpened, totalClicked, sentCount, scheduledCount, draftCount, failedCount, openPct, clickPct };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (channel !== 'all' && r.channel !== channel) return false;
      if (!needle) return true;
      const hay = `${r.name} ${r.subject ?? ''} ${r.segment_name ?? ''} ${CHANNEL_LABEL[r.channel]}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, status, channel, q]);

  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Campaign',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="pulse-campaign-cell">
          <div className="pulse-channel-icon-wrap" title={CHANNEL_LABEL[r.channel]}>
            <Icon name={CHANNEL_ICON[r.channel]} size={15} color="var(--teal)" />
          </div>
          <div className="pulse-campaign-info">
            <div className="pulse-campaign-title" title={r.name}>{r.name}</div>
            <div className="pulse-campaign-sub" title={r.subject || r.segment_name || undefined}>
              {r.subject ? `${r.subject} · ` : ''}{r.segment_name ?? 'No audience selected'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      hideAt: 'sm',
      sortable: true,
      sortValue: (r) => r.channel,
      render: (r) => <Badge variant="gray">{CHANNEL_LABEL[r.channel]}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'when',
      header: 'Schedule / Sent',
      hideAt: 'sm',
      sortable: true,
      sortValue: (r) => r.sent_at ?? r.scheduled_at ?? r.started_at ?? r.created_at,
      render: (r) => {
        if (r.status === 'scheduled') {
          return <span>{r.scheduled_at ? `Sends ${fmtWhen(r.scheduled_at)}` : 'Scheduled'}</span>;
        }
        if (r.sent_at) return <span>{fmtWhen(r.sent_at)}</span>;
        if (r.started_at) return <span>Started {fmtWhen(r.started_at)}</span>;
        return <span className="pulse-muted">Draft · Not sent</span>;
      },
    },
    {
      key: 'sent',
      header: 'Sent',
      align: 'right',
      hideAt: 'md',
      sortable: true,
      sortValue: (r) => r.sent || r.total_recipients || 0,
      render: (r) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {r.sent ? fmtNum(r.sent) : r.total_recipients ? fmtNum(r.total_recipients) : '—'}
        </span>
      ),
    },
    {
      key: 'opened',
      header: 'Open rate',
      align: 'right',
      hideAt: 'md',
      sortable: true,
      sortValue: (r) => (r.channel === 'email' && r.sent ? r.opened / r.sent : -1),
      render: (r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {r.channel === 'email' ? pct(r.opened, r.sent) : '—'}
        </span>
      ),
    },
    {
      key: 'clicked',
      header: 'Click rate',
      align: 'right',
      hideAt: 'md',
      sortable: true,
      sortValue: (r) => (r.sent ? r.clicked / r.sent : -1),
      render: (r) => (
        <Badge variant={r.clicked > 0 ? 'brand' : 'gray'}>
          {pct(r.clicked, r.sent)}
        </Badge>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      hideAt: 'md',
      render: (r) =>
        r.created_by_name ? (
          <div className="pulse-person">
            <PersonAvatar userId={r.created_by} name={r.created_by_name} src={r.created_by_avatar} size={24} />
            <span>{r.created_by_name}</span>
          </div>
        ) : (
          <span className="pulse-muted">—</span>
        ),
    },
  ];

  const rowActions = useCallback((r: Row): RowAction<Row>[] => {
    const actions: RowAction<Row>[] = [
      r.status === 'draft'
        ? { label: 'Edit draft', icon: 'edit', onClick: () => navigate(`/pulse/campaigns/${r.id}/edit`) }
        : { label: 'View report', icon: 'barChart', onClick: () => navigate(`/pulse/campaigns/${r.id}`) },
      { label: 'Duplicate', icon: 'copy', onClick: () => duplicateCampaign(r) },
    ];
    if ((r.status === 'draft' || r.status === 'cancelled') && !r.started_at) {
      actions.push({ label: 'Delete', icon: 'trash', variant: 'danger', separator: true, onClick: () => deleteCampaign(r) });
    }
    return actions;
  }, [navigate, duplicateCampaign, deleteCampaign]);

  const filtered = status !== 'all' || channel !== 'all' || !!q.trim();
  const initialLoading = loading && rows.length === 0;

  return (
    <div className="pulse-page">
      <PageHeader
        crumbs={[{ label: 'Marketing', to: '/pulse' }, 'Campaigns']}
        titlePlain="Marketing"
        titleEm="Campaigns"
        subtitle="Send targeted Email, SMS, and WhatsApp broadcasts to your audiences. Opens, clicks, and unsubscribes are tracked per recipient."
        actions={
          <div className="pulse-header-bar">
            <Button variant="outline" size="sm" onClick={() => navigate('/pulse/audiences')}>
              <Icon name="users" size={13} /> Audiences
            </Button>
            <Button size="sm" onClick={() => navigate('/pulse/campaigns/new')}>
              <Icon name="plus" size={13} /> New campaign
            </Button>
          </div>
        }
      />

      {/* Executive Campaign KPIs */}
      <div className="pulse-metrics">
        <MetricCard
          title="Total dispatched"
          value={fmtNum(stats.totalSent)}
          sub1Label="Sent campaigns"
          sub1Value={fmtNum(stats.sentCount)}
          sub2Label="Scheduled / Live"
          sub2Value={fmtNum(stats.scheduledCount)}
          icon="send"
          emphasis="primary"
          loading={initialLoading}
        />
        <MetricCard
          title="Email open rate"
          value={pct(stats.totalOpened, stats.totalEmailSent)}
          sub1Label="Unique opens"
          sub1Value={fmtNum(stats.totalOpened)}
          sub2Label="Emails sent"
          sub2Value={fmtNum(stats.totalEmailSent)}
          progress={stats.openPct}
          progressLabel="Email open rate"
          icon="mail"
          loading={initialLoading}
        />
        <MetricCard
          title="Click-through rate"
          value={pct(stats.totalClicked, stats.totalSent)}
          sub1Label="Unique clicks"
          sub1Value={fmtNum(stats.totalClicked)}
          sub2Label="Click-to-open"
          sub2Value={pct(stats.totalClicked, stats.totalOpened)}
          progress={stats.clickPct}
          progressLabel="Click-through rate"
          icon="link"
          loading={initialLoading}
        />
        <MetricCard
          title="Campaign pipeline"
          value={fmtNum(rows.length)}
          sub1Label="Drafts"
          sub1Value={fmtNum(stats.draftCount)}
          sub2Label="Failed / Cancelled"
          sub2Value={fmtNum(stats.failedCount)}
          icon="activity"
          loading={initialLoading}
        />
      </div>

      {/* Segmented Filter & Search Toolbar */}
      <div className="pulse-social-toolbar">
        <div className="pulse-social-toolbar-filters">
          <div className="pulse-time-toggle" role="group" aria-label="Filter by campaign status">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={status === s.key}
                className={`pulse-time-btn ${status === s.key ? 'active' : ''}`}
                onClick={() => setStatus(s.key)}
                data-ui-native-button=""
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="pulse-time-toggle" role="group" aria-label="Filter by channel">
            {CHANNEL_FILTERS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={channel === c.key}
                className={`pulse-time-btn ${channel === c.key ? 'active' : ''}`}
                onClick={() => setChannel(c.key)}
                data-ui-native-button=""
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pulse-social-search">
          <Input
            aria-label="Search campaigns"
            placeholder="Search campaigns, subjects, or audiences…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Campaigns Directory */}
      <SectionCard
        title="Campaigns"
        padded={false}
        collapsible={false}
        action={
          rows.length > 0 ? (
            <span className="pulse-muted">
              {filtered ? `${fmtNum(shown.length)} of ${fmtNum(rows.length)} shown` : `${fmtNum(rows.length)} total`}
            </span>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={shown}
          loading={loading}
          error={error}
          onRetry={load}
          rowActions={rowActions}
          empty={!loading && rows.length === 0}
          emptyIcon="send"
          emptyTitle="No campaigns yet"
          emptyMessage="Pick an audience, compose your Email, SMS, or WhatsApp broadcast, and send it now or schedule for later."
          emptyAction={{ label: 'New campaign', onClick: () => navigate('/pulse/campaigns/new') }}
          filteredEmpty={!loading && rows.length > 0 && shown.length === 0 && filtered}
          onRowClick={(r) => navigate(r.status === 'draft' ? `/pulse/campaigns/${r.id}/edit` : `/pulse/campaigns/${r.id}`)}
        />
      </SectionCard>
    </div>
  );
}
