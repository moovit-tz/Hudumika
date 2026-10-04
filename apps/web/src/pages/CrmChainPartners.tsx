import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { UserRole } from '@hudumika/types';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { BackButton } from '../components/ui/BackButton.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionCard } from '../components/SectionCard.js';
import { ActivityTimeline } from '../components/crm/ActivityTimeline.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter
} from '../components/ui/dialog.js';
import './CrmChainPartners.css';

// Mirrors the roles DELETE /v1/customers/:id accepts (customers.routes.ts).
const DELETE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

export interface Partner {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  phone_wa?: string | null;
  partner_role: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  registry_number?: string | null;
  tax_id?: string | null;
  account_status?: string | null;
  entity_type?: string | null;
  preferred_port?: string | null;
  is_customer?: boolean;
  is_partner?: boolean;
  created_at: string;
  updated_at?: string;
}

const PARTNER_CATEGORIES = [
  'ICD',
  'CFS',
  'Warehouse',
  'Logistics',
  'Transporter',
  'Clearing Agent',
  'Other',
];

const CATEGORY_DESCRIPTIONS: Record<string, { label: string; desc: string; icon: 'warehouse' | 'container' | 'truck' | 'globe' | 'building' | 'package' | 'link'; variant: 'brand' | 'info' | 'warning' | 'success' | 'gray' }> = {
  CFS: {
    label: 'CFS (Container Freight Station)',
    desc: 'Off-dock terminal for staging, devanning, container stuffing, and customs clearance.',
    icon: 'container',
    variant: 'brand',
  },
  ICD: {
    label: 'ICD (Inland Container Depot)',
    desc: 'Inland dry port connected by rail or road serving as a regional container handling hub.',
    icon: 'warehouse',
    variant: 'info',
  },
  Warehouse: {
    label: 'Bonded Warehouse & Storage',
    desc: 'Licensed customs-bonded and non-bonded warehousing, cold-chain, and bulk storage.',
    icon: 'warehouse',
    variant: 'warning',
  },
  Logistics: {
    label: 'Logistics & Freight Forwarding',
    desc: 'Multimodal freight forwarding, ocean cargo booking, and 3PL supply chain services.',
    icon: 'globe',
    variant: 'success',
  },
  Transporter: {
    label: 'Transporter & Fleet Haulage',
    desc: 'Heavy cargo trucking, container drayage, cross-border transit, and flatbed transport.',
    icon: 'truck',
    variant: 'success',
  },
  'Clearing Agent': {
    label: 'Clearing & Forwarding Agent',
    desc: 'Licensed customs brokerage, import/export documentation, and tariff compliance.',
    icon: 'building',
    variant: 'info',
  },
  Other: {
    label: 'Other Partner',
    desc: 'All other strategic service providers, suppliers, and maritime trade chain entities.',
    icon: 'link',
    variant: 'gray',
  },
};

/* ── Infer partner category from name ── */
function inferCategory(name: string): { label: string; variant: 'brand' | 'info' | 'warning' | 'success' | 'gray' } {
  const n = name.toLowerCase();
  if (n.includes('cfs') || n.includes('container freight') || n.includes('freight station')) return { label: 'CFS', variant: 'brand' };
  if (n.includes('icd') || n.includes('inland container') || n.includes('dry port')) return { label: 'ICD', variant: 'info' };
  if (n.includes('warehouse') || n.includes('bonded') || n.includes('storage')) return { label: 'Warehouse', variant: 'warning' };
  if (n.includes('logistics') || n.includes('transport') || n.includes('clearing') || n.includes('haulage')) return { label: 'Logistics', variant: 'success' };
  return { label: 'Partner', variant: 'gray' };
}

function partnerCategory(partner: Partner) {
  if (!partner.partner_role) return inferCategory(partner.name);
  const info = CATEGORY_DESCRIPTIONS[partner.partner_role];
  if (info) return { label: partner.partner_role, variant: info.variant };
  return { label: partner.partner_role, variant: 'gray' as const };
}

