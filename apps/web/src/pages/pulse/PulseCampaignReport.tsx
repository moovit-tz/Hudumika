import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiError, CHANNEL_LABEL, fmtNum, fmtWhen, pct, StatusBadge, type Campaign } from './pulseShared.js';

interface Report {
  totals: Record<string, number>;
  variants: { variant: string; sent: number; opened: number; clicked: number }[];
  links: { position: number; url: string; click_count: number }[];
  timeline: { hour: string; type: 'open' | 'click'; n: number }[];
}
interface Recipient {
  id: string; recipient_name: string | null; address: string; variant: string | null; status: string; skip_reason: string | null;
  error: string | null; sent_at: string | null; opened_at: string | null; open_count: number; clicked_at: string | null;
  click_count: number; unsubscribed_at: string | null; bounced_at: string | null; source: string; source_id: string | null;
}

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

function recipientState(r: Recipient) {
  if (r.status === 'skipped') return { label: 'Skipped', variant: 'gray' as const, note: r.skip_reason };
  if (r.bounced_at || r.status === 'failed') return { label: 'Not delivered', variant: 'error' as const, note: r.error };
  if (r.unsubscribed_at) return { label: 'Unsubscribed', variant: 'warning' as const, note: null };
  if (r.clicked_at) return { label: 'Clicked', variant: 'success' as const, note: null };
  if (r.opened_at) return { label: 'Opened', variant: 'info' as const, note: null };
  if (r.status === 'sent') return { label: 'Sent', variant: 'gray' as const, note: null };
  return { label: 'Waiting', variant: 'gray' as const, note: r.status === 'held' ? 'Gets the A/B winner' : null };
}

