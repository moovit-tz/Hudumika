import { useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Input } from '../../components/ui/input.js';
import { Switch } from '../../components/ui/switch.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { CompanyAvatar } from '../../components/PersonAvatar.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { APP_REGISTRY } from '../../lib/appRegistry.js';
import { DEFAULT_APP_COLORS, type ShellAppId } from '../../lib/appDefaults.js';
import { LoadState, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, KpiGrid, KpiLink, Notice, Panel, Pill, TD, TR, appName } from './console-ui.js';

interface ProductItem {
  app: string;
  status: string;
  statusMessage?: string | null;
  openCases: number;
  activeIncidents: number;
  teams: Array<{ id: string; name: string }>;
}

const PRODUCT_ICONS: Record<string, IconName> = {
  clearos: 'truck',
  finops: 'dollarSign',
  nexushr: 'users',
  bliss: 'message',
  complyos: 'shield',
  crm: 'contact',
  cloud: 'folder',
  email: 'mail',
  contacts: 'contact',
  store: 'package',
  workspace: 'tool',
  admin: 'shield',
  ondi: 'userCheck',
  onesite: 'fileText',
  onsite: 'server',
  tracking: 'activity',
  demurrage: 'clock',
  cargotracker: 'truck',
  calendar: 'calendar',
  tasks: 'clipboardList',
  seal: 'archive',
  studio: 'layers',
  hudubi: 'barChart',
  petti: 'calculator',
  pos: 'receipt',
  sms: 'chatBubble',
  tuma: 'truck',
  lexcore: 'stamp',
  ngao: 'shield',
  lens: 'search',
  'design-system': 'color',
};

const APP_META_MAP = new Map(APP_REGISTRY.map(a => [a.id as string, a]));

