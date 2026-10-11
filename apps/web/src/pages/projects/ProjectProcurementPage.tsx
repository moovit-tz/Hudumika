import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

type ProcTab = 'purchase_requests' | 'rfqs' | 'purchase_orders' | 'goods_receipts';

interface ProcItem {
  id: string;
  project_id: string;
  project_name: string;
  project_color: string;
  title?: string;
  description?: string;
  status: string;
  amount?: number;
  currency?: string;
  created_at: string;
  requested_by_name?: string;
  vendor_name?: string;
}

const TAB_META: { key: ProcTab; label: string; endpoint: string; icon: string }[] = [
  { key: 'purchase_requests', label: 'Purchase Requests', endpoint: 'purchase-requests', icon: 'fileText' },
  { key: 'rfqs', label: 'RFQs', endpoint: 'rfqs', icon: 'send' },
  { key: 'purchase_orders', label: 'Purchase Orders', endpoint: 'purchase-orders', icon: 'shoppingCart' },
  { key: 'goods_receipts', label: 'Goods Receipts', endpoint: 'goods-receipts', icon: 'package' },
];

const STATUS_BADGE: Record<string, { label: string; variant: 'gray' | 'brand' | 'success' | 'error' | 'warning' }> = {
  pending_inspection: { label: 'Pending Inspection', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  partially_accepted: { label: 'Accepted with Concession', variant: 'warning' },
  draft: { label: 'Draft', variant: 'gray' },
  pending: { label: 'Pending Approval', variant: 'warning' },
  submitted: { label: 'Submitted', variant: 'brand' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  issued: { label: 'Issued', variant: 'brand' },
  received: { label: 'Received', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  closed: { label: 'Closed', variant: 'gray' },
  cancelled: { label: 'Cancelled', variant: 'error' },
};

export const ProjectProcurementPage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ProcTab>('purchase_requests');
  const [items, setItems] = useState<ProcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [procPage, setProcPage] = useState(1);
  const [procPageSize, setProcPageSize] = useState(25);

  const curMeta = TAB_META.find(t => t.key === tab) || TAB_META[0];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const projRes = await apiFetch('/v1/tasks/projects');
      const projects = Array.isArray(projRes.data) ? projRes.data : (Array.isArray(projRes) ? projRes : []);
      const endpoint = curMeta.endpoint;
      const all: ProcItem[] = [];
      await Promise.all(
        projects.map(async (p: any) => {
          try {
            const res = await apiFetch(`/v1/project-os/projects/${p.id}/${endpoint}`);
            const list = Array.isArray(res) ? res : (res?.data || []);
            list.forEach((item: any) => {
              all.push({
                id: item.id,
                project_id: p.id,
                project_name: p.name,
                project_color: p.color || 'var(--teal)',
                title: item.title || item.description || item.pr_number || item.rfq_number || item.po_number || item.grn_number || `${curMeta.label} #${String(item.id).slice(0, 8)}`,
                description: item.description,
                status: item.status || 'draft',
                amount: item.total_amount ?? item.amount ?? item.estimated_cost,
                currency: item.currency || p.currency || 'TZS',
                created_at: item.created_at,
                requested_by_name: item.requested_by_name,
                vendor_name: item.vendor_name || item.supplier_name,
              });
            });
          } catch {
            // Soft failure for individual project queries
          }
        })
      );
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(all);
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load project procurement items');
    }
    setLoading(false);
  }, [curMeta.endpoint, curMeta.label]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => { setProcPage(1); }, [tab, search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      i.project_name.toLowerCase().includes(q) ||
      (i.vendor_name || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalValue = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const pendingCount = items.filter(i => ['pending', 'submitted', 'pending_inspection'].includes(i.status)).length;
  const approvedCount = items.filter(i => ['approved', 'accepted', 'issued', 'received'].includes(i.status)).length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {loadError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Financial']}
        titlePlain="Project"
        titleEm="procurement"
        subtitle="End-to-end supply chain — purchase requests, competitive RFQs, purchase orders, and goods receipts."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/budgets')}>
              <Icon name="dollarSign" size={13} style={{ marginRight: 6 }} /> Budgets
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/finance')}>
              <Icon name="creditCard" size={13} style={{ marginRight: 6 }} /> Finance
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: `Total ${curMeta.label}`, value: items.length, icon: curMeta.icon as any, variant: 'brand' as const },
            { label: 'Total Value', value: totalValue > 0 ? `${(totalValue / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : '—', icon: 'dollarSign' as const, variant: 'brand' as const },
            { label: 'Pending Review', value: pendingCount, icon: 'clock' as const, variant: pendingCount > 0 ? 'warning' as const : 'brand' as const },
            { label: 'Approved / Received', value: approvedCount, icon: 'checkCircle' as const, variant: 'success' as const },
          ].map(k => (
            <div
              key={k.label}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 16,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FeaturedIcon variant={k.variant} size="sm">
                  <Icon name={k.icon} size={13} />
                </FeaturedIcon>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {k.label}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tab Selection & Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Tabs value={tab} onValueChange={v => setTab(v as ProcTab)}>
            <TabsList>
              {TAB_META.map(t => (
                <TabsTrigger key={t.key} value={t.key}>
                  <Icon name={t.icon as any} size={13} style={{ marginRight: 6 }} />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <SearchToolbar search={search} onSearch={setSearch} placeholder={`Search ${curMeta.label.toLowerCase()}…`} />
        </div>

        {/* Data View */}
        {loading ? (
          <SectionLoading />
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
            <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
              <Icon name={curMeta.icon as any} size={24} />
            </FeaturedIcon>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              No {curMeta.label} Found
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 420, margin: '0 auto 16px' }}>
              No {curMeta.label.toLowerCase()} recorded across projects. Open any individual project workspace to create procurement records.
            </p>
            <Button variant="outline" onClick={() => navigate('/projects/directory')}>
              Go to Projects Directory
            </Button>
          </div>
        ) : (
          <>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  {['Item Reference', 'Project', 'Status', 'Estimated / PO Amount', 'Vendor / Supplier', 'Date Created'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginate(filtered, procPage, procPageSize).visible.map(i => {
                  const sb = STATUS_BADGE[i.status] || STATUS_BADGE.draft;
                  return (
                    <tr
                      key={i.id}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onClick={() => navigate(`/projects/${i.project_id}/procurement`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--ink)' }}>
                        {i.title}
                        {i.description && (
                          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink3)', marginTop: 2 }}>
                            {i.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: i.project_color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--ink)' }}>{i.project_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                        {i.amount ? `${i.currency} ${Number(i.amount).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)' }}>
                        {i.vendor_name || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                        {i.created_at ? new Date(i.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination total={filtered.length} page={procPage} pageSize={procPageSize} onPageChange={setProcPage} onPageSizeChange={setProcPageSize} noun={curMeta.label.toLowerCase()} />
          </>
        )}
      </div>
    </div>
  );
};
