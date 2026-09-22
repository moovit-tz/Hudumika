import React, { useEffect, useState, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { UserRole } from '@hudumika/types';
import { useAuth } from '../hooks/useAuth.js';

// Mirrors the roles DELETE /v1/customers/:id accepts (customers.routes.ts).
const DELETE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
import { PageHeader } from '../components/PageHeader.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tip } from '../components/ui/tooltip.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter
} from '../components/ui/dialog.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import './CrmChainPartners.css';

interface Partner {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  partner_role: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  registry_number?: string | null;
  tax_id?: string | null;
  account_status?: string | null;
  is_customer?: boolean;
  created_at: string;
  updated_at?: string;
}

interface PartnerActivity {
  id: string;
  type: string;
  body: string;
  actor_name?: string;
  created_at: string;
}

const PARTNER_CATEGORIES = ['ICD', 'CFS', 'Warehouse', 'Logistics', 'Transporter', 'Clearing Agent', 'Other'];

/* ── Infer partner category from name ── */
function inferCategory(name: string): { label: string; variant: 'brand' | 'info' | 'warning' | 'success' | 'gray' } {
  const n = name.toLowerCase();
  if (n.includes('cfs') || n.includes('container freight') || n.includes('freight station')) return { label: 'CFS', variant: 'brand' };
  if (n.includes('icd') || n.includes('inland container') || n.includes('dry port')) return { label: 'ICD', variant: 'info' };
  if (n.includes('warehouse') || n.includes('bonded') || n.includes('storage')) return { label: 'Warehouse', variant: 'warning' };
  if (n.includes('logistics') || n.includes('transport') || n.includes('clearing')) return { label: 'Logistics', variant: 'success' };
  return { label: 'Partner', variant: 'gray' };
}

function partnerCategory(partner: Partner) {
  if (!partner.partner_role) return inferCategory(partner.name);
  const variants: Record<string, 'brand' | 'info' | 'warning' | 'success' | 'gray'> = {
    CFS: 'brand', ICD: 'info', Warehouse: 'warning', Logistics: 'success', Transporter: 'success', 'Clearing Agent': 'info', Other: 'gray',
  };
  return { label: partner.partner_role, variant: variants[partner.partner_role] ?? 'gray' };
}

