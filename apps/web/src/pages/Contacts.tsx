import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { useContacts } from '../shells/contacts-context.js';
import type { Contact, ContactActivityEntry, ContactEmail, ContactPhone, SortBy, SmartGroup } from '../shells/contacts-context.js';
import { labelDescendantMap } from './contacts/labelTree.js';
import { SmartGroupEditor } from './contacts/SmartGroupEditor.js';
import { describeRule } from './contacts/smartGroupFields.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PageHeader } from '../components/PageHeader.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';

const MODAL_STEPS: { key: 'profile' | 'contact' | 'business' | 'extra'; label: string; icon: IconName }[] = [
  { key: 'profile',  label: 'Profile',        icon: 'user'     },
  { key: 'contact',  label: 'Contact',        icon: 'mail'     },
  { key: 'business', label: 'Business',       icon: 'building' },
  { key: 'extra',    label: 'Labels & Notes', icon: 'tag'      },
];

// Real team-member search — same /v1/hr/staff endpoint TasksApp's assignee
// picker already uses, so "Sales Owner" resolves to a real user account
// (CLAUDE.md's PersonAvatar convention) instead of the old free-text input.
async function searchStaff(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
}

type EmailRow = { id?: string; label: 'work' | 'personal' | 'other'; email: string };
type PhoneRow = { id?: string; label: 'work' | 'mobile' | 'home' | 'other'; phone: string };
const emptyEmailRow = (): EmailRow => ({ label: 'other', email: '' });
const emptyPhoneRow = (): PhoneRow => ({ label: 'other', phone: '' });

// Shared filter/sort predicates — used by both the main list and the
// smart-group result list so the two behave identically.
function contactMatchesQuery(c: Contact, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
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
}

function sortContacts(list: Contact[], sortBy: SortBy): Contact[] {
  return [...list].sort((a, b) => {
    const nameA = `${a.first_name} ${a.last_name || ''}`.toLowerCase();
    const nameB = `${b.first_name} ${b.last_name || ''}`.toLowerCase();
    if (sortBy === 'name-asc')     return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    if (sortBy === 'name-desc')    return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
    if (sortBy === 'created-desc') return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    if (sortBy === 'created-asc')  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    return 0;
  });
}

function summarizeSmartGroup(group: SmartGroup, labelName: (id: string) => string): string {
  if (!group.rules.length) return 'No rules yet — matches nobody.';
  const sep = group.match_type === 'any' ? '   ·  or  ·   ' : '   ·  and  ·   ';
  return group.rules.map(r => describeRule(r, labelName)).join(sep);
}