export function ConsoleProducts() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/products');
  const items: ProductItem[] = data?.items ?? [];

  const [filterTab, setFilterTab] = useState<'all' | 'operational' | 'issues' | 'maintenance'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const sum = (k: keyof ProductItem) => items.reduce((s, p) => s + (Number(p[k]) || 0), 0);
  const totalOpenCases = sum('openCases');
  const totalActiveIncidents = sum('activeIncidents');
  const maintenanceCount = items.filter(p => p.status === 'maintenance').length;
  const operationalCount = items.filter(p => p.status !== 'maintenance' && Number(p.activeIncidents || 0) === 0).length;

  const filteredItems = useMemo(() => {
    return items.filter(p => {
      // Tab filter
      if (filterTab === 'operational' && (p.status === 'maintenance' || Number(p.activeIncidents || 0) > 0)) {
        return false;
      }
      if (filterTab === 'issues' && Number(p.openCases || 0) === 0 && Number(p.activeIncidents || 0) === 0) {
        return false;
      }
      if (filterTab === 'maintenance' && p.status !== 'maintenance') {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const meta = APP_META_MAP.get(p.app);
        const name = (meta?.name ?? appName(p.app)).toLowerCase();
        const key = p.app.toLowerCase();
        const slogan = (meta?.slogan ?? '').toLowerCase();
        const teams = p.teams.map(t => t.name.toLowerCase()).join(' ');

        if (!name.includes(q) && !key.includes(q) && !slogan.includes(q) && !teams.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [items, filterTab, searchQuery]);

  return (
    <div className="console-page">
      <PageHeader
        crumbs={[{ label: 'Console', to: '/console' }, { label: 'Products' }]}
        titlePlain="Product"
        titleEm="health"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              aria-label="Refresh product roster"
            >
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/console/cases?tab=incidents')}
              aria-label="View incidents queue"
            >
              <Icon name="alertTriangle" size={14} color="var(--red)" />
              <span>Incidents ({totalActiveIncidents})</span>
            </Button>
          </div>
        }
      />

      <LoadState loading={loading} error={error} onRetry={reload}>
        <KpiGrid>
          <KpiLink
            title="Products"
            value={String(items.length)}
            icon="package"
            color="var(--teal)"
            hint="Catalog in scope"
          />
          <KpiLink
            title="Fully operational"
            value={String(operationalCount)}
            icon="checkCircle"
            color="var(--green)"
            hint="No active incidents"
          />
          <KpiLink
            to="/console/cases?queue=open"
            title="Open cases"
            value={String(totalOpenCases)}
            icon="inbox"
            color="var(--blue)"
            hint="Across all applications"
          />
          <KpiLink
            to="/console/cases?tab=incidents"
            title="Active incidents"
            value={String(totalActiveIncidents)}
            icon="alertTriangle"
            color={totalActiveIncidents > 0 ? 'var(--red)' : 'var(--ink3)'}
            hint={totalActiveIncidents > 0 ? 'Urgent attention required' : 'Zero live disruptions'}
          />
          <KpiLink
            title="In maintenance"
            value={String(maintenanceCount)}
            icon="shield"
            color={maintenanceCount > 0 ? 'var(--gold)' : 'var(--ink3)'}
            hint="Switched on by operations"
          />
        </KpiGrid>

        <div className="console-products-toolbar">
          <Tabs value={filterTab} onValueChange={(val: any) => setFilterTab(val)}>
            <TabsList>
              <TabsTrigger value="all">
                All ({items.length})
              </TabsTrigger>
              <TabsTrigger value="operational">
                Operational ({operationalCount})
              </TabsTrigger>
              <TabsTrigger value="issues">
                Issues & Cases ({items.filter(p => Number(p.openCases || 0) > 0 || Number(p.activeIncidents || 0) > 0).length})
              </TabsTrigger>
              <TabsTrigger value="maintenance">
                Maintenance ({maintenanceCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="console-products-controls">
            <div style={{ position: 'relative', width: 240 }}>
              <Input
                type="search"
                aria-label="Filter products by name or team"
                placeholder="Search products, keys, teams..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 30 }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--ink3)',
                  display: 'flex',
                }}
              >
                <Icon name="search" size={14} />
              </span>
            </div>

            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                aria-label="Switch to grid view"
                style={{ borderRadius: 0, padding: '6px 10px', height: 32 }}
              >
                <Icon name="grid" size={14} />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                aria-label="Switch to table view"
                style={{ borderRadius: 0, padding: '6px 10px', height: 32 }}
              >
                <Icon name="list" size={14} />
              </Button>
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <Panel title="Products" icon="package">
            <Empty icon="package" title="No matching products found">
              {searchQuery || filterTab !== 'all' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <span>No products match the selected filters or search terms.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFilterTab('all');
                      setSearchQuery('');
                    }}
                    aria-label="Reset filters"
                  >
                    Reset filters
                  </Button>
                </div>
              ) : (
                'No products are currently registered in your scope. Contact an Operations Manager.'
              )}
            </Empty>
          </Panel>
        ) : viewMode === 'grid' ? (
          <div className="console-product-grid">
            {filteredItems.map(p => {
              const meta = APP_META_MAP.get(p.app);
              const name = meta?.name ?? appName(p.app);
              const slogan = meta?.slogan ?? 'Hudumika business application';
              const color = DEFAULT_APP_COLORS[p.app as ShellAppId] ?? 'var(--teal)';
              const iconName = PRODUCT_ICONS[p.app] ?? 'package';
              const isMaintenance = p.status === 'maintenance';
              const hasIncidents = Number(p.activeIncidents || 0) > 0;
              const healthStatus = isMaintenance ? 'maintenance' : (hasIncidents ? 'degraded' : 'healthy');

              return (
                <article
                  key={p.app}
                  className="console-product-card"
                  onClick={() => navigate(`/console/products/${p.app}`)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open operations for ${name}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/console/products/${p.app}`);
                    }
                  }}
                >
                  <div>
                    <div className="console-product-card-top">
                      <div className="console-product-badge-wrap">
                        <div
                          className="console-product-icon"
                          style={{
                            background: `color-mix(in srgb, ${color} 14%, var(--white))`,
                            color: color,
                            border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
                          }}
                        >
                          <Icon name={iconName} size={20} />
                        </div>
                        <div className="console-product-title-wrap">
                          <span className="console-product-name">{name}</span>
                          <span className="console-product-key">{p.app}</span>
                        </div>
                      </div>
                      <Pill kind="health" value={healthStatus} />
                    </div>

                    <p className="console-product-slogan" title={slogan}>
                      {slogan}
                    </p>

                    {isMaintenance && p.statusMessage && (
                      <div className="console-product-notice">
                        <Icon name="shield" size={13} color="var(--gold-d)" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.statusMessage}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="console-product-metrics">
                    <Link
                      to={`/console/cases?app=${p.app}`}
                      onClick={e => e.stopPropagation()}
                      className={`console-product-stat-pill ${p.openCases > 0 ? 'has-cases' : ''}`}
                      title={`${p.openCases} open cases`}
                    >
                      <Icon name="inbox" size={12} />
                      <span>{p.openCases} cases</span>
                    </Link>

                    {hasIncidents ? (
                      <Link
                        to="/console/cases?tab=incidents"
                        onClick={e => e.stopPropagation()}
                        className="console-product-stat-pill has-incidents"
                        title={`${p.activeIncidents} active incident(s)`}
                      >
                        <Icon name="alertTriangle" size={12} />
                        <span>{p.activeIncidents} active</span>
                      </Link>
                    ) : (
                      <span className="console-product-team-tag">
                        {p.teams.length ? p.teams.map(t => t.name).join(', ') : 'Unassigned'}
                      </span>
                    )}

                    <span className="console-product-footer-act">
                      <span>Inspect</span>
                      <Icon name="arrowRight" size={12} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Panel title={`Products (${filteredItems.length})`} icon="package" flush>
            <DataTable headers={['Product', 'App Key', 'Health Status', 'Open cases', 'Active incidents', 'Assigned Teams', 'Actions']}>
              {filteredItems.map(p => {
                const meta = APP_META_MAP.get(p.app);
                const name = meta?.name ?? appName(p.app);
                const color = DEFAULT_APP_COLORS[p.app as ShellAppId] ?? 'var(--teal)';
                const iconName = PRODUCT_ICONS[p.app] ?? 'package';
                const isMaintenance = p.status === 'maintenance';
                const hasIncidents = Number(p.activeIncidents || 0) > 0;
                const healthStatus = isMaintenance ? 'maintenance' : (hasIncidents ? 'degraded' : 'healthy');

                return (
                  <TR key={p.app} onClick={() => navigate(`/console/products/${p.app}`)}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--r-sm)',
                            background: `color-mix(in srgb, ${color} 14%, var(--white))`,
                            color: color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={iconName} size={15} />
                        </div>
                        <Link
                          to={`/console/products/${p.app}`}
                          onClick={e => e.stopPropagation()}
                          style={{ textDecoration: 'none' }}
                        >
                          <span className="console-cell-title" style={{ fontWeight: 600 }}>{name}</span>
                        </Link>
                      </div>
                    </TD>
                    <TD>
                      <span className="console-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>{p.app}</span>
                    </TD>
                    <TD nowrap>
                      <Pill kind="health" value={healthStatus} />
                    </TD>
                    <TD>
                      {p.openCases ? (
                        <Link
                          to={`/console/cases?app=${p.app}`}
                          onClick={e => e.stopPropagation()}
                          style={{ fontWeight: 700, color: 'var(--blue)' }}
                        >
                          {p.openCases}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>0</span>
                      )}
                    </TD>
                    <TD>
                      {p.activeIncidents ? (
                        <Link
                          to="/console/cases?tab=incidents"
                          onClick={e => e.stopPropagation()}
                          style={{ fontWeight: 700, color: 'var(--red)' }}
                        >
                          {p.activeIncidents}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>0</span>
                      )}
                    </TD>
                    <TD>
                      {p.teams.length ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {p.teams.map(t => (
                            <Badge key={t.id} variant="gray">
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>No team assigned</span>
                      )}
                    </TD>
                    <TD nowrap>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/console/products/${p.app}`);
                        }}
                        aria-label={`Manage operations for ${name}`}
                      >
                        Manage
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </DataTable>
          </Panel>
        )}
      </LoadState>
    </div>
  );
}

