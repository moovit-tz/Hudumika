import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { MetricCard } from '../../components/MetricCard.js';
import { CompanyAvatar, PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Switch } from '../../components/ui/switch.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { DateTimePicker } from '../../components/ui/date-picker.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiError, fmtNum, fmtWhen } from './pulseShared.js';

type Network = 'facebook' | 'instagram' | 'linkedin' | 'x';
interface Account {
  id: string;
  network: Network;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  status: 'connected' | 'expired';
  last_error: string | null;
}
interface Target {
  post_id: string;
  account_id: string;
  body_override: string | null;
  status: 'pending' | 'published' | 'failed';
  external_url: string | null;
  error: string | null;
  metrics: Record<string, number> | null;
  network: Network;
  name: string;
  avatar_url: string | null;
}
interface Post {
  id: string;
  status: string;
  body: string;
  link_url: string | null;
  image_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  created_by_avatar: string | null;
  targets: Target[];
}

const NETWORK: Record<Network, { label: string; limit: number }> = {
  facebook: { label: 'Facebook', limit: 63206 },
  instagram: { label: 'Instagram', limit: 2200 },
  linkedin: { label: 'LinkedIn', limit: 3000 },
  x: { label: 'X', limit: 280 },
};

const PROVIDERS: { key: 'meta' | 'linkedin' | 'x'; label: string; note: string }[] = [
  { key: 'meta', label: 'Facebook & Instagram', note: 'Pages you manage, and the Instagram business accounts linked to them.' },
  { key: 'linkedin', label: 'LinkedIn', note: 'Company pages where you are an admin.' },
  { key: 'x', label: 'X', note: 'Your X profile.' },
];

const POST_STATUS: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', variant: 'gray' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  publishing: { label: 'Posting…', variant: 'warning' },
  published: { label: 'Posted', variant: 'success' },
  partly_published: { label: 'Partly posted', variant: 'warning' },
  failed: { label: 'Failed', variant: 'error' },
  cancelled: { label: 'Cancelled', variant: 'gray' },
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Posted' },
  { key: 'draft', label: 'Drafts' },
  { key: 'failed', label: 'Failed' },
];

