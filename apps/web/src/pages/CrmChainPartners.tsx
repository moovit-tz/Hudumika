import React, { useEffect, useState, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { SectionLoading } from '../components/ui/spinner.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter
} from '../components/ui/dialog.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';

interface Partner {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

/* ── Infer partner category from name ── */
function inferCategory(name: string): { label: string; variant: 'brand' | 'info' | 'warning' | 'success' | 'gray' } {
  const n = name.toLowerCase();
  if (n.includes('cfs') || n.includes('container freight') || n.includes('freight station')) return { label: 'CFS', variant: 'brand' };
  if (n.includes('icd') || n.includes('inland container') || n.includes('dry port')) return { label: 'ICD', variant: 'info' };
  if (n.includes('warehouse') || n.includes('bonded') || n.includes('storage')) return { label: 'Warehouse', variant: 'warning' };
  if (n.includes('logistics') || n.includes('transport') || n.includes('clearing')) return { label: 'Logistics', variant: 'success' };
  return { label: 'Partner', variant: 'gray' };
}

export function CrmChainPartners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [search, setSearch] = useState('');

  /* New Partner Form */
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
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
        body: JSON.stringify({ name: name.trim(), contactName: contactName.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined }),
      });
      setName(''); setContactName(''); setEmail(''); setPhone('');
      setShowAddDialog(false);
      loadPartners();
      showAlert('Chain partner registered', { variant: 'success' });
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 32px', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* House Page Header */}
      <PageHeader
        crumbs={['CRM', 'Chain Partners']}
        titlePlain="Chain"
        titleEm="partners"
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

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI Metrics Ribbon */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>

          {/* KPI 1 */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>Chain Partners</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>{totalCount}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{withContact} with contact person</div>
            </div>
            <FeaturedIcon variant="brand" size="md" shape="square">
              <Icon name="link" size={18} />
            </FeaturedIcon>
          </div>

          {/* KPI 2 */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--elev-sm)', overflow: 'hidden' }}>

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
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <Icon name="x" size={13} />
                </button>
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
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink2)', marginBottom: 6 }}>No chain partners yet</div>
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
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '11px 18px', fontWeight: 700 }}>Partner</th>
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
                              <div style={{ fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{p.name}</div>
                              <Badge variant={cat.variant} style={{ marginTop: 3, fontSize: 10, padding: '1px 6px' }}>{cat.label}</Badge>
                            </div>
                          </div>
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
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={async () => {
                                  if (!window.confirm(`Remove "${p.name}" from chain partners?`)) return;
                                  try {
                                    await apiFetch(`/v1/customers/partners/${p.id}`, { method: 'DELETE' });
                                    setPartners(prev => prev.filter(x => x.id !== p.id));
                                  } catch (err: any) { showAlert(err.message || 'Failed to delete'); }
                                }}
                              >
                                <Icon name="trash" size={13} /> Delete
                              </DropdownMenuItem>
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
            <DialogTitle>Register chain partner</DialogTitle>
            <DialogDescription>Add an ICD, CFS operator, bonded warehouse, or logistics partner.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePartner}>
            <DialogBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
    </div>
  );
}
