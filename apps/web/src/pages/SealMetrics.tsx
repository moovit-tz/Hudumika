import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader } from '../components/ui/card.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Progress } from '../components/ui/progress.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { CUSTOMS_STATUS_VARIANT } from '../lib/sealStatus.js';
import './Seal.css';
import './SealMetrics.css';
interface Metrics {
    totals: {
        lots: number;
        consignments: number;
        pendingExams: number;
        activeTransfers: number;
        expiredLots: number;
        nearExpiryLots: number;
    };
    movementsActivity: Array<{
        date: string;
        count: string;
    }>;
    statusBreakdown: Array<{
        customs_status: string;
        count: string;
    }>;
}
const number = (value: number) => value.toLocaleString();
const dayLabel = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export function SealMetrics() {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setMetrics(await apiFetch<Metrics>('/v1/seal/analytics'));
            setUpdatedAt(new Date());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to load warehouse metrics.');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    const activity = metrics?.movementsActivity.map(row => ({ date: row.date.slice(0, 10), count: Number(row.count) })) ?? [];
    const movementTotal = activity.reduce((sum, row) => sum + row.count, 0);
    const statusTotal = metrics?.statusBreakdown.reduce((sum, row) => sum + Number(row.count), 0) ?? 0;
    const peak = activity.reduce((best, row) => row.count > best.count ? row : best, { date: '', count: 0 });
    function exportReport() {
        if (!metrics)
            return;
        const rows = [['Section', 'Metric / date', 'Value'], ...Object.entries(metrics.totals).map(([key, value]) => ['Snapshot', key, String(value)]), ...activity.map(row => ['Movement', row.date, String(row.count)]), ...metrics.statusBreakdown.map(row => ['Customs status', CUSTOMS_STATUS_LABELS[row.customs_status as CustomsStatus] ?? row.customs_status, row.count])];
        const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `seal-operational-report-${updatedAt?.toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }
    const summaries: Array<{
        label: string;
        value: number;
        icon: IconName;
        detail: string;
        path: string;
    }> = metrics ? [
        { label: 'Lots in the workspace', value: metrics.totals.lots, icon: 'package', detail: 'Explore lots & batches', path: '/seal/lots' },
        { label: 'Consignments', value: metrics.totals.consignments, icon: 'truck', detail: 'View receiving activity', path: '/seal/consignments' },
        { label: 'Active transfers', value: metrics.totals.activeTransfers, icon: 'arrowRight', detail: 'Track stock in transit', path: '/seal/stock-transfers' },
    ] : [];
    return <div className="seal-page seal-metrics">
    <PageHeader crumbs={['SEAL', 'Analytics', 'Metrics']} titlePlain="Operational" titleEm="reports" subtitle="A clear view of your stock, warehouse activity and what needs attention." actions={<><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><Icon name="refresh" size={15}/>Refresh</Button><Button size="sm" onClick={exportReport} disabled={!metrics || loading}><Icon name="download" size={15}/>Export report</Button></>}/>
    <div className="sm-context"><span><Icon name="warehouse" size={15}/>All warehouses <span aria-hidden="true">/</span> Workspace overview</span><span>{loading ? 'Updating snapshot…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Snapshot unavailable'}</span></div>
    {error && <Banner variant="error">{error}{metrics ? ' Showing the last successful snapshot.' : ' Refresh to try again.'}</Banner>}
    {loading && !metrics ? <SectionLoading /> : !metrics ? <Card><CardContent className="sm-empty"><Icon name="barChart" size={32}/><h2>Metrics are unavailable</h2><p>Refresh to reconnect to your warehouse reports.</p><Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></CardContent></Card> : <>
      <div className="sm-kpis">{summaries.map(item => <Card key={item.label}><CardContent className="sm-kpi"><div className="sm-kpi-top"><span>{item.label}</span><FeaturedIcon size="sm"><Icon name={item.icon} size={17}/></FeaturedIcon></div><strong>{number(item.value)}</strong><Link to={item.path}>{item.detail}<Icon name="arrowUpRight" size={14}/></Link></CardContent></Card>)}</div>
      <div className="sm-main-grid">
        <Card><CardHeader><div className="sm-heading"><div><span className="sm-eyebrow">WAREHOUSE PULSE</span><h2>Movement activity</h2></div><Badge variant="gray">Last 30 days</Badge></div><div className="sm-total"><strong>{number(movementTotal)}</strong><span>recorded movements</span></div></CardHeader><CardContent>
          {movementTotal > 0 ? <div className="sm-chart" role="img" aria-label={`${number(movementTotal)} movements in the last 30 days. Peak: ${number(peak.count)} on ${dayLabel(peak.date)}.`}><ResponsiveContainer width="100%" height="100%"><BarChart data={activity} margin={{ top: 10, right: 0, bottom: 0, left: -24 }}><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5"/><XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: 'var(--ink3)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={32}/><YAxis allowDecimals={false} tick={{ fill: 'var(--ink3)', fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={label => dayLabel(String(label))} cursor={{ fill: 'var(--teal-l)' }} contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--ink)' }}/><Bar dataKey="count" name="Movements" fill="var(--teal)" maxBarSize={36}/></BarChart></ResponsiveContainer></div> : <div className="sm-empty sm-chart"><FeaturedIcon variant="gray" size="lg"><Icon name="activity" size={22}/></FeaturedIcon><h3>No movements yet</h3><p>Activity will appear as stock is received, moved or dispatched.</p></div>}
          <div className="sm-chart-footer"><span>{peak.date ? <>Busiest day<strong>{dayLabel(peak.date)} · {number(peak.count)} movements</strong></> : 'Activity across all warehouses.'}</span><Link to="/seal/movements">Movement history<Icon name="arrowUpRight" size={14}/></Link></div>
        </CardContent></Card>
        <Card className="sm-attention"><CardHeader><span className="sm-eyebrow">OPERATIONAL CHECKLIST</span><h2>Needs attention</h2><p>Keep exceptions moving toward resolution.</p></CardHeader><CardContent>{([
                { label: 'Pending examinations', detail: 'Awaiting completion or waiver', value: metrics.totals.pendingExams, path: '/seal/examinations', icon: 'search', variant: 'warning' },
                { label: 'Expired lots', detail: 'Review expiry and next steps', value: metrics.totals.expiredLots, path: '/seal/lots', icon: 'alertCircle', variant: 'error' },
                { label: 'Expiring within 30 days', detail: 'Plan stock rotation early', value: metrics.totals.nearExpiryLots, path: '/seal/lots', icon: 'clock', variant: 'warning' },
            ] as const).map(item => <Link className="sm-attention-row" to={item.path} key={item.label}><FeaturedIcon size="sm" variant={item.variant}><Icon name={item.icon} size={16}/></FeaturedIcon><span><b>{item.label}</b><small>{item.detail}</small></span><strong>{number(item.value)}</strong><Icon name="arrowUpRight" size={14}/></Link>)}<div className="sm-note"><Icon name="info" size={15}/><span>Examinations and expiry are separate checks and may include the same lot.</span></div></CardContent></Card>
      </div>
      <Card><CardHeader><div className="sm-heading"><div><span className="sm-eyebrow">INVENTORY COMPOSITION</span><h2>Customs status</h2></div><Badge variant="brand">{number(statusTotal)} lots</Badge></div></CardHeader><CardContent>{metrics.statusBreakdown.length ? <div className="sm-status-grid">{metrics.statusBreakdown.map(row => { const count = Number(row.count); const pct = statusTotal ? count / statusTotal * 100 : 0; const status = row.customs_status as CustomsStatus; return <div className="sm-status" key={status}><div><Badge variant={CUSTOMS_STATUS_VARIANT[status] ?? 'gray'}>{CUSTOMS_STATUS_LABELS[status] ?? status}</Badge><span>{pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%</span></div><strong>{number(count)}<small> lots</small></strong><Progress value={pct} aria-label={`${CUSTOMS_STATUS_LABELS[status] ?? status} share of lots`}/></div>; })}</div> : <p className="sm-no-status">Status distribution will appear once lots are recorded.</p>}</CardContent></Card>
    </>}
  </div>;
}