const NETWORK_FILTERS: { key: 'all' | Network; label: string }[] = [
  { key: 'all', label: 'All networks' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X' },
];

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
const DELETABLE_STATUSES = ['draft', 'failed', 'cancelled'];

function AccountChip({ a }: { a: { network: Network; name: string; avatar_url: string | null } }) {
  return (
    <span className="pulse-person">
      <CompanyAvatar name={a.name} logoUrl={a.avatar_url} size={22} />
      <span>{a.name}</span>
      <span className="pulse-muted">· {NETWORK[a.network].label}</span>
    </span>
  );
}

function useAccounts() {
  const [d, setD] = useState<{ available: Record<string, boolean>; accounts: Account[] } | null>(null);
  const load = useCallback(
    () =>
      apiFetch('/v1/pulse/social/accounts')
        .then((r: any) => setD(r.data))
        .catch(() => setD({ available: {}, accounts: [] })),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  return [d, load] as const;
}

export function PulseSocial() {
  usePageSEO('Social Publishing', 'Plan, customize, schedule, and measure posts across Facebook, Instagram, LinkedIn, and X.');
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPublish = PUBLISH_ROLES.includes(user?.role ?? '');
  const [acc, reloadAccounts] = useAccounts();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [networkFilter, setNetworkFilter] = useState<'all' | Network>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(
    () =>
      apiFetch('/v1/pulse/social/posts')
        .then((r: any) => setPosts(r.data))
        .catch((e) => {
          showAlert(apiError(e), { variant: 'error' });
          setPosts([]);
        }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function connect(provider: string) {
    try {
      const r: any = await apiFetch(`/v1/pulse/social/connect/${provider}`, { method: 'POST' });
      window.location.assign(r.data.url);
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    }
  }

  async function disconnect(a: Account) {
    if (
      !(await showConfirm(
        `Disconnect ${a.name}? Pulse will no longer be able to post as this account. Scheduled posts to it will fail until you reconnect.`,
        { title: 'Disconnect account', variant: 'danger', confirmLabel: 'Disconnect' },
      ))
    )
      return;
    try {
      await apiFetch(`/v1/pulse/social/accounts/${a.id}`, { method: 'DELETE' });
      reloadAccounts();
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    }
  }

  async function removePost(p: Post) {
    if (
      !(await showConfirm('Delete this post permanently? This cannot be undone.', {
        title: 'Delete post',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    )
      return;
    try {
      await apiFetch(`/v1/pulse/social/posts/${p.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    }
  }

  const accounts = acc?.accounts ?? [];

  const stats = useMemo(() => {
    const list = posts ?? [];
    let published = 0;
    let scheduled = 0;
    let drafts = 0;
    let publishing = 0;
    let deliveredTargets = 0;
    let failedTargets = 0;
    let engagement = 0;
    let trackedPosts = 0;

    for (const p of list) {
      if (p.status === 'published' || p.status === 'partly_published') published++;
      else if (p.status === 'scheduled') scheduled++;
      else if (p.status === 'draft') drafts++;
      else if (p.status === 'publishing') publishing++;

      let postHasMetrics = false;
      for (const t of p.targets) {
        if (t.status === 'published') deliveredTargets++;
        if (t.status === 'failed') failedTargets++;
        if (t.metrics) {
          for (const val of Object.values(t.metrics)) {
            if (typeof val === 'number') {
              engagement += val;
              postHasMetrics = true;
            }
          }
        }
      }
      if (postHasMetrics) trackedPosts++;
    }

    const healthy = accounts.filter((a) => a.status === 'connected').length;
    const expired = accounts.filter((a) => a.status === 'expired').length;
    const activeNetworks = new Set(accounts.map((a) => a.network)).size;

    return { published, scheduled, drafts, publishing, deliveredTargets, failedTargets, engagement, trackedPosts, healthy, expired, activeNetworks };
  }, [posts, accounts]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter((p) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'published' && p.status !== 'published' && p.status !== 'partly_published') return false;
        if (statusFilter !== 'published' && p.status !== statusFilter) return false;
      }
      if (networkFilter !== 'all' && !p.targets.some((t) => t.network === networkFilter)) return false;
      if (q) {
        const hay = `${p.body} ${p.link_url ?? ''} ${p.targets.map((t) => `${t.name} ${t.network}`).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, statusFilter, networkFilter, query]);

  // Group by day: drafts first, then upcoming, then past.
  const groups = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of filteredPosts) {
      const key =
        p.status === 'draft'
          ? 'Drafts'
          : new Date(p.published_at ?? p.scheduled_at ?? p.created_at).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            });
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return [...m.entries()];
  }, [filteredPosts]);

  return (
    <div className="pulse-page">
      <PageHeader
        crumbs={[{ label: 'Marketing', to: '/pulse' }, 'Social']}
        titlePlain="Social"
        titleEm="Publishing"
        subtitle="Plan, customize, schedule, and measure posts across Facebook, Instagram, LinkedIn, and X from one unified calendar."
        actions={
          <div className="pulse-header-bar">
            <Button variant="outline" size="sm" onClick={() => navigate('/pulse/links')}>
              <Icon name="link" size={13} /> Link builder
            </Button>
            <Button size="sm" onClick={() => navigate('/pulse/social/new')} disabled={!accounts.length}>
              <Icon name="plus" size={13} /> New post
            </Button>
          </div>
        }
      />

      {/* Executive Social KPIs */}
      <div className="pulse-metrics">
        <MetricCard
          title="Published posts"
          value={fmtNum(stats.published)}
          sub1Label="Target deliveries"
          sub1Value={fmtNum(stats.deliveredTargets)}
          sub2Label="Failed targets"
          sub2Value={fmtNum(stats.failedTargets)}
          icon="send"
          emphasis="primary"
        />
        <MetricCard
          title="Scheduled queue"
          value={fmtNum(stats.scheduled)}
          sub1Label="Drafts saved"
          sub1Value={fmtNum(stats.drafts)}
          sub2Label="In progress"
          sub2Value={fmtNum(stats.publishing)}
          icon="calendar"
        />
        <MetricCard
          title="Total engagement"
          value={fmtNum(stats.engagement)}
          sub1Label="Active networks"
          sub1Value={fmtNum(stats.activeNetworks)}
          sub2Label="Tracked posts"
          sub2Value={fmtNum(stats.trackedPosts)}
          icon="activity"
        />
        <MetricCard
          title="Connected profiles"
          value={fmtNum(accounts.length)}
          sub1Label="Healthy"
          sub1Value={fmtNum(stats.healthy)}
          sub2Label="Needs reconnect"
          sub2Value={fmtNum(stats.expired)}
          icon="share"
        />
      </div>

      {/* Filter & Search Toolbar */}
      <div className="pulse-social-toolbar">
        <div className="pulse-social-toolbar-filters">
          <div className="pulse-time-toggle" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`pulse-time-btn ${statusFilter === s.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(s.key)}
                data-ui-native-button=""
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="pulse-time-toggle" role="group" aria-label="Filter by network">
            {NETWORK_FILTERS.map((n) => (
              <button
                key={n.key}
                type="button"
                className={`pulse-time-btn ${networkFilter === n.key ? 'active' : ''}`}
                onClick={() => setNetworkFilter(n.key)}
                data-ui-native-button=""
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pulse-social-search">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts or accounts…"
            aria-label="Search social posts"
          />
        </div>
      </div>

      {/* Main Split: Calendar Stream + Connected Profiles */}
      <div className="pulse-split">
        <SectionCard
          title={`Publishing calendar${posts ? ` (${filteredPosts.length})` : ''}`}
          collapsible={false}
          action={
            accounts.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => navigate('/pulse/social/new')}>
                <Icon name="plus" size={13} /> Compose
              </Button>
            ) : undefined
          }
        >
          {!posts ? (
            <SectionLoading />
          ) : posts.length === 0 ? (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginBottom: 16 }}>
                {accounts.length
                  ? 'Your social calendar is empty. Draft your first post and publish or schedule across connected profiles.'
                  : 'Connect your company social accounts on the right to start drafting and scheduling posts.'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--card-radius, 12px)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="share" size={16} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>1. Connect profiles</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Link Facebook Pages, Instagram, LinkedIn, or X using the panel on the right.</div>
                </div>
                <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--card-radius, 12px)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="edit" size={16} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>2. Tailor per network</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Write once and override copy per platform with live character limit checks.</div>
                </div>
                <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--card-radius, 12px)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="calendar" size={16} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>3. Schedule & track</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Publish now or queue for later and monitor reactions and link attribution.</div>
                </div>
              </div>
              {accounts.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Button size="sm" onClick={() => navigate('/pulse/social/new')}>
                    <Icon name="plus" size={13} /> Write first post
                  </Button>
                </div>
              )}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No posts match the selected filters.
            </div>
          ) : (
            <div className="pulse-agenda">
              {groups.map(([day, list]) => (
                <section key={day}>
                  <h3 className="pulse-agenda-day">{day}</h3>
                  <ul className="pulse-agenda-list">
                    {list.map((p) => {
                      const timeSource = p.published_at ?? p.scheduled_at;
                      const timeText =
                        p.status === 'draft' || !timeSource
                          ? 'Draft'
                          : new Date(timeSource).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                      const canDelete = DELETABLE_STATUSES.includes(p.status);
                      return (
                        <li key={p.id}>
                          <article className="pulse-social-post-card">
                            <div className="pulse-social-post-head">
                              <div className="pulse-social-post-meta">
                                <span className="pulse-social-time">
                                  <Icon name="clock" size={12} color="var(--ink3)" />
                                  {timeText}
                                </span>
                                {p.created_by_name && (
                                  <span className="pulse-person">
                                    <PersonAvatar userId={p.created_by} name={p.created_by_name} src={p.created_by_avatar} size={20} />
                                    <span>{p.created_by_name}</span>
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Badge variant={POST_STATUS[p.status]?.variant ?? 'gray'}>
                                  {POST_STATUS[p.status]?.label ?? p.status}
                                </Badge>
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/pulse/social/${p.id}`)} aria-label="Open post">
                                  <Icon name="edit" size={13} />
                                </Button>
                                {canDelete && (
                                  <Button variant="ghost" size="sm" onClick={() => removePost(p)} aria-label="Delete post">
                                    <Icon name="trash2" size={13} />
                                  </Button>
                                )}
                              </div>
                            </div>

                            <Link to={`/pulse/social/${p.id}`} className="pulse-social-post-link">
                              <p className="pulse-social-post-body">
                                {p.body ? `${p.body.slice(0, 240)}${p.body.length > 240 ? '…' : ''}` : p.image_url ? 'Image post' : 'Empty draft'}
                              </p>
                            </Link>

                            {(p.image_url || p.link_url) && (
                              <div className="pulse-social-post-attachments">
                                {p.image_url && (
                                  <span className="pulse-social-attach-pill">
                                    <Icon name="image" size={12} color="var(--teal)" />
                                    Image attached
                                  </span>
                                )}
                                {p.link_url && (
                                  <span className="pulse-social-attach-pill" title={p.link_url}>
                                    <Icon name="link" size={12} color="var(--teal)" />
                                    {p.link_url}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="pulse-social-post-targets">
                              {p.targets.length === 0 ? (
                                <span className="pulse-muted">No accounts chosen yet</span>
                              ) : (
                                p.targets.map((t) => {
                                  const metricText =
                                    t.metrics && Object.keys(t.metrics).length > 0
                                      ? Object.entries(t.metrics)
                                          .map(([k, v]) => `${fmtNum(v)} ${k}`)
                                          .join(' · ')
                                      : null;
                                  return (
                                    <span key={t.account_id} className="pulse-social-target-pill" data-status={t.status}>
                                      <CompanyAvatar name={t.name} logoUrl={t.avatar_url} size={18} />
                                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
                                      <span className="pulse-muted">· {NETWORK[t.network].label}</span>
                                      {metricText && <span style={{ color: 'var(--teal)', fontWeight: 600 }}>· {metricText}</span>}
                                      {t.status === 'failed' && <Icon name="alertTriangle" size={12} color="var(--red)" />}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={`Connected accounts (${accounts.length})`}
          collapsible={false}
          action={
            stats.expired > 0 ? <Badge variant="warning">{stats.expired} need reconnect</Badge> : undefined
          }
        >
          {!acc ? (
            <SectionLoading />
          ) : (
            <div className="pulse-form">
              {accounts.length === 0 ? (
                <p className="pulse-muted" style={{ margin: 0 }}>
                  No social profiles connected yet. Choose a network below to authorize posting.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {accounts.map((a) => (
                    <div key={a.id} className="pulse-social-account-card">
                      <div className="pulse-social-account-top">
                        <div className="pulse-social-account-info">
                          <CompanyAvatar name={a.name} logoUrl={a.avatar_url} size={30} />
                          <div style={{ minWidth: 0 }}>
                            <div className="pulse-social-account-name" title={a.name}>
                              {a.name}
                            </div>
                            <div className="pulse-social-account-sub">
                              {NETWORK[a.network].label}
                              {a.handle ? ` · ${a.handle}` : ''}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <Badge variant={a.status === 'expired' ? 'warning' : 'success'}>
                            {a.status === 'expired' ? 'Reconnect' : 'Connected'}
                          </Badge>
                          {canPublish && (
                            <Button variant="ghost" size="icon" aria-label={`Disconnect ${a.name}`} onClick={() => disconnect(a)}>
                              <Icon name="x" size={14} />
                            </Button>
                          )}
                        </div>
                      </div>
                      {a.last_error && (
                        <div className="pulse-note pulse-note-warn" style={{ fontSize: 12 }}>
                          {a.last_error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink3)' }}>
                  Add network
                </span>
                {PROVIDERS.map((p) => (
                  <div key={p.key} className="pulse-social-provider-card">
                    <div style={{ minWidth: 0 }}>
                      <div className="pulse-strong" style={{ fontSize: 13 }}>
                        {p.label}
                      </div>
                      <div className="pulse-muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {acc.available[p.key]
                          ? p.note
                          : 'Not available on this platform yet — the Hudumika team needs to register a developer app with this network.'}
                      </div>
                    </div>
                    {canPublish && (
                      <Button variant="outline" size="sm" disabled={!acc.available[p.key]} onClick={() => connect(p.key)}>
                        Connect
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/** Where each network sends the person back after they approve access. */
export function PulseSocialCallback() {
  const { provider } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState('Finishing the connection…');
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const code = params.get('code'),
      state = params.get('state'),
      denied = params.get('error_description') || params.get('error');
    if (denied || !code || !state) {
      setMsg(denied ? `The connection wasn’t approved: ${denied}` : 'The connection came back incomplete.');
      return;
    }
    apiFetch(`/v1/pulse/social/callback/${provider}`, { method: 'POST', body: JSON.stringify({ code, state }) })
      .then((r: any) => {
        showAlert(`Connected: ${r.data.connected.map((c: any) => c.name).join(', ')}`, { variant: 'success' });
        navigate('/pulse/social', { replace: true });
      })
      .catch((e) => setMsg(apiError(e)));
  }, [provider, params, navigate]);
  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', { label: 'Social', to: '/pulse/social' }, 'Connect']} title="Connecting account" />
      <SectionCard collapsible={false}>
        <p className="pulse-note" role="status">
          {msg}
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="outline" onClick={() => navigate('/pulse/social')}>
            Back to Social
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

export function PulseSocialComposer() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPublish = PUBLISH_ROLES.includes(user?.role ?? '');
  const [acc] = useAccounts();
  const [post, setPost] = useState<Post | null>(null);
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState<Date | undefined>();
  const [busy, setBusy] = useState(false);
  usePageSEO(isNew ? 'New social post' : 'Social post', 'Write, customize, preview, and schedule a social post.');

  const load = useCallback(() => {
    if (isNew) return;
    apiFetch('/v1/pulse/social/posts?from=2000-01-01&to=2100-01-01').then((r: any) => {
      const p = (r.data as Post[]).find((x) => x.id === id);
      if (!p) {
        showAlert('Post not found.', { variant: 'error' });
        return;
      }
      setPost(p);
      setBody(p.body);
      setLink(p.link_url ?? '');
      setImage(p.image_url ?? '');
      setChosen(p.targets.map((t) => t.account_id));
      setOverrides(
        Object.fromEntries(p.targets.filter((t) => t.body_override != null).map((t) => [t.account_id, t.body_override!])),
      );
    });
  }, [id, isNew]);
  useEffect(load, [load]);

  const editable = isNew || ['draft', 'failed', 'partly_published'].includes(post?.status ?? '');
  const canDelete = !isNew && DELETABLE_STATUSES.includes(post?.status ?? '');
  const accounts = acc?.accounts ?? [];

  async function save(): Promise<string | null> {
    setBusy(true);
    try {
      const payload = JSON.stringify({
        body,
        link_url: link || null,
        image_url: image || null,
        account_ids: chosen,
        overrides: Object.fromEntries(Object.entries(overrides).filter(([k]) => chosen.includes(k))),
      });
      const r: any = await apiFetch(isNew ? '/v1/pulse/social/posts' : `/v1/pulse/social/posts/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: payload,
      });
      return r.data.id;
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const pid = await save();
    if (!pid) return;
    const text = later && when ? `Schedule this post for ${when.toLocaleString()}?` : 'Post this now to the chosen accounts?';
    if (
      !(await showConfirm(text, {
        title: later ? 'Schedule post' : 'Post now',
        confirmLabel: later ? 'Schedule' : 'Post now',
        variant: 'warning',
      }))
    ) {
      if (isNew) navigate(`/pulse/social/${pid}`, { replace: true });
      return;
    }
    setBusy(true);
    try {
      const r: any = await apiFetch(`/v1/pulse/social/posts/${pid}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: later && when ? when.toISOString() : null }),
      });
      if (r.data?.status === 'failed' || r.data?.status === 'partly_published') {
        showAlert('Some accounts didn’t accept the post. See the reasons on the post.', { variant: 'warning' });
      }
      navigate(`/pulse/social/${pid}`, { replace: true });
      if (!isNew) load();
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeCurrentPost() {
    if (!id) return;
    if (
      !(await showConfirm('Delete this post permanently? This cannot be undone.', {
        title: 'Delete post',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    )
      return;
    setBusy(true);
    try {
      await apiFetch(`/v1/pulse/social/posts/${id}`, { method: 'DELETE' });
      navigate('/pulse/social', { replace: true });
    } catch (e) {
      showAlert(apiError(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!acc || (!isNew && !post)) return <SectionLoading />;

  const previewAccount = accounts.find((a) => chosen.includes(a.id)) ?? accounts[0] ?? null;

  return (
    <div className="pulse-page">
      <PageHeader
        variant="create"
        backTo="/pulse/social"
        backLabel="Social"
        crumbs={['Pulse', { label: 'Social', to: '/pulse/social' }, isNew ? 'New post' : 'Post']}
        title={isNew ? 'New post' : 'Social post'}
        actions={
          <div className="pulse-header-bar">
            {canDelete && (
              <Button variant="outline" size="sm" disabled={busy} onClick={removeCurrentPost}>
                <Icon name="trash2" size={13} /> Delete
              </Button>
            )}
            {editable ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    const pid = await save();
                    if (pid && isNew) navigate(`/pulse/social/${pid}`, { replace: true });
                    else if (pid) load();
                  }}
                >
                  Save draft
                </Button>
                {canPublish && (
                  <Button disabled={busy || !chosen.length || (later && !when)} onClick={publish}>
                    <Icon name="send" size={14} /> {later ? 'Schedule' : 'Post now'}
                  </Button>
                )}
              </>
            ) : post?.status === 'scheduled' && canPublish ? (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await apiFetch(`/v1/pulse/social/posts/${id}/cancel`, { method: 'POST' });
                    load();
                  } catch (e) {
                    showAlert(apiError(e), { variant: 'error' });
                  }
                }}
              >
                Unschedule
              </Button>
            ) : null}
          </div>
        }
      />

      {post && (
        <div className="pulse-social-post-meta">
          <Badge variant={POST_STATUS[post.status]?.variant ?? 'gray'}>{POST_STATUS[post.status]?.label ?? post.status}</Badge>
          {post.scheduled_at && post.status === 'scheduled' && <span>Goes out {fmtWhen(post.scheduled_at)}</span>}
          {post.published_at && <span>Posted {fmtWhen(post.published_at)}</span>}
          {post.created_by_name && (
            <span className="pulse-person">
              <PersonAvatar userId={post.created_by} name={post.created_by_name} src={post.created_by_avatar} size={20} />
              <span>{post.created_by_name}</span>
            </span>
          )}
        </div>
      )}

      <div className="pulse-split">
        <div className="pulse-stack">
          <SectionCard title="Compose post" collapsible={false}>
            <div className="pulse-form">
              <div className="pulse-field">
                <Label htmlFor="sp-body">Post copy</Label>
                <Textarea
                  id="sp-body"
                  rows={6}
                  value={body}
                  disabled={!editable}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Share an update, announcement, or campaign link…"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="pulse-muted">{body.length} characters</span>
                  <div className="pulse-limit-bar">
                    {(Object.keys(NETWORK) as Network[]).map((net) => {
                      const limit = NETWORK[net].limit;
                      return (
                        <span key={net} className="pulse-limit-pill" data-over={body.length > limit}>
                          {NETWORK[net].label}: {body.length}/{limit}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pulse-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Label htmlFor="sp-link">Link (optional)</Label>
                  <Link to="/pulse/links" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
                    Build UTM link
                  </Link>
                </div>
                <Input
                  id="sp-link"
                  value={link}
                  disabled={!editable}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://… — tag it with the link builder to credit this post"
                />
              </div>

              <div className="pulse-field">
                <Label htmlFor="sp-img">Image address (optional; Instagram needs one)</Label>
                <Input
                  id="sp-img"
                  value={image}
                  disabled={!editable}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://… a public image"
                />
              </div>

              {editable && canPublish && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <div className="pulse-ab-toggle">
                    <Switch id="sp-later" checked={later} onCheckedChange={setLater} />
                    <Label htmlFor="sp-later">Schedule for later</Label>
                  </div>
                  {later && (
                    <div className="pulse-field">
                      <Label>Publish date & time</Label>
                      <DateTimePicker date={when} onChange={setWhen} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Feed preview"
            collapsible={false}
            action={previewAccount ? <span className="pulse-muted">{NETWORK[previewAccount.network].label}</span> : undefined}
          >
            <div className="pulse-social-preview">
              <div className="pulse-social-preview-head">
                {previewAccount ? (
                  <CompanyAvatar name={previewAccount.name} logoUrl={previewAccount.avatar_url} size={32} />
                ) : (
                  <div className="pulse-channel-icon-wrap">
                    <Icon name="globe" size={16} />
                  </div>
                )}
                <div>
                  <div className="pulse-strong" style={{ fontSize: 13.5 }}>
                    {previewAccount?.name ?? 'Your workspace page'}
                  </div>
                  <div className="pulse-muted" style={{ fontSize: 11.5 }}>
                    {later && when ? `Scheduled · ${when.toLocaleString()}` : 'Just now · Public'}
                  </div>
                </div>
              </div>

              <p className="pulse-social-post-body">
                {body.trim() ? body : <span className="pulse-muted">Write post copy above to preview it here…</span>}
              </p>

              {image.trim() && (
                <img
                  src={image.trim()}
                  alt="Social post attachment preview"
                  className="pulse-social-preview-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}

              {link.trim() && (
                <div className="pulse-social-preview-linkbox">
                  <Icon name="link" size={14} color="var(--teal)" />
                  <span>{link.trim()}</span>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title={`Post to (${chosen.length})`}
          collapsible={false}
          action={
            editable && accounts.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChosen(chosen.length === accounts.length ? [] : accounts.map((a) => a.id))}
              >
                {chosen.length === accounts.length ? 'Clear all' : 'Select all'}
              </Button>
            ) : undefined
          }
        >
          {accounts.length === 0 ? (
            <p className="pulse-muted">
              No accounts connected. <Link to="/pulse/social">Connect one</Link>.
            </p>
          ) : (
            <ul className="pulse-targets">
              {accounts.map((a) => {
                const on = chosen.includes(a.id);
                const text = overrides[a.id] ?? body;
                const over = text.length > NETWORK[a.network].limit;
                const t = post?.targets.find((x) => x.account_id === a.id);
                return (
                  <li key={a.id} className="pulse-social-account-card">
                    <label className="pulse-target-head">
                      <Checkbox
                        checked={on}
                        disabled={!editable}
                        onCheckedChange={(v) => setChosen((c) => (v ? [...c, a.id] : c.filter((x) => x !== a.id)))}
                        aria-label={`Post to ${a.name} on ${NETWORK[a.network].label}`}
                      />
                      <AccountChip a={a} />
                    </label>
                    {on && (
                      <div className="pulse-target-body">
                        <span className={over ? 'pulse-note pulse-note-warn' : 'pulse-muted'}>
                          {text.length}/{NETWORK[a.network].limit}
                          {a.network === 'instagram' && !image ? ' · needs an image' : ''}
                        </span>
                        {editable &&
                          (overrides[a.id] == null ? (
                            <Button
                              variant="link"
                              className="pulse-link-btn"
                              onClick={() => setOverrides((o) => ({ ...o, [a.id]: body }))}
                            >
                              Write a different version for {NETWORK[a.network].label}
                            </Button>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <Textarea
                                aria-label={`Text for ${a.name}`}
                                rows={3}
                                value={overrides[a.id]}
                                onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                style={{ alignSelf: 'flex-start' }}
                                onClick={() =>
                                  setOverrides((o) => {
                                    const next = { ...o };
                                    delete next[a.id];
                                    return next;
                                  })
                                }
                              >
                                Reset to main copy
                              </Button>
                            </div>
                          ))}
                        {t?.status === 'failed' && <p className="pulse-note pulse-note-warn">{t.error}</p>}
                        {t?.status === 'published' && (
                          <p className="pulse-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {t.external_url ? (
                              <a href={t.external_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--teal)' }}>
                                View on {NETWORK[a.network].label} <Icon name="externalLink" size={12} />
                              </a>
                            ) : (
                              'Posted'
                            )}
                            {t.metrics &&
                              Object.keys(t.metrics).length > 0 &&
                              ` · ${Object.entries(t.metrics)
                                .map(([k, v]) => `${v.toLocaleString()} ${k}`)
                                .join(' · ')}`}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
