import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FINANCE_INDUSTRIES,
  type FinanceCapabilityKey,
  type FinanceIndustryKey,
  type IndustryWork,
  type IndustryWorkLine,
  type IndustryProductionRecipe
} from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Switch } from '../components/ui/switch.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';
import { Icon, type IconName } from '../components/Icon.js';
import './FinanceIndustries.css';

const experiences: Record<
  FinanceIndustryKey,
  {
    title: string;
    noun: string;
    description: string;
    sections: string[];
    kinds: IndustryWorkLine['kind'][];
    fields: string[];
    tools: { label: string; path: string; description: string }[];
  }
> = {
  retail: {
    title: 'Retail Counter',
    noun: 'Sale Request',
    description: 'Serve counter customers, reconcile daily takings, and manage store point-of-sale inventory.',
    sections: ['Customer Requests', 'Counter Tools'],
    kinds: ['service', 'material', 'expense'],
    fields: ['Collection Point'],
    tools: [
      { label: 'Open Till & POS', path: '/finance/pos', description: 'Counter sales, shift cashups & card capture.' },
      { label: 'Stock Catalogue', path: '/finance/products', description: 'Real-time items & selling prices.' },
      { label: 'Receipts & Payments', path: '/finance/payments', description: 'Review collections & settlements.' }
    ]
  },
  wholesale: {
    title: 'Wholesale Orders',
    noun: 'Trade Order',
    description: 'Track volume trade orders, negotiated credit terms, batch delivery notes, and invoicing.',
    sections: ['Order Book', 'Trade Desk'],
    kinds: ['material', 'service', 'expense'],
    fields: ['Delivery Address', 'Trade Terms', 'PO Reference'],
    tools: [
      { label: 'Commercial Quotes', path: '/finance/quotations', description: 'Prepare tiered pricing for accounts.' },
      { label: 'Supplier Purchasing', path: '/finance/purchase-orders', description: 'Restock from approved vendors.' },
      { label: 'Delivery Documents', path: '/finance/delivery-documents', description: 'Goods issue & receiving notes.' }
    ]
  },
  manufacturing: {
    title: 'Production & Manufacturing',
    noun: 'Production Job',
    description: 'Structure multi-stage bills of materials (BOM), track conversion costs, and compare quotes to posted WIP.',
    sections: ['Production Register', 'Supply Planning'],
    kinds: ['material', 'time', 'expense', 'service'],
    fields: ['Output Specification', 'Target Quantity', 'Quality Standards'],
    tools: [
      { label: 'Material Catalogue', path: '/finance/products', description: 'Raw inputs and finished goods.' },
      { label: 'Purchase Orders', path: '/finance/purchase-orders', description: 'Procure production supplies.' },
      { label: 'Cost Ledger', path: '/finance/accounts/ledger', description: 'Review posted WIP & variances.' }
    ]
  },
  warehousing: {
    title: 'Warehouse & Storage',
    noun: 'Handling Job',
    description: 'Track customer storage leases, inbound/outbound cross-docking, and recurring logistics tariffs.',
    sections: ['Handling Queue', 'Warehouse Desk'],
    kinds: ['service', 'time', 'expense'],
    fields: ['Warehouse Bay', 'Storage Period', 'Handling Protocol'],
    tools: [
      { label: 'Delivery Records', path: '/finance/delivery-documents', description: 'Waybills & consignment receipts.' },
      { label: 'Storage Catalogue', path: '/finance/products', description: 'SKUs, pallet spots & rental units.' },
      { label: 'Customer Billing', path: '/finance/invoices', description: 'Storage & handling invoice drafts.' }
    ]
  },
  professional_services: {
    title: 'Client Engagements',
    noun: 'Engagement',
    description: 'Track timesheets, billable fee disbursements, milestones, and client retainer schedules.',
    sections: ['Active Engagements', 'Practice Desk'],
    kinds: ['time', 'service', 'expense'],
    fields: ['Scope of Work', 'Lead Partner'],
    tools: [
      { label: 'Service Quotes', path: '/finance/quotations', description: 'Scope, rate cards & retainer agreements.' },
      { label: 'Operating Expenses', path: '/finance/expenses', description: 'Disbursements & partner expenses.' },
      { label: 'Client Invoices', path: '/finance/invoices', description: 'Time & milestone billing drafts.' }
    ]
  },
  consulting: {
    title: 'Consulting Projects',
    noun: 'Project',
    description: 'Manage deliverables, track consultant utilization, and monitor budget burn against contracted milestones.',
    sections: ['Project Portfolio', 'Delivery Desk'],
    kinds: ['milestone', 'time', 'expense', 'service'],
    fields: ['Deliverables', 'Billing Agreement', 'Project Sponsor'],
    tools: [
      { label: 'Proposals & Scope', path: '/finance/quotations', description: 'Scope & deliverables sign-off.' },
      { label: 'Account Budgets', path: '/finance/accounts/budgets', description: 'Budget limits & exposure tracking.' },
      { label: 'Milestone Invoices', path: '/finance/invoices', description: 'Stage-gate billing & draws.' }
    ]
  },
  printing: {
    title: 'Print Job Tickets',
    noun: 'Print Job',
    description: 'Manage pre-press specifications, substrates, inks, finishing options, and machine run estimates.',
    sections: ['Job Tickets', 'Print Desk'],
    kinds: ['material', 'time', 'service', 'expense'],
    fields: ['Paper & Stock', 'Finished Trim Size', 'Colors (CMYK/Spot)', 'Finishing / Binding', 'Proof Sign-off'],
    tools: [
      { label: 'Print Quotations', path: '/finance/quotations', description: 'Imposition & run length estimates.' },
      { label: 'Supplies Procurement', path: '/finance/purchase-orders', description: 'Order paper, plates & ink.' },
      { label: 'Delivery Handover', path: '/finance/delivery-documents', description: 'Customer dispatch & delivery slips.' }
    ]
  },
  construction: {
    title: 'Construction Projects',
    noun: 'Construction Project',
    description: 'Control project budgets, material issues, subcontracted work, site costs, milestones, and progress billing.',
    sections: ['Project Register', 'Site & Commercial Desk'],
    kinds: ['milestone', 'material', 'time', 'service', 'expense'],
    fields: ['Site Address', 'Contract / BOQ Reference', 'Project Manager', 'Retention Terms', 'Defects Liability Period'],
    tools: [
      { label: 'Estimates & Quotations', path: '/finance/quotations', description: 'Prepare project estimates, BOQs & commercial offers.' },
      { label: 'Materials Procurement', path: '/finance/purchase-orders', description: 'Purchase site materials & subcontracted services.' },
      { label: 'Project Budgets', path: '/finance/accounts/budgets', description: 'Monitor committed and actual costs against budget.' },
      { label: 'Progress Billing', path: '/finance/invoices', description: 'Raise approved milestone and progress invoices.' }
    ]
  }
};

function Picker({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  if (!['Status', 'Currency', 'Type'].includes(label)) {
    return (
      <div className="industry-field">
        <Label>{label}</Label>
        <Combobox
          options={options}
          value={value}
          onChange={onChange}
          placeholder={`Choose ${label.toLowerCase()}`}
          searchPlaceholder={`Search ${label.toLowerCase()}`}
        />
      </div>
    );
  }
  return (
    <div className="industry-field">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="industry-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function money(amount: number | string | undefined, currency = 'TZS') {
  return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount ?? 0));
}

const writers = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'];
const categoryLabels = {
  core: 'Core Finance & Ledgers',
  accounting: 'Advanced Accounting & Compliance',
  operations: 'Operational Supply Chain',
  reporting: 'Executive Reporting & Analytics'
} as const;

