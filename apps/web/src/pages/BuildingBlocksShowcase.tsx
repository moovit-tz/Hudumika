import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { SectionCard } from '../components/SectionCard.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { showAlert } from '../lib/alert.js';

type BlockCategory = 'all' | 'headers' | 'metrics' | 'tables' | 'forms' | 'cards' | 'empty';

interface BlockDefinition {
  id: string;
  title: string;
  category: BlockCategory;
  description: string;
  codeSnippet: string;
  render: () => React.ReactNode;
}

export default function BuildingBlocksShowcase() {
  const [activeCategory, setActiveCategory] = useState<BlockCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyCode(id: string, snippet: string) {
    navigator.clipboard.writeText(snippet);
    setCopiedId(id);
    showAlert('Building block code copied to clipboard!', { variant: 'success', title: 'Code Copied' });
    setTimeout(() => setCopiedId(null), 2500);
  }

  const blocks: BlockDefinition[] = [
    // 1. HEADER BLOCKS
    {
      id: 'header-enterprise-hero',
      title: 'Enterprise Page Header with Actions & Breadcrumbs',
      category: 'headers',
      description: 'Standard page top banner featuring breadcrumb hierarchy, status badges, search input, and action triggers.',
      codeSnippet: `<PageHeader
  crumbs={['Operations', 'Shipments']}
  titlePlain="Container"
  titleEm="tracking"
  subtitle="Live vessel positions, status milestones, and delay risk telemetry."
  actions={
    <div style={{ display: 'flex', gap: 10 }}>
      <Button variant="outline" size="sm"><Icon name="download" size={14} /> Export CSV</Button>
      <Button variant="default" size="sm"><Icon name="plus" size={14} /> New Booking</Button>
    </div>
  }
/>`,
      render: () => (
        <PageHeader
          crumbs={['Operations', 'Shipments']}
          titlePlain="Container"
          titleEm="tracking"
          subtitle="Live vessel positions, status milestones, and delay risk telemetry."
          actions={
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="outline" size="sm"><Icon name="download" size={14} /> Export CSV</Button>
              <Button variant="default" size="sm"><Icon name="plus" size={14} /> New Booking</Button>
            </div>
          }
        />
      ),
    },

    // 2. METRIC & KPI BLOCKS
    {
      id: 'metric-4card-grid',
      title: '4-Card Executive KPI Summary Grid',
      category: 'metrics',
      description: 'Responsive 4-card grid featuring primary values, icon badges, percentage trends, and secondary sub-metrics.',
      codeSnippet: `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
  {[
    { label: 'Active Shipments', val: '1,284', trend: '+14%', icon: 'truck', color: 'var(--teal)' },
    { label: 'Landed Cost Total', val: '$482,900', trend: '+8.2%', icon: 'dollarSign', color: 'var(--green)' },
    { label: 'Compliance Audits', val: '99.4%', trend: 'Clean', icon: 'shieldCheck', color: 'var(--blue)' },
    { label: 'Demurrage Risk', val: '3 Assets', trend: 'High Risk', icon: 'alertTriangle', color: 'var(--red)' },
  ].map(k => (
    <div key={k.label} className="ondi-kpi-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>{k.label}</span>
        <FeaturedIcon variant="teal" size="sm" shape="circle"><Icon name={k.icon as any} size={14} /></FeaturedIcon>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>{k.val}</div>
      <div style={{ fontSize: 11.5, color: k.color, fontWeight: 700, marginTop: 4 }}>{k.trend} vs last month</div>
    </div>
  ))}
</div>`,
      render: () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { label: 'Active Shipments', val: '1,284', trend: '+14%', icon: 'truck', color: 'var(--teal)' },
            { label: 'Landed Cost Total', val: '$482,900', trend: '+8.2%', icon: 'dollarSign', color: 'var(--green)' },
            { label: 'Compliance Audits', val: '99.4%', trend: 'Clean', icon: 'shieldCheck', color: 'var(--blue)' },
            { label: 'Demurrage Risk', val: '3 Assets', trend: 'High Risk', icon: 'alertTriangle', color: 'var(--red)' },
          ].map(k => (
            <div key={k.label} className="ondi-kpi-card" style={{ padding: 18, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>{k.label}</span>
                <FeaturedIcon variant="gray" size="sm" shape="circle"><Icon name={k.icon as any} size={14} /></FeaturedIcon>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>{k.val}</div>
              <div style={{ fontSize: 11.5, color: k.color, fontWeight: 700, marginTop: 4 }}>{k.trend} vs last month</div>
            </div>
          ))}
        </div>
      ),
    },

    // 3. TABLE & TOOLBAR BLOCKS
    {
      id: 'table-audit-log',
      title: 'Data Table with Status Badges & Pagination Bar',
      category: 'tables',
      description: 'Fully responsive scrollable table wrapped in .rtbl-wrap with uppercase headers and canonical PaginationBar.',
      codeSnippet: `<SectionCard padded={false} title="System Activity & Audit Logs">
  <div className="rtbl-wrap">
    <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
          {['User', 'Action', 'Target', 'Status', 'Timestamp'].map(h => (
            <th key={h} style={{ padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* rows */}
      </tbody>
    </table>
  </div>
  <PaginationBar page={1} pageSize={10} total={48} onPageChange={() => {}} itemLabel="audit log" />
</SectionCard>`,
      render: () => (
        <SectionCard padded={false} title="System Activity & Audit Logs">
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['User', 'Action', 'Target', 'Status', 'Timestamp'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { user: 'Viden Admin', action: 'Created Security Policy', target: 'SSO Enforce', status: 'ACTIVE', time: '2 mins ago' },
                  { user: 'Sarah Jenkins', action: 'Uploaded Customs Declaration', target: 'DEC-2026-0819', status: 'VERIFIED', time: '14 mins ago' },
                  { user: 'David Kim', action: 'Updated Tax Code Classifications', target: 'VAT-TZ-18', status: 'PENDING', time: '1 hour ago' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar name={r.user} size={22} />
                        {r.user}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink2)' }}>{r.action}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{r.target}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={r.status === 'ACTIVE' || r.status === 'VERIFIED' ? 'success' : 'warning'}>{r.status}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink3)', fontSize: 12 }}>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={1} pageSize={10} total={48} onPageChange={() => {}} itemLabel="log entry" />
        </SectionCard>
      ),
    },

    // 4. FORM & SETTINGS BLOCKS
    {
      id: 'form-settings-card',
      title: 'Settings Form Block with Field Labels & Hints',
      category: 'forms',
      description: 'Structured form layout inside SectionCard with title, helper instructions, inputs, and action footer.',
      codeSnippet: `<SectionCard title="Tenant Branding & Identity">
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Company Name</label>
      <Input defaultValue="Hudumika Global Corp" />
    </div>
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Primary Contact Email</label>
      <Input defaultValue="ops@hudumika.io" />
    </div>
  </div>
  <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
    <Button variant="outline" size="sm">Cancel</Button>
    <Button variant="default" size="sm">Save Changes</Button>
  </div>
</SectionCard>`,
      render: () => (
        <SectionCard title="Tenant Branding & Identity">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Company Name</label>
              <Input defaultValue="Hudumika Global Corp" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Primary Contact Email</label>
              <Input defaultValue="ops@hudumika.io" />
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="outline" size="sm">Cancel</Button>
            <Button variant="default" size="sm">Save Changes</Button>
          </div>
        </SectionCard>
      ),
    },

    // 5. PRICING & CARD BLOCKS
    {
      id: 'cards-pricing-tier',
      title: 'Full-Width Plan & Subscription Cards Block',
      category: 'cards',
      description: '3-tier pricing block using repeat(auto-fit, minmax(280px, 1fr)) that stretches flush across 100% width.',
      codeSnippet: `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, width: '100%' }}>
  {[
    { name: 'Starter', price: '$6', desc: 'For solo founders & small teams', badge: null, features: ['Every module included', '100 items / mo', '10 GB storage'] },
    { name: 'Growth', price: '$18', desc: 'For growing operational teams', badge: 'MOST POPULAR', features: ['Every module included', '500 items / mo', '50 GB storage', 'WhatsApp Bot'] },
    { name: 'Enterprise', price: 'Custom', desc: 'Custom SLAs & dedicated manager', badge: 'CURRENT PLAN', features: ['Unlimited storage', '24/7 phone support', 'Custom API access'] },
  ].map(p => (
    <div key={p.name} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      {p.badge && <Badge variant={p.badge === 'MOST POPULAR' ? 'teal' : 'gray'} style={{ marginBottom: 10 }}>{p.badge}</Badge>}
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{p.name}</div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>{p.desc}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal)', marginBottom: 14 }}>{p.price} <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/user/mo</span></div>
      <Button variant={p.badge === 'CURRENT PLAN' ? 'outline' : 'default'} style={{ width: '100%' }}>Select Plan</Button>
    </div>
  ))}
</div>`,
      render: () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, width: '100%' }}>
          {[
            { name: 'Starter', price: '$6', desc: 'For solo founders & small teams', badge: null, features: ['Every module included', '100 items / mo', '10 GB storage'] },
            { name: 'Growth', price: '$18', desc: 'For growing operational teams', badge: 'MOST POPULAR', features: ['Every module included', '500 items / mo', '50 GB storage', 'WhatsApp Bot'] },
            { name: 'Enterprise', price: 'Custom', desc: 'Custom SLAs & dedicated manager', badge: 'CURRENT PLAN', features: ['Unlimited storage', '24/7 phone support', 'Custom API access'] },
          ].map(p => (
            <div key={p.name} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              {p.badge && <Badge variant={p.badge === 'MOST POPULAR' ? 'brand' : 'gray'} style={{ marginBottom: 10 }}>{p.badge}</Badge>}
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>{p.desc}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal)', marginBottom: 14 }}>{p.price} <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/user/mo</span></div>
              <Button variant={p.badge === 'CURRENT PLAN' ? 'outline' : 'default'} style={{ width: '100%' }}>Select Plan</Button>
            </div>
          ))}
        </div>
      ),
    },

    // 6. EMPTY & ERROR BLOCKS
    {
      id: 'empty-state-card',
      title: 'Empty State Illustration Block',
      category: 'empty',
      description: 'Centered empty state with FeaturedIcon circle, clear explanation text, and primary call-to-action button.',
      codeSnippet: `<div style={{ padding: 40, textAlign: 'center', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14 }}>
  <FeaturedIcon variant="brand" size="lg" shape="circle" style={{ margin: '0 auto 12px' }}>
    <Icon name="package" size={20} />
  </FeaturedIcon>
  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>No Records Found</div>
  <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 360, margin: '6px auto 16px' }}>
    There are no assets or logs matching your criteria. Get started by creating your first entry.
  </div>
  <Button variant="default" size="sm"><Icon name="plus" size={14} /> Create Record</Button>
</div>`,
      render: () => (
        <div style={{ padding: 36, textAlign: 'center', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <FeaturedIcon variant="brand" size="lg" shape="circle">
              <Icon name="package" size={20} />
            </FeaturedIcon>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No Records Found</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', maxWidth: 340, margin: '6px auto 16px' }}>
            There are no assets or logs matching your criteria. Get started by creating your first entry.
          </div>
          <Button variant="default" size="sm"><Icon name="plus" size={14} /> Create Record</Button>
        </div>
      ),
    },
  ];

  const filteredBlocks = blocks.filter(b => {
    if (activeCategory !== 'all' && b.category !== activeCategory) return false;
    if (searchQuery.trim() && !b.title.toLowerCase().includes(searchQuery.toLowerCase()) && !b.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const categories: { id: BlockCategory; label: string; icon: IconName }[] = [
    { id: 'all', label: 'All Blocks', icon: 'grid' },
    { id: 'headers', label: 'Headers', icon: 'layoutDashboard' },
    { id: 'metrics', label: 'Metrics', icon: 'barChart' },
    { id: 'tables', label: 'Tables', icon: 'fileText' },
    { id: 'forms', label: 'Forms', icon: 'edit' },
    { id: 'cards', label: 'Cards & Pricing', icon: 'layers' },
    { id: 'empty', label: 'Empty States', icon: 'package' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 4px' }}>
      {/* Header Banner */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FeaturedIcon variant="brand" size="md" shape="square"><Icon name="layoutDashboard" size={18} /></FeaturedIcon>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Building Blocks</h1>
              <Badge variant="brand">shadcn/ui style</Badge>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 8, maxWidth: 640, lineHeight: 1.5 }}>
              Pre-built page sections, dashboard blocks, stat grids, data tables, pricing grids, and empty states tailored specifically to Hudumika's design tokens and React 19 primitives.
            </p>
          </div>
          <Input
            placeholder="Search blocks…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: 240 }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {categories.map(cat => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(cat.id)}
            >
              <Icon name={cat.icon} size={14} /> {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Building Blocks List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {filteredBlocks.map(b => (
          <div key={b.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{b.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{b.description}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyCode(b.id, b.codeSnippet)}
              >
                <Icon name={copiedId === b.id ? 'check' : 'copy'} size={14} /> {copiedId === b.id ? 'Copied!' : 'Copy Code'}
              </Button>
            </div>

            {/* Live Block Canvas */}
            <div style={{ padding: 20, background: 'var(--white)' }}>
              {b.render()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