export function CrmChainPartners() {
  const { user } = useAuth();
  const canDelete = DELETE_ROLES.includes((user?.role ?? '') as UserRole);

  const { id: paramId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const idQuery = searchParams.get('id');
  const viewQuery = searchParams.get('view');

  const isNewView = paramId === 'new' || viewQuery === 'new' || location.pathname.endsWith('/chain-partners/new') || location.pathname.endsWith('/new');
  const activeId = (!isNewView && paramId && paramId !== 'new') ? paramId : (idQuery || null);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const loadPartners = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/customers/partners')
      .then(res => setPartners(res.data || []))
      .catch(() => setPartners([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  /* Navigation helpers */
  const goToDirectory = useCallback(() => {
    navigate('/crm/chain-partners');
  }, [navigate]);

  const goToNewPartner = useCallback(() => {
    navigate('/crm/chain-partners/new');
  }, [navigate]);

  const goToPartner = useCallback((id: string) => {
    navigate(`/crm/chain-partners/${id}`);
  }, [navigate]);

  /* Partner delete / remove actions */
  async function removePartner(p: Partner, onDone?: () => void) {
    if (!(await showConfirm(`Remove "${p.name}" from the partners directory? It stays in your customers list.`, { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/customers/${p.id}/partner`, { method: 'PATCH', body: JSON.stringify({ is_partner: false }) });
      setPartners(prev => prev.filter(x => x.id !== p.id));
      showAlert('Removed from partners directory', { variant: 'success' });
      if (onDone) onDone();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove partner');
    }
  }

  async function deletePartner(p: Partner, onDone?: () => void) {
    if (!(await showConfirm(`Delete "${p.name}"? It will disappear from every company list. Documents that already reference it will keep showing its name.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/customers/${p.id}`, { method: 'DELETE' });
      setPartners(prev => prev.filter(x => x.id !== p.id));
      showAlert('Partner deleted', { variant: 'success' });
      if (onDone) onDone();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete partner');
    }
  }

  /* Derived metrics */
  const totalCount   = partners.length;
  const withContact  = partners.filter(p => !!p.contact_name).length;
  const withEmail    = partners.filter(p => !!p.email).length;
  const withPhone    = partners.filter(p => !!p.phone).length;
  const fullyLinked  = partners.filter(p => p.contact_name && p.email && p.phone).length;

  /* Filtered list */
  const filtered = useMemo(() => {
    let list = partners;
    if (categoryFilter !== 'ALL') {
      list = list.filter(p => (p.partner_role || inferCategory(p.name).label) === categoryFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.contact_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q)
    );
  }, [partners, search, categoryFilter]);

  // 1. REGISTER NEW PARTNER FULL-PAGE VIEW
  if (isNewView) {
    return (
      <NewPartnerPageView
        onBack={goToDirectory}
        onCreated={(created) => {
          loadPartners();
          goToPartner(created.id);
        }}
      />
    );
  }

  // 2. PARTNER DETAIL FULL-PAGE VIEW
  if (activeId) {
    return (
      <PartnerDetailPageView
        partnerId={activeId}
        canDelete={canDelete}
        onBack={goToDirectory}
        onPartnerUpdated={(updated) => {
          setPartners(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
        }}
        onRemovePartner={removePartner}
        onDeletePartner={deletePartner}
      />
    );
  }

  // 3. PARTNERS DIRECTORY MASTER LIST VIEW
  return (
    <div className="partner-page-container">
      {/* Page Header */}
      <PageHeader
        crumbs={['CRM', 'Partners directory']}
        titlePlain="Partners"
        titleEm="directory"
        subtitle={`${totalCount} ICD, CFS, bonded warehouse, and logistics partners registered.`}
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={goToNewPartner}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" size={15} strokeWidth={2.5} color="hsl(var(--primary-foreground))" />
            Add Partner
          </Button>
        }
      />

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPI Metrics Ribbon */}
        <div className="partner-metrics-grid">
          {/* KPI 1 */}
          <div className="partner-metric-card">
            <div className="partner-metric-card-content">
              <div className="partner-metric-label">Partners Directory</div>
              <div className="partner-metric-value">{totalCount}</div>
              <div className="partner-metric-subtext">{withContact} with contact person</div>
            </div>
            <FeaturedIcon variant="brand" size="md" shape="square">
              <Icon name="link" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 2 */}
          <div className="partner-metric-card">
            <div className="partner-metric-card-content">
              <div className="partner-metric-label">With Email</div>
              <div className="partner-metric-value">{withEmail}</div>
              <div className="partner-metric-subtext">
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{totalCount > 0 ? Math.round((withEmail / totalCount) * 100) : 0}%</span> email coverage
              </div>
            </div>
            <FeaturedIcon variant="info" size="md" shape="square">
              <Icon name="mail" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 3 */}
          <div className="partner-metric-card">
            <div className="partner-metric-card-content">
              <div className="partner-metric-label">With Phone</div>
              <div className="partner-metric-value">{withPhone}</div>
              <div className="partner-metric-subtext">
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>{totalCount > 0 ? Math.round((withPhone / totalCount) * 100) : 0}%</span> phone coverage
              </div>
            </div>
            <FeaturedIcon variant="success" size="md" shape="square">
              <Icon name="phone" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 4 */}
          <div className="partner-metric-card">
            <div className="partner-metric-card-content">
              <div className="partner-metric-label">Fully Connected</div>
              <div className="partner-metric-value">{fullyLinked}</div>
              <div className="partner-metric-subtext">Contact + email + phone</div>
            </div>
            <FeaturedIcon variant="warning" size="md" shape="square">
              <Icon name="checkCircle" size={18} />
            </FeaturedIcon>
          </div>
        </div>

        {/* Partners Table Card */}
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--elev-sm)', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="input-field"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search partners by name, contact, phone…"
                style={{ paddingLeft: 32, paddingRight: search ? 32 : 12, width: '100%' }}
              />
              {search && (
                <Tip label="Clear search">
                  <button
                    type="button"
                    aria-label="Clear partner search"
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, display: 'flex', alignItems: 'center' }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </Tip>
              )}
            </div>

            {/* Category Filter */}
            <div style={{ width: 180 }}>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  {PARTNER_CATEGORIES.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
              {filtered.length !== totalCount ? `Showing ${filtered.length} of ${totalCount}` : `${totalCount} partner${totalCount !== 1 ? 's' : ''}`}
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div style={{ padding: 48 }}><SectionLoading /></div>
          ) : partners.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <FeaturedIcon variant="gray" size="xl" shape="square" className="mx-auto mb-3">
                <Icon name="link" size={28} />
              </FeaturedIcon>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>No partners yet</div>
              <div style={{ fontSize: 13, maxWidth: 440, margin: '0 auto', lineHeight: 1.6, color: 'var(--ink3)' }}>
                Add ICDs, CFS operators, bonded warehouse providers, and logistics partners.
                A company can be both a customer and a partner in the CRM.
              </div>
              <Button variant="default" size="sm" onClick={goToNewPartner} style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={14} strokeWidth={2.5} color="hsl(var(--primary-foreground))" />
                Register first partner
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>
              No partners match <strong>"{search}"</strong>
              <div style={{ marginTop: 10 }}>
                <Button variant="outline" size="sm" onClick={() => { setSearch(''); setCategoryFilter('ALL'); }}>
                  Reset filters
                </Button>
              </div>
            </div>
          ) : (
            <div className="rtbl-wrap">
              <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Partner</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Category</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Contact Person</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Email & Phone</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Location</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Registered</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const cat = partnerCategory(p);
                    const locationStr = [p.city, p.country].filter(Boolean).join(', ');
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}>
                        <td style={{ padding: '13px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <AvatarPicker id={p.id} kind="customers" name={p.name} size={36} shape="square" />
                            <div>
                              <button
                                type="button"
                                className="partner-name-button"
                                onClick={() => goToPartner(p.id)}
                              >
                                {p.name}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '13px 18px' }}>
                          <Badge variant={cat.variant}>{cat.label}</Badge>
                        </td>
                        <td style={{ padding: '13px 18px', color: p.contact_name ? 'var(--ink)' : 'var(--ink3)', fontStyle: p.contact_name ? 'normal' : 'italic' }}>
                          {p.contact_name || 'Not set'}
                        </td>
                        <td style={{ padding: '13px 18px' }}>
                          {p.email && (
                            <a href={`mailto:${p.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink)', textDecoration: 'none', marginBottom: p.phone ? 4 : 0, fontSize: 12.5 }}>
                              <Icon name="mail" size={12} style={{ color: 'var(--ink3)', flexShrink: 0 }} />
                              {p.email}
                            </a>
                          )}
                          {p.phone && (
                            <a href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--green)', textDecoration: 'none', fontSize: 12.5 }}>
                              <Icon name="phone" size={12} style={{ flexShrink: 0 }} />
                              {p.phone}
                            </a>
                          )}
                          {!p.email && !p.phone && <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td style={{ padding: '13px 18px', color: locationStr ? 'var(--ink2)' : 'var(--ink3)' }}>
                          {locationStr || '—'}
                        </td>
                        <td style={{ padding: '13px 18px', color: 'var(--ink3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '13px 12px' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="More actions"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 'var(--r)', color: 'var(--ink3)', display: 'flex', alignItems: 'center' }}
                              >
                                <Icon name="moreHorizontal" size={16} strokeWidth={1.75} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem className="cursor-pointer" onClick={() => goToPartner(p.id)}>
                                <Icon name="building" size={13} /> View partner page
                              </DropdownMenuItem>
                              {p.email && (
                                <DropdownMenuItem className="cursor-pointer" onClick={() => { window.open(`mailto:${p.email}`); }}>
                                  <Icon name="mail" size={13} className="text-muted-foreground" /> Email partner
                                </DropdownMenuItem>
                              )}
                              {p.phone && (
                                <DropdownMenuItem className="cursor-pointer" onClick={() => { window.open(`https://wa.me/${p.phone!.replace(/\D/g, '')}`, '_blank'); }}>
                                  <Icon name="phone" size={13} className="text-muted-foreground" /> WhatsApp
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {p.is_customer ? (
                                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => removePartner(p)}>
                                  <Icon name="trash" size={13} /> Remove from directory
                                </DropdownMenuItem>
                              ) : canDelete && (
                                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => deletePartner(p)}>
                                  <Icon name="trash" size={13} /> Delete partner
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PARTNER DETAIL PAGE VIEW
   ════════════════════════════════════════════════════════════════════════════ */
interface PartnerDetailPageProps {
  partnerId: string;
  canDelete: boolean;
  onBack: () => void;
  onPartnerUpdated: (partner: Partner) => void;
  onRemovePartner: (p: Partner, onDone?: () => void) => void;
  onDeletePartner: (p: Partner, onDone?: () => void) => void;
}

function PartnerDetailPageView({
  partnerId,
  canDelete,
  onBack,
  onPartnerUpdated,
  onRemovePartner,
  onDeletePartner,
}: PartnerDetailPageProps) {
  const { user } = useAuth();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'category' | 'activity'>('profile');

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [editRegistryNumber, setEditRegistryNumber] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadPartner = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/v1/customers/${partnerId}`);
      setPartner(data);
      setEditName(data.name || '');
      setEditContactName(data.contact_name || '');
      setEditEmail(data.email || '');
      setEditPhone(data.phone || '');
      setEditWebsite(data.website || '');
      setEditAddress(data.address || '');
      setEditCity(data.city || '');
      setEditCountry(data.country || '');
      setEditTaxId(data.tax_id || '');
      setEditRegistryNumber(data.registry_number || '');
      setEditNotes(data.notes || '');
    } catch {
      setPartner(null);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    loadPartner();
  }, [loadPartner]);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!partner || !editName.trim()) return;
    setEditSaving(true);
    try {
      const updated = await apiFetch(`/v1/customers/${partner.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          contact_name: editContactName.trim() || null,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          website: editWebsite.trim() || null,
          address: editAddress.trim() || null,
          city: editCity.trim() || null,
          country: editCountry.trim() || null,
          tax_id: editTaxId.trim() || null,
          registry_number: editRegistryNumber.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      setPartner(updated);
      onPartnerUpdated(updated);
      setShowEditDialog(false);
      showAlert('Partner profile updated', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to update partner');
    } finally {
      setEditSaving(false);
    }
  }

  async function updateCategory(newRole: string) {
    if (!partner) return;
    setCategorySaving(true);
    try {
      const updated = await apiFetch(`/v1/customers/${partner.id}/partner`, {
        method: 'PATCH',
        body: JSON.stringify({ is_partner: true, partner_role: newRole }),
      });
      setPartner(prev => prev ? { ...prev, ...updated, partner_role: newRole } : updated);
      onPartnerUpdated(updated);
      showAlert(`Partner category set to ${newRole}`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to update category');
    } finally {
      setCategorySaving(false);
    }
  }

  if (loading) {
    return (
      <div className="partner-page-container">
        <BackButton onClick={onBack} label="Back to Partners Directory" />
        <div style={{ padding: 60 }}><SectionLoading /></div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="partner-page-container">
        <BackButton onClick={onBack} label="Back to Partners Directory" />
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: 48, textAlign: 'center' }}>
          <FeaturedIcon variant="warning" size="xl" shape="square" className="mx-auto mb-3">
            <Icon name="alertCircle" size={28} />
          </FeaturedIcon>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Partner record not found</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>This partner may have been removed or deleted.</div>
          <Button variant="outline" size="sm" onClick={onBack} style={{ marginTop: 16 }}>
            Return to directory
          </Button>
        </div>
      </div>
    );
  }

  const cat = partnerCategory(partner);
  const locationStr = [partner.city, partner.country].filter(Boolean).join(', ');

  return (
    <div className="partner-page-container">
      {/* Back Button */}
      <BackButton onClick={onBack} label="Back to Partners Directory" />

      {/* Page Header */}
      <PageHeader
        crumbs={['CRM', 'Partners directory', partner.name]}
        titlePlain={partner.name}
        titleEm="profile"
        subtitle={`Partner in the logistics & trade chain directory.`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="edit" size={14} />
              Edit Profile
            </Button>
            {partner.email && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { window.open(`mailto:${partner.email}`); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="mail" size={14} />
                Send Email
              </Button>
            )}
            {partner.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { window.open(`https://wa.me/${partner.phone!.replace(/\D/g, '')}`, '_blank'); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green)' }}
              >
                <Icon name="whatsapp" size={14} />
                WhatsApp
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" style={{ padding: '0 8px' }}>
                  <Icon name="moreHorizontal" size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="cursor-pointer" onClick={() => setShowEditDialog(true)}>
                  <Icon name="edit" size={13} /> Edit partner details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {partner.is_customer ? (
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => onRemovePartner(partner, onBack)}>
                    <Icon name="trash" size={13} /> Remove from directory
                  </DropdownMenuItem>
                ) : canDelete && (
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => onDeletePartner(partner, onBack)}>
                    <Icon name="trash" size={13} /> Delete partner
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Hero Identity Card */}
        <div className="partner-hero-card">
          <div className="partner-hero-top">
            <div className="partner-hero-identity">
              <AvatarPicker id={partner.id} kind="customers" name={partner.name} size={64} shape="square" />
              <div className="partner-hero-info">
                <div className="partner-hero-name-row">
                  <h1 className="partner-hero-name">{partner.name}</h1>
                  <Badge variant={cat.variant}>{cat.label}</Badge>
                  {partner.is_customer && <Badge variant="info">Also Customer</Badge>}
                </div>
                <div className="partner-hero-meta">
                  {partner.contact_name && (
                    <span className="partner-hero-meta-item">
                      <Icon name="user" size={13} /> {partner.contact_name}
                    </span>
                  )}
                  {locationStr && (
                    <span className="partner-hero-meta-item">
                      <Icon name="mapPin" size={13} /> {locationStr}
                    </span>
                  )}
                  <span className="partner-hero-meta-item">
                    <Icon name="calendar" size={13} /> Registered {new Date(partner.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="partner-metrics-grid">
            <div className="partner-metric-card">
              <div className="partner-metric-card-content">
                <div className="partner-metric-label">Category / Role</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                  {partner.partner_role || cat.label}
                </div>
                <div className="partner-metric-subtext">Chain directory grouping</div>
              </div>
              <FeaturedIcon variant={cat.variant} size="md" shape="square">
                <Icon name="tag" size={18} />
              </FeaturedIcon>
            </div>

            <div className="partner-metric-card">
              <div className="partner-metric-card-content">
                <div className="partner-metric-label">Primary Contact</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {partner.contact_name || 'None designated'}
                </div>
                <div className="partner-metric-subtext">{partner.phone || 'No direct phone'}</div>
              </div>
              <FeaturedIcon variant="info" size="md" shape="square">
                <Icon name="user" size={18} />
              </FeaturedIcon>
            </div>

            <div className="partner-metric-card">
              <div className="partner-metric-card-content">
                <div className="partner-metric-label">Email Channel</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {partner.email ? 'Connected' : 'Not set'}
                </div>
                <div className="partner-metric-subtext">{partner.email || 'Add email for dispatches'}</div>
              </div>
              <FeaturedIcon variant={partner.email ? 'success' : 'gray'} size="md" shape="square">
                <Icon name="mail" size={18} />
              </FeaturedIcon>
            </div>

            <div className="partner-metric-card">
              <div className="partner-metric-card-content">
                <div className="partner-metric-label">Classification</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                  {partner.is_customer ? 'Dual Entity' : 'Partner Only'}
                </div>
                <div className="partner-metric-subtext">{partner.is_customer ? 'Partner & Customer' : 'Trade Chain Partner'}</div>
              </div>
              <FeaturedIcon variant="brand" size="md" shape="square">
                <Icon name="building" size={18} />
              </FeaturedIcon>
            </div>
          </div>
        </div>

        {/* Full Page Tabs */}
        <div className="partner-detail-tabs-root">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList>
              <TabsTrigger value="profile">Profile & Details</TabsTrigger>
              <TabsTrigger value="category">Category Settings</TabsTrigger>
              <TabsTrigger value="activity">Activity & Timeline</TabsTrigger>
            </TabsList>

            {/* TAB 1: PROFILE & DETAILS */}
            <TabsContent value="profile" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                {/* Contact Information */}
                <SectionCard
                  title="Contact Information"
                  collapsible={false}
                  action={
                    <button
                      type="button"
                      onClick={() => setShowEditDialog(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Icon name="edit" size={12} /> Edit
                    </button>
                  }
                >
                  <div className="partner-info-grid">
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Contact Person</span>
                      <span className="partner-info-box-value">{partner.contact_name || 'Not set'}</span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Email Address</span>
                      <span className="partner-info-box-value">
                        {partner.email ? (
                          <a href={`mailto:${partner.email}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                            {partner.email}
                          </a>
                        ) : 'Not set'}
                      </span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Phone Number</span>
                      <span className="partner-info-box-value">
                        {partner.phone ? (
                          <a href={`tel:${partner.phone}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                            {partner.phone}
                          </a>
                        ) : 'Not set'}
                      </span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Website</span>
                      <span className="partner-info-box-value">
                        {partner.website ? (
                          <a href={partner.website.startsWith('http') ? partner.website : `https://${partner.website}`} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {partner.website} <Icon name="externalLink" size={11} />
                          </a>
                        ) : 'Not set'}
                      </span>
                    </div>
                  </div>
                </SectionCard>

                {/* Company & Legal Registration */}
                <SectionCard
                  title="Registration & Legal Details"
                  collapsible={false}
                  action={
                    <button
                      type="button"
                      onClick={() => setShowEditDialog(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Icon name="edit" size={12} /> Edit
                    </button>
                  }
                >
                  <div className="partner-info-grid">
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Registry / BRELA Number</span>
                      <span className="partner-info-box-value">{partner.registry_number || 'Not set'}</span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Tax ID / TIN</span>
                      <span className="partner-info-box-value">{partner.tax_id || 'Not set'}</span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Account Status</span>
                      <span className="partner-info-box-value">
                        <Badge variant={partner.account_status === 'ACTIVE' || !partner.account_status ? 'success' : 'gray'}>
                          {partner.account_status || 'Active'}
                        </Badge>
                      </span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Created In CRM</span>
                      <span className="partner-info-box-value">
                        {new Date(partner.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </SectionCard>
              </div>

              {/* Physical Location & Address */}
              <SectionCard
                title="Physical Location & Address"
                collapsible={false}
                action={
                  <button
                    type="button"
                    onClick={() => setShowEditDialog(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon name="edit" size={12} /> Edit
                  </button>
                }
              >
                <div className="partner-info-grid">
                  <div className="partner-info-box" style={{ gridColumn: 'span 2' }}>
                    <span className="partner-info-box-label">Physical Address</span>
                    <span className="partner-info-box-value">{partner.address || 'No physical address specified'}</span>
                  </div>
                  <div className="partner-info-box">
                    <span className="partner-info-box-label">City</span>
                    <span className="partner-info-box-value">{partner.city || 'Not set'}</span>
                  </div>
                  <div className="partner-info-box">
                    <span className="partner-info-box-label">Country</span>
                    <span className="partner-info-box-value">{partner.country || 'Not set'}</span>
                  </div>
                </div>
              </SectionCard>

              {/* Operational Remarks & Notes */}
              <SectionCard
                title="Operational Notes & Guidelines"
                collapsible={false}
                action={
                  <button
                    type="button"
                    onClick={() => setShowEditDialog(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon name="edit" size={12} /> Edit Notes
                  </button>
                }
              >
                {partner.notes ? (
                  <div className="partner-notes-container">
                    <p>{partner.notes}</p>
                  </div>
                ) : (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No operational notes or handling guidelines recorded for this partner.
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            {/* TAB 2: CATEGORY SETTINGS */}
            <TabsContent value="category" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
              <SectionCard title="Partner Category Classification" collapsible={false}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
                    Select how <strong>{partner.name}</strong> is categorized in the supply chain directory. This grouping governs customs clearance workflows, carrier assignments, and warehouse linkages.
                  </div>
                </div>

                <div className="partner-category-picker-grid">
                  {PARTNER_CATEGORIES.map(category => {
                    const info = CATEGORY_DESCRIPTIONS[category] || {
                      label: category,
                      desc: 'Strategic trade chain partner',
                      icon: 'link' as const,
                      variant: 'gray' as const,
                    };
                    const isSelected = (partner.partner_role || 'Other') === category;

                    return (
                      <button
                        key={category}
                        type="button"
                        className={`partner-category-card-select ${isSelected ? 'selected' : ''}`}
                        onClick={() => updateCategory(category)}
                        disabled={categorySaving}
                      >
                        <div className="partner-category-card-header">
                          <FeaturedIcon variant={info.variant} size="md" shape="square">
                            <Icon name={info.icon} size={18} />
                          </FeaturedIcon>
                          {isSelected && (
                            <Badge variant="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="check" size={10} /> Active
                            </Badge>
                          )}
                        </div>
                        <h4 className="partner-category-title">{category}</h4>
                        <p className="partner-category-desc">{info.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Dual Directory Status" collapsible={false}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <FeaturedIcon variant="brand" size="lg" shape="square">
                    <Icon name="building" size={20} />
                  </FeaturedIcon>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                      Customer & Partner Status
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.5, maxWidth: 640 }}>
                      {partner.is_customer ? (
                        <>This entity is flagged as both a <strong>Customer</strong> and a <strong>Chain Partner</strong>. You can issue sales invoices to them while maintaining their vendor/terminal role.</>
                      ) : (
                        <>This entity is currently registered exclusively as a <strong>Chain Partner</strong>. If you provide clearance or freight services to them directly, you can also link them to the customer directory.</>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </TabsContent>

            {/* TAB 3: ACTIVITY & TIMELINE */}
            <TabsContent value="activity" style={{ paddingTop: 16 }}>
              <SectionCard title="Chronological Activity & Notes" collapsible={false}>
                <ActivityTimeline
                  subjectType="customer"
                  subjectId={partner.id}
                  currentUserId={user?.id}
                />
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Edit Partner Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Partner Profile</DialogTitle>
            <DialogDescription>Update company information, primary contact, address, and notes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit}>
            <DialogBody>
              <div className="partner-form-grid">
                <div className="partner-form-grid-full">
                  <label className="seal-field-label">Company / Partner Name <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="seal-field-label">Contact Person</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editContactName}
                    onChange={e => setEditContactName(e.target.value)}
                    placeholder="Operations Manager"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Phone Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="+255 700 000 000"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Email Address</label>
                  <input
                    type="email"
                    className="input-field"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="operations@partner.co.tz"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Website</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editWebsite}
                    onChange={e => setEditWebsite(e.target.value)}
                    placeholder="https://partner.co.tz"
                  />
                </div>
                <div className="partner-form-grid-full">
                  <label className="seal-field-label">Physical Address</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                    placeholder="Bandari Road, Kurasini"
                  />
                </div>
                <div>
                  <label className="seal-field-label">City</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    placeholder="Dar es Salaam"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Country</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editCountry}
                    onChange={e => setEditCountry(e.target.value)}
                    placeholder="Tanzania"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Tax ID / TIN</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editTaxId}
                    onChange={e => setEditTaxId(e.target.value)}
                    placeholder="123-456-789"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Registry / BRELA Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editRegistryNumber}
                    onChange={e => setEditRegistryNumber(e.target.value)}
                    placeholder="123456"
                  />
                </div>
                <div className="partner-form-grid-full">
                  <label className="seal-field-label">Operational Notes</label>
                  <textarea
                    className="input-field"
                    rows={3}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Gate handling hours, customs bonded warehouse permit details, container turn-in instructions..."
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={editSaving || !editName.trim()}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   REGISTER NEW PARTNER FULL-PAGE VIEW
   ════════════════════════════════════════════════════════════════════════════ */
interface NewPartnerPageProps {
  onBack: () => void;
  onCreated: (partner: Partner) => void;
}

function NewPartnerPageView({ onBack, onCreated }: NewPartnerPageProps) {
  const [name, setName] = useState('');
  const [partnerRole, setPartnerRole] = useState('CFS');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Tanzania');
  const [taxId, setTaxId] = useState('');
  const [registryNumber, setRegistryNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isCustomer, setIsCustomer] = useState(false);

  const [saving, setSaving] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('Partner name is required', { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      // 1. Create partner row via POST /v1/customers/partners
      const res = await apiFetch('/v1/customers/partners', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          partnerRole,
          isCustomer,
        }),
      });

      const createdPartner: Partner = res.partner;

      // 2. If extra profile fields are present, update via PATCH /v1/customers/:id
      const hasExtraFields = !!(
        website.trim() || address.trim() || city.trim() || (country.trim() && country.trim() !== 'Tanzania') ||
        taxId.trim() || registryNumber.trim() || notes.trim()
      );

      if (hasExtraFields && createdPartner?.id) {
        await apiFetch(`/v1/customers/${createdPartner.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            website: website.trim() || null,
            address: address.trim() || null,
            city: city.trim() || null,
            country: country.trim() || null,
            tax_id: taxId.trim() || null,
            registry_number: registryNumber.trim() || null,
            notes: notes.trim() || null,
          }),
        }).catch(() => { /* best-effort extra fields update */ });
      }

      showAlert('Partner registered successfully', { variant: 'success' });
      onCreated(createdPartner);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create partner');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="partner-page-container">
      {/* Back Button */}
      <BackButton onClick={onBack} label="Back to Partners Directory" />

      {/* Page Header */}
      <PageHeader
        crumbs={['CRM', 'Partners directory', 'New partner']}
        titlePlain="Register"
        titleEm="partner"
        subtitle="Add an ICD, CFS operator, bonded warehouse, or logistics partner to the directory."
      />

      <form onSubmit={handleRegister} className="partner-form-layout">
        {/* Section 1: Partner Identity */}
        <SectionCard title="Partner Identity" collapsible={false}>
          <div className="partner-form-grid">
            <div className="partner-form-grid-full">
              <label className="seal-field-label">
                Partner / Organization Name <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                className="input-field"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Dar es Salaam Container Freight Station Ltd"
                required
                autoFocus
              />
            </div>
            <div className="partner-form-grid-full">
              <label className="seal-field-label">Partner Category</label>
              <Select value={partnerRole} onValueChange={setPartnerRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_CATEGORIES.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* Section 2: Primary Contact & Communication */}
        <SectionCard title="Primary Contact & Communication" collapsible={false}>
          <div className="partner-form-grid">
            <div>
              <label className="seal-field-label">Contact Person</label>
              <input
                type="text"
                className="input-field"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="e.g. John Doe (Operations Manager)"
              />
            </div>
            <div>
              <label className="seal-field-label">Phone Number</label>
              <input
                type="text"
                className="input-field"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+255 700 000 000"
              />
            </div>
            <div>
              <label className="seal-field-label">Email Address</label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operations@partner.co.tz"
              />
            </div>
            <div>
              <label className="seal-field-label">Website URL</label>
              <input
                type="text"
                className="input-field"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://partner.co.tz"
              />
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Location & Legal Registration */}
        <SectionCard title="Location & Legal Registration" collapsible={false}>
          <div className="partner-form-grid">
            <div className="partner-form-grid-full">
              <label className="seal-field-label">Physical Address</label>
              <input
                type="text"
                className="input-field"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. Plot 45 Bandari Road, Kurasini"
              />
            </div>
            <div>
              <label className="seal-field-label">City</label>
              <input
                type="text"
                className="input-field"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Dar es Salaam"
              />
            </div>
            <div>
              <label className="seal-field-label">Country</label>
              <input
                type="text"
                className="input-field"
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="Tanzania"
              />
            </div>
            <div>
              <label className="seal-field-label">Tax ID / TIN</label>
              <input
                type="text"
                className="input-field"
                value={taxId}
                onChange={e => setTaxId(e.target.value)}
                placeholder="e.g. 100-200-300"
              />
            </div>
            <div>
              <label className="seal-field-label">Registry / BRELA Number</label>
              <input
                type="text"
                className="input-field"
                value={registryNumber}
                onChange={e => setRegistryNumber(e.target.value)}
                placeholder="e.g. 142857"
              />
            </div>
          </div>
        </SectionCard>

        {/* Section 4: Operational Remarks */}
        <SectionCard title="Operational Notes & Guidelines" collapsible={false}>
          <div className="partner-form-grid">
            <div className="partner-form-grid-full">
              <label className="seal-field-label">Internal Remarks</label>
              <textarea
                className="input-field"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Gate delivery schedules, customs bonded warehouse permit code, container devanning protocol..."
              />
            </div>
          </div>
        </SectionCard>

        {/* Section 5: Directory & Customer Setup */}
        <SectionCard title="Directory Setup" collapsible={false}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={isCustomer}
              onChange={e => setIsCustomer(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--teal)', cursor: 'pointer' }}
            />
            <span>Also register as a <strong>Customer</strong> in CRM (allows issuing invoices and quotes to this organization).</span>
          </label>
        </SectionCard>

        {/* Form Actions */}
        <div className="partner-form-actions">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={saving || !name.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="check" size={14} />
            {saving ? 'Registering partner…' : 'Register partner'}
          </Button>
        </div>
      </form>
    </div>
  );
}
