import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { MetricsRow } from '../../components/MetricCard.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { useSupportMetrics, PeriodSwitcher, type Ticket } from '../SupportOverviewShared.js';
import './BlissReports.css';

const statusVariant = (status: Ticket['status']) => status === 'RESOLVED' || status === 'CLOSED' ? 'success' : status === 'IN_PROGRESS' ? 'warning' : 'info';
const priorityVariant = (priority: Ticket['priority']) => priority === 'URGENT' ? 'error' : priority === 'HIGH' ? 'warning' : 'gray';

export const SLAComplianceReport: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod, tickets, loading, metrics, metricsLoading } = useSupportMetrics();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => tickets.filter(ticket => {
    const query = search.toLowerCase();
    return !query || ticket.ref.toLowerCase().includes(query) || ticket.customer.toLowerCase().includes(query) || (ticket.category ?? '').toLowerCase().includes(query);
  }), [tickets, search]);

  const columns: TableColumn<Ticket>[] = [
    { key: 'ref', header: 'Ticket', accessor: 'ref', sortable: true, render: ticket => <div><div className="font-semibold text-foreground">{ticket.ref}</div><div className="text-xs text-muted-foreground">{ticket.customer}</div></div> },
    { key: 'category', header: 'Category', accessor: 'category', sortable: true, hideAt: 'sm', render: ticket => ticket.category || 'Uncategorized' },
    { key: 'priority', header: 'Priority', accessor: 'priority', sortable: true, render: ticket => <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge> },
    { key: 'status', header: 'Status', accessor: 'status', sortable: true, render: ticket => <Badge variant={statusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge> },
    { key: 'created', header: 'Created', accessor: 'created_at', sortable: true, hideAt: 'md', render: ticket => new Date(ticket.created_at).toLocaleDateString() },
  ];

  const sla = metrics?.sla ?? 0;
  return (
    <div className="bliss-report-root">
      <div className="bliss-report-container">
        <PageHeader
          crumbs={['Bliss', 'Reports']}
          titlePlain="SLA compliance"
          titleEm="report"
          subtitle="Measured response, resolution and escalation performance from support tickets in the selected period."
          actions={<div className="flex flex-wrap items-center gap-2"><div className="flex gap-0.5 rounded-(--radius) border border-border bg-muted p-0.5"><PeriodSwitcher period={period} setPeriod={setPeriod} /></div><Button variant="outline" size="sm" onClick={() => navigate('/bliss/overview')}><Icon name="activity" size={14} /> Overview</Button></div>}
        />

        <MetricsRow cards={[
          { title: 'SLA compliance', value: metrics ? `${sla}%` : '—', icon: 'shield', barHighlight: 'var(--green)', comparisonLabel: `${period} reporting period`, progress: sla, progressLabel: 'Tickets within SLA', loading: metricsLoading, emphasis: 'primary' },
          { title: 'Average first reply', value: metrics ? `${metrics.firstReply}h` : '—', icon: 'clock', barHighlight: 'var(--blue)', progress: metrics ? Math.min(100, (2 / Math.max(metrics.firstReply, 0.01)) * 100) : undefined, progressLabel: 'Against <2h target', loading: metricsLoading },
          { title: 'Average solve time', value: metrics ? `${metrics.resolution}h` : '—', icon: 'timer', barHighlight: 'var(--gold)', progress: metrics ? Math.min(100, (8 / Math.max(metrics.resolution, 0.01)) * 100) : undefined, progressLabel: 'Against <8h target', loading: metricsLoading },
          { title: 'Escalation rate', value: metrics ? `${metrics.escalation}%` : '—', icon: 'alertTriangle', barHighlight: 'var(--red)', loading: metricsLoading },
          { title: 'Defect rate', value: metrics ? `${metrics.defect}%` : '—', icon: 'warning', barHighlight: 'var(--red)', loading: metricsLoading, sub1Label: 'MEASURE', sub1Value: 'Reopened or escalated', emphasis: 'subtle' },
        ]} />

        <SearchToolbar search={search} onSearch={setSearch} placeholder="Search tickets…" />
        <DataTable
          columns={columns}
          rows={filtered}
          loading={loading}
          filteredEmpty={!!search && filtered.length === 0}
          empty={!loading && tickets.length === 0}
          emptyIcon="shield"
          emptyTitle="No tickets in this period"
          emptyMessage="SLA detail appears after support tickets are created."
          defaultSortKey="created"
          defaultSortDir="desc"
          pageSize={10}
          onRowClick={ticket => navigate(`/bliss/inbox?ticket=${ticket.id}`)}
        />
      </div>
    </div>
  );
};