export function FinanceIndustries() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');
  const configuration = useFinanceConfiguration();
  const { data: capData, loading: capLoading, error: capError, setEnabled } = useFinanceCapabilities();
  const [savingIndustries, setSavingIndustries] = useState(false);
  const [savingCap, setSavingCap] = useState<FinanceCapabilityKey | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('workspaces');
  const [industrySearch, setIndustrySearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [lineBusy, setLineBusy] = useState(false);
  const [newLine, setNewLine] = useState({ name: '', code: '' });
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState({ name: '', code: '' });

  const selectedIndustries = configuration.data?.industries ?? [];
  const recommendations = useMemo(
    () =>
      new Set(
        configuration.data?.industryDefinitions
          .filter(ind => selectedIndustries.includes(ind.key))
          .flatMap(ind => ind.recommendedCapabilities) ?? []
      ),
    [configuration.data, selectedIndustries]
  );
  const recommendedCapabilities = useMemo(
    () => capData?.capabilities.filter(item => item.status === 'available' && recommendations.has(item.key)) ?? [],
    [capData, recommendations]
  );
  const advancedAccounting = capData?.capabilities.find(item => item.key === 'finance.accounting.advanced');
  const canManageBusinessLines = canManage && advancedAccounting?.enabled === true;

  const visibleIndustries = FINANCE_INDUSTRIES.filter(industry => {
    const selected = selectedIndustries.includes(industry.key);
    const matchesFilter =
      industryFilter === 'all' || (industryFilter === 'active' ? selected : !selected);
    const query = industrySearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      `${industry.name} ${experiences[industry.key].description} ${experiences[industry.key].fields.join(' ')}`
        .toLowerCase()
        .includes(query);
    return matchesFilter && matchesSearch;
  });

  const industryIcons: Record<FinanceIndustryKey, IconName> = {
    retail: 'shoppingCart',
    wholesale: 'truck',
    manufacturing: 'settings',
    warehousing: 'warehouse',
    professional_services: 'briefcase',
    consulting: 'building',
    printing: 'printer',
    construction: 'tool'
  };

  async function toggleIndustry(key: FinanceIndustryKey, checked: boolean) {
    setSavingIndustries(true);
    setMessage(null);
    const next = checked ? [...selectedIndustries, key] : selectedIndustries.filter(k => k !== key);
    try {
      await configuration.saveIndustries(next as FinanceIndustryKey[]);
      setMessage({
        type: 'success',
        text: `Updated profile: ${experiences[key]?.title || key} is now ${checked ? 'active' : 'disabled'}.`
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message ?? 'Unable to save workspace profiles.' });
    } finally {
      setSavingIndustries(false);
    }
  }

  async function toggleCap(key: FinanceCapabilityKey, enabled: boolean) {
    setSavingCap(key);
    setMessage(null);
    try {
      await setEnabled(key, enabled);
      setMessage({
        type: 'success',
        text: `Capability ${enabled ? 'enabled' : 'disabled'} successfully.`
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message ?? 'Unable to update capability status.' });
    } finally {
      setSavingCap(null);
    }
  }

  const enabledCapsCount = capData?.capabilities.filter(item => item.enabled && item.status === 'available').length ?? 0;
  const businessLinesCount = configuration.data?.businessLines.filter(line => line.active).length ?? 0;

  return (
    <div className="industry-page finance-capabilities-page industry-erp">
      <PageHeader
        crumbs={[{ label: 'Finance', to: '/finance' }, 'Industries & ERP']}
        titlePlain="Enterprise"
        titleEm="industries"
        subtitle="Unify sector-specific operations, double-entry accounting, and multi-dimensional reporting."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {capData?.capabilities.find(item => item.key === 'finance.consolidation')?.enabled && (
              <Button asChild variant="outline">
                <Link to="/finance/accounts/multi-entity">
                  <Icon name="building" size={15} /> Multi-Entity
                </Link>
              </Button>
            )}
            <Button variant="default" onClick={() => setActiveTab('capabilities')}>
              <Icon name="sliders" size={15} /> Manage Capabilities
            </Button>
          </div>
        }
      />

      {/* ── Executive ERP Overview Banner ── */}
      <div className="erp-overview-card">
        <div className="erp-overview-content">
          <div className="erp-overview-copy">
            <FeaturedIcon size="lg" variant="brand">
              <Icon name="sparkle" size={24} color="var(--teal)" />
            </FeaturedIcon>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge variant="brand">Enterprise ERP Workspace</Badge>
                {capData?.edition && (
                  <Badge variant={capData.edition === 'advanced' ? 'success' : 'gray'}>
                    Finance {capData.edition === 'advanced' ? 'Advanced' : 'Standard'}
                  </Badge>
                )}
              </div>
              <h2>Unified Business Operating Systems</h2>
              <p>
                Run distinct industry operations with synchronized customers, global chart of accounts, and continuous inventory tracking. Segment P&L by business lines and consolidate multi-currency legal entities in one place.
              </p>
            </div>
          </div>

          <div className="erp-overview-stats" aria-label="Workspace configuration metrics">
            <div>
              <strong>{configuration.loading || configuration.error ? '—' : selectedIndustries.length}</strong>
              <span>Active Profiles</span>
            </div>
            <div>
              <strong>{capLoading || capError ? '—' : enabledCapsCount}</strong>
              <span>Enabled Modules</span>
            </div>
            <div>
              <strong>{configuration.loading || configuration.error ? '—' : businessLinesCount}</strong>
              <span>Business Lines</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Foundation Cards ── */}
      <div className="erp-foundation-grid">
        <div className="erp-foundation-card">
          <div className="erp-foundation">
            <FeaturedIcon variant="brand" size="md">
              <Icon name="building" size={20} color="var(--teal)" />
            </FeaturedIcon>
            <div>
              <h3>Legal Entities & Multi-Book</h3>
              <p>Separate entity ledgers with automated intercompany settlements and consolidated financial reports.</p>
            </div>
            {capData?.capabilities.find(item => item.key === 'finance.consolidation')?.enabled ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/finance/accounts/multi-entity">View Entities →</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setActiveTab('capabilities')}>
                Requirements
              </Button>
            )}
          </div>
        </div>

        <div className="erp-foundation-card">
          <div className="erp-foundation">
            <FeaturedIcon variant="brand" size="md">
              <Icon name="layers" size={20} color="var(--teal)" />
            </FeaturedIcon>
            <div>
              <h3>Business Line Dimensions</h3>
              <p>Tag cost journals, revenue lines, and job expenses to departmental segments without separate subscriptions.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActiveTab('lines')}>
              Manage Lines →
            </Button>
          </div>
        </div>
      </div>

      {/* Alert Notices */}
      {!canManage && (
        <Banner variant="info">
          You are viewing this workspace in read-only mode. Workspace administrators configure industry profiles, modules, and business lines.
        </Banner>
      )}
      {message && (
        <Banner variant={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </Banner>
      )}

      {/* ── Main Tabbed Section ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList aria-label="Finance workspace sections" style={{ marginBottom: 20 }}>
          <TabsTrigger value="workspaces" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="layoutDashboard" size={15} />
            <span>Industry Profiles</span>
            <Badge variant="gray" style={{ marginLeft: 4, padding: '1px 6px', fontSize: 11 }}>
              {selectedIndustries.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="capabilities" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="sliders" size={15} />
            <span>Capabilities & Modules</span>
            <Badge variant="gray" style={{ marginLeft: 4, padding: '1px 6px', fontSize: 11 }}>
              {enabledCapsCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="lines" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="layers" size={15} />
            <span>Business Lines</span>
            <Badge variant="gray" style={{ marginLeft: 4, padding: '1px 6px', fontSize: 11 }}>
              {businessLinesCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Industry Workspaces ── */}
        <TabsContent value="workspaces">
          <div className="erp-section-heading">
            <div>
              <h2>Industry Operating Workspaces</h2>
              <p>Activate pre-configured workflows tailored to your commerce, service, or manufacturing processes.</p>
            </div>
            <Badge variant="gray">
              {visibleIndustries.length} of {FINANCE_INDUSTRIES.length} profiles visible
            </Badge>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="erp-filter-row">
            <div style={{ flex: 1, minWidth: 260, maxWidth: 460 }}>
              <SearchToolbar
                search={industrySearch}
                onSearch={setIndustrySearch}
                placeholder="Search industries, operational fields, or tools…"
              />
            </div>
            <div className="erp-filter-pills">
              <button
                type="button"
                className={`erp-filter-pill${industryFilter === 'all' ? ' erp-filter-pill--active' : ''}`}
                onClick={() => setIndustryFilter('all')}
              >
                All Profiles ({FINANCE_INDUSTRIES.length})
              </button>
              <button
                type="button"
                className={`erp-filter-pill${industryFilter === 'active' ? ' erp-filter-pill--active' : ''}`}
                onClick={() => setIndustryFilter('active')}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--teal)',
                    display: 'inline-block'
                  }}
                />
                Active Only ({selectedIndustries.length})
              </button>
              <button
                type="button"
                className={`erp-filter-pill${industryFilter === 'inactive' ? ' erp-filter-pill--active' : ''}`}
                onClick={() => setIndustryFilter('inactive')}
              >
                Available ({FINANCE_INDUSTRIES.length - selectedIndustries.length})
              </button>
            </div>
          </div>

          {configuration.error && <Banner variant="error">{configuration.error}</Banner>}

          {configuration.loading ? (
            <SectionLoading label="Loading industry workspace profiles…" />
          ) : (
            <div className="erp-industry-grid">
              {visibleIndustries.map(industry => {
                const isSelected = selectedIndustries.includes(industry.key);
                const exp = experiences[industry.key];
                return (
                  <Card
                    key={industry.key}
                    className={`erp-industry-card${isSelected ? ' erp-industry-card--active' : ''}`}
                  >
                    <CardHeader>
                      <div className="erp-card-identity">
                        <FeaturedIcon variant={isSelected ? 'brand' : 'gray'} size="lg">
                          <Icon name={industryIcons[industry.key]} size={22} color={isSelected ? 'var(--teal)' : 'var(--ink2)'} />
                        </FeaturedIcon>
                        <Badge variant={isSelected ? 'success' : 'gray'}>
                          {isSelected ? '● Active Profile' : 'Available'}
                        </Badge>
                      </div>
                      <CardTitle>{industry.name}</CardTitle>
                      <CardDescription className="erp-card-description">{exp.description}</CardDescription>
                    </CardHeader>

                    <CardContent>
                      <div className="erp-workflow-label">Key Dimensions</div>
                      <div className="industry-tags">
                        {exp.fields.slice(0, 3).map(field => (
                          <Badge key={field} variant="gray" style={{ fontSize: 11 }}>
                            {field}
                          </Badge>
                        ))}
                      </div>

                      <div className="erp-workflow-label" style={{ marginTop: 12 }}>
                        Operational Modules
                      </div>
                      <ul className="erp-tool-list">
                        {exp.tools.map(tool => (
                          <li key={tool.path}>
                            <Icon name="checkCircle" size={15} color="var(--teal)" />
                            <span>{tool.label}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>

                    <div className="erp-card-footer">
                      {canManage ? (
                        <label className="erp-profile-switch" title={`Toggle ${industry.name} profile active status`}>
                          <span>Use Profile</span>
                          <Switch
                            aria-label={`Toggle ${industry.name} profile`}
                            checked={isSelected}
                            disabled={savingIndustries || !!configuration.error}
                            onCheckedChange={checked => void toggleIndustry(industry.key, checked)}
                          />
                        </label>
                      ) : (
                        <p className="erp-profile-readonly">{isSelected ? 'Active Profile' : 'Not Activated'}</p>
                      )}

                      <Button asChild variant={isSelected ? 'default' : 'outline'} size="sm">
                        <Link to={`/finance/industries/${industry.key}`}>
                          Open Workspace <Icon name="arrowRight" size={14} />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}

              {!visibleIndustries.length && (
                <div className="erp-no-results">
                  <div className="industry-empty">
                    <FeaturedIcon variant="gray" size="lg">
                      <Icon name="search" size={24} color="var(--ink3)" />
                    </FeaturedIcon>
                    <h3 style={{ margin: '8px 0 4px', fontWeight: 700, color: 'var(--ink)' }}>No matching industry profiles</h3>
                    <p style={{ margin: 0, color: 'var(--ink3)', fontSize: '0.875rem' }}>
                      Try adjusting your search criteria or switch back to "All Profiles".
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIndustrySearch('');
                        setIndustryFilter('all');
                      }}
                      style={{ marginTop: 12 }}
                    >
                      Reset Filters
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Recommended Capabilities Matching Active Industries ── */}
          {selectedIndustries.length > 0 && capData && recommendedCapabilities.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <Card>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FeaturedIcon variant="brand" size="sm">
                      <Icon name="sparkle" size={16} color="var(--teal)" />
                    </FeaturedIcon>
                    <div>
                      <CardTitle>Recommended Capabilities for Selected Industries</CardTitle>
                      <CardDescription>
                        Modules tailored to enhance your {selectedIndustries.length} active profile{selectedIndustries.length > 1 ? 's' : ''}.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="industry-recommendation-list">
                  {recommendedCapabilities.map(item => (
                    <div className="industry-recommendation-row" key={item.key}>
                      <FeaturedIcon variant={item.enabled ? 'success' : 'gray'} size="sm">
                        <Icon name={item.enabled ? 'checkCircle' : item.entitled ? 'settings' : 'lock'} size={16} />
                      </FeaturedIcon>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.enabled ? 'Active and operational' : item.entitled ? 'Included with your plan — ready to enable' : 'Requires Finance Advanced edition'}</small>
                      </div>
                      {item.enabled ? (
                        <Badge variant="success">Enabled</Badge>
                      ) : item.entitled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManage || savingCap === item.key}
                          onClick={() => void toggleCap(item.key, true)}
                        >
                          Enable Module
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/workspace/billing">Upgrade Edition</Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Capabilities & Modules ── */}
        <TabsContent value="capabilities">
          {capLoading ? (
            <SectionLoading label="Loading capabilities & module matrix…" />
          ) : capError ? (
            <Banner variant="error">{capError}</Banner>
          ) : capData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="finance-edition-card">
                <div>
                  <span className="finance-capabilities-eyebrow">ACTIVE WORKSPACE EDITION</span>
                  <h2>Finance {capData.edition === 'advanced' ? 'Advanced Enterprise' : 'Basic Standard'}</h2>
                  <p>
                    Turning available capabilities on or off configures the workflow scope for this specific tenant without altering billing.
                  </p>
                  <small>
                    {capData.usage.limit == null
                      ? `${capData.usage.used.toLocaleString()} actions executed this cycle · Unlimited Quota`
                      : `${capData.usage.used.toLocaleString()} of ${capData.usage.limit.toLocaleString()} monthly finance actions consumed`}
                  </small>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <Badge variant={capData.edition === 'advanced' ? 'brand' : 'gray'} style={{ fontSize: 13, padding: '4px 12px' }}>
                    {capData.edition === 'advanced' ? 'Advanced Edition' : 'Standard Edition'}
                  </Badge>
                  {capData.edition !== 'advanced' && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/workspace/billing">Upgrade to Advanced</Link>
                    </Button>
                  )}
                </div>
              </div>

              {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map(category => {
                const items = capData.capabilities.filter(item => item.category === category && item.status === 'available');
                if (!items.length) return null;
                const enabledCount = items.filter(item => item.enabled).length;

                return (
                  <div className="finance-capability-section" key={category}>
                    <header>
                      <h2>{categoryLabels[category]}</h2>
                      <span>
                        {enabledCount} of {items.length} active
                      </span>
                    </header>
                    <div className="finance-capability-list">
                      {items.map(item => (
                        <div className="finance-capability-row" key={item.key}>
                          <FeaturedIcon variant={item.entitled ? (item.enabled ? 'brand' : 'gray') : 'gray'} size="sm">
                            <Icon name={item.enabled ? 'checkCircle' : item.entitled ? 'settings' : 'lock'} size={16} />
                          </FeaturedIcon>
                          <div className="finance-capability-copy">
                            <div className="finance-capability-title">
                              <strong>{item.name}</strong>
                              <Badge variant={item.state === 'enabled' ? 'success' : item.state === 'available' ? 'warning' : 'gray'}>
                                {item.state === 'not_entitled' ? 'Requires Upgrade' : item.state === 'available' ? 'Available' : 'Enabled'}
                              </Badge>
                              {recommendations.has(item.key) && <Badge variant="brand">Recommended</Badge>}
                            </div>
                            <p>{item.description}</p>
                            {item.dependencies.length > 0 && (
                              <small>
                                Prerequisite:{' '}
                                {item.dependencies
                                  .map(key => capData.capabilities.find(cap => cap.key === key)?.name ?? key)
                                  .join(', ')}
                              </small>
                            )}
                          </div>
                          {item.configurable && (
                            <Switch
                              aria-label={`Toggle ${item.name}`}
                              checked={item.enabled}
                              disabled={!canManage || !item.entitled || savingCap === item.key}
                              onCheckedChange={checked => void toggleCap(item.key, checked)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </TabsContent>

        {/* ── Tab 3: Business Lines ── */}
        <TabsContent value="lines">
          <div className="finance-capability-section finance-configuration-section">
            <header>
              <div>
                <h2>Business Lines & Operational Segments</h2>
                <span>Tag accounting transactions and project costs to internal divisions without separate subscriptions.</span>
              </div>
            </header>

            {!advancedAccounting?.entitled && (
              <div style={{ padding: '16px 24px' }}>
                <Banner variant="info">
                  Business line management and segment dimensions require the Finance Advanced package. Existing lines remain visible.
                </Banner>
              </div>
            )}

            {advancedAccounting?.entitled && !advancedAccounting.enabled && (
              <div style={{ padding: '16px 24px' }}>
                <Banner variant="info">
                  Enable the Advanced Accounting module in the Capabilities tab to create, rename, or archive business line dimensions.
                </Banner>
              </div>
            )}

            {canManageBusinessLines && (
              <form
                className="finance-line-form"
                onSubmit={async event => {
                  event.preventDefault();
                  if (!newLine.name.trim() || !newLine.code.trim()) return;
                  setLineBusy(true);
                  setMessage(null);
                  try {
                    await configuration.createBusinessLine(newLine);
                    setNewLine({ name: '', code: '' });
                    setMessage({ type: 'success', text: `Business line "${newLine.name}" added.` });
                  } catch (err: any) {
                    setMessage({ type: 'error', text: err.message });
                  } finally {
                    setLineBusy(false);
                  }
                }}
              >
                <Input
                  aria-label="Business line name"
                  placeholder="e.g. Retail Division, Port Operations"
                  value={newLine.name}
                  onChange={event => setNewLine(current => ({ ...current, name: event.target.value }))}
                />
                <Input
                  aria-label="Business line code"
                  placeholder="Code (e.g. RET, OPS)"
                  value={newLine.code}
                  onChange={event => setNewLine(current => ({ ...current, code: event.target.value }))}
                />
                <Button type="submit" disabled={lineBusy || !newLine.name.trim() || !newLine.code.trim()}>
                  <Icon name="plus" size={15} /> {lineBusy ? 'Saving…' : 'Add Business Line'}
                </Button>
              </form>
            )}

            {configuration.loading ? (
              <SectionLoading label="Loading business lines…" />
            ) : (
              <div className="finance-business-lines">
                {configuration.data?.businessLines.map(line => (
                  <div className="finance-business-line" key={line.id}>
                    {editingLine === line.id ? (
                      <>
                        <Input
                          aria-label="Business line name"
                          value={lineDraft.name}
                          onChange={event => setLineDraft(current => ({ ...current, name: event.target.value }))}
                        />
                        <Input
                          aria-label="Business line code"
                          value={lineDraft.code}
                          onChange={event => setLineDraft(current => ({ ...current, code: event.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={lineBusy || !lineDraft.name.trim() || !lineDraft.code.trim()}
                          onClick={async () => {
                            setLineBusy(true);
                            setMessage(null);
                            try {
                              await configuration.updateBusinessLine(line.id, lineDraft);
                              setEditingLine(null);
                              setMessage({ type: 'success', text: 'Business line updated.' });
                            } catch (err: any) {
                              setMessage({ type: 'error', text: err.message });
                            } finally {
                              setLineBusy(false);
                            }
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingLine(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>{line.name}</strong>
                            <Badge variant="gray" style={{ fontSize: 11 }}>
                              {line.code}
                            </Badge>
                            {!line.active && <Badge variant="warning">Archived</Badge>}
                          </div>
                          <small>{line.active ? 'Active segment for journal tagging' : 'Archived dimension'}</small>
                        </div>
                        {canManageBusinessLines && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingLine(line.id);
                                setLineDraft({ name: line.name, code: line.code });
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={lineBusy}
                              onClick={async () => {
                                setLineBusy(true);
                                setMessage(null);
                                try {
                                  await configuration.updateBusinessLine(line.id, { active: !line.active });
                                  setMessage({
                                    type: 'success',
                                    text: `Business line ${line.active ? 'archived' : 'restored'}.`
                                  });
                                } catch (err: any) {
                                  setMessage({ type: 'error', text: err.message });
                                } finally {
                                  setLineBusy(false);
                                }
                              }}
                            >
                              {line.active ? 'Archive' : 'Restore'}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {configuration.data?.businessLines.length === 0 && (
                  <p className="finance-empty-copy">
                    No business lines defined yet. Add lines to track divisional P&L segments across accounting entries.
                  </p>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function FinanceIndustryWorkspace() {
  const { industry: key } = useParams();
  const industry = key as FinanceIndustryKey;
  const config = experiences[industry];
  const { user } = useAuth();
  const canWrite = writers.includes(user?.role ?? '');
  const [data, setData] = useState<{ items: IndustryWork[]; total: number }>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!config) return;
    let live = true;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(
      () =>
        apiFetch(
          `/v1/finance/industries?industry=${industry}&page=${page}&search=${encodeURIComponent(search)}${status === 'all' ? '' : `&status=${status}`}`
        )
          .then(result => {
            if (live) setData(result);
          })
          .catch(err => {
            if (live) setError(err.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          }),
      250
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [industry, page, status, search]);

  if (!config) return <Banner variant="error">Industry profile not found.</Banner>;

  return (
    <div className={`industry-page industry-${industry}`}>
      <PageHeader
        crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Industries', to: '/finance/industries' }, config.title]}
        titlePlain={config.title}
        subtitle={config.description}
        actions={
          canWrite && (
            <Button asChild>
              <Link to={`/finance/industries/${industry}/new`}>
                <Icon name="plus" size={15} /> New {config.noun}
              </Link>
            </Button>
          )
        }
      />
      <div className="industry-workspace-grid">
        <Card className="industry-register">
          <CardHeader>
            <CardTitle>{config.sections[0]}</CardTitle>
            <CardDescription>{data.total} records · Customer-linked work and approved billing lines</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="industry-toolbar">
              <SearchToolbar placeholder="Search work…" search={search} onSearch={value => { setSearch(value); setPage(1); }} />
              <Picker
                label="Status"
                value={status}
                onChange={value => { setStatus(value); setPage(1); }}
                options={['all', 'draft', 'active', 'completed', 'cancelled'].map(value => ({
                  value,
                  label: value === 'all' ? 'All statuses' : value.charAt(0).toUpperCase() + value.slice(1)
                }))}
              />
            </div>
            {error ? (
              <Banner variant="error">{error}</Banner>
            ) : loading ? (
              <SectionLoading label="Loading work orders…" />
            ) : data.items.length ? (
              <div className="industry-records">
                {data.items.map(work => (
                  <Link className="industry-record" key={work.id} to={`/finance/industries/${industry}/${work.id}`}>
                    <div>
                      <small>{work.reference}</small>
                      <strong>{work.name}</strong>
                      <span>{work.customer_name}</span>
                    </div>
                    <div>
                      <Badge variant={work.status === 'active' ? 'success' : work.status === 'completed' ? 'brand' : 'gray'}>
                        {work.status}
                      </Badge>
                      <small>Budget {money(work.budget, work.currency)}</small>
                      {work.due_date && <small>Due {String(work.due_date).slice(0, 10)}</small>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="industry-empty">
                <FeaturedIcon variant="gray" size="lg">
                  <Icon name="inbox" size={24} />
                </FeaturedIcon>
                <h3>No {config.noun.toLowerCase()}s recorded yet</h3>
                <p>Create customer work orders, capture materials and service lines, and approve charges for billing.</p>
                {canWrite && (
                  <Button asChild style={{ marginTop: 10 }}>
                    <Link to={`/finance/industries/${industry}/new`}>
                      <Icon name="plus" size={15} /> Create {config.noun}
                    </Link>
                  </Button>
                )}
              </div>
            )}
            <div className="industry-pagination">
              <span>Page {page} of {Math.max(1, Math.ceil(data.total / 20))}</span>
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= data.total || loading} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle>{config.sections[1]}</CardTitle>
            </CardHeader>
            <CardContent className="industry-tools">
              {config.tools.map(tool => (
                <Link key={tool.path} to={tool.path}>
                  <strong>{tool.label}</strong>
                  <span>{tool.description}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accounting Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink3)', lineHeight: 1.6, margin: '0 0 10px' }}>
                Job estimates do not directly post to the GL ledger. Actual costs are recognized through expense claims, vendor bills, and inventory dispatches.
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink3)', lineHeight: 1.6, margin: 0 }}>
                Approved billing charges generate compliant invoice drafts ready for customer delivery.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export function FinanceIndustryNew() {
  const { industry: key } = useParams();
  const industry = key as FinanceIndustryKey;
  const config = experiences[industry];
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', customer_id: '', currency: 'TZS', budget: '', due_date: '' });
  const [specifications, setSpecifications] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    apiFetch('/v1/customers')
      .then(result => {
        if (live) setCustomers(result.data ?? []);
      })
      .catch(err => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!config) return <Banner variant="error">Industry not found.</Banner>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const work = await apiFetch<IndustryWork>('/v1/finance/industries', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          industry,
          budget: Number(form.budget || 0),
          due_date: form.due_date || undefined,
          specifications
        })
      });
      navigate(`/finance/industries/${industry}/${work.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="industry-page">
      <PageHeader
        crumbs={['Finance', config.title]}
        titlePlain={`New ${config.noun}`}
        variant="create"
        backTo={`/finance/industries/${industry}`}
        subtitle="Specify the customer, budget, and job requirements."
      />
      <Card>
        <CardContent className="industry-form-content">
          <form onSubmit={submit}>
            <div className="industry-form-grid">
              <Field label="Job / Request Name">
                <Input required maxLength={160} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Picker
                label="Customer"
                value={form.customer_id}
                onChange={customer_id => setForm({ ...form, customer_id })}
                options={customers.map(customer => ({ value: customer.id, label: customer.name }))}
              />
              <Picker
                label="Currency"
                value={form.currency}
                onChange={currency => setForm({ ...form, currency })}
                options={['TZS', 'USD', 'EUR', 'GBP', 'KES', 'UGX'].map(value => ({ value, label: value }))}
              />
              <Field label="Estimated Cost Budget">
                <Input type="number" min="0" step="0.01" value={form.budget} onChange={event => setForm({ ...form, budget: event.target.value })} />
              </Field>
              <Field label="Target Due Date">
                <DatePicker date={parseDateOnly(form.due_date)} onChange={date => setForm({ ...form, due_date: toDateOnlyString(date) })} placeholder="Choose target date" />
              </Field>
              {config.fields.map(field => (
                <Field key={field} label={field}>
                  <Input maxLength={1000} value={specifications[field] ?? ''} onChange={event => setSpecifications({ ...specifications, [field]: event.target.value })} />
                </Field>
              ))}
            </div>
            {error && <Banner variant="error">{error}</Banner>}
            <div className="industry-form-actions">
              <Button asChild variant="outline">
                <Link to={`/finance/industries/${industry}`}>Cancel</Link>
              </Button>
              <Button type="submit" disabled={saving || !form.customer_id}>
                {saving ? 'Creating…' : 'Create Job'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function FinanceIndustryWorkDetail() {
  const { industry: key, id } = useParams();
  const industry = key as FinanceIndustryKey;
  const config = experiences[industry];
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = writers.includes(user?.role ?? '');
  const { data: access } = useFinanceCapabilities();
  const productionEnabled = ['finance.inventory', 'finance.accounting.advanced'].every(key =>
    access?.capabilities.some(item => item.key === key && item.enabled)
  );
  const inventoryEnabled = access?.capabilities.some(item => item.key === 'finance.inventory' && item.enabled);
  const accountingEnabled = access?.capabilities.some(item => item.key === 'finance.accounting.advanced' && item.enabled);
  const [work, setWork] = useState<IndustryWork | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState({
    kind: 'service',
    description: '',
    quantity: '1',
    unit: 'unit',
    rate: '',
    cost_rate: '',
    billable: true,
    work_date: new Date().toISOString().slice(0, 10)
  });
  const [outputQuantities, setOutputQuantities] = useState<Record<string, string>>({});
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setWork(null);
    setError('');
    apiFetch<IndustryWork>(`/v1/finance/industries/${id}`)
      .then(result => {
        if (live) setWork(result);
      })
      .catch(err => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [id]);

  async function refresh() {
    setWork(await apiFetch<IndustryWork>(`/v1/finance/industries/${id}`));
  }

  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      await refresh();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function bill() {
    setBusy(true);
    setError('');
    try {
      const invoice = await apiFetch<{ id: string }>('/v1/invoices', { method: 'POST', body: JSON.stringify({ industry_work_id: id }) });
      navigate(`/finance/invoices?id=${invoice.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!config) return <Banner variant="error">Industry profile not found.</Banner>;
  if (!work && error) return <div className="industry-page"><Banner variant="error">{error}</Banner></div>;
  if (!work) return <SectionLoading label="Loading work details…" />;
  if (work.industry !== industry) return <Banner variant="error">This work belongs to a different industry workspace.</Banner>;

  const editable = ['draft', 'active'].includes(work.status);
  const unbilled = work.lines?.some(item => item.approved && item.billable && !item.invoice_id);

  return (
    <div className="industry-page">
      <PageHeader
        crumbs={[{ label: 'Finance', to: '/finance' }, { label: config.title, to: `/finance/industries/${industry}` }, work.reference]}
        titlePlain={work.name}
        subtitle={`${work.reference} · Status: ${work.status.toUpperCase()}`}
        actions={
          <div className="industry-actions">
            {canWrite && work.status === 'draft' && (
              <Button disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/status`, 'PATCH', { status: 'active' })}>
                Activate Work
              </Button>
            )}
            {canWrite && work.status === 'active' && (
              <Button
                variant="outline"
                disabled={busy || work.lines?.some(item => !item.approved)}
                onClick={() => action(`/v1/finance/industries/${id}/status`, 'PATCH', { status: 'completed' })}
              >
                Complete
              </Button>
            )}
            {canWrite && unbilled && work.status !== 'draft' && work.status !== 'cancelled' && (
              <Button disabled={busy} onClick={bill}>
                Create Invoice Draft
              </Button>
            )}
            {work.invoice_id && (
              <Button asChild variant="outline">
                <Link to={`/finance/invoices?id=${work.invoice_id}`}>View Invoice Draft</Link>
              </Button>
            )}
          </div>
        }
      />
      {error && <Banner variant="error">{error}</Banner>}

      {/* Summary KPI Cards */}
      <div className="industry-summary-grid">
        {[
          ['Cost Budget', work.budget],
          ['Estimated Charges', work.estimated_revenue],
          ['Estimated Costs', work.estimated_cost],
          ['Estimated Margin', Number(work.estimated_revenue) - Number(work.estimated_cost)]
        ].map(([label, amount]) => (
          <Card key={String(label)}>
            <CardHeader style={{ padding: '16px 20px' }}>
              <CardDescription>{label}</CardDescription>
              <CardTitle style={{ fontSize: '1.25rem', marginTop: 4 }}>{money(amount as number, work.currency)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {work.currency === 'TZS' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Posted General Ledger Results</CardTitle>
                <CardDescription>
                  Direct costs and ledger items tagged to this job. Excludes general overhead.
                </CardDescription>
              </div>
              {canWrite && accountingEnabled && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/finance/industries/${industry}/${id}/costs`}>Allocate Posted Costs</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="industry-summary-grid" style={{ marginBottom: 16 }}>
              <div>
                <small style={{ color: 'var(--ink3)' }}>Revenue (ex. VAT)</small>
                <h3 style={{ margin: '4px 0 0', color: 'var(--ink)' }}>{money(work.posted_revenue)}</h3>
              </div>
              <div>
                <small style={{ color: 'var(--ink3)' }}>Recognised Direct Costs</small>
                <h3 style={{ margin: '4px 0 0', color: 'var(--ink)' }}>{money(work.posted_cost)}</h3>
              </div>
              <div>
                <small style={{ color: 'var(--ink3)' }}>Realised Margin</small>
                <h3 style={{ margin: '4px 0 0', color: 'var(--teal)' }}>
                  {money(Number(work.posted_revenue) - Number(work.posted_cost))}
                </h3>
              </div>
              <div>
                <small style={{ color: 'var(--ink3)' }}>Budget Variance</small>
                <h3 style={{ margin: '4px 0 0', color: 'var(--ink)' }}>
                  {money(Number(work.budget) - Number(work.posted_cost))}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Allocation & Dispatch */}
      {['retail', 'wholesale', 'warehousing', 'manufacturing', 'printing', 'construction'].includes(industry) && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Stock Allocations & Dispatches</CardTitle>
                <CardDescription>Reserve inventory items for this job. Dispatches automatically trigger COGS entries.</CardDescription>
              </div>
              {canWrite && work.status === 'active' && inventoryEnabled && (
                <Button asChild size="sm">
                  <Link to={`/finance/industries/${industry}/${id}/allocation/new`}>
                    <Icon name="plus" size={14} /> Allocate Stock
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!inventoryEnabled && <Banner variant="info">Enable Inventory module to reserve and dispatch stock.</Banner>}
            <div className="industry-records">
              {work.allocations?.map(allocation => (
                <div className="industry-record" key={allocation.id}>
                  <div>
                    <strong>{allocation.item_name}</strong>
                    <small>
                      {allocation.quantity} {allocation.unit} allocated · {allocation.dispatched_quantity} dispatched
                      {allocation.batch ? ` · Batch: ${allocation.batch}` : ''}
                    </small>
                    {allocation.released && <Badge variant="gray">Released</Badge>}
                  </div>
                  {canWrite &&
                    inventoryEnabled &&
                    work.status === 'active' &&
                    !allocation.released &&
                    Number(allocation.dispatched_quantity) < Number(allocation.quantity) && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Input
                          aria-label={`Dispatch quantity for ${allocation.item_name}`}
                          type="number"
                          min="0.0001"
                          max={Number(allocation.quantity) - Number(allocation.dispatched_quantity)}
                          step="0.0001"
                          placeholder="Qty"
                          style={{ width: 100 }}
                          value={dispatchQuantities[allocation.id] ?? ''}
                          onChange={event => setDispatchQuantities({ ...dispatchQuantities, [allocation.id]: event.target.value })}
                        />
                        <Button
                          size="sm"
                          disabled={busy || !dispatchQuantities[allocation.id]}
                          onClick={() =>
                            action(`/v1/finance/industries/${id}/allocations/${allocation.id}/dispatch`, 'POST', {
                              quantity: Number(dispatchQuantities[allocation.id])
                            })
                          }
                        >
                          Dispatch
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => action(`/v1/finance/industries/${id}/allocations/${allocation.id}/release`, 'POST')}
                        >
                          Release
                        </Button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Production Orders / WIP */}
      {['manufacturing', 'printing'].includes(industry) && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Production Orders & WIP</CardTitle>
                <CardDescription>Consume raw material recipes into WIP and receive finished yield.</CardDescription>
              </div>
              {canWrite && editable && productionEnabled && (
                <Button asChild size="sm">
                  <Link to={`/finance/industries/${industry}/${id}/production/new`}>
                    <Icon name="plus" size={14} /> New Production Order
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!productionEnabled && <Banner variant="info">Enable Inventory and Advanced Accounting to run production.</Banner>}
            <div className="industry-records">
              {work.production?.map(order => (
                <div className="industry-record" key={order.id}>
                  <div>
                    <strong>{order.status.toUpperCase()} · Planned: {order.planned_quantity}</strong>
                    <small>
                      Material: {money(order.material_cost)} · Conversion: {money(order.conversion_cost)}
                    </small>
                    {order.actual_quantity && <small>Actual Output: {order.actual_quantity}</small>}
                  </div>
                  {canWrite && productionEnabled && work.status === 'active' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {order.status === 'draft' && (
                        <Button size="sm" disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/production/${order.id}/release`, 'POST', {})}>
                          Release Materials
                        </Button>
                      )}
                      {order.status === 'released' && (
                        <>
                          <Input
                            aria-label="Actual output quantity"
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            placeholder="Actual Yield"
                            style={{ width: 120 }}
                            value={outputQuantities[order.id] ?? ''}
                            onChange={event => setOutputQuantities({ ...outputQuantities, [order.id]: event.target.value })}
                          />
                          <Button
                            size="sm"
                            disabled={busy || Number(outputQuantities[order.id]) <= 0 || !outputQuantities[order.id]}
                            onClick={() =>
                              action(`/v1/finance/industries/${id}/production/${order.id}/complete`, 'POST', {
                                actual_quantity: Number(outputQuantities[order.id])
                              })
                            }
                          >
                            Receive Output
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work & Billing Lines */}
      <Card>
        <CardHeader>
          <CardTitle>
            {industry === 'consulting'
              ? 'Milestones & Time Records'
              : industry === 'printing'
              ? 'Materials, Finishing & Labor Lines'
              : industry === 'professional_services'
              ? 'Fee Schedules & Disbursements'
              : 'Work Lines & Billing Charges'}
          </CardTitle>
          <CardDescription>Approved lines are staged for batch invoicing. Draft invoices lock billed lines.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="industry-records">
            {work.lines?.map(item => (
              <div className="industry-record" key={item.id}>
                <div>
                  <strong>{item.description}</strong>
                  <small>
                    {item.kind} · {item.quantity} {item.unit} @ {money(item.rate, work.currency)}
                  </small>
                  <small>{item.billable ? 'Billable to Customer' : 'Internal Non-Billable'} · {item.approved ? 'Approved' : 'Pending Approval'}</small>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <strong style={{ fontSize: '0.9375rem', color: 'var(--ink)' }}>
                    {money(Number(item.quantity) * Number(item.rate), work.currency)}
                  </strong>
                  {item.invoice_id ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/finance/invoices?id=${item.invoice_id}`}>Invoiced Draft →</Link>
                    </Button>
                  ) : (
                    canWrite &&
                    !item.approved &&
                    editable && (
                      <div className="industry-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditingLineId(item.id);
                            setLine({
                              kind: item.kind,
                              description: item.description,
                              quantity: String(item.quantity),
                              unit: item.unit,
                              rate: String(item.rate),
                              cost_rate: String(item.cost_rate),
                              billable: item.billable,
                              work_date: item.work_date
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/lines/${item.id}/approve`, 'POST')}>
                          Approve
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {canWrite && editable && (
            <form
              className="industry-line-form"
              onSubmit={async event => {
                event.preventDefault();
                const saved = await action(
                  `/v1/finance/industries/${id}/lines${editingLineId ? `/${editingLineId}` : ''}`,
                  editingLineId ? 'PATCH' : 'POST',
                  {
                    ...line,
                    kind: config.kinds.includes(line.kind as IndustryWorkLine['kind']) ? line.kind : config.kinds[0],
                    quantity: Number(line.quantity),
                    rate: Number(line.rate || 0),
                    cost_rate: Number(line.cost_rate || 0)
                  }
                );
                if (saved) {
                  setEditingLineId(null);
                  setLine({
                    kind: config.kinds[0],
                    description: '',
                    quantity: '1',
                    unit: 'unit',
                    rate: '',
                    cost_rate: '',
                    billable: true,
                    work_date: new Date().toISOString().slice(0, 10)
                  });
                }
              }}
            >
              <h3>{editingLineId ? 'Edit Work Line' : 'Add Work Line'}</h3>
              <div className="industry-form-grid">
                <Picker
                  label="Type"
                  value={config.kinds.includes(line.kind as IndustryWorkLine['kind']) ? line.kind : config.kinds[0]}
                  onChange={kind => setLine({ ...line, kind })}
                  options={config.kinds.map(value => ({ value, label: value }))}
                />
                <Field label="Description">
                  <Input required maxLength={500} value={line.description} onChange={event => setLine({ ...line, description: event.target.value })} />
                </Field>
                <Field label="Quantity">
                  <Input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event => setLine({ ...line, quantity: event.target.value })} />
                </Field>
                <Field label="Unit of Measure">
                  <Input required maxLength={50} value={line.unit} onChange={event => setLine({ ...line, unit: event.target.value })} />
                </Field>
                <Field label="Billable Rate">
                  <Input type="number" min="0" step="0.0001" value={line.rate} onChange={event => setLine({ ...line, rate: event.target.value })} />
                </Field>
                <Field label="Estimated Cost per Unit">
                  <Input type="number" min="0" step="0.0001" value={line.cost_rate} onChange={event => setLine({ ...line, cost_rate: event.target.value })} />
                </Field>
                <Field label="Date of Work">
                  <DatePicker date={parseDateOnly(line.work_date)} onChange={date => setLine({ ...line, work_date: toDateOnlyString(date) })} placeholder="Choose work date" />
                </Field>
              </div>
              <label className="industry-check">
                <Checkbox checked={line.billable} onCheckedChange={value => setLine({ ...line, billable: value === true })} />
                <span>Billable to customer</span>
              </label>
              <div className="industry-actions">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : editingLineId ? 'Save Changes' : 'Add Line'}
                </Button>
                {editingLineId && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditingLineId(null);
                      setLine({
                        kind: config.kinds[0],
                        description: '',
                        quantity: '1',
                        unit: 'unit',
                        rate: '',
                        cost_rate: '',
                        billable: true,
                        work_date: new Date().toISOString().slice(0, 10)
                      });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function FinanceIndustryProductionNew() {
  const { industry, id } = useParams();
  const navigate = useNavigate();
  const [options, setOptions] = useState<{
    items: { id: string; name: string; sku: string; base_uom: string }[];
    locations: { id: string; name: string; code: string }[];
  }>({ items: [], locations: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    output_item_id: '',
    source_location_id: '',
    target_location_id: '',
    planned_quantity: '1',
    output_batch: '',
    conversion_cost: ''
  });
  const [materials, setMaterials] = useState([{ item_id: '', quantity: '1', unit: '', batch: '' }]);
  const [recipes, setRecipes] = useState<IndustryProductionRecipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [recipeMessage, setRecipeMessage] = useState('');

  useEffect(() => {
    let live = true;
    apiFetch<{ items: any[]; locations: any[] }>('/v1/finance/industries/stock-options')
      .then(result => {
        if (live) setOptions(result);
      })
      .catch(err => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    apiFetch<IndustryProductionRecipe[]>('/v1/finance/industries/recipes')
      .then(result => {
        if (live) setRecipes(result);
      })
      .catch(err => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, []);

  function loadRecipe(recipeId: string) {
    setSelectedRecipe(recipeId);
    const saved = recipes.find(recipe => recipe.id === recipeId);
    if (!saved) return;
    const { materials: recipeMaterials, ...fields } = saved.recipe;
    setForm({
      ...fields,
      planned_quantity: String(fields.planned_quantity),
      conversion_cost: String(fields.conversion_cost)
    });
    setMaterials(recipeMaterials.map(line => ({ ...line, quantity: String(line.quantity) })));
    setRecipeName(saved.name);
  }

  async function saveRecipe() {
    setSaving(true);
    setError('');
    setRecipeMessage('');
    try {
      const saved = await apiFetch<IndustryProductionRecipe>('/v1/finance/industries/recipes', {
        method: 'POST',
        body: JSON.stringify({
          name: recipeName,
          recipe: {
            ...form,
            planned_quantity: Number(form.planned_quantity),
            conversion_cost: Number(form.conversion_cost || 0),
            materials: materials.map(line => ({ ...line, quantity: Number(line.quantity) }))
          }
        })
      });
      setRecipes([saved, ...recipes]);
      setSelectedRecipe(saved.id);
      setRecipeMessage(`Saved recipe "${saved.name}" (Version ${saved.version}).`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const items = options.items.map(item => ({ value: item.id, label: `${item.sku} · ${item.name}` }));
  const locations = options.locations.map(location => ({ value: location.id, label: `${location.code} · ${location.name}` }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/finance/industries/${id}/production`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          planned_quantity: Number(form.planned_quantity),
          conversion_cost: Number(form.conversion_cost || 0),
          materials: materials.map(line => ({ ...line, quantity: Number(line.quantity) }))
        })
      });
      navigate(`/finance/industries/${industry}/${id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="industry-page">
      <PageHeader
        crumbs={['Finance', 'Production']}
        variant="create"
        titlePlain="Production"
        titleEm="order"
        backTo={`/finance/industries/${industry}/${id}`}
        subtitle="Define bill of materials (BOM) for this batch run. Release posts material consumption to WIP."
      />
      <form onSubmit={submit}>
        <Card style={{ marginBottom: 20 }}>
          <CardHeader>
            <CardTitle>Reusable BOM Recipe</CardTitle>
            <CardDescription>Load a saved formula version or snapshot the current recipe.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="industry-form-grid">
              <Picker
                label="Saved Recipe"
                value={selectedRecipe}
                onChange={loadRecipe}
                options={recipes.map(recipe => ({ value: recipe.id, label: `${recipe.name} · v${recipe.version}` }))}
              />
              <Field label="Recipe Name">
                <Input maxLength={120} value={recipeName} onChange={event => setRecipeName(event.target.value)} />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !recipeName.trim() || !form.output_item_id || materials.some(line => !line.item_id)}
              onClick={saveRecipe}
              style={{ marginTop: 14 }}
            >
              Save New Version
            </Button>
            {recipeMessage && <Banner variant="success" style={{ marginTop: 14 }}>{recipeMessage}</Banner>}
          </CardContent>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <CardHeader>
            <CardTitle>Target Output & Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="industry-form-grid">
              <Picker label="Output Item" value={form.output_item_id} onChange={output_item_id => setForm({ ...form, output_item_id })} options={items} />
              <Field label="Planned Output (Base Units)">
                <Input required type="number" min="0.0001" step="0.0001" value={form.planned_quantity} onChange={event => setForm({ ...form, planned_quantity: event.target.value })} />
              </Field>
              <Picker label="Material Source Location" value={form.source_location_id} onChange={source_location_id => setForm({ ...form, source_location_id })} options={locations} />
              <Picker label="Output Destination Location" value={form.target_location_id} onChange={target_location_id => setForm({ ...form, target_location_id })} options={locations} />
              <Field label="Output Batch Tag">
                <Input value={form.output_batch} onChange={event => setForm({ ...form, output_batch: event.target.value })} />
              </Field>
              <Field label="Conversion Costs (TZS)">
                <Input type="number" min="0" step="0.01" value={form.conversion_cost} onChange={event => setForm({ ...form, conversion_cost: event.target.value })} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Input Raw Materials</CardTitle>
            <CardDescription>Total input quantities for this batch run, including expected shrinkage.</CardDescription>
          </CardHeader>
          <CardContent>
            {materials.map((line, index) => (
              <div className="industry-material-row" key={index}>
                <Picker
                  label={`Material #${index + 1}`}
                  value={line.item_id}
                  onChange={item_id =>
                    setMaterials(
                      materials.map((entry, position) =>
                        position === index
                          ? { ...entry, item_id, unit: options.items.find(item => item.id === item_id)?.base_uom ?? '' }
                          : entry
                      )
                    )
                  }
                  options={items.filter(item => item.value !== form.output_item_id)}
                />
                <Field label="Quantity">
                  <Input
                    required
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={line.quantity}
                    onChange={event =>
                      setMaterials(
                        materials.map((entry, position) => (position === index ? { ...entry, quantity: event.target.value } : entry))
                      )
                    }
                  />
                </Field>
                <Field label="Unit">
                  <Input
                    required
                    value={line.unit}
                    onChange={event =>
                      setMaterials(
                        materials.map((entry, position) => (position === index ? { ...entry, unit: event.target.value } : entry))
                      )
                    }
                  />
                </Field>
                <Field label="Batch">
                  <Input
                    value={line.batch}
                    onChange={event =>
                      setMaterials(
                        materials.map((entry, position) => (position === index ? { ...entry, batch: event.target.value } : entry))
                      )
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={materials.length <= 1}
                  onClick={() => setMaterials(materials.filter((_entry, position) => position !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={materials.length >= 200}
              onClick={() => setMaterials([...materials, { item_id: '', quantity: '1', unit: '', batch: '' }])}
            >
              <Icon name="plus" size={14} /> Add Raw Material
            </Button>
          </CardContent>
        </Card>

        {error && <Banner variant="error" style={{ marginTop: 16 }}>{error}</Banner>}

        <div className="industry-form-actions">
          <Button type="submit" disabled={saving || !form.output_item_id || !form.source_location_id || !form.target_location_id || materials.some(line => !line.item_id)}>
            {saving ? 'Creating Order…' : 'Create Production Order'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function FinanceIndustryAllocationNew() {
  const { industry, id } = useParams();
  const navigate = useNavigate();
  const [options, setOptions] = useState<{
    items: { id: string; name: string; sku: string; base_uom: string }[];
    locations: { id: string; name: string; code: string }[];
  }>({ items: [], locations: [] });
  const [form, setForm] = useState({ item_id: '', location_id: '', quantity: '1', batch: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch<{ items: any[]; locations: any[] }>('/v1/finance/industries/stock-options')
      .then(result => {
        if (live) setOptions(result);
      })
      .catch(err => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/finance/industries/${id}/allocations`, {
        method: 'POST',
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) })
      });
      navigate(`/finance/industries/${industry}/${id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="industry-page">
      <PageHeader
        variant="create"
        crumbs={['Finance', 'Allocation']}
        titlePlain="Allocate Owned"
        titleEm="stock"
        backTo={`/finance/industries/${industry}/${id}`}
        subtitle="Reserve stock items for this customer work order. Quantities already held cannot be double-allocated."
      />
      <Card>
        <CardContent className="industry-form-content">
          <form onSubmit={submit}>
            <div className="industry-form-grid">
              <Picker
                label="Stock Item"
                value={form.item_id}
                onChange={item_id => setForm({ ...form, item_id })}
                options={options.items.map(item => ({ value: item.id, label: `${item.sku} · ${item.name}` }))}
              />
              <Picker
                label="Source Warehouse Location"
                value={form.location_id}
                onChange={location_id => setForm({ ...form, location_id })}
                options={options.locations.map(location => ({ value: location.id, label: `${location.code} · ${location.name}` }))}
              />
              <Field
                label={`Quantity (${options.items.find(item => item.id === form.item_id)?.base_uom ?? 'base units'})`}
              >
                <Input
                  required
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={form.quantity}
                  onChange={event => setForm({ ...form, quantity: event.target.value })}
                />
              </Field>
              <Field label="Batch / Lot Tag">
                <Input maxLength={100} value={form.batch} onChange={event => setForm({ ...form, batch: event.target.value })} />
              </Field>
            </div>
            {error && <Banner variant="error" style={{ marginTop: 14 }}>{error}</Banner>}
            <div className="industry-form-actions">
              <Button type="submit" disabled={saving || !form.item_id || !form.location_id}>
                {saving ? 'Allocating…' : 'Reserve Stock'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