export function Contacts() {
  // Shared state + data from context (provided by ContactsProvider in ContactsShell)
  const {
    contacts, labels, smartGroups, duplicates, companies, loading,
    currentView, setCurrentView,
    selectedLabelId, setSelectedLabelId,
    selectedSmartGroupId,
    activeContact, setActiveContact,
    searchQuery, setSearchQuery,
    loadData,
    handleDeleteSmartGroup,
    openContactModalRef,
    filterOpen,
    sortBy, setSortBy,
    filterLabelIds, setFilterLabelIds,
    exportSelected,
  } = useContacts();

  const navigate = useNavigate();

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
  const [formSalesOwnerId, setFormSalesOwnerId] = useState<string | null>(null);
  const [formSalesOwnerPicker, setFormSalesOwnerPicker] = useState<PickerItem | null>(null);
  const [formLastContactedAt, setFormLastContactedAt] = useState('');

  // Multi-value emails/phones beyond the single primary field above — the
  // real contact_emails/contact_phones tables (438_contacts_gap_closure.sql),
  // additive to the scalar email/phone columns which stay authoritative.
  const [formExtraEmails, setFormExtraEmails] = useState<EmailRow[]>([]);
  const [formExtraPhones, setFormExtraPhones] = useState<PhoneRow[]>([]);

  // Structured address — additive to the existing freeform `location` text.
  const [formAddrStreet, setFormAddrStreet] = useState('');
  const [formAddrCity, setFormAddrCity] = useState('');
  const [formAddrState, setFormAddrState] = useState('');
  const [formAddrPostalCode, setFormAddrPostalCode] = useState('');
  const [formAddrCountry, setFormAddrCountry] = useState('');

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
      // Not seeded here — an existing contact's picture is shown/edited
      // entirely through AvatarPicker below, which reads the identity
      // system directly rather than this form's own local state.

      // Eyris fields
      setFormLocation(contact.location || '');
      setFormWebsite(contact.website || '');
      setFormIndustry(contact.industry || '');
      setFormCompanySize(contact.company_size || '');
      setFormSalesOwner(contact.sales_owner || '');
      setFormSalesOwnerId(contact.sales_owner_id || null);
      setFormSalesOwnerPicker(contact.sales_owner_id ? { id: contact.sales_owner_id, label: contact.sales_owner || 'Owner' } : null);
      setFormLastContactedAt(contact.last_contacted_at ? contact.last_contacted_at.split('T')[0] : '');

      // Extra emails/phones — exclude whichever row happens to match the
      // primary scalar value, so the same address doesn't show up twice
      // (once as "Email" above, once again in "Additional emails").
      setFormExtraEmails((contact.emails || []).filter(e => e.email !== contact.email).map(e => ({ id: e.id, label: e.label, email: e.email })));
      setFormExtraPhones((contact.phones || []).filter(p => p.phone !== contact.phone).map(p => ({ id: p.id, label: p.label, phone: p.phone })));

      setFormAddrStreet(contact.address_street || '');
      setFormAddrCity(contact.address_city || '');
      setFormAddrState(contact.address_state || '');
      setFormAddrPostalCode(contact.address_postal_code || '');
      setFormAddrCountry(contact.address_country || '');
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
      setFormSalesOwnerId(null);
      setFormSalesOwnerPicker(null);
      setFormLastContactedAt('');

      setFormExtraEmails([]);
      setFormExtraPhones([]);
      setFormAddrStreet('');
      setFormAddrCity('');
      setFormAddrState('');
      setFormAddrPostalCode('');
      setFormAddrCountry('');
    }
  };

  useEffect(() => {
    openContactModalRef.current = openContactModal;
  });

  // Submit Contact Form
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;

    // Full replace, same convention as label_ids above — the primary row
    // (if set) rides along so its is_primary flag stays correct (see
    // ContactsService.syncEmailsAndPhones, which marks is_primary by
    // comparing each row to this same scalar email/phone).
    const emails = [
      ...(formEmail.trim() ? [{ label: 'work' as const, email: formEmail.trim() }] : []),
      ...formExtraEmails.filter(e => e.email.trim()).map(e => ({ label: e.label, email: e.email.trim() })),
    ];
    const phones = [
      ...(formPhone.trim() ? [{ label: 'work' as const, phone: formPhone.trim() }] : []),
      ...formExtraPhones.filter(p => p.phone.trim()).map(p => ({ label: p.label, phone: p.phone.trim() })),
    ];

    const body: Record<string, unknown> = {
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
      label_ids: formLabelIds,
      location: formLocation,
      website: formWebsite,
      industry: formIndustry,
      company_size: formCompanySize,
      sales_owner: formSalesOwnerPicker?.label ?? formSalesOwner,
      sales_owner_id: formSalesOwnerId,
      last_contacted_at: formLastContactedAt || null,
      emails,
      phones,
      address_street: formAddrStreet || null,
      address_city: formAddrCity || null,
      address_state: formAddrState || null,
      address_postal_code: formAddrPostalCode || null,
      address_country: formAddrCountry || null,
    };

    try {
      if (showEditModal.id) {
        // Update — avatar_url is deliberately NOT included here. An
        // existing contact's picture is owned entirely by AvatarPicker
        // (below), which writes straight through the identity system on
        // each change; sending a possibly-stale formAvatarUrl here on an
        // unrelated field edit would silently stomp on that.
        await apiFetch(`/v1/contacts/${showEditModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
      } else {
        // Create — there's no contact id yet for AvatarPicker/the identity
        // system to key off, so a freshly-picked picture rides along in the
        // creation payload this one time only.
        body.avatar_url = formAvatarUrl;
        await apiFetch('/v1/contacts', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      setShowEditModal(null);
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save contact');
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
      showAlert(err.message || 'Failed to create label');
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
      showAlert(err.message || 'Failed to delete contact');
    }
  };

  // Restore Contact
  const handleRestoreContact = async (id: string) => {
    try {
      await apiFetch(`/v1/contacts/${id}/restore`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to restore contact');
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
      showAlert(err.message || 'Failed to update favorite status');
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
      showAlert('Contacts merged successfully!');
    } catch (err: any) {
      showAlert(err.message || 'Failed to merge contacts');
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
      showAlert(err.message || 'Failed to perform bulk delete');
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
      showAlert(err.message || 'Failed to apply bulk label');
    }
  };

  // id -> self + every descendant, so "show me everyone under Clients"
  // sweeps up VIP, Prospects, etc. (migration 441).
  const labelDescendants = useMemo(() => labelDescendantMap(labels), [labels]);

  // Filter + Sort Contacts (all views except smart groups, which pull their
  // own server-evaluated list below).
  const filteredContacts = useMemo(() => {
    const labelSet = currentView === 'label' && selectedLabelId
      ? labelDescendants.get(selectedLabelId) ?? new Set([selectedLabelId])
      : null;

    const list = contacts.filter(c => {
      if (currentView === 'contacts' && c.status !== 'ACTIVE') return false;
      if (currentView === 'favorites' && (!c.is_favorite || c.status !== 'ACTIVE')) return false;
      if (currentView === 'trash' && c.status !== 'TRASHED') return false;
      if (currentView === 'label' && (c.status !== 'ACTIVE' || !labelSet || !c.labels.some(l => labelSet.has(l.id)))) return false;

      if (filterLabelIds.length > 0 && !filterLabelIds.some(id => c.labels.some(l => l.id === id))) return false;

      return contactMatchesQuery(c, searchQuery);
    });

    return sortContacts(list, sortBy);
  }, [contacts, currentView, selectedLabelId, labelDescendants, searchQuery, sortBy, filterLabelIds]);

  // ─── Smart-group view state ──────────────────────────────────────────────
  // A smart group's membership is computed on the server, so we fetch its
  // contact list rather than filtering the already-loaded `contacts`.
  const smartGroup = currentView === 'smartgroup' && selectedSmartGroupId
    ? smartGroups.find(g => g.id === selectedSmartGroupId) ?? null
    : null;
  const creatingSmartGroup = currentView === 'smartgroup' && !selectedSmartGroupId;
  const [editingSmart, setEditingSmart] = useState(false);
  const [smartGroupContacts, setSmartGroupContacts] = useState<Contact[] | null>(null);
  const [smartGroupLoading, setSmartGroupLoading] = useState(false);

  useEffect(() => {
    setEditingSmart(false);
    if (currentView === 'smartgroup' && selectedSmartGroupId) {
      let alive = true;
      setSmartGroupLoading(true);
      apiFetch(`/v1/contacts/smart-groups/${selectedSmartGroupId}/contacts`)
        .then((res: any) => { if (alive) setSmartGroupContacts(Array.isArray(res?.contacts) ? res.contacts : []); })
        .catch(() => { if (alive) setSmartGroupContacts([]); })
        .finally(() => { if (alive) setSmartGroupLoading(false); });
      return () => { alive = false; };
    }
    setSmartGroupContacts(null);
  }, [currentView, selectedSmartGroupId]);

  // What the table actually renders.
  const displayContacts = useMemo(() => {
    if (currentView !== 'smartgroup') return filteredContacts;
    const base = (smartGroupContacts ?? []).filter(c => contactMatchesQuery(c, searchQuery));
    return sortContacts(base, sortBy);
  }, [currentView, filteredContacts, smartGroupContacts, searchQuery, sortBy]);

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
    if (selectedIds.size === displayContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayContacts.map(c => c.id)));
    }
  };

  // Monogram helper
  const monogram = (first: string, last?: string | null) => {
    return `${first[0]}${last ? last[0] : ''}`.toUpperCase();
  };

  return (
    <div className="cts-page">
      
      {/* Conditional Rendering: Detail Page vs Smart-group editor vs List View */}
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
                  
                  {/* Avatar — a contact could show a picture but never set
                      one (the column was written only by the Google sync).
                      The accent ring is drawn by AvatarPicker itself (its
                      `ring` prop) directly on the avatar element, not a
                      wrapping div — a wrapper here used to draw its
                      border-radius circle around the *whole* component,
                      Remove label included, so the ring visibly cut across
                      that label instead of framing just the photo. */}
                  <div style={{ marginBottom: 16 }}>
                    <AvatarPicker
                      id={activeContact.id} kind="contacts"
                      name={`${activeContact.first_name} ${activeContact.last_name || ''}`.trim()}
                      size={104} shape="circle" ring="var(--cts-accent)"
                      onChange={url => {
                        // The list lives in ContactsProvider, so the open
                        // record is updated here and the list is re-read —
                        // otherwise the row behind this panel keeps the old
                        // picture until the next navigation.
                        setActiveContact({ ...activeContact, avatar_url: url });
                        loadData();
                      }}
                    />
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
                        <Badge key={l.id} variant="brand">{l.name}</Badge>
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

                    {/* Additional emails/phones — real contact_emails/contact_phones
                        rows beyond the primary shown above */}
                    {(activeContact.emails || []).filter(e => e.email !== activeContact.email).map(e => (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon name="mail" size={14} color="var(--ink3)" />
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{e.email}</span>
                        <Badge variant="gray">{e.label}</Badge>
                      </div>
                    ))}
                    {(activeContact.phones || []).filter(p => p.phone !== activeContact.phone).map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon name="phone" size={14} color="var(--ink3)" />
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{p.phone}</span>
                        <Badge variant="gray">{p.label}</Badge>
                      </div>
                    ))}

                    {(activeContact.address_street || activeContact.address_city || activeContact.address_country) && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <Icon name="mapPin" size={14} color="var(--ink3)" />
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                          {[activeContact.address_street, activeContact.address_city, activeContact.address_state, activeContact.address_postal_code, activeContact.address_country].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
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
                          display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py-lg) 20px',
                          border: 'none', background: 'none', cursor: 'pointer',
                          borderBottom: active ? '3px solid var(--cts-accent)' : '3px solid transparent',
                          color: active ? 'var(--cts-accent)' : 'var(--ink2)',
                          fontWeight: 600, fontSize: 14, transition: 'all 0.15s', minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}
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
                            {activeContact.sales_owner_id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PersonAvatar userId={activeContact.sales_owner_id} name={activeContact.sales_owner || ''} size={22} />
                                <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{activeContact.sales_owner || '—'}</span>
                              </div>
                            ) : activeContact.sales_owner ? (
                              <div style={{ fontSize: 14, color: 'var(--ink2)', fontStyle: 'italic' }}>{activeContact.sales_owner} (unlinked)</div>
                            ) : (
                              <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>—</div>
                            )}
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
                              company_changed:  { label: 'Company switched',       dot: 'var(--gold)' },
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
        ) : currentView === 'smartgroup' && (creatingSmartGroup || editingSmart) ? (
          /* ─── SMART GROUP RULE BUILDER ─── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0 0' }}>
            <SmartGroupEditor
              group={editingSmart ? smartGroup : null}
              onDone={(savedId) => {
                setEditingSmart(false);
                navigate(savedId ? `/contacts/smart/${savedId}` : '/contacts');
              }}
            />
          </div>
        ) : (
          /* ─── STANDARD CONTACTS LIST / SEARCH / TABLE VIEW ─── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {currentView === 'smartgroup' ? (
              <div style={{ padding: '20px 0 0' }}>
                <PageHeader
                  crumbs={['Contacts', 'Smart groups']}
                  title={smartGroup?.name || 'Smart group'}
                  subtitle={smartGroup ? summarizeSmartGroup(smartGroup, id => labels.find(l => l.id === id)?.name ?? 'label') : 'A saved filter that always shows whoever matches right now.'}
                  actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="sm" variant="secondary" onClick={() => setEditingSmart(true)}>Edit rules</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                        onClick={async () => {
                          if (!selectedSmartGroupId) return;
                          await handleDeleteSmartGroup(selectedSmartGroupId);
                          navigate('/contacts');
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : (
              <div style={{ padding: '20px 0 0' }}>
                <PageHeader crumbs={['Contacts']} titlePlain="All" titleEm="contacts" subtitle="Everyone you've saved, synced, or tagged in one place." />
              </div>
            )}

            {/* Filter panel — header section (sort) + body section (labels) */}
            {filterOpen && currentView !== 'smartgroup' && (
              <div className="cts-filter-panel">
                {/* Header section: Sort — single-select, so the shared
                    segmented ds-tabs (not the multi-select label chips below,
                    which stay their own toggle-chip style). */}
                <div className="cts-filter-section">
                  <span className="cts-filter-section-label">Sort</span>
                  <Tabs value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)} variant="outline">
                    <TabsList>
                      {([
                        { key: 'name-asc',     label: 'Name A→Z' },
                        { key: 'name-desc',    label: 'Name Z→A' },
                        { key: 'created-desc', label: 'Newest first' },
                        { key: 'created-asc',  label: 'Oldest first' },
                      ] as { key: typeof sortBy; label: string }[]).map(opt => (
                        <TabsTrigger key={opt.key} value={opt.key} title={opt.label}>{opt.label}</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
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
                {(loading || smartGroupLoading) ? 'Loading…' : `${displayContacts.length} ${displayContacts.length === 1 ? 'contact' : 'contacts'}`}
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0', background: 'var(--white)' }}>
              
              {/* Bulk Action Bar (when items are selected) */}
              {selectedIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', background: 'var(--cts-accent-bg)', borderRadius: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cts-accent)' }}>{selectedIds.size} selected</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>Deselect all</button>
                  
                  <div style={{ flex: 1 }} />

                  {/* Bulk Label Trigger */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: 'var(--white)', color: 'var(--ink)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        Apply Label…
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {labels.map(l => (
                        <DropdownMenuItem key={l.id} onClick={() => handleBulkLabel(l.id, 'ADD')}>{l.name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Export selection */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: 'var(--white)', color: 'var(--ink)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        Export…
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportSelected('csv', Array.from(selectedIds))}>Export as CSV</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportSelected('vcf', Array.from(selectedIds))}>Export as vCard</DropdownMenuItem>
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
                <div className="rtbl-wrap">
                  <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse', fontSize: 14, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--ink2)', borderBottom: '1px solid var(--border)', height: 48 }}>
                        <th style={{ width: 48, paddingLeft: 12 }}>
                          <Checkbox
                            checked={displayContacts.length > 0 && selectedIds.size === displayContacts.length}
                            onCheckedChange={toggleSelectAll}
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
                      {displayContacts.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--ink2)', fontSize: 14, fontStyle: 'italic' }}>
                            {currentView === 'smartgroup' ? 'No contacts match this smart group right now.' : 'No contacts found.'}
                          </td>
                        </tr>
                      ) : (
                        displayContacts.map(contact => {
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
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelect(contact.id)}
                                />
                              </td>

                              {/* Avatar & Name */}
                              <td style={{ padding: '8px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <PersonAvatar userId={contact.id} kind="contacts" name={`${contact.first_name} ${contact.last_name || ''}`.trim()} size={36} />
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
                                    <Badge key={l.id} variant="gray">{l.name}</Badge>
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
                                        <Icon name="refresh2" size={18} color="var(--cts-accent)" />
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
                          showAlert('All duplicates merged!');
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
                            {group.type === 'email' && `Duplicate email: ${group.value}`}
                            {group.type === 'phone' && `Duplicate phone: ${group.value}`}
                            {group.type === 'phone_normalized' && `Same phone number, different format (…${group.value})`}
                            {group.type === 'name_similarity' && 'Similar name — possible duplicate'}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
                            {group.contacts.map(c => (
                              <div
                                key={c.id}
                                onClick={() => setActiveContact(c)}
                                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8, cursor: 'pointer' }}
                              >
                                <PersonAvatar userId={c.id} kind="contacts" name={`${c.first_name} ${c.last_name || ''}`.trim()} size={32} />
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
      <Dialog open={showEditModal !== null} onOpenChange={o => { if (!o) setShowEditModal(null); }}>
        <DialogContent size="md">
        {showEditModal !== null && (
          <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <DialogHeader className="border-b-0! pb-0!">
              <DialogTitle style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                {showEditModal.id ? 'Edit contact' : 'Create contact'}
              </DialogTitle>

              {/* Step tabs — click any section directly, no strict linear gating.
                  Their own bottom border is the header divider (DialogHeader's
                  own border is suppressed above, so there's just the one line). */}
              <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginTop: 2 }}>
                {MODAL_STEPS.map(step => {
                  const on = formStep === step.key;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => setFormStep(step.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 12px',
                        border: 'none', background: 'none', cursor: 'pointer',
                        borderBottom: on ? '2.5px solid var(--cts-accent)' : '2.5px solid transparent',
                        color: on ? 'var(--cts-accent)' : 'var(--ink2)',
                        fontWeight: 600, fontSize: 13, marginBottom: -1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                    >
                      <Icon name={step.icon} size={14} color={on ? 'var(--cts-accent)' : 'var(--ink2)'} />
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </DialogHeader>

            <DialogBody>
            {/* STEP: Profile — avatar + name + favorite */}
            {formStep === 'profile' && (<>
            {/* Profile Avatar Block — an existing contact (has an id) is
                edited through the real AvatarPicker, the same shared
                upload/remove control (and PersonAvatar read path) every
                other picture in the app uses; it writes straight through
                the identity system, so this modal can't drift from what the
                contact list/detail sidebar shows for the same person the
                way it used to. A brand-new contact has no id yet for
                AvatarPicker to key off, so creation keeps a small local
                upload-only widget for that one case (no preset Unsplash
                grid, no paste-a-URL field — both were the exact kind of
                unvalidated external image CLAUDE.md's own avatar section
                warns about). */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, position: 'relative' }}>
              {showEditModal.id ? (
                <AvatarPicker id={showEditModal.id} kind="contacts" name={`${formFirstName} ${formLastName}`.trim() || 'Contact'} size={80} />
              ) : (
                <>
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
                        width: '100%', height: '100%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
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
                    Set Profile Picture
                  </button>

                  {showAvatarSelector && (
                    <div style={{
                      position: 'absolute', top: 90, zIndex: 10, width: 220,
                      background: 'var(--white)', borderRadius: 8, padding: 16,
                      boxShadow: 'var(--elev-lg)', border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)',
                            fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer'
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

                        {formAvatarUrl && (
                          <button
                            type="button"
                            onClick={() => { setFormAvatarUrl(null); setShowAvatarSelector(false); }}
                            style={{
                              width: '100%', border: 'none', background: 'none', color: 'var(--red)',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 'var(--ds-btn-py-sm) 0 0', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
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
                <Checkbox
                  checked={formIsFavorite}
                  onCheckedChange={c => setFormIsFavorite(c === true)}
                />
                <span style={{ fontSize: 13, color: 'var(--ink)', marginLeft: 8 }}>Add to favorites</span>
              </div>
            </div>
            </>)}

            {/* STEP: Contact — email, phone, location, birthday */}
            {formStep === 'contact' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Email</label>
                <input className="input-field" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Phone</label>
                <input className="input-field" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
              </div>
            </div>

            {/* Additional emails/phones — extra rows beyond the primary above */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                {formExtraEmails.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <Select value={row.label} onValueChange={v => setFormExtraEmails(prev => prev.map((r, j) => j === i ? { ...r, label: v as EmailRow['label'] } : r))}>
                      <SelectTrigger className="input-field" style={{ height: 36, padding: '0 8px', width: 92, flexShrink: 0 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="personal">Personal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <input className="input-field" type="email" placeholder="Additional email" value={row.email} onChange={e => setFormExtraEmails(prev => prev.map((r, j) => j === i ? { ...r, email: e.target.value } : r))} />
                    <button type="button" onClick={() => setFormExtraEmails(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                      <Icon name="x" size={14} color="var(--ink3)" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setFormExtraEmails(prev => [...prev, emptyEmailRow()])} style={{ border: 'none', background: 'none', color: 'var(--cts-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  + Add another email
                </button>
              </div>
              <div>
                {formExtraPhones.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <Select value={row.label} onValueChange={v => setFormExtraPhones(prev => prev.map((r, j) => j === i ? { ...r, label: v as PhoneRow['label'] } : r))}>
                      <SelectTrigger className="input-field" style={{ height: 36, padding: '0 8px', width: 92, flexShrink: 0 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="home">Home</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <input className="input-field" placeholder="Additional phone" value={row.phone} onChange={e => setFormExtraPhones(prev => prev.map((r, j) => j === i ? { ...r, phone: e.target.value } : r))} />
                    <button type="button" onClick={() => setFormExtraPhones(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                      <Icon name="x" size={14} color="var(--ink3)" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setFormExtraPhones(prev => [...prev, emptyPhoneRow()])} style={{ border: 'none', background: 'none', color: 'var(--cts-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  + Add another phone
                </button>
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

            {/* Structured address — additive to the freeform Location above */}
            <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12 }}>
              Address
            </h4>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Street</label>
              <input className="input-field" value={formAddrStreet} onChange={e => setFormAddrStreet(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>City</label>
                <input className="input-field" value={formAddrCity} onChange={e => setFormAddrCity(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>State / Region</label>
                <input className="input-field" value={formAddrState} onChange={e => setFormAddrState(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Postal Code</label>
                <input className="input-field" value={formAddrPostalCode} onChange={e => setFormAddrPostalCode(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Country</label>
                <input className="input-field" value={formAddrCountry} onChange={e => setFormAddrCountry(e.target.value)} />
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
                  <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1.5" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
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
                <EntityPicker
                  value={formSalesOwnerPicker}
                  onChange={item => {
                    setFormSalesOwnerPicker(item);
                    setFormSalesOwnerId(item?.id ?? null);
                    if (item) setFormSalesOwner(item.label);
                  }}
                  search={searchStaff}
                  placeholder="Search team members…"
                />
                {!formSalesOwnerPicker && formSalesOwner && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>
                    Previously recorded as "{formSalesOwner}" — not linked to an account yet
                  </div>
                )}
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
                          fontSize: 12, padding: 'var(--ds-btn-py-xs) 12px', borderRadius: 16, cursor: 'pointer',
                          border: `1px solid ${selected ? 'var(--cts-accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--cts-accent-bg)' : 'var(--white)',
                          color: selected ? 'var(--cts-accent)' : 'var(--ink)',
                          fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                          transition: 'all 0.15s', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
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
                    padding: '0 12px', minHeight: 'var(--ctl-h-sm)', borderRadius: 'var(--r)', border: 'none',
                    background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', boxSizing: 'border-box'
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
            </DialogBody>

            {/* Footer — Back / Continue walk through steps; Save works from any step */}
            <DialogFooter className="justify-between">
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
            </DialogFooter>
          </form>
        )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