/** Opens and clicks per hour as two thin bar rows; the table below holds the exact numbers. */
function Timeline({ points }: { points: Report['timeline'] }) {
  const hours = [...new Set(points.map((p) => p.hour))].sort();
  if (hours.length < 2) return <p className="pulse-muted">Activity over time appears once people start opening.</p>;
  const get = (h: string, t: string) => points.find((p) => p.hour === h && p.type === t)?.n ?? 0;
  const max = Math.max(...points.map((p) => p.n), 1);
  return (
    <div className="pulse-timeline" role="img" aria-label={`Opens and clicks per hour over ${hours.length} hours`}>
      {hours.map((h) => (
        <div key={h} className="pulse-tl-col" title={`${new Date(h).toLocaleString()}: ${get(h, 'open')} opens, ${get(h, 'click')} clicks`}>
          <span className="pulse-tl-bar pulse-tl-open" style={{ height: `${(get(h, 'open') / max) * 100}%` }} />
          <span className="pulse-tl-bar pulse-tl-click" style={{ height: `${(get(h, 'click') / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export function PulseCampaignReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState<Campaign | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  usePageSEO(c?.name ?? 'Campaign report', 'Who got a Pulse campaign and what they did with it.');

  const load = useCallback(() => {
    apiFetch(`/v1/pulse/campaigns/${id}`).then((r: any) => {
      if (r.data.status === 'draft') navigate(`/pulse/campaigns/${id}/edit`, { replace: true });
      else setC(r.data);
    }).catch((e) => showAlert(apiError(e), { variant: 'error' }));
    apiFetch(`/v1/pulse/campaigns/${id}/report`).then((r: any) => setReport(r.data)).catch(() => {});
  }, [id, navigate]);
  useEffect(() => { load(); }, [load]);
  // While it is going out, refresh every 15 seconds.
  useEffect(() => {
    if (c?.status !== 'sending' && c?.status !== 'scheduled') return;
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [c?.status, load]);

  useEffect(() => {
    setLoadingList(true);
    const t = window.setTimeout(() => {
      const qs = new URLSearchParams({ limit: '100' });
      if (filter !== 'all') qs.set('filter', filter);
      if (q.trim()) qs.set('q', q.trim());
      apiFetch(`/v1/pulse/campaigns/${id}/recipients?${qs}`).then((r: any) => setRecipients(r.data)).catch(() => setRecipients([])).finally(() => setLoadingList(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [id, filter, q, report]);

  async function act(path: 'cancel' | 'duplicate') {
    if (path === 'cancel' && !(await showConfirm(c?.status === 'scheduled' ? 'Unschedule this campaign? It goes back to being a draft.' : 'Stop sending? People who already got it keep it; nobody else will.', { title: 'Cancel campaign', variant: 'danger', confirmLabel: 'Cancel campaign', cancelLabel: 'Keep going' }))) return;
    try {
      const r: any = await apiFetch(`/v1/pulse/campaigns/${id}/${path}`, { method: 'POST' });
      if (path === 'duplicate' || r.data?.status === 'draft') navigate(`/pulse/campaigns/${r.data.id}/edit`);
      else load();
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  if (!c || !report) return <SectionLoading />;
  const t = report.totals;
  const isEmail = c.channel === 'email';
  const canCancel = PUBLISH_ROLES.includes(user?.role ?? '') && (c.status === 'scheduled' || c.status === 'sending');

  const columns: TableColumn<Recipient>[] = [
    { key: 'name', header: 'Recipient', render: (r) => (
      <div className="pulse-person">
        <PersonAvatar userId={r.source_id} kind={r.source === 'leads' ? 'leads' : r.source === 'customers' ? 'customers' : 'contacts'} name={r.recipient_name || r.address} size={28} />
        <div><div className="pulse-strong">{r.recipient_name || r.address}</div><div className="pulse-muted">{r.address}</div></div>
      </div>
    ) },
    { key: 'state', header: 'Result', render: (r) => { const s = recipientState(r); return <div><Badge variant={s.variant}>{s.label}</Badge>{s.note && <div className="pulse-muted">{s.note}</div>}</div>; } },
    ...(c.ab_test ? [{ key: 'variant', header: 'Subject', hideAt: 'sm' as const, render: (r: Recipient) => r.variant ?? '—' }] : []),
    { key: 'opens', header: 'Opens', align: 'right', hideAt: 'md', render: (r) => (isEmail ? r.open_count : '—') },
    { key: 'clicks', header: 'Clicks', align: 'right', hideAt: 'md', render: (r) => r.click_count },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', { label: 'Campaigns', to: '/pulse/campaigns' }, c.name]} title={c.name}
        subtitle={`${CHANNEL_LABEL[c.channel]} campaign · ${c.status === 'scheduled' ? `sends ${c.scheduled_at ? fmtWhen(c.scheduled_at) : 'within a minute'}` : c.sent_at ? `finished ${fmtWhen(c.sent_at)}` : c.started_at ? `started ${fmtWhen(c.started_at)}` : 'not started'}`}
        actions={<>
          <StatusBadge status={c.status} />
          {c.journey_id
            ? <Button variant="outline" onClick={() => navigate(`/pulse/journeys/${c.journey_id}`)}><Icon name="gitBranch" size={14} /> Open journey</Button>
            : <Button variant="outline" onClick={() => act('duplicate')}><Icon name="copy" size={14} /> Duplicate</Button>}
          {canCancel && !c.journey_id && <Button variant="outline" onClick={() => act('cancel')}><Icon name="x" size={14} /> {c.status === 'scheduled' ? 'Unschedule' : 'Stop sending'}</Button>}
        </>} />

      {c.last_error && <p className="pulse-note pulse-note-warn" role="alert">{c.last_error}</p>}
      {t.simulated > 0 && (
        <p className="pulse-note pulse-note-warn">
          {fmtNum(t.simulated)} {t.simulated === 1 ? 'email was' : 'emails were'} only simulated because this workspace has no email server set up. Add one in Admin ▸ Settings ▸ Email.
        </p>
      )}

      <div className="pulse-kpis">
        <div className="pulse-kpi"><span>Sent</span><strong>{fmtNum(t.sent)}</strong><small>of {fmtNum(t.audience)} in the audience</small></div>
        {isEmail && <div className="pulse-kpi"><span>Opened</span><strong>{pct(t.opened, t.sent)}</strong><small>{fmtNum(t.opened)} people</small></div>}
        <div className="pulse-kpi"><span>Clicked</span><strong>{pct(t.clicked, t.sent)}</strong><small>{fmtNum(t.clicked)} people</small></div>
        {isEmail && <div className="pulse-kpi"><span>Unsubscribed</span><strong>{pct(t.unsubscribed, t.sent)}</strong><small>{fmtNum(t.unsubscribed)} people</small></div>}
        <div className="pulse-kpi"><span>Not delivered</span><strong>{fmtNum(t.failed)}</strong><small>{fmtNum(t.skipped)} skipped (opted out)</small></div>
      </div>
      {isEmail && <p className="pulse-muted pulse-footnote">Opens are a lower bound: some inboxes block the tracking image. A click always counts as an open.</p>}

      <div className="pulse-split">
        <SectionCard title="Activity by hour" collapsible={false}>
          <Timeline points={report.timeline} />
          <div className="pulse-legend"><span className="pulse-key pulse-tl-open" /> Opens <span className="pulse-key pulse-tl-click" /> Clicks</div>
        </SectionCard>
        {c.ab_test ? (
          <SectionCard title="Subject test" collapsible={false}>
            <ul className="pulse-variants">
              {report.variants.map((x) => {
                const subject = c.ab_test!.variants.find((y) => y.key === x.variant)?.subject;
                const won = c.ab_test!.winner_key === x.variant;
                return (
                  <li key={x.variant}>
                    <div className="pulse-strong">{x.variant}: {subject} {won && <Badge variant="success">Winner</Badge>}</div>
                    <div className="pulse-muted">{fmtNum(x.sent)} sent · {pct(x.opened, x.sent)} opened · {pct(x.clicked, x.sent)} clicked</div>
                  </li>
                );
              })}
            </ul>
            {!c.ab_test.winner_key && <p className="pulse-muted">The winner is picked {c.ab_test.decide_after_hours} {c.ab_test.decide_after_hours === 1 ? 'hour' : 'hours'} after sending starts, by {c.ab_test.metric === 'click' ? 'clicks' : 'opens'}.</p>}
          </SectionCard>
        ) : (
          <SectionCard title="Links" collapsible={false}>
            {report.links.length === 0 ? <p className="pulse-muted">This message has no links.</p> : (
              <ol className="pulse-links">
                {report.links.map((l) => (
                  <li key={l.position}><span className="pulse-link-url" title={l.url}>{l.url}</span><strong>{fmtNum(l.click_count)}</strong></li>
                ))}
              </ol>
            )}
          </SectionCard>
        )}
      </div>

      <SectionCard title="Recipients" padded={false} collapsible={false}
        action={<div className="pulse-filters pulse-filters-inline">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Show recipients" className="pulse-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {isEmail && <SelectItem value="opened">Opened</SelectItem>}
              <SelectItem value="clicked">Clicked</SelectItem>
              {isEmail && <SelectItem value="unsubscribed">Unsubscribed</SelectItem>}
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="failed">Not delivered</SelectItem>
            </SelectContent>
          </Select>
          <Input aria-label="Search recipients" className="pulse-search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>}>
        <DataTable columns={columns} rows={recipients} loading={loadingList}
          empty={!loadingList && recipients.length === 0 && filter === 'all' && !q} emptyIcon="users" emptyTitle="No recipients yet"
          emptyMessage={c.status === 'scheduled' ? 'The audience is worked out when the campaign starts sending.' : 'Nobody was in the audience when it sent.'}
          filteredEmpty={!loadingList && recipients.length === 0 && (filter !== 'all' || !!q)} />
      </SectionCard>
    </div>
  );
}