export function CrmChainPartners() {
  const { user } = useAuth();
  const canDelete = DELETE_ROLES.includes((user?.role ?? '') as UserRole);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [activities, setActivities] = useState<PartnerActivity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);

  /* New Partner Form */
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [partnerRole, setPartnerRole] = useState('Other');
  const [saving, setSaving] = useState(false);

  function loadPartners() {
    setLoading(true);
    apiFetch('/v1/customers/partners')
      .then(res => setPartners(res.data || []))
      .catch(() => setPartners([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPartners(); }, []);

  async function handleCreatePartner(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/customers/partners', {
        method: 'POST',
        // The backend's zod schema for these three fields is `.optional()`,
        // not `.nullable()` — it accepts a string or nothing at all, but
        // rejects an explicit `null`. Sending `null` for a blank field (as
        // this used to) failed validation with a 400 on every partner
        // created with any optional field left empty, which is the common
        // case since only the name is required on this form.
        body: JSON.stringify({ name: name.trim(), contactName: contactName.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, partnerRole }),
      });
      setName(''); setContactName(''); setEmail(''); setPhone(''); setPartnerRole('Other');
      setShowAddDialog(false);
      loadPartners();
      showAlert('Partner registered', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to create partner');
    } finally {
      setSaving(false);
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
    const q = search.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.contact_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q)
    );
  }, [partners, search]);

  async function openPartner(partner: Partner) {
    setSelectedPartner(partner);
    setHistoryLoading(true);
    try {
      const [profile, history] = await Promise.all([
        apiFetch(`/v1/customers/${partner.id}`),
        apiFetch(`/v1/crm/activities?subject_type=customer&subject_id=${partner.id}`),
      ]);
      setSelectedPartner(profile);
      setActivities(Array.isArray(history) ? history : []);
    } catch {
      setActivities([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  // This directory lists customers.is_partner=true rows — there is no separate
  // partners table. A company that is also a customer is only un-flagged (the
  // same PATCH /:id/partner the Category tab uses); its customer record and
  // history are untouched. A partner-only record has nowhere else to live, so
  // "remove" would 409 — it's soft-deleted instead (DELETE /v1/customers/:id
  // sets deleted_at; documents that already reference it keep its name).
  async function removePartner(p: Partner) {
    if (!(await showConfirm(`Remove "${p.name}" from the partners directory? It stays in your customers list.`, { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/customers/${p.id}/partner`, { method: 'PATCH', body: JSON.stringify({ is_partner: false }) });
      setPartners(prev => prev.filter(x => x.id !== p.id));
    } catch (err: any) { showAlert(err.message || 'Failed to remove partner'); }
  }

  async function deletePartner(p: Partner) {
    if (!(await showConfirm(`Delete "${p.name}"? It will disappear from every company list. Documents that already reference it will keep showing its name.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/customers/${p.id}`, { method: 'DELETE' });
      setPartners(prev => prev.filter(x => x.id !== p.id));
      if (selectedPartner?.id === p.id) setSelectedPartner(null);
    } catch (err: any) { showAlert(err.message || 'Failed to delete partner'); }
  }

  async function updatePartnerCategory(value: string) {
    if (!selectedPartner) return;
    setCategorySaving(true);
    try {
      const updated = await apiFetch(`/v1/customers/${selectedPartner.id}/partner`, {
        method: 'PATCH',
        body: JSON.stringify({ is_partner: true, partner_role: value }),
      });
      setSelectedPartner(updated);
      setPartners(previous => previous.map(partner => partner.id === updated.id ? { ...partner, ...updated } : partner));
      showAlert('Partner category updated', { variant: 'success' });
    } catch (error: any) {
      showAlert(error.message || 'Failed to update partner category');
    } finally {
      setCategorySaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 32px', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* House Page Header */}
      <PageHeader
        crumbs={['CRM', 'Partners directory']}
        titlePlain="Partners"
        titleEm="directory"
        subtitle={`${totalCount} ICD, CFS, bonded warehouse, and logistics partners registered.`}
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" size={15} strokeWidth={2.5} color="hsl(var(--primary-foreground))" />
            Add Partner
          </Button>
        }
      />

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI Metrics Ribbon */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>

          {/* KPI 1 */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>Partners Directory</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>{totalCount}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{withContact} with contact person</div>
            </div>
            <FeaturedIcon variant="brand" size="md" shape="square">
              <Icon name="link" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 2 */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>With Email</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>{withEmail}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{totalCount > 0 ? Math.round((withEmail / totalCount) * 100) : 0}%</span> email coverage
              </div>
            </div>
            <FeaturedIcon variant="info" size="md" shape="square">
              <Icon name="mail" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 3 */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>With Phone</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>{withPhone}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>{totalCount > 0 ? Math.round((withPhone / totalCount) * 100) : 0}%</span> phone coverage
              </div>
            </div>
            <FeaturedIcon variant="success" size="md" shape="square">
              <Icon name="phone" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 4 */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>Fully Connected</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>{fullyLinked}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Contact + email + phone</div>
            </div>
            <FeaturedIcon variant="warning" size="md" shape="square">
              <Icon name="checkCircle" size={18} />
            </FeaturedIcon>
          </div>
        </div>

        {/* Partners Table Card */}
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--elev-sm)', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="input-field"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search partners…"
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
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
              {filtered.length !== totalCount ? `${filtered.length} of ${totalCount}` : `${totalCount} partner${totalCount !== 1 ? 's' : ''}`}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ padding: 40 }}><SectionLoading /></div>
          ) : partners.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <FeaturedIcon variant="gray" size="xl" shape="square" className="mx-auto mb-3">
                <Icon name="link" size={28} />
              </FeaturedIcon>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink2)', marginBottom: 6 }}>No partners yet</div>
              <div style={{ fontSize: 12.5, maxWidth: 420, margin: '0 auto', lineHeight: 1.6, color: 'var(--ink3)' }}>
                Add ICDs, CFS operators, bonded warehouse providers, and logistics partners.
                A company can be both a customer and a partner.
              </div>
              <Button variant="default" size="sm" onClick={() => setShowAddDialog(true)} style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={14} strokeWidth={2.5} color="hsl(var(--primary-foreground))" />
                Register first partner
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No partners match <strong>"{search}"</strong>
            </div>
          ) : (
            <div className="rtbl-wrap">
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Partner</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Category</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Contact Person</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Email & Phone</th>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Registered</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const cat = inferCategory(p.name);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}>
                        <td style={{ padding: '13px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <AvatarPicker id={p.id} kind="customers" name={p.name} size={34} shape="square" />
                            <div>
                              <button type="button" className="partner-name-button" onClick={() => openPartner(p)}>{p.name}</button>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '13px 18px' }}><Badge variant={cat.variant}>{cat.label}</Badge></td>
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
                        <td style={{ padding: '13px 18px', color: 'var(--ink3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '13px 12px' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="More actions"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 'var(--r)', color: 'var(--ink3)', display: 'flex', alignItems: 'center' }}
                              >
                                <Icon name="moreHorizontal" size={15} strokeWidth={1.75} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
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
                              {(p.email || p.phone) && <DropdownMenuSeparator />}
                              <DropdownMenuItem className="cursor-pointer" onClick={() => openPartner(p)}>
                                <Icon name="building" size={13} /> View profile
                              </DropdownMenuItem>
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

      {/* Add Partner Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Register partner</DialogTitle>
            <DialogDescription>Add an ICD, CFS operator, bonded warehouse, or logistics partner.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePartner}>
            <DialogBody>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="seal-field-label">Partner / Company Name <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Dar es Salaam Container Freight Station Ltd"
                    required
                    autoFocus
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="seal-field-label">Partner Category</label>
                  <Select value={partnerRole} onValueChange={setPartnerRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PARTNER_CATEGORIES.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="seal-field-label">Contact Person</label>
                  <input
                    type="text"
                    className="input-field"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="seal-field-label">Phone</label>
                  <input
                    type="text"
                    className="input-field"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+255 700 000 000"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="seal-field-label">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="operations@cfs-dsm.co.tz"
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={saving || !name.trim()}>
                {saving ? 'Registering…' : 'Register partner'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedPartner} onOpenChange={open => !open && setSelectedPartner(null)}>
        <SheetContent className="partner-profile-sheet">
          {selectedPartner && (
            <>
              <SheetHeader className="partner-profile-header">
                <div className="partner-profile-identity">
                  <AvatarPicker id={selectedPartner.id} kind="customers" name={selectedPartner.name} size={48} shape="square" />
                  <div>
                    <SheetTitle>{selectedPartner.name}</SheetTitle>
                    <SheetDescription>{selectedPartner.contact_name || 'No primary contact assigned'}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <Tabs defaultValue="profile" className="partner-profile-tab-root">
                <TabsList>
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="category">Category</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="partner-tab-content">
                  <div className="partner-profile-grid">
                    {[
                      ['Contact person', selectedPartner.contact_name], ['Email', selectedPartner.email], ['Phone', selectedPartner.phone],
                      ['Website', selectedPartner.website], ['Location', [selectedPartner.city, selectedPartner.country].filter(Boolean).join(', ')],
                      ['Address', selectedPartner.address], ['Registry number', selectedPartner.registry_number], ['Tax ID', selectedPartner.tax_id],
                      ['Account status', selectedPartner.account_status],
                    ].map(([label, value]) => (
                      <div key={label} className="partner-profile-field">
                        <span>{label}</span><strong>{value || 'Not set'}</strong>
                      </div>
                    ))}
                  </div>
                  {selectedPartner.notes && <div className="partner-profile-notes"><span>Notes</span><p>{selectedPartner.notes}</p></div>}
                </TabsContent>
                <TabsContent value="category" className="partner-tab-content">
                  <div className="partner-category-card">
                    <FeaturedIcon variant="brand" size="lg" shape="square"><Icon name="tag" size={20} /></FeaturedIcon>
                    <div><h3>Partner category</h3><p>Controls how this organisation is grouped throughout the partners directory.</p></div>
                  </div>
                  <label className="seal-field-label">Category</label>
                  <Select value={selectedPartner.partner_role || 'Other'} onValueChange={updatePartnerCategory} disabled={categorySaving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PARTNER_CATEGORIES.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                </TabsContent>
                <TabsContent value="history" className="partner-tab-content">
                  {historyLoading ? <SectionLoading /> : (
                    <div className="partner-history">
                      {activities.map(activity => (
                        <div key={activity.id} className="partner-history-item">
                          <span className="partner-history-dot" />
                          <div><strong>{activity.body}</strong><span>{activity.actor_name || 'Hudumika'} · {new Date(activity.created_at).toLocaleString()}</span></div>
                        </div>
                      ))}
                      <div className="partner-history-item">
                        <span className="partner-history-dot" />
                        <div><strong>Added to partners directory</strong><span>{new Date(selectedPartner.created_at).toLocaleString()}</span></div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
