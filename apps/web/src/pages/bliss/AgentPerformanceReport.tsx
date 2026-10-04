import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { MetricsRow } from '../../components/MetricCard.js';
import { Button } from '../../components/ui/button.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Badge } from '../../components/ui/badge.js';
import { useSupportMetrics, PeriodSwitcher, type AgentStat } from '../SupportOverviewShared.js';
import './BlissReports.css';

export const AgentPerformanceReport: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod, metrics, metricsLoading } = useSupportMetrics();
  const [search, setSearch] = useState('');

  const agents: AgentStat[] = metrics?.agents ?? [];
  const filtered = useMemo(() => agents.filter(agent =>
    !search || agent.name.toLowerCase().includes(search.toLowerCase()),
  ), [agents, search]);
  const totals = useMemo(() => ({
    assigned: agents.reduce((sum, agent) => sum + agent.assigned, 0),
    resolved: agents.reduce((sum, agent) => sum + agent.resolved, 0),
    open: agents.reduce((sum, agent) => sum + agent.open, 0),
    resolutionRate: agents.length ? Math.round(agents.reduce((sum, agent) => sum + agent.resolutionRate, 0) / agents.length) : 0,
    csat: (() => {
      const scored = agents.filter(agent => agent.csat != null);
      return scored.length ? (scored.reduce((sum, agent) => sum + (agent.csat ?? 0), 0) / scored.length).toFixed(1) : '—';
    })(),
  }), [agents]);

  const columns: TableColumn<AgentStat>[] = [
    { key: 'agent', header: 'Agent', render: agent => <div className="flex items-center gap-2.5"><PersonAvatar userId={agent.id} name={agent.name} size={32} /><div><div className="font-semibold text-foreground">{agent.name}</div><div className="text-xs text-muted-foreground">{agent.assigned} assigned</div></div></div> },
    { key: 'resolved', header: 'Resolved', accessor: 'resolved', sortable: true, align: 'right' },
    { key: 'open', header: 'Open', accessor: 'open', sortable: true, align: 'right', hideAt: 'sm' },
    { key: 'rate', header: 'Resolution rate', accessor: 'resolutionRate', sortable: true, align: 'right', render: agent => <Badge variant={agent.resolutionRate >= 90 ? 'success' : agent.resolutionRate >= 70 ? 'warning' : 'error'}>{agent.resolutionRate}%</Badge> },
    { key: 'time', header: 'Avg. resolution', accessor: 'avgResolutionHours', sortable: true, align: 'right', hideAt: 'md', render: agent => agent.avgResolutionHours == null ? '—' : `${agent.avgResolutionHours}h` },
    { key: 'csat', header: 'CSAT', accessor: 'csat', sortable: true, align: 'right', hideAt: 'md', render: agent => agent.csat == null ? '—' : `${agent.csat}/5` },
  ];

  return (
    <div className="bliss-report-root">
      <div className="bliss-report-container">
        <PageHeader
          crumbs={['Bliss', 'Reports']}
          titlePlain="Agent performance"
          titleEm="report"
          subtitle="Real assignment, resolution and satisfaction results for the selected reporting period."
          actions={<div className="flex flex-wrap items-center gap-2"><div className="flex gap-0.5 rounded-(--radius) border border-border bg-muted p-0.5"><PeriodSwitcher period={period} setPeriod={setPeriod} /></div><Button variant="outline" size="sm" onClick={() => navigate('/bliss/overview')}><Icon name="activity" size={14} /> Overview</Button></div>}
        />

        <MetricsRow cards={[
          { title: 'Assigned tickets', value: String(totals.assigned), icon: 'clipboard', comparisonLabel: `${period} reporting period`, loading: metricsLoading, emphasis: 'primary' },
          { title: 'Resolved', value: String(totals.resolved), icon: 'checkCircle', barHighlight: 'var(--green)', loading: metricsLoading },
          { title: 'Open workload', value: String(totals.open), icon: 'alertCircle', barHighlight: 'var(--gold)', loading: metricsLoading },
          { title: 'Average resolution rate', value: `${totals.resolutionRate}%`, icon: 'trendingUp', barHighlight: 'var(--blue)', loading: metricsLoading, progress: totals.resolutionRate, progressLabel: 'Across assigned agents' },
          { title: 'Average CSAT', value: totals.csat === '—' ? '—' : `${totals.csat}/5`, icon: 'smile', barHighlight: 'var(--green)', loading: metricsLoading, empty: !metricsLoading && totals.csat === '—', emptyMessage: 'No scored tickets in this period', emphasis: 'subtle' },
        ]} />

        <SearchToolbar search={search} onSearch={setSearch} placeholder="Search agents…" />
        <DataTable
          columns={columns}
          rows={filtered}
          loading={metricsLoading}
          filteredEmpty={!!search && filtered.length === 0}
          empty={!metricsLoading && agents.length === 0}
          emptyIcon="users"
          emptyTitle="No assigned agents"
          emptyMessage="Agent performance appears after support tickets are assigned in this period."
          defaultSortKey="resolved"
          defaultSortDir="desc"
          pageSize={10}
        />
      </div>
    </div>
  );
};