const INCIDENT_STEPS: [string, string][] = [
  ['investigating', 'Investigating'],
  ['identified', 'Identified'],
  ['monitoring', 'Monitoring'],
  ['resolved', 'Resolved'],
];

export function ConsoleProductDetail() {
  const { app } = useParams();
  const { me } = useStaff();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>(`/v1/staff/products/${app}`);
  const [summary, setSummary] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: label });
      reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'That action could not be completed.' });
    }
  };

  const meta = app ? APP_META_MAP.get(app) : undefined;
  const name = meta?.name ?? appName(app);
  const color = (app && DEFAULT_APP_COLORS[app as ShellAppId]) ? DEFAULT_APP_COLORS[app as ShellAppId] : 'var(--teal)';
  const iconName = (app && PRODUCT_ICONS[app]) ? PRODUCT_ICONS[app] : 'package';

  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && (
        <div className="console-page">
          <PageHeader
            crumbs={[
              { label: 'Console', to: '/console' },
              { label: 'Products', to: '/console/products' },
              { label: name },
            ]}
            titlePlain={name}
            titleEm="operations"
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/console/products')}
                  aria-label="Back to all products"
                >
                  <Icon name="arrowLeft" size={14} />
                  <span>All Products</span>
                </Button>
                {data.status === 'maintenance' ? (
                  <Pill kind="health" value="maintenance" />
                ) : (
                  <Pill kind="health" value={data.incidents.some((i: any) => i.status !== 'resolved') ? 'degraded' : 'healthy'} />
                )}
              </div>
            }
          />

          <Notice msg={msg} />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 18px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              background: 'var(--white)',
              marginBottom: 16,
              boxShadow: 'var(--elev-sm)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--r-sm)',
                background: `color-mix(in srgb, ${color} 14%, var(--white))`,
                color: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
              }}
            >
              <Icon name={iconName} size={22} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>{name}</h3>
                <span className="console-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>{app}</span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink2)' }}>
                {meta?.slogan || 'Hudumika modular platform service'}
              </p>
            </div>
          </div>

          <KpiGrid>
            <KpiLink
              title="Affected customers"
              value={String(data.affectedCustomers?.length ?? 0)}
              icon="building"
              color="var(--teal)"
              hint="Tenants with open cases/incidents"
            />
            <KpiLink
              to={`/console/cases?app=${app}`}
              title="Open cases"
              value={String(data.cases?.filter((c: any) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length ?? 0)}
              icon="inbox"
              color="var(--blue)"
              hint="Support inquiries in scope"
            />
            <KpiLink
              title="Active incidents"
              value={String(data.incidents?.filter((i: any) => i.status !== 'resolved').length ?? 0)}
              icon="alertTriangle"
              color={(data.incidents?.filter((i: any) => i.status !== 'resolved').length ?? 0) > 0 ? 'var(--red)' : 'var(--ink3)'}
              hint="Live platform disruptions"
            />
          </KpiGrid>

          {hasPerm(me, 'maintenance.manage') && (
            <Panel title="Maintenance & Health Controls" icon="tool">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Maintenance Mode</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>
                      When enabled, tenant users visiting this application will be presented with a maintenance holding notice.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: data.status === 'maintenance' ? 'var(--gold-d)' : 'var(--ink2)' }}>
                      {data.status === 'maintenance' ? 'Maintenance Active' : 'Operational'}
                    </span>
                    <Switch
                      aria-label={`Toggle maintenance mode for ${name}`}
                      checked={data.status === 'maintenance'}
                      onCheckedChange={v =>
                        act(
                          v ? `${name} placed in maintenance.` : `${name} returned to operational mode.`,
                          () =>
                            apiFetch(`/v1/staff/settings/maintenance/${app}`, {
                              method: 'PUT',
                              body: JSON.stringify({
                                maintenance: v,
                                ...(notice !== null ? { message: notice } : {}),
                                reason: v ? 'Maintenance started from console' : 'Maintenance ended from console',
                              }),
                            }).then(() => setNotice(null))
                        )
                      }
                    />
                  </div>
                </div>

                <form
                  style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                  onSubmit={e => {
                    e.preventDefault();
                    act('Maintenance notice updated.', () =>
                      apiFetch(`/v1/staff/settings/maintenance/${app}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                          maintenance: data.status === 'maintenance',
                          message: notice ?? '',
                          reason: 'Notice updated from console',
                        }),
                      }).then(() => setNotice(null))
                    );
                  }}
                >
                  <Input
                    aria-label="Maintenance notice message for customers"
                    placeholder="Enter customer-facing maintenance notice (e.g., Scheduled infrastructure upgrade in progress)..."
                    value={notice ?? data.statusMessage ?? ''}
                    onChange={e => setNotice(e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                    maxLength={500}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    type="submit"
                    disabled={notice === null || notice === (data.statusMessage ?? '')}
                    aria-label="Save maintenance notice"
                  >
                    Save Notice
                  </Button>
                </form>
              </div>
            </Panel>
          )}

          <Panel
            title="Incidents & Outages"
            sub="Disruptions linked to this application. Customer visibility requires staff summary approval."
            icon="alertTriangle"
          >
            {data.incidents?.length ? (
              data.incidents.map((i: any) => (
                <article
                  key={i.id}
                  className="console-stack"
                  style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--border)' }}
                >
                  <div className="console-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <Pill kind="severity" value={i.severity} />
                    <Pill kind="incident" value={i.status} />
                    <span className="console-cell-title grow" style={{ fontWeight: 600 }}>{i.title}</span>
                    <span className="console-muted">
                      <span className="console-mono">{i.ref}</span> · started {fmtRel(i.started_at)}
                    </span>
                  </div>
                  <div className="console-muted" style={{ fontSize: 12.5 }}>
                    Customers: {i.customers?.length ? i.customers.map((c: any) => c.name).join(', ') : 'none linked'}
                  </div>

                  {hasPerm(me, 'incidents.manage') && (
                    <div className="console-stack" style={{ gap: 8, marginTop: 8 }}>
                      <Textarea
                        rows={2}
                        aria-label={`Customer-facing summary for incident ${i.ref}`}
                        placeholder="Public customer status update summary..."
                        value={summary[i.id] ?? i.public_summary ?? ''}
                        onChange={e => setSummary({ ...summary, [i.id]: e.target.value })}
                      />
                      <div className="console-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            act('Summary saved.', () =>
                              apiFetch(`/v1/staff/incidents/${i.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ public_summary: summary[i.id] ?? i.public_summary ?? null }),
                              })
                            )
                          }
                          aria-label={`Save summary for ${i.ref}`}
                        >
                          Save summary
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!i.public_summary || !!i.public_summary_approved_at}
                          onClick={() =>
                            act('Summary approved.', () =>
                              apiFetch(`/v1/staff/incidents/${i.id}/approve-summary`, { method: 'POST', body: '{}' })
                            )
                          }
                          aria-label={`Approve customer summary for ${i.ref}`}
                        >
                          {i.public_summary_approved_at ? 'Summary approved' : 'Approve summary'}
                        </Button>
                        <span className="grow" />
                        <Select
                          value={i.status}
                          onValueChange={s =>
                            act('Incident updated.', () =>
                              apiFetch(`/v1/staff/incidents/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) })
                            )
                          }
                        >
                          <SelectTrigger aria-label={`Status of incident ${i.ref}`} style={{ width: 170 }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INCIDENT_STEPS.map(([v, l]) => (
                              <SelectItem key={v} value={v}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <Empty icon="checkCircle" title="No incidents registered">
                This product has no active or reported incidents on record.
              </Empty>
            )}
          </Panel>

          <div className="console-two">
            <Panel title="Affected Customers" icon="building" flush>
              {data.affectedCustomers?.length ? (
                <ul className="console-list">
                  {data.affectedCustomers.map((c: any) => (
                    <li key={c.tenant_id}>
                      <CompanyAvatar name={c.name} logoUrl={c.logo_url} size={28} />
                      <div className="console-list-main">
                        <Link to={`/console/customers/${c.tenant_id}`}>
                          <div className="console-list-title">{c.name}</div>
                        </Link>
                        <div className="console-list-meta">
                          {c.openCases} open case{c.openCases === 1 ? '' : 's'}
                          {c.incidents ? ` · ${c.incidents} incident(s)` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon="building" title="No affected customers">
                  No customers are currently impacted by issues in this product.
                </Empty>
              )}
            </Panel>

            <Panel title="Recent & Open Cases" icon="inbox" flush>
              {data.cases?.length ? (
                <DataTable headers={['Case', 'Customer', 'Status', 'Owner']}>
                  {data.cases.map((c: any) => (
                    <TR key={c.id} onClick={() => navigate(`/console/cases/${c.id}`)}>
                      <TD style={{ minWidth: 180 }}>
                        <div className="console-cell-title">{c.subject}</div>
                        <div className="console-cell-sub console-mono">{c.ref_number}</div>
                      </TD>
                      <TD>{c.customer_name}</TD>
                      <TD nowrap>
                        <Pill kind="status" value={c.status} />
                      </TD>
                      <TD nowrap>
                        {c.owner_name ?? <span style={{ color: 'var(--ink3)' }}>Unassigned</span>}
                      </TD>
                    </TR>
                  ))}
                </DataTable>
              ) : (
                <Empty icon="inbox" title="No cases recorded">
                  No customer support cases are currently assigned or logged for this product.
                </Empty>
              )}
            </Panel>
          </div>
        </div>
      )}
    </LoadState>
  );
}
