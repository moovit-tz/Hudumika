import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { UserRole } from '@hudumika/types';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { BackButton } from '../components/ui/BackButton.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { MetricsRow } from '../components/MetricCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionCard } from '../components/SectionCard.js';
import { Checkbox } from '../components/ui/checkbox.js';
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
          <Button variant="default" size="sm" onClick={goToNewPartner}>
            <Icon name="plus" size={15} strokeWidth={2.5} />
            Add Partner
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        <MetricsRow cards={[
          { title: 'PARTNERS DIRECTORY', value: String(totalCount), loading: loading, icon: 'link', sub1Label: `${withContact} with contact person` },
          { title: 'WITH EMAIL', value: String(withEmail), loading: loading, icon: 'mail', sub1Label: `${totalCount > 0 ? Math.round((withEmail / totalCount) * 100) : 0}% email coverage` },
          { title: 'WITH PHONE', value: String(withPhone), loading: loading, icon: 'phone', sub1Label: `${totalCount > 0 ? Math.round((withPhone / totalCount) * 100) : 0}% phone coverage` },
          { title: 'FULLY CONNECTED', value: String(fullyLinked), loading: loading, icon: 'checkCircle', sub1Label: 'Contact + email + phone' },
        ]} />

        {/* Partners Table Card */}
        <Card className="overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div className="relative min-w-55 max-w-90 flex-1">
              <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                className="input-field pl-8 pr-8 w-full"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search partners by name, contact, phone…"
              />
              {search && (
                <Tip label="Clear search">
                  <button
                    type="button"
                    aria-label="Clear partner search"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </Tip>
              )}
            </div>

            <div className="w-45">
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

            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
              {filtered.length !== totalCount ? `Showing ${filtered.length} of ${totalCount}` : `${totalCount} partner${totalCount !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><SectionLoading /></div>
          ) : partners.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <FeaturedIcon variant="gray" size="xl" shape="square" className="mx-auto mb-3">
                <Icon name="link" size={28} />
              </FeaturedIcon>
              <p className="text-sm font-bold text-foreground">No partners yet</p>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Add ICDs, CFS operators, bonded warehouse providers, and logistics partners.
                A company can be both a customer and a partner in the CRM.
              </p>
              <Button variant="default" size="sm" onClick={goToNewPartner} className="mt-5">
                <Icon name="plus" size={14} strokeWidth={2.5} />
                Register first partner
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No partners match <strong>"{search}"</strong></p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(''); setCategoryFilter('ALL'); }}>
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="rtbl-wrap">
              <table className="w-full min-w-195 border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4.5 py-2.5">Partner</th>
                    <th className="px-4.5 py-2.5">Category</th>
                    <th className="px-4.5 py-2.5">Contact Person</th>
                    <th className="px-4.5 py-2.5">Email &amp; Phone</th>
                    <th className="px-4.5 py-2.5">Location</th>
                    <th className="px-4.5 py-2.5">Registered</th>
                    <th className="w-10 px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(p => {
                    const cat = partnerCategory(p);
                    const locationStr = [p.city, p.country].filter(Boolean).join(', ');
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4.5 py-3">
                          <div className="flex items-center gap-3">
                            <AvatarPicker id={p.id} kind="customers" name={p.name} size={36} shape="square" />
                            <button
                              type="button"
                              className="partner-name-button"
                              onClick={() => goToPartner(p.id)}
                            >
                              {p.name}
                            </button>
                          </div>
                        </td>
                        <td className="px-4.5 py-3">
                          <Badge variant={cat.variant}>{cat.label}</Badge>
                        </td>
                        <td className={`px-4.5 py-3 ${p.contact_name ? 'text-foreground' : 'italic text-muted-foreground'}`}>
                          {p.contact_name || 'Not set'}
                        </td>
                        <td className="px-4.5 py-3">
                          {p.email && (
                            <a href={`mailto:${p.email}`} className={`flex items-center gap-1 text-xs text-foreground no-underline hover:underline ${p.phone ? 'mb-1' : ''}`}>
                              <Icon name="mail" size={12} className="shrink-0 text-muted-foreground" />
                              {p.email}
                            </a>
                          )}
                          {p.phone && (
                            <a href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-(--green) no-underline hover:underline">
                              <Icon name="phone" size={12} className="shrink-0" />
                              {p.phone}
                            </a>
                          )}
                          {!p.email && !p.phone && <span className="italic text-muted-foreground">—</span>}
                        </td>
                        <td className={`px-4.5 py-3 text-sm ${locationStr ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {locationStr || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4.5 py-3 text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="More actions">
                                <Icon name="moreHorizontal" size={16} strokeWidth={1.75} />
                              </Button>
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
        </Card>
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
        <div className="flex min-h-60 items-center justify-center"><SectionLoading /></div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="partner-page-container">
        <BackButton onClick={onBack} label="Back to Partners Directory" />
        <Card>
          <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <FeaturedIcon variant="warning" size="xl" shape="square" className="mx-auto mb-3">
              <Icon name="alertCircle" size={28} />
            </FeaturedIcon>
            <p className="text-base font-bold text-foreground">Partner record not found</p>
            <p className="mt-1 text-sm text-muted-foreground">This partner may have been removed or deleted.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
              Return to directory
            </Button>
          </CardContent>
        </Card>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
              <Icon name="edit" size={14} />
              Edit Profile
            </Button>
            {partner.email && (
              <Button variant="outline" size="sm" onClick={() => { window.open(`mailto:${partner.email}`); }}>
                <Icon name="mail" size={14} />
                Send Email
              </Button>
            )}
            {partner.phone && (
              <Button variant="outline" size="sm" className="text-(--green)"
                onClick={() => { window.open(`https://wa.me/${partner.phone!.replace(/\D/g, '')}`, '_blank'); }}>
                <Icon name="whatsapp" size={14} />
                WhatsApp
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
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

      <div className="flex flex-col gap-5">
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
                <div className="mt-1 text-base font-bold text-foreground">
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
                <div className="mt-1 truncate text-base font-bold text-foreground">
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
                <div className="mt-1 truncate text-base font-bold text-foreground">
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
                <div className="mt-1 text-base font-bold text-foreground">
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
            <TabsContent value="profile" className="flex flex-col gap-4 pt-4">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                {/* Contact Information */}
                <SectionCard
                  title="Contact Information"
                  collapsible={false}
                  action={
                    <Button type="button" variant="ghost" size="sm" className="text-(--teal)" onClick={() => setShowEditDialog(true)}>
                      <Icon name="edit" size={12} /> Edit
                    </Button>
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
                          <a href={`mailto:${partner.email}`} className="text-(--teal) no-underline hover:underline">
                            {partner.email}
                          </a>
                        ) : 'Not set'}
                      </span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Phone Number</span>
                      <span className="partner-info-box-value">
                        {partner.phone ? (
                          <a href={`tel:${partner.phone}`} className="text-foreground no-underline hover:underline">
                            {partner.phone}
                          </a>
                        ) : 'Not set'}
                      </span>
                    </div>
                    <div className="partner-info-box">
                      <span className="partner-info-box-label">Website</span>
                      <span className="partner-info-box-value">
                        {partner.website ? (
                          <a href={partner.website.startsWith('http') ? partner.website : `https://${partner.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-(--teal) no-underline hover:underline">
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
                    <Button type="button" variant="ghost" size="sm" className="text-(--teal)" onClick={() => setShowEditDialog(true)}>
                      <Icon name="edit" size={12} /> Edit
                    </Button>
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
                  <Button type="button" variant="ghost" size="sm" className="text-(--teal)" onClick={() => setShowEditDialog(true)}>
                    <Icon name="edit" size={12} /> Edit
                  </Button>
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
                  <Button type="button" variant="ghost" size="sm" className="text-(--teal)" onClick={() => setShowEditDialog(true)}>
                    <Icon name="edit" size={12} /> Edit Notes
                  </Button>
                }
              >
                {partner.notes ? (
                  <div className="partner-notes-container">
                    <p>{partner.notes}</p>
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No operational notes or handling guidelines recorded for this partner.
                  </p>
                )}
              </SectionCard>
            </TabsContent>

            {/* TAB 2: CATEGORY SETTINGS */}
            <TabsContent value="category" className="flex flex-col gap-4 pt-4">
              <SectionCard title="Partner Category Classification" collapsible={false}>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  Select how <strong>{partner.name}</strong> is categorized in the supply chain directory. This grouping governs customs clearance workflows, carrier assignments, and warehouse linkages.
                </p>

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
                            <Badge variant="brand" className="inline-flex items-center gap-1">
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
                <div className="flex items-start gap-3.5">
                  <FeaturedIcon variant="brand" size="lg" shape="square">
                    <Icon name="building" size={20} />
                  </FeaturedIcon>
                  <div>
                    <p className="text-sm font-bold text-foreground">Customer &amp; Partner Status</p>
                    <p className="mt-1 max-w-160 text-sm leading-relaxed text-muted-foreground">
                      {partner.is_customer ? (
                        <>This entity is flagged as both a <strong>Customer</strong> and a <strong>Chain Partner</strong>. You can issue sales invoices to them while maintaining their vendor/terminal role.</>
                      ) : (
                        <>This entity is currently registered exclusively as a <strong>Chain Partner</strong>. If you provide clearance or freight services to them directly, you can also link them to the customer directory.</>
                      )}
                    </p>
                  </div>
                </div>
              </SectionCard>
            </TabsContent>

            {/* TAB 3: ACTIVITY & TIMELINE */}
            <TabsContent value="activity" className="pt-4">
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
                  <label className="seal-field-label">Company / Partner Name <span className="text-(--red)">*</span></label>
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
                Partner / Organization Name <span className="text-(--red)">*</span>
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
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <Checkbox
              checked={isCustomer}
              onCheckedChange={checked => setIsCustomer(Boolean(checked))}
            />
            <span>Also register as a <strong>Customer</strong> in CRM (allows issuing invoices and quotes to this organization).</span>
          </label>
        </SectionCard>

        {/* Form Actions */}
        <div className="partner-form-actions">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            Cancel
          </Button>
          <Button type="submit" variant="default" size="sm" disabled={saving || !name.trim()}>
            <Icon name="check" size={14} />
            {saving ? 'Registering partner…' : 'Register partner'}
          </Button>
        </div>
      </form>
    </div>
  );
}
