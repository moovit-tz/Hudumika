import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useContacts } from '../shells/contacts-context.js';
import type { Contact, ContactActivityEntry } from '../shells/contacts-context.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

const MODAL_STEPS: { key: 'profile' | 'contact' | 'business' | 'extra'; label: string; icon: IconName }[] = [
  { key: 'profile',  label: 'Profile',        icon: 'user'     },
  { key: 'contact',  label: 'Contact',        icon: 'mail'     },
  { key: 'business', label: 'Business',       icon: 'building' },
  { key: 'extra',    label: 'Labels & Notes', icon: 'tag'      },
];

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=60',
];

export function Contacts() {
  // Shared state + data from context (provided by ContactsProvider in ContactsShell)
  const {
    contacts, labels, duplicates, companies, loading,
    currentView, setCurrentView,
    selectedLabelId, setSelectedLabelId,
    activeContact, setActiveContact,
    searchQuery, setSearchQuery,
    loadData,
    openContactModalRef,
    filterOpen,
    sortBy, setSortBy,
    filterLabelIds, setFilterLabelIds,
  } = useContacts();

  // Local UI state
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'activity'>('overview');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activityLog, setActivityLog] = useState<ContactActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Modal / Form states
  const [showEditModal, setShowEditModal] = useState<Contact | null>(null);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);

  // Inline label creation state in edit modal
  const [inlineNewLabel, setInlineNewLabel] = useState('');

  // Contact Form Fields
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formCompanyId, setFormCompanyId] = useState<string | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formBirthday, setFormBirthday] = useState('');
  const [formLabelIds, setFormLabelIds] = useState<string[]>([]);
  const [formIsFavorite, setFormIsFavorite] = useState(false);
  const [formAvatarUrl, setFormAvatarUrl] = useState<string | null>(null);

  // Eyris Extra Fields
  const [formLocation, setFormLocation] = useState('');
  const [formWebsite, setFormWebsite] = useState('');
  const [formIndustry, setFormIndustry] = useState('');
  const [formCompanySize, setFormCompanySize] = useState('');
  const [formSalesOwner, setFormSalesOwner] = useState('');
  const [formLastContactedAt, setFormLastContactedAt] = useState('');

  // Modal step (long form broken into sections; free navigation between them)
  const [formStep, setFormStep] = useState<'profile' | 'contact' | 'business' | 'extra'>('profile');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCompanies = useMemo(() => {
    const q = formCompany.trim().toLowerCase();
    if (!q) return companies.slice(0, 6);
    return companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [companies, formCompany]);

  // Open Edit/New Modal
  const openContactModal = (contact: Contact | null) => {
    setShowAvatarSelector(false);
    setInlineNewLabel('');
    setFormStep('profile');
    setCompanyPickerOpen(false);
    if (contact) {
      // Edit mode
      setShowEditModal(contact);
      setFormFirstName(contact.first_name);
      setFormLastName(contact.last_name || '');
      setFormEmail(contact.email || '');
      setFormPhone(contact.phone || '');
      setFormCompany(contact.company || '');
      setFormCompanyId(contact.company_id || null);
      setFormJobTitle(contact.job_title || '');
      setFormNotes(contact.notes || '');
      setFormBirthday(contact.birthday ? contact.birthday.split('T')[0] : '');
      setFormLabelIds(contact.labels.map(l => l.id));
      setFormIsFavorite(contact.is_favorite);
      setFormAvatarUrl(contact.avatar_url || null);

      // Eyris fields
      setFormLocation(contact.location || '');
      setFormWebsite(contact.website || '');
      setFormIndustry(contact.industry || '');
      setFormCompanySize(contact.company_size || '');
      setFormSalesOwner(contact.sales_owner || '');
      setFormLastContactedAt(contact.last_contacted_at ? contact.last_contacted_at.split('T')[0] : '');
    } else {
      // Create mode
      setShowEditModal({} as Contact);
      setFormFirstName('');
      setFormLastName('');
      setFormEmail('');
      setFormPhone('');
      setFormCompany('');
      setFormCompanyId(null);
      setFormJobTitle('');
      setFormNotes('');
      setFormBirthday('');
      setFormLabelIds([]);
      setFormIsFavorite(false);
      setFormAvatarUrl(null);

      // Eyris fields
      setFormLocation('');
      setFormWebsite('');
      setFormIndustry('');
      setFormCompanySize('');
      setFormSalesOwner('');
      setFormLastContactedAt('');
    }
  };

  useEffect(() => {
    openContactModalRef.current = openContactModal;
  });

  // Submit Contact Form
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;

    const body = {
      first_name: formFirstName,
      last_name: formLastName,
      email: formEmail,
      phone: formPhone,
      company: formCompany,
      company_id: formCompanyId,
      job_title: formJobTitle,
      notes: formNotes,
      birthday: formBirthday || null,
      is_favorite: formIsFavorite,
      avatar_url: formAvatarUrl,
      label_ids: formLabelIds,
      location: formLocation,
      website: formWebsite,
      industry: formIndustry,
      company_size: formCompanySize,
      sales_owner: formSalesOwner,
      last_contacted_at: formLastContactedAt || null,
    };

    try {
      if (showEditModal.id) {
        // Update
        await apiFetch(`/v1/contacts/${showEditModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
      } else {
        // Create
        await apiFetch('/v1/contacts', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      setShowEditModal(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save contact');
    }
  };

  // Company picker — search registered companies (customers), or fall back to free text
  const handleCompanyInputChange = (value: string) => {
    setFormCompany(value);
    setFormCompanyId(null);
    setCompanyPickerOpen(true);
  };
  const handleSelectCompany = (c: { id: string; name: string }) => {
    setFormCompany(c.name);
    setFormCompanyId(c.id);
    setCompanyPickerOpen(false);
  };
  const handleClearCompany = () => {
    setFormCompany('');
    setFormCompanyId(null);
    setCompanyPickerOpen(false);
  };

  // Create label inline in the edit modal
  const handleCreateLabelInline = async () => {
    if (!inlineNewLabel.trim()) return;
    try {
      const newLabel = await apiFetch('/v1/contacts/labels', {
        method: 'POST',
        body: JSON.stringify({ name: inlineNewLabel.trim() })
      });
      await loadData();
      setFormLabelIds(prev => [...prev, newLabel.id]);
      setInlineNewLabel('');
    } catch (err: any) {
      alert(err.message || 'Failed to create label');
    }
  };

  // Avatar upload handler
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormAvatarUrl(reader.result as string);
      setShowAvatarSelector(false);
    };
    reader.readAsDataURL(file);
  };

  // Fetch the activity log whenever the Activity tab is opened for a contact
  useEffect(() => {
    if (!activeContact || activeTab !== 'activity') return;
    let cancelled = false;
    setActivityLoading(true);
    apiFetch(`/v1/contacts/${activeContact.id}/activity`)
      .then((res: any) => { if (!cancelled) setActivityLog(Array.isArray(res) ? res : []); })
      .catch(() => { if (!cancelled) setActivityLog([]); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [activeContact, activeTab]);

  // Delete / Trash Contact
  const handleDeleteContact = async (id: string, hard: boolean = false) => {
    try {
      await apiFetch(`/v1/contacts/${id}?hard=${hard}`, { method: 'DELETE' });
      if (activeContact?.id === id) setActiveContact(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete contact');
    }
  };

  // Restore Contact
  const handleRestoreContact = async (id: string) => {
    try {
      await apiFetch(`/v1/contacts/${id}/restore`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to restore contact');
    }
  };

  // Star / Unstar
  const handleToggleFavorite = async (contact: Contact) => {
    try {
      await apiFetch(`/v1/contacts/${contact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_favorite: !contact.is_favorite })
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update favorite status');
    }
  };

  // Merge Duplicates
  const handleMerge = async (primaryId: string, duplicateIds: string[]) => {
    try {
      await apiFetch('/v1/contacts/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds })
      });
      await loadData();
      alert('Contacts merged successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to merge contacts');
    }
  };

  // Bulk Actions
  const handleBulkDelete = async (hard: boolean = false) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await apiFetch('/v1/contacts/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids, status: hard ? 'DELETE' : 'TRASHED' })
      });
      setSelectedIds(new Set());
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to perform bulk delete');
    }
  };

  const handleBulkLabel = async (labelId: string, action: 'ADD' | 'REMOVE') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await apiFetch('/v1/contacts/bulk-label', {
        method: 'POST',
        body: JSON.stringify({ contact_ids: ids, label_id: labelId, action })
      });
      setSelectedIds(new Set());
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to apply bulk label');
    }
  };

  // Filter + Sort Contacts
  const filteredContacts = useMemo(() => {
    let list = contacts.filter(c => {
      if (currentView === 'contacts' && c.status !== 'ACTIVE') return false;
      if (currentView === 'favorites' && (!c.is_favorite || c.status !== 'ACTIVE')) return false;
      if (currentView === 'trash' && c.status !== 'TRASHED') return false;
      if (currentView === 'label' && (c.status !== 'ACTIVE' || !c.labels.some(l => l.id === selectedLabelId))) return false;

      if (filterLabelIds.length > 0 && !filterLabelIds.some(id => c.labels.some(l => l.id === id))) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const fullName = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.job_title || '').toLowerCase().includes(q) ||
        (c.location || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.sales_owner || '').toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name || ''}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name || ''}`.toLowerCase();
      if (sortBy === 'name-asc')     return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
      if (sortBy === 'name-desc')    return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
      if (sortBy === 'created-desc') return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      if (sortBy === 'created-asc')  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
      return 0;
    });

    return list;
  }, [contacts, currentView, selectedLabelId, searchQuery, sortBy, filterLabelIds]);

  // Toggle Single Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle Select All
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  // Monogram helper
  const monogram = (first: string, last?: string | null) => {
    return `${first[0]}${last ? last[0] : ''}`.toUpperCase();
  };

  return (
    <div className="cts-page">
      
      {/* Conditional Rendering: Detail Page vs List View */}
        {activeContact ? (
          /* ─── FULL PAGE CONTACT DETAIL VIEW ─── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Top Detail Bar */}
            <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setActiveContact(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none',
                  color: 'var(--cts-accent)', fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0
                }}
              >
                <Icon name="arrowLeft" size={16} color="var(--cts-accent)" />
                Back to contacts
              </button>

              <div style={{ flex: 1 }} />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(activeContact)}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="star" size={14} color={activeContact.is_favorite ? '#f4b400' : 'var(--ink2)'} />
                  {activeContact.is_favorite ? 'Favorited' : 'Favorite'}
                </button>
                <button
                  type="button"
                  onClick={() => openContactModal(activeContact)}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="edit" size={14} color="var(--ink2)" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteContact(activeContact.id, activeContact.status === 'TRASHED')}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: 'var(--red)', color: 'var(--red)' }}
                >
                  <Icon name="trash" size={14} color="var(--red)" />
                  Delete
                </button>
              </div>
            </div>

            {/* Detail Body (Two-Column Layout) */}
            <div style={{ flex: 1, display: 'flex', padding: 24, gap: 24, overflowY: 'auto' }}>
              
              {/* Left Column: Profile Card */}
              <div style={{ width: 300, flexShrink: 0 }}>
                <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  
                  {/* Avatar */}
                  <div style={{ width: 110, height: 110, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg)', border: '3px solid var(--cts-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    {activeContact.avatar_url ? (
                      <img src={activeContact.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'var(--cts-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 44 }}>
                        {monogram(activeContact.first_name, activeContact.last_name)}
                      </div>
                    )}
                  </div>

                  {/* Name & Title */}
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px' }}>
                    {activeContact.first_name} {activeContact.last_name || ''}
                  </h2>
                  
                  {activeContact.job_title || activeContact.company ? (
                    <p style={{ fontSize: 13.5, color: 'var(--ink2)', margin: '0 0 16px', fontWeight: 500 }}>
                      {activeContact.job_title} {activeContact.company ? `@ ${activeContact.company}` : ''}
                    </p>
                  ) : null}

                  {/* Labels */}
                  {activeContact.labels.length > 0 ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                      {activeContact.labels.map(l => (
                        <span key={l.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'var(--cts-accent-bg)', color: 'var(--cts-accent)', fontWeight: 600 }}>
                          {l.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', marginBottom: 20 }}>No labels assigned</span>
                  )}

                  {/* Sidebar Quick Info */}
                  <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="mail" size={14} color="var(--ink2)" />
                      <span style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeContact.email || ''}>
                        {activeContact.email || 'No email'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="phone" size={14} color="var(--ink2)" />
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                        {activeContact.phone || 'No phone'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="mapPin" size={14} color="var(--ink2)" />
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                        {activeContact.location || 'No location'}
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Right Column: Details & Tabs */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                {/* Tabs Header */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--white)', borderRadius: '12px 12px 0 0', padding: '0 16px', border: '1px solid var(--border)' }}>
                  {[
                    { key: 'overview', label: 'Overview', icon: 'user' as IconName },
                    { key: 'notes', label: 'Notes', icon: 'fileText' as IconName },
                    { key: 'activity', label: 'Activity Log', icon: 'clock' as IconName },
                  ].map(tab => {
                    const active = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key as any)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px',
                          border: 'none', background: 'none', cursor: 'pointer',
                          borderBottom: active ? '3px solid var(--cts-accent)' : '3px solid transparent',
                          color: active ? 'var(--cts-accent)' : 'var(--ink2)',
                          fontWeight: 600, fontSize: 14, transition: 'all 0.15s'
                        }}
                      >
                        <Icon name={tab.icon} size={15} color={active ? 'var(--cts-accent)' : 'var(--ink2)'} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tab Body */}
                <div style={{ background: 'var(--white)', borderRadius: '0 0 12px 12px', padding: 24, border: '1px solid var(--border)', borderTop: 'none', flex: 1 }}>
                  
                  {/* OVERVIEW TAB */}
                  {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                      
                      {/* Business Info Grid */}
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 16 }}>
                          Business Information
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Company</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{activeContact.company || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Job Title</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{activeContact.job_title || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Industry</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{activeContact.industry || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Company Size</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{activeContact.company_size || '—'}</div>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Website</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                              {activeContact.website ? (
                                <a href={activeContact.website.startsWith('http') ? activeContact.website : `https://${activeContact.website}`} target="_blank" rel="noreferrer" style={{ color: 'var(--cts-accent)', textDecoration: 'none', fontWeight: 600 }}>
                                  {activeContact.website}
                                </a>
                              ) : '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Account Management Grid */}
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 16 }}>
                          Account Management
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Sales Owner</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{activeContact.sales_owner || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Last Contacted</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                              {activeContact.last_contacted_at ? new Date(activeContact.last_contacted_at).toLocaleDateString() : '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Additional Details */}
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 16 }}>
                          Personal Details
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Birthday</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                              {activeContact.birthday ? new Date(activeContact.birthday).toLocaleDateString() : '—'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Date Added</div>
                            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                              {activeContact.created_at ? new Date(activeContact.created_at).toLocaleDateString() : 'Recently'}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* NOTES TAB */}
                  {activeTab === 'notes' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Notepad</div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openContactModal(activeContact)}
                        >
                          Edit Notes
                        </button>
                      </div>
                      <div style={{
                        flex: 1, padding: 16, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
                        fontSize: 14, color: 'var(--ink)', whiteSpace: 'pre-wrap', minHeight: 200, fontFamily: 'inherit'
                      }}>
                        {activeContact.notes || 'No notes added yet. Click Edit to write notes about this contact.'}
                      </div>
                    </div>
                  )}

                  {/* ACTIVITY LOG TAB */}
                  {activeTab === 'activity' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Timeline</div>

                      {activityLoading ? (
                        <div style={{ fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' }}>Loading activity…</div>
                      ) : activityLog.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' }}>No activity recorded yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 20 }}>
                          {/* Timeline vertical line */}
                          <div style={{ position: 'absolute', top: 8, bottom: 8, left: 6, width: 2, background: 'var(--border)' }} />

                          {activityLog.map(entry => {
                            const cfg: Record<string, { label: string; dot: string }> = {
                              created:          { label: 'Contact created',        dot: 'var(--cts-accent)' },
                              updated:          { label: 'Contact updated',        dot: 'var(--ink2)' },
                              company_linked:   { label: 'Company linked',         dot: 'var(--green)' },
                              company_changed:  { label: 'Company switched',       dot: '#d97706' },
                              company_unlinked: { label: 'Company removed',        dot: 'var(--red)' },
                            };
                            const c = cfg[entry.action] || { label: entry.action, dot: 'var(--ink2)' };
                            return (
                              <div key={entry.id} style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%', background: c.dot }} />
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.label}</div>
                                {entry.detail && (
                                  <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 2 }}>{entry.detail}</div>
                                )}
                                <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>
                                  {new Date(entry.created_at).toLocaleString()}{entry.actor_name ? ` · by ${entry.actor_name}` : ''}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                    </div>
                  )}

                </div>

              </div>

            </div>

          </div>
        ) : (
          /* ─── STANDARD CONTACTS LIST / SEARCH / TABLE VIEW ─── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Filter panel — header section (sort) + body section (labels) */}
            {filterOpen && (
              <div className="cts-filter-panel">
                {/* Header section: Sort */}
                <div className="cts-filter-section">
                  <span className="cts-filter-section-label">Sort</span>
                  {([
                    { key: 'name-asc',     label: 'Name A→Z' },
                    { key: 'name-desc',    label: 'Name Z→A' },
                    { key: 'created-desc', label: 'Newest first' },
                    { key: 'created-asc',  label: 'Oldest first' },
                  ] as { key: typeof sortBy; label: string }[]).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`cts-chip${sortBy === opt.key ? ' cts-chip--on' : ''}`}
                      onClick={() => setSortBy(opt.key)}
                      title={opt.label}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* Body section: Label filters */}
                {labels.length > 0 && (
                  <div className="cts-filter-section cts-filter-section--body">
                    <span className="cts-filter-section-label">Label</span>
                    {filterLabelIds.length > 0 && (
                      <button
                        type="button"
                        className="cts-chip cts-chip--clear"
                        onClick={() => setFilterLabelIds([])}
                        title="Clear label filters"
                      >Clear</button>
                    )}
                    {labels.map(l => {
                      const on = filterLabelIds.includes(l.id);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className={`cts-chip${on ? ' cts-chip--on' : ''}`}
                          onClick={() => setFilterLabelIds(
                            on ? filterLabelIds.filter(id => id !== l.id) : [...filterLabelIds, l.id]
                          )}
                          title={l.name}
                        >{l.name}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Always-visible list bar — contact count + active filter summary */}
            <div className="cts-list-bar">
              <span className="cts-list-bar-count">
                {loading ? 'Loading…' : `${filteredContacts.length} ${filteredContacts.length === 1 ? 'contact' : 'contacts'}`}
              </span>
              <div className="cts-list-bar-meta">
                <span className="cts-list-bar-sort">
                  {sortBy === 'name-asc' ? 'A → Z' : sortBy === 'name-desc' ? 'Z → A' : sortBy === 'created-desc' ? 'Newest first' : 'Oldest first'}
                </span>
                {filterLabelIds.length > 0 && (
                  <button
                    type="button"
                    className="cts-list-bar-badge cts-list-bar-badge--label"
                    onClick={() => setFilterLabelIds([])}
                    title="Clear label filters"
                  >
                    {filterLabelIds.length} label filter{filterLabelIds.length > 1 ? 's' : ''} ×
                  </button>
                )}
                {searchQuery && (
                  <button
                    type="button"
                    className="cts-list-bar-badge cts-list-bar-badge--search"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    "{searchQuery}" ×
                  </button>
                )}
              </div>
            </div>

            {/* Table Container */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--white)' }}>
              
              {/* Bulk Action Bar (when items are selected) */}
              {selectedIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', background: 'var(--cts-accent-bg)', borderRadius: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cts-accent)' }}>{selectedIds.size} selected</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>Deselect all</button>
                  
                  <div style={{ flex: 1 }} />

                  {/* Bulk Label Trigger */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: 'var(--white)', color: 'var(--ink)' }}>
                        Apply Label…
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {labels.map(l => (
                        <DropdownMenuItem key={l.id} onClick={() => handleBulkLabel(l.id, 'ADD')}>{l.name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                    onClick={() => handleBulkDelete(currentView === 'trash')}
                  >
                    {currentView === 'trash' ? 'Delete Permanently' : 'Move to Trash'}
                  </button>
                </div>
              )}

              {/* Standard List Table */}
              {currentView !== 'merge' && (
                <div style={{ minWidth: 800 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--ink2)', borderBottom: '1px solid var(--border)', height: 48 }}>
                        <th style={{ width: 48, paddingLeft: 12 }}>
                          <input
                            type="checkbox"
                            checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th style={{ padding: '8px 16px', fontWeight: 500 }}>Name</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500 }}>Email</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500 }}>Phone number</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500 }}>Job title & company</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500 }}>Labels</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--ink2)', fontSize: 14, fontStyle: 'italic' }}>
                            No contacts found.
                          </td>
                        </tr>
                      ) : (
                        filteredContacts.map(contact => {
                          const isSelected = selectedIds.has(contact.id);
                          return (
                            <tr
                              key={contact.id}
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.tagName === 'INPUT' || target.closest('button')) return;
                                setActiveContact(contact);
                              }}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                height: 56,
                                background: isSelected ? 'var(--bg)' : 'transparent',
                                cursor: 'pointer'
                              }}
                              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                            >
                              {/* Checkbox */}
                              <td style={{ paddingLeft: 12 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(contact.id)}
                                />
                              </td>

                              {/* Avatar & Name */}
                              <td style={{ padding: '8px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {contact.avatar_url ? (
                                    <img
                                      src={contact.avatar_url}
                                      alt=""
                                      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    <div style={{
                                      width: 36, height: 36, borderRadius: '50%',
                                      background: 'var(--cts-accent)', color: '#fff',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontWeight: 700, fontSize: 13
                                    }}>
                                      {monogram(contact.first_name, contact.last_name)}
                                    </div>
                                  )}
                                  <div>
                                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                                      {contact.first_name} {contact.last_name || ''}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Email */}
                              <td style={{ padding: '8px 16px', color: 'var(--ink)' }}>{contact.email || '—'}</td>

                              {/* Phone */}
                              <td style={{ padding: '8px 16px', color: 'var(--ink)' }}>{contact.phone || '—'}</td>

                              {/* Job & Company */}
                              <td style={{ padding: '8px 16px', color: 'var(--ink)' }}>
                                {contact.job_title ? `${contact.job_title}, ` : ''}{contact.company || ''}
                                {!contact.job_title && !contact.company && '—'}
                              </td>

                              {/* Labels */}
                              <td style={{ padding: '8px 16px' }}>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {contact.labels.map(l => (
                                    <span key={l.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 500 }}>
                                      {l.name}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              {/* Actions */}
                              <td style={{ padding: '8px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                                  {contact.status === 'ACTIVE' ? (
                                    <>
                                      {/* Star Favorite */}
                                      <button
                                        type="button"
                                        onClick={() => handleToggleFavorite(contact)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                                      >
                                        <Icon
                                          name="star"
                                          size={18}
                                          color={contact.is_favorite ? '#f4b400' : 'var(--ink2)'}
                                        />
                                      </button>
                                      {/* Edit */}
                                      <button
                                        type="button"
                                        onClick={() => openContactModal(contact)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                                      >
                                        <Icon name="edit" size={18} color="var(--ink2)" />
                                      </button>
                                      {/* Trash */}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteContact(contact.id, false)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                                      >
                                        <Icon name="trash" size={18} color="var(--ink2)" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {/* Restore */}
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreContact(contact.id)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                                        title="Restore"
                                      >
                                        <Icon name="rotateCcw" size={18} color="var(--cts-accent)" />
                                      </button>
                                      {/* Hard Delete */}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteContact(contact.id, true)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                                        title="Delete permanently"
                                      >
                                        <Icon name="trash" size={18} color="var(--red)" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>

                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Merge & Fix View */}
              {currentView === 'merge' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Duplicate suggestions</h3>
                    {duplicates.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={async () => {
                          for (const group of duplicates) {
                            await handleMerge(group.contacts[0].id, group.contacts.slice(1).map(c => c.id));
                          }
                          alert('All duplicates merged!');
                        }}
                      >
                        Merge all
                      </button>
                    )}
                  </div>

                  {duplicates.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--ink2)', fontStyle: 'italic' }}>
                      No duplicates found. Your contact list is clean!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {duplicates.map((group, index) => (
                        <div key={index} className="card" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12, fontWeight: 600 }}>
                            Duplicate {group.type === 'email' ? 'email' : 'phone'}: {group.value}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
                            {group.contacts.map(c => (
                              <div
                                key={c.id}
                                onClick={() => setActiveContact(c)}
                                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8, cursor: 'pointer' }}
                              >
                                {c.avatar_url ? (
                                  <img
                                    src={c.avatar_url}
                                    alt=""
                                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <div style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: 'var(--cts-accent)', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: 12
                                  }}>
                                    {monogram(c.first_name, c.last_name)}
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.first_name} {c.last_name || ''}</div>
                                  <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{c.job_title || ''} {c.company ? `@ ${c.company}` : ''}</div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleMerge(group.contacts[0].id, group.contacts.slice(1).map(c => c.id))}
                            >
                              Merge
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

      {/* ── CREATE / EDIT CONTACT MODAL ── */}
      {showEditModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' }}>
          <form onSubmit={handleSaveContact} style={{ background: 'var(--white)', padding: 32, borderRadius: 8, width: 560, maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', margin: '20px 0' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
              {showEditModal.id ? 'Edit contact' : 'Create contact'}
            </h3>

            {/* Step tabs — click any section directly, no strict linear gating */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              {MODAL_STEPS.map(step => {
                const on = formStep === step.key;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setFormStep(step.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                      border: 'none', background: 'none', cursor: 'pointer',
                      borderBottom: on ? '2.5px solid var(--cts-accent)' : '2.5px solid transparent',
                      color: on ? 'var(--cts-accent)' : 'var(--ink2)',
                      fontWeight: 600, fontSize: 12.5, marginBottom: -1,
                    }}
                  >
                    <Icon name={step.icon} size={14} color={on ? 'var(--cts-accent)' : 'var(--ink2)'} />
                    {step.label}
                  </button>
                );
              })}
            </div>

            {/* STEP: Profile — avatar + name + favorite */}
            {formStep === 'profile' && (<>
            {/* Profile Avatar Block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, position: 'relative' }}>
              <div
                onClick={() => setShowAvatarSelector(o => !o)}
                style={{
                  width: 80, height: 80, borderRadius: '50%',
                  cursor: 'pointer', overflow: 'hidden', position: 'relative',
                  border: '2px solid var(--cts-accent)', background: 'var(--bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                {formAvatarUrl ? (
                  <img src={formAvatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', background: 'var(--cts-accent)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 28
                  }}>
                    {formFirstName ? monogram(formFirstName, formLastName) : '?'}
                  </div>
                )}
                
                {/* Hover overlay */}
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                  color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                >
                  <Icon name="camera" size={18} color="#fff" />
                  <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Change</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAvatarSelector(o => !o)}
                style={{
                  background: 'none', border: 'none', color: 'var(--cts-accent)', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', marginTop: 8
                }}
              >
                Change Profile Picture
              </button>

              {/* Avatar Selector Dropdown Panel */}
              {showAvatarSelector && (
                <div style={{
                  position: 'absolute', top: 90, zIndex: 10, width: 280,
                  background: 'var(--white)', borderRadius: 8, padding: 16,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)', border: '1px solid var(--border)'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8 }}>Choose Preset Portrait</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                    {PRESET_AVATARS.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        onClick={() => { setFormAvatarUrl(url); setShowAvatarSelector(false); }}
                        style={{
                          width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
                          cursor: 'pointer', border: formAvatarUrl === url ? '2.5px solid var(--cts-accent)' : '1.5px solid transparent'
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
                        fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer'
                      }}
                    >
                      <Icon name="upload" size={14} color="var(--ink2)" />
                      Upload Photo
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      style={{ display: 'none' }}
                    />

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Or Paste Image URL</div>
                      <input
                        className="input-field"
                        placeholder="https://example.com/photo.jpg"
                        style={{ height: 30, fontSize: 12, padding: '4px 8px' }}
                        value={formAvatarUrl?.startsWith('data:') ? '' : (formAvatarUrl || '')}
                        onChange={e => setFormAvatarUrl(e.target.value || null)}
                      />
                    </div>

                    {formAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => { setFormAvatarUrl(null); setShowAvatarSelector(false); }}
                        style={{
                          width: '100%', border: 'none', background: 'none', color: 'var(--red)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0 0'
                        }}
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Form Section: Names */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>First name</label>
                <input className="input-field" required value={formFirstName} onChange={e => setFormFirstName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Last name</label>
                <input className="input-field" value={formLastName} onChange={e => setFormLastName(e.target.value)} />
              </div>
            </div>

            {/* Favorite Checkbox */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>
                <input
                  type="checkbox"
                  checked={formIsFavorite}
                  onChange={e => setFormIsFavorite(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 13, color: 'var(--ink)', marginLeft: 8 }}>Add to favorites</span>
              </div>
            </div>
            </>)}

            {/* STEP: Contact — email, phone, location, birthday */}
            {formStep === 'contact' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Email</label>
                <input className="input-field" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Phone</label>
                <input className="input-field" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Location</label>
                <input className="input-field" placeholder="e.g. New York, US" value={formLocation} onChange={e => setFormLocation(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Birthday</label>
                <DatePicker date={parseDateOnly(formBirthday)} onChange={d => setFormBirthday(toDateOnlyString(d))} />
              </div>
            </div>
            </>)}

            {/* STEP: Business — searchable company picker, job title, industry, etc. */}
            {formStep === 'business' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Company</label>
                <Popover open={companyPickerOpen && filteredCompanies.length > 0} onOpenChange={setCompanyPickerOpen}>
                  <PopoverAnchor asChild>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="input-field"
                        style={{ paddingRight: formCompanyId || formCompany ? 30 : undefined }}
                        value={formCompany}
                        placeholder="Search registered companies or type a new one…"
                        onChange={e => handleCompanyInputChange(e.target.value)}
                        onFocus={() => setCompanyPickerOpen(true)}
                      />
                      {(formCompanyId || formCompany) && (
                        <button
                          type="button"
                          title={formCompanyId ? 'Unlink company' : 'Clear'}
                          onClick={handleClearCompany}
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex' }}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      )}
                    </div>
                  </PopoverAnchor>
                  <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1.5" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
                    {filteredCompanies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCompany(c)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Icon name="building" size={13} color="var(--ink2)" />
                        {c.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                {formCompanyId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                    <Icon name="check" size={11} /> Linked to registered company
                  </div>
                ) : formCompany ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>Not linked — will be saved as free text</div>
                ) : null}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Job title</label>
                <input className="input-field" value={formJobTitle} onChange={e => setFormJobTitle(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Industry</label>
                <input className="input-field" placeholder="e.g. Software" value={formIndustry} onChange={e => setFormIndustry(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Company Size</label>
                <Select value={formCompanySize || '__none__'} onValueChange={v => setFormCompanySize(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="input-field" style={{ height: 36, padding: '0 8px' }}><SelectValue placeholder="Select size..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select size...</SelectItem>
                    <SelectItem value="1-10 employees">1-10 employees</SelectItem>
                    <SelectItem value="11-50 employees">11-50 employees</SelectItem>
                    <SelectItem value="51-200 employees">51-200 employees</SelectItem>
                    <SelectItem value="201+ employees">201+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Website</label>
              <input className="input-field" placeholder="e.g. https://www.google.com" value={formWebsite} onChange={e => setFormWebsite(e.target.value)} />
            </div>

            {/* Form Section: Account Management */}
            <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12, marginTop: 24 }}>
              Account Management
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Sales Owner</label>
                <input className="input-field" value={formSalesOwner} onChange={e => setFormSalesOwner(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Last Contacted Date</label>
                <DatePicker date={parseDateOnly(formLastContactedAt)} onChange={d => setFormLastContactedAt(toDateOnlyString(d))} />
              </div>
            </div>
            </>)}

            {/* STEP: Labels & Notes */}
            {formStep === 'extra' && (<>
            {/* Labels multiselect box + Inline new label creator */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Labels</label>
              
              {/* Pill selector container */}
              <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 110, overflowY: 'auto',
                padding: 10, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', marginBottom: 8
              }}>
                {labels.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic' }}>No labels created yet. Use the input below to create one!</span>
                ) : (
                  labels.map(label => {
                    const selected = formLabelIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => {
                          setFormLabelIds(prev =>
                            selected ? prev.filter(id => id !== label.id) : [...prev, label.id]
                          );
                        }}
                        style={{
                          fontSize: 12, padding: '4px 12px', borderRadius: 16, cursor: 'pointer',
                          border: `1px solid ${selected ? 'var(--cts-accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--cts-accent-bg)' : 'var(--white)',
                          color: selected ? 'var(--cts-accent)' : 'var(--ink)',
                          fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                          transition: 'all 0.15s'
                        }}
                      >
                        {label.name}
                        {selected && <Icon name="check" size={11} color="var(--cts-accent)" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Inline Label Creator */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={inlineNewLabel}
                  onChange={e => setInlineNewLabel(e.target.value)}
                  placeholder="Type new label name..."
                  style={{
                    flex: 1, height: 32, fontSize: 12.5, border: '1px solid var(--border)',
                    borderRadius: 6, padding: '0 10px', outline: 'none'
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateLabelInline(); } }}
                />
                <button
                  type="button"
                  onClick={handleCreateLabelInline}
                  style={{
                    padding: '0 12px', height: 32, borderRadius: 6, border: 'none',
                    background: 'var(--cts-accent)', color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center'
                  }}
                >
                  Create Label
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 4 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Notes</label>
              <textarea className="input-field" rows={3} value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
            </>)}

            {/* Footer — Back / Continue walk through steps; Save works from any step */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(null)}>Cancel</button>
              <div style={{ display: 'flex', gap: 10 }}>
                {MODAL_STEPS.findIndex(s => s.key === formStep) > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setFormStep(MODAL_STEPS[MODAL_STEPS.findIndex(s => s.key === formStep) - 1].key)}
                  >
                    Back
                  </button>
                )}
                {MODAL_STEPS.findIndex(s => s.key === formStep) < MODAL_STEPS.length - 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setFormStep(MODAL_STEPS[MODAL_STEPS.findIndex(s => s.key === formStep) + 1].key)}
                  >
                    Continue
                  </button>
                )}
                <button type="submit" className="btn btn-primary">Save contact</button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
