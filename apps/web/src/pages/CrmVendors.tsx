import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { VendorMaster } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { showAlert } from '../lib/alert.js';
import { VendorProfilePage } from './VendorProfilePage.js';

const CATEGORIES = [
  { value: 'all', label: 'All categories' },
  { value: 'port_services', label: 'Port Services' },
  { value: 'customs', label: 'Customs & Clearance' },
  { value: 'freight', label: 'Freight & Forwarding' },
  { value: 'warehouse', label: 'Warehousing & Storage' },
  { value: 'transport', label: 'Inland Transport' },
  { value: 'consulting', label: 'Professional Consulting' },
  { value: 'utility', label: 'Utilities & Services' },
  { value: 'other', label: 'General / Other' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'blocked', label: 'Blocked' },
];

const CATEGORY_ICONS: Record<string, string> = {
  port_services: 'anchor',
  customs: 'shield',
  freight: 'container',
  warehouse: 'warehouse',
  transport: 'truck',
  consulting: 'briefcase',
  utility: 'zap',
  other: 'building',
};

const WRITER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'];

interface VendorStats {
  total: number;
  active: number;
  inactive: number;
  blocked: number;
  activeRate: number;
}

export function CrmVendors({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const canWrite = WRITER_ROLES.includes(user?.role || '');

  // Load stats once or on reload
  useEffect(() => {
    let alive = true;
    apiFetch<VendorStats>('/v1/suppliers/stats')
      .then(res => { if (alive) setStats(res); })
      .catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  // Fetch vendors with search / filter debounce
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: '18',
    });
    if (search.trim()) query.set('search', search.trim());
    if (status !== 'all') query.set('status', status);

    const timer = setTimeout(async () => {
      try {
        const result = await apiFetch<any>(`/v1/suppliers?${query.toString()}`);
        if (!alive) return;
        if (Array.isArray(result)) {
          setVendors(result);
          setHasMore(false);
        } else if (result && Array.isArray(result.data)) {
          setVendors(result.data);
          setHasMore(Boolean(result.has_more));
        } else {
          setVendors([]);
          setHasMore(false);
        }
        setError('');
      } catch (err: any) {
        if (!alive) return;
        // Fallback: try querying without pagination params in case limit/page triggered a backend issue
        try {
          const fallbackRes = await apiFetch<any>(`/v1/suppliers${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`);
          if (!alive) return;
          const list = Array.isArray(fallbackRes) ? fallbackRes : (fallbackRes?.data || []);
          setVendors(list);
          setHasMore(false);
          setError('');
        } catch (fbErr: any) {
          if (alive) setError(fbErr.message || err.message || 'Failed to load suppliers');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [page, search, status, reloadKey]);

  // Client-side category filtering
  const filteredVendors = useMemo(() => {
    if (category === 'all') return vendors;
    return vendors.filter(v => (v.category || 'other').toLowerCase() === category);
  }, [vendors, category]);

  return (
    <div className="space-y-6 pb-12">
      {!embedded && (
        <PageHeader
          crumbs={['CRM', 'Business relationships', 'Vendors']}
          titlePlain="Vendor"
          titleEm="directory"
          subtitle="Enterprise vendor & supplier records shared across Finance, Logistics, and Procurement."
          actions={
            canWrite && (
              <Button asChild variant="default" className="gap-1.5">
                <Link to="/crm/relationships/vendors/new">
                  <Icon name="plus" size={14} />
                  <span>Add vendor</span>
                </Link>
              </Button>
            )
          }
        />
      )}

      {/* KPI Stats Strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Suppliers</span>
              <div className="mt-1 text-2xl font-black text-foreground tabular-nums">{stats.total}</div>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">Managed in workspace</span>
            </div>
            <FeaturedIcon variant="brand" size="md">
              <Icon name="building" size={18} />
            </FeaturedIcon>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--teal)]">Active Suppliers</span>
              <div className="mt-1 text-2xl font-black text-[var(--teal)] tabular-nums">{stats.active}</div>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">{stats.activeRate}% operational</span>
            </div>
            <FeaturedIcon variant="success" size="md">
              <Icon name="check" size={18} />
            </FeaturedIcon>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Inactive</span>
              <div className="mt-1 text-2xl font-black text-muted-foreground tabular-nums">{stats.inactive}</div>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">No recent orders</span>
            </div>
            <FeaturedIcon variant="gray" size="md">
              <Icon name="clock" size={18} />
            </FeaturedIcon>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--red)]">Blocked</span>
              <div className="mt-1 text-2xl font-black text-[var(--red)] tabular-nums">{stats.blocked}</div>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">Payment / terms hold</span>
            </div>
            <FeaturedIcon variant="error" size="md">
              <Icon name="alertTriangle" size={18} />
            </FeaturedIcon>
          </div>
        </div>
      )}

      {/* Search & Filtering Toolbar */}
      <Card className="shadow-xs overflow-hidden border-border/80">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Input
                placeholder="Search vendors by name, contact person, email or ref code…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 pr-8 text-xs h-9 bg-background"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Icon name="search" size={14} />
              </div>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPage(1); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns & View Mode */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[140px] text-xs h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={category} onValueChange={v => { setCategory(v); setPage(1); }}>
                <SelectTrigger className="w-[160px] text-xs h-9">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Grid / Table View Switcher */}
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 shrink-0">
                <Button
                  type="button"
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  iconOnly
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                  className="size-7"
                >
                  <Icon name="grid" size={13} />
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="icon"
                  iconOnly
                  aria-label="Table view"
                  onClick={() => setViewMode('table')}
                  className="size-7"
                >
                  <Icon name="list" size={13} />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Vendor Content Area */}
      {error ? (
        <Card className="rounded-xl border-destructive/20 bg-destructive/5 p-8 text-center text-sm text-destructive">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="size-11 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <Icon name="alertTriangle" size={20} />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Could not load vendor directory. Please check your connection or retry.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setError(''); setReloadKey(k => k + 1); }}
              className="mt-1 gap-1.5"
            >
              <Icon name="refresh" size={13} />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      ) : loading ? (
        <div className="py-20">
          <SectionLoading label="Loading vendor directory…" />
        </div>
      ) : filteredVendors.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mx-auto mb-3">
            <Icon name="building" size={20} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No vendors found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            {search || status !== 'all' || category !== 'all'
              ? 'No suppliers match your current filter parameters. Try clearing your search.'
              : 'Start building your supplier base by onboarding your first vendor.'}
          </p>
          {canWrite && !search && status === 'all' && (
            <Button asChild size="sm" className="mt-4 gap-1.5">
              <Link to="/crm/relationships/vendors/new">
                <Icon name="plus" size={13} />
                <span>Add first vendor</span>
              </Link>
            </Button>
          )}
        </Card>
      ) : viewMode === 'grid' ? (
        /* Modern Structured Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredVendors.map(vendor => {
            const catKey = (vendor.category || 'other').toLowerCase();
            const iconName = CATEGORY_ICONS[catKey] || 'building';
            const isBlocked = vendor.status === 'blocked';
            const isActive = vendor.status === 'active';

            return (
              <div
                key={vendor.id}
                className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5"
              >
                <div>
                  {/* Card Top: Identity & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <PersonAvatar
                        userId={vendor.id}
                        kind="suppliers"
                        name={vendor.name}
                        size={42}
                      />
                      <div className="min-w-0">
                        <Link
                          to={`/crm/relationships/vendors/${vendor.id}`}
                          className="font-bold text-sm text-foreground hover:text-primary transition-colors block truncate"
                          title={vendor.name}
                        >
                          {vendor.name}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                          {(vendor as any).ref_code && (
                            <span className="mono font-semibold px-1 rounded bg-muted/60 text-[10px]">
                              {(vendor as any).ref_code}
                            </span>
                          )}
                          <span className="capitalize truncate">
                            {(vendor.category || 'Supplier').replaceAll('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant={isBlocked ? 'error' : isActive ? 'success' : 'gray'}
                      className="text-[10px] uppercase font-bold tracking-wider py-0 px-2 shrink-0 capitalize"
                    >
                      {vendor.status || 'Active'}
                    </Badge>
                  </div>

                  {/* Contact & Location Details */}
                  <div className="mt-4 pt-3.5 border-t border-border/50 space-y-2 text-xs">
                    {vendor.contact_name ? (
                      <div className="flex items-center gap-2 text-foreground font-medium truncate">
                        <Icon name="user" size={13} className="text-muted-foreground shrink-0" />
                        <span className="truncate">{vendor.contact_name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/60 italic text-[11px]">
                        <Icon name="user" size={13} className="shrink-0" />
                        <span>No contact representative</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-muted-foreground truncate">
                      <Icon name="mail" size={13} className="shrink-0" />
                      <span className="truncate">{vendor.email || vendor.phone || 'No direct channel'}</span>
                    </div>

                    {(vendor.city || vendor.country) && (
                      <div className="flex items-center gap-2 text-muted-foreground truncate">
                        <Icon name="mapPin" size={13} className="shrink-0" />
                        <span className="truncate">
                          {[vendor.city, vendor.country].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Quick Links & Financial Action */}
                <div className="mt-5 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground mono font-semibold">
                    {vendor.currency || 'TZS'} · {(vendor.payment_terms || 'net_30').toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2.5">
                      <Link to={`/crm/relationships/vendors/${vendor.id}`}>
                        <span>Details</span>
                        <Icon name="chevronRight" size={12} />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground hover:text-primary">
                      <Link to={`/finance/vendors/${vendor.id}`} title="View finance activity">
                        <Icon name="receipt" size={13} />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Full Compact Table View */
        <Card className="overflow-hidden shadow-xs border-border/80">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  <th className="py-3 px-4">Vendor Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Terms</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredVendors.map(vendor => (
                  <tr key={vendor.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar userId={vendor.id} kind="suppliers" name={vendor.name} size={28} />
                        <div>
                          <Link to={`/crm/relationships/vendors/${vendor.id}`} className="font-semibold text-foreground hover:text-primary transition-colors">
                            {vendor.name}
                          </Link>
                          {(vendor as any).ref_code && (
                            <span className="mono text-[10px] text-muted-foreground block">{(vendor as any).ref_code}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 capitalize text-muted-foreground">
                      {(vendor.category || 'other').replaceAll('_', ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{vendor.contact_name || '—'}</div>
                      <div className="text-[11px] text-muted-foreground">{vendor.email || vendor.phone || ''}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {[vendor.city, vendor.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4 mono text-muted-foreground">
                      {vendor.currency || 'TZS'} · {(vendor.payment_terms || 'net_30').toUpperCase()}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={vendor.status === 'blocked' ? 'error' : vendor.status === 'active' ? 'success' : 'gray'}
                        className="text-[10px] uppercase font-bold tracking-wider py-0 px-2 capitalize"
                      >
                        {vendor.status || 'Active'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2">
                          <Link to={`/crm/relationships/vendors/${vendor.id}`}>View</Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" iconOnly aria-label="Finance Ledger" className="size-7">
                          <Link to={`/finance/vendors/${vendor.id}`}>
                            <Icon name="receipt" size={13} />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination Footer */}
      <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        <span>Page {page}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1 || loading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="text-xs gap-1"
          >
            <Icon name="chevronLeft" size={13} />
            <span>Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => setPage(p => p + 1)}
            className="text-xs gap-1"
          >
            <span>Next</span>
            <Icon name="chevronRight" size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CrmVendorRecord() {
  const { id } = useParams<{ id: string }>();
  if (id && id !== 'new') {
    return <VendorProfilePage />;
  }
  return <CrmVendorForm />;
}

function CrmVendorForm() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<Partial<VendorMaster>>({
    name: '',
    category: 'other',
    currency: 'TZS',
    payment_terms: 'net_30',
    status: 'active',
    country: 'Tanzania',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);

  const writable = WRITER_ROLES.includes(user?.role || '');

  useEffect(() => {
    if (!id) return;
    let live = true;
    apiFetch<VendorMaster>(`/v1/suppliers/${id}`)
      .then(result => { if (live) setVendor(result); })
      .catch(err => { if (live) setError(err.message || 'Failed to fetch vendor record'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  async function save() {
    setBusy(true);
    setError('');
    const keys = [
      'name', 'contact_name', 'email', 'phone', 'address', 'city', 'country',
      'tax_id', 'category', 'currency', 'payment_terms', 'status', 'bank_name', 'bank_account', 'notes'
    ] as const;
    const body = Object.fromEntries(keys.map(key => [key, (vendor as any)[key] ?? '']));

    try {
      const saved = await apiFetch<VendorMaster>(id ? `/v1/suppliers/${id}` : '/v1/suppliers', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      setVendor(saved);
      showAlert(`Vendor ${id ? 'updated' : 'created'} successfully`, { variant: 'success' });
      if (!id) navigate(`/crm/relationships/vendors/${saved.id}`);
    } catch (err: any) {
      setError(err?.message || 'Unable to save vendor record.');
      showAlert(err?.message || 'Unable to save vendor record', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={[
          { label: 'CRM', to: '/crm' },
          { label: 'Business relationships', to: '/crm/relationships?view=vendors' },
          id ? (vendor.name || 'Vendor Details') : 'New Vendor',
        ]}
        titlePlain={id ? (vendor.name || 'Vendor') : 'New'}
        titleEm={id ? 'profile' : 'vendor'}
        subtitle="Manage supplier master parameters used across invoices, purchase orders, and customs manifests."
        actions={
          id && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link to={`/finance/vendors/${id}`}>
                <Icon name="receipt" size={14} />
                <span>Finance ledger</span>
              </Link>
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20">
          <SectionLoading label="Loading vendor profile…" />
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); void save(); }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Primary Details Card */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-xs overflow-hidden border-border/80">
                <div className="p-4 border-b border-border bg-muted/20 flex items-center gap-2">
                  <Icon name="building" size={16} className="text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Company & Identity</span>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vendor-name" className="text-xs font-semibold">
                      Company / Supplier Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="vendor-name"
                      required
                      placeholder="e.g. Tanzania Port Services Co. Ltd"
                      value={vendor.name || ''}
                      onChange={e => setVendor(v => ({ ...v, name: e.target.value }))}
                      disabled={!writable || busy}
                      className="text-sm font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-tax_id" className="text-xs font-semibold">TIN / Tax Identification</Label>
                      <Input
                        id="vendor-tax_id"
                        placeholder="e.g. 104-582-901"
                        value={vendor.tax_id || ''}
                        onChange={e => setVendor(v => ({ ...v, tax_id: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-category" className="text-xs font-semibold">Service Category</Label>
                      <Select
                        value={vendor.category || 'other'}
                        disabled={!writable || busy}
                        onValueChange={val => setVendor(v => ({ ...v, category: val as any }))}
                      >
                        <SelectTrigger id="vendor-category" className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                            <SelectItem key={c.value} value={c.value} className="text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-contact_name" className="text-xs font-semibold">Contact Representative</Label>
                      <Input
                        id="vendor-contact_name"
                        placeholder="e.g. Ally Said (Logistics Manager)"
                        value={vendor.contact_name || ''}
                        onChange={e => setVendor(v => ({ ...v, contact_name: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-email" className="text-xs font-semibold">Corporate Email</Label>
                      <Input
                        id="vendor-email"
                        type="email"
                        placeholder="operations@supplier.co.tz"
                        value={vendor.email || ''}
                        onChange={e => setVendor(v => ({ ...v, email: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-phone" className="text-xs font-semibold">Phone / WhatsApp</Label>
                      <Input
                        id="vendor-phone"
                        placeholder="+255 754 000 000"
                        value={vendor.phone || ''}
                        onChange={e => setVendor(v => ({ ...v, phone: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-country" className="text-xs font-semibold">Country</Label>
                      <Input
                        id="vendor-country"
                        placeholder="Tanzania"
                        value={vendor.country || 'Tanzania'}
                        onChange={e => setVendor(v => ({ ...v, country: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-city" className="text-xs font-semibold">City / Port Terminal</Label>
                      <Input
                        id="vendor-city"
                        placeholder="Dar es Salaam"
                        value={vendor.city || ''}
                        onChange={e => setVendor(v => ({ ...v, city: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vendor-address" className="text-xs font-semibold">Physical Address</Label>
                      <Input
                        id="vendor-address"
                        placeholder="Plot 14, Bandari Road, Kurasini"
                        value={vendor.address || ''}
                        onChange={e => setVendor(v => ({ ...v, address: e.target.value }))}
                        disabled={!writable || busy}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes Card */}
              <Card className="shadow-xs overflow-hidden border-border/80">
                <div className="p-4 border-b border-border bg-muted/20 flex items-center gap-2">
                  <Icon name="fileText" size={16} className="text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Operational Notes & Agreements</span>
                </div>
                <CardContent className="p-5">
                  <textarea
                    rows={4}
                    placeholder="Enter compliance certifications, special clearance rates, SLA commitments or instructions…"
                    value={vendor.notes || ''}
                    onChange={e => setVendor(v => ({ ...v, notes: e.target.value }))}
                    disabled={!writable || busy}
                    className="w-full rounded-lg border border-input bg-background p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Settings Card */}
            <div className="space-y-6">
              <Card className="shadow-xs overflow-hidden border-border/80">
                <div className="p-4 border-b border-border bg-muted/20 flex items-center gap-2">
                  <Icon name="settings" size={16} className="text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Terms & Billing</span>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vendor-status" className="text-xs font-semibold">Account Status</Label>
                    <Select
                      value={vendor.status || 'active'}
                      disabled={!writable || busy}
                      onValueChange={val => setVendor(v => ({ ...v, status: val as any }))}
                    >
                      <SelectTrigger id="vendor-status" className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active" className="text-xs">Active (Operational)</SelectItem>
                        <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                        <SelectItem value="blocked" className="text-xs">Blocked (Hold)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vendor-currency" className="text-xs font-semibold">Billing Currency</Label>
                    <Select
                      value={vendor.currency || 'TZS'}
                      disabled={!writable || busy}
                      onValueChange={val => setVendor(v => ({ ...v, currency: val }))}
                    >
                      <SelectTrigger id="vendor-currency" className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['TZS', 'USD', 'EUR', 'GBP', 'KES', 'UGX'].map(c => (
                          <SelectItem key={c} value={c} className="text-xs mono font-medium">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vendor-terms" className="text-xs font-semibold">Payment Terms</Label>
                    <Select
                      value={vendor.payment_terms || 'net_30'}
                      disabled={!writable || busy}
                      onValueChange={val => setVendor(v => ({ ...v, payment_terms: val as any }))}
                    >
                      <SelectTrigger id="vendor-terms" className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prepaid" className="text-xs">Prepaid / Upfront</SelectItem>
                        <SelectItem value="cod" className="text-xs">Cash on Delivery (COD)</SelectItem>
                        <SelectItem value="net_15" className="text-xs">Net 15 Days</SelectItem>
                        <SelectItem value="net_30" className="text-xs">Net 30 Days</SelectItem>
                        <SelectItem value="net_60" className="text-xs">Net 60 Days</SelectItem>
                        <SelectItem value="net_90" className="text-xs">Net 90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              {writable && (
                <div className="flex flex-col gap-2.5">
                  <Button
                    type="submit"
                    disabled={busy || !vendor.name?.trim()}
                    className="w-full gap-1.5"
                  >
                    <Icon name="check" size={14} />
                    <span>{busy ? 'Saving vendor…' : id ? 'Update vendor' : 'Save vendor'}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/crm/relationships?view=vendors')}
                    disabled={busy}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
