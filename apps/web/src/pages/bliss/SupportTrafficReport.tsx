import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { MetricsRow } from '../../components/MetricCard.js';
import { Button } from '../../components/ui/button.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { useSupportMetrics, PeriodSwitcher } from '../SupportOverviewShared.js';
import './BlissReports.css';

interface TagRow { id: string; tag: string; count: number; share: number }

export const SupportTrafficReport: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod, tickets, loading, metrics, metricsLoading } = useSupportMetrics();
  const dailyBars: number[] = metrics?.dailyBars ?? [];
  const resolved = metrics ? metrics.resolved + metrics.closed : 0;
  const resolutionRate = metrics?.total ? Math.round((resolved / metrics.total) * 100) : 0;
  const uniqueCustomers = useMemo(() => new Set(tickets.map(ticket => ticket.customer).filter(Boolean)).size, [tickets]);
  const trendData = useMemo(() => dailyBars.map((count, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (dailyBars.length - index - 1));
    return { day: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count };
  }), [dailyBars]);
  const tags: TagRow[] = useMemo(() => (metrics?.tagBreakdown ?? []).map((item: { tag: string; count: number }) => ({
    id: item.tag,
    tag: item.tag,
    count: item.count,
    share: metrics?.total ? Math.round((item.count / metrics.total) * 100) : 0,
  })), [metrics]);

  const columns: TableColumn<TagRow>[] = [
    { key: 'tag', header: 'Conversation tag', accessor: 'tag', sortable: true, render: row => <span className="font-semibold text-foreground">{row.tag}</span> },
    { key: 'count', header: 'Tickets', accessor: 'count', sortable: true, align: 'right' },
    { key: 'share', header: 'Share of tickets', accessor: 'share', sortable: true, align: 'right', render: row => `${row.share}%` },
  ];

  return (
    <div className="bliss-report-root">
      <div className="bliss-report-container">
        <PageHeader
          crumbs={['Bliss', 'Reports']}
          titlePlain="Support traffic"
          titleEm="report"
          subtitle="Actual ticket volume, requester reach and conversation categories for the selected reporting period."
          actions={<div className="flex flex-wrap items-center gap-2"><div className="flex gap-0.5 rounded-(--radius) border border-border bg-muted p-0.5"><PeriodSwitcher period={period} setPeriod={setPeriod} /></div><Button variant="outline" size="sm" onClick={() => navigate('/bliss/overview')}><Icon name="activity" size={14} /> Overview</Button></div>}
        />

        <MetricsRow cards={[
          { title: 'Total inquiries', value: String(metrics?.total ?? 0), icon: 'inbox', comparisonLabel: `${period} reporting period`, bars: dailyBars, loading: metricsLoading, emphasis: 'primary' },
          { title: 'Unique customers', value: String(uniqueCustomers), icon: 'users', barHighlight: 'var(--blue)', loading },
          { title: 'Resolved or closed', value: String(resolved), icon: 'checkCircle', barHighlight: 'var(--green)', loading: metricsLoading, sub1Label: 'RESOLUTION RATE', sub1Value: `${resolutionRate}%` },
          { title: 'Open', value: String(metrics?.open ?? 0), icon: 'alertCircle', barHighlight: 'var(--red)', loading: metricsLoading },
          { title: 'In progress', value: String(metrics?.inProgress ?? 0), icon: 'clock', barHighlight: 'var(--gold)', loading: metricsLoading, emphasis: 'subtle' },
        ]} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <SectionCard title="Daily ticket volume">
            {metricsLoading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading ticket volume…</div> : trendData.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No ticket volume in this period.</div> : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs><linearGradient id="supportTrafficFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--teal)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--teal)" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="day" stroke="var(--ink3)" fontSize={11} tickLine={false} />
                    <YAxis stroke="var(--ink3)" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--white)', borderColor: 'var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12 }} />
                    <Area type="monotone" dataKey="count" name="Tickets" stroke="var(--teal)" strokeWidth={2.5} fill="url(#supportTrafficFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Traffic context">
            <dl className="grid gap-4 text-sm">
              <div><dt className="text-muted-foreground">Average first reply</dt><dd className="mt-1 text-xl font-bold text-foreground">{metrics ? `${metrics.firstReply}h` : '—'}</dd></div>
              <div><dt className="text-muted-foreground">Average resolution</dt><dd className="mt-1 text-xl font-bold text-foreground">{metrics ? `${metrics.resolution}h` : '—'}</dd></div>
              <div><dt className="text-muted-foreground">Urgent tickets</dt><dd className="mt-1 text-xl font-bold text-foreground">{metrics?.urgent ?? 0}</dd></div>
            </dl>
          </SectionCard>
        </div>

        <DataTable
          columns={columns}
          rows={tags}
          loading={metricsLoading}
          empty={!metricsLoading && tags.length === 0}
          emptyIcon="tag"
          emptyTitle="No conversation tags"
          emptyMessage="Tag breakdown appears when tickets in this period have tags."
          defaultSortKey="count"
          defaultSortDir="desc"
          pageSize={8}
        />
      </div>
    </div>
  );
};
