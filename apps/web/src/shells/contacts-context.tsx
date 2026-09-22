import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch, apiDownload } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

// ── Shared types ───────────────────────────────────────────────────────────

export interface ContactLabel {
  id: string;
  name: string;
  // Migration 441 — self-referential parent. null = a top-level label.
  parent_id: string | null;
}

// Smart groups (migration 442) — a saved filter with computed membership.
// The field/op catalog the builder UI reads lives in
// pages/contacts/smartGroupFields.ts; it mirrors the API's SMART_FIELDS,
// which is the authoritative one.
export interface SmartGroupRule {
  field: string;
  op: string;
  value?: string | number | boolean | null;
}

export interface SmartGroup {
  id: string;
  name: string;
  match_type: 'all' | 'any';
  rules: SmartGroupRule[];
  count?: number;
}

export interface RegisteredCompany {
  id: string;
  name: string;
}

export interface ContactActivityEntry {
  id: string;
  action: string;
  detail: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface ContactEmail {
  id: string;
  label: 'work' | 'personal' | 'other';
  email: string;
  is_primary: boolean;
}

export interface ContactPhone {
  id: string;
  label: 'work' | 'mobile' | 'home' | 'other';
  phone: string;
  is_primary: boolean;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  company_id: string | null;
  job_title: string | null;
  notes: string | null;
  birthday: string | null;
  is_favorite: boolean;
  avatar_url: string | null;
  status: 'ACTIVE' | 'TRASHED';
  labels: ContactLabel[];
  website: string | null;
  location: string | null;
  industry: string | null;
  company_size: string | null;
  sales_owner: string | null;
  sales_owner_id: string | null;
  last_contacted_at: string | null;
  created_at?: string;
  emails?: ContactEmail[];
  phones?: ContactPhone[];
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
}

export interface DuplicateGroup {
  // 'phone_normalized' catches the same number in different formats
  // (+255…/0…); 'name_similarity' is a real pg_trgm fuzzy match — see
  // ContactsService.getDuplicates's own comments for why both exist
  // alongside plain exact email/phone matching.
  type: 'email' | 'phone' | 'phone_normalized' | 'name_similarity';
  value: string;
  contacts: Contact[];
}

export type ContactView = 'contacts' | 'favorites' | 'merge' | 'trash' | 'label' | 'smartgroup';

// ── Context value shape ────────────────────────────────────────────────────

export type SortBy = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc';

export interface ContactsCtxValue {
  contacts: Contact[];
  labels: ContactLabel[];
  smartGroups: SmartGroup[];
  duplicates: DuplicateGroup[];
  companies: RegisteredCompany[];
  loading: boolean;
  /** Which of loadData's parallel requests actually failed on the last load
   *  — distinguishes "genuinely empty" from "couldn't fetch" per section,
   *  instead of every failure silently collapsing into an empty array. */
  loadErrors: { contacts?: boolean; labels?: boolean; smartGroups?: boolean; duplicates?: boolean; companies?: boolean };
  currentView: ContactView;
  setCurrentView: (v: ContactView) => void;
  selectedLabelId: string | null;
  setSelectedLabelId: (v: string | null) => void;
  selectedSmartGroupId: string | null;
  setSelectedSmartGroupId: (v: string | null) => void;
  activeContact: Contact | null;
  setActiveContact: (c: Contact | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loadData: () => Promise<void>;
  handleDeleteLabel: (id: string) => Promise<void>;
  handleUpdateLabel: (id: string, patch: { name?: string; parent_id?: string | null }) => Promise<void>;
  saveSmartGroup: (payload: { name: string; match_type: 'all' | 'any'; rules: SmartGroupRule[] }, id?: string) => Promise<SmartGroup | null>;
  handleDeleteSmartGroup: (id: string) => Promise<void>;
  handleImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportCSV: () => void;
  handleExportVCard: () => void;
  exportSelected: (format: 'csv' | 'vcf', ids: string[]) => void;
  showNewLabelModal: boolean;
  setShowNewLabelModal: (v: boolean) => void;
  newLabelName: string;
  setNewLabelName: (v: string) => void;
  newLabelParentId: string | null;
  setNewLabelParentId: (v: string | null) => void;
  handleCreateLabel: (e: React.FormEvent) => Promise<void>;
  openContactModalRef: React.MutableRefObject<(c: Contact | null) => void>;
  filterOpen: boolean;
  setFilterOpen: (v: boolean) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  filterLabelIds: string[];
  setFilterLabelIds: (ids: string[]) => void;
}

// ── Default no-op context ─────────────────────────────────────────────────

const noop = () => {};
const noopAsync = async () => {};

export const ContactsCtx = createContext<ContactsCtxValue>({
  contacts: [],
  labels: [],
  smartGroups: [],
  duplicates: [],
  companies: [],
  loading: false,
  loadErrors: {},
  currentView: 'contacts',
  setCurrentView: noop,
  selectedLabelId: null,
  setSelectedLabelId: noop,
  selectedSmartGroupId: null,
  setSelectedSmartGroupId: noop,
  activeContact: null,
  setActiveContact: noop,
  searchQuery: '',
  setSearchQuery: noop,
  loadData: noopAsync,
  handleDeleteLabel: noopAsync,
  handleUpdateLabel: noopAsync,
  saveSmartGroup: async () => null,
  handleDeleteSmartGroup: noopAsync,
  handleImportCSV: noop,
  handleExportCSV: noop,
  handleExportVCard: noop,
  exportSelected: noop,
  showNewLabelModal: false,
  setShowNewLabelModal: noop,
  newLabelName: '',
  setNewLabelName: noop,
  newLabelParentId: null,
  setNewLabelParentId: noop,
  handleCreateLabel: noopAsync,
  openContactModalRef: { current: noop },
  filterOpen: false,
  setFilterOpen: noop,
  sortBy: 'name-asc',
  setSortBy: noop,
  filterLabelIds: [],
  setFilterLabelIds: noop,
});

export function useContacts() {
  return useContext(ContactsCtx);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function ContactsProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts]               = useState<Contact[]>([]);
  const [labels, setLabels]                   = useState<ContactLabel[]>([]);
  const [smartGroups, setSmartGroups]         = useState<SmartGroup[]>([]);
  const [duplicates, setDuplicates]           = useState<DuplicateGroup[]>([]);
  const [companies, setCompanies]             = useState<RegisteredCompany[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [loadErrors, setLoadErrors]           = useState<ContactsCtxValue['loadErrors']>({});
  const [currentView, setCurrentView]         = useState<ContactView>('contacts');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedSmartGroupId, setSelectedSmartGroupId] = useState<string | null>(null);
  const [activeContact, setActiveContactRaw]  = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery]         = useState('');
  const [showNewLabelModal, setShowNewLabelModal] = useState(false);
  const [newLabelName, setNewLabelName]       = useState('');
  const [newLabelParentId, setNewLabelParentId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen]           = useState(true);
  const [sortBy, setSortBy]                   = useState<SortBy>('name-asc');
  const [filterLabelIds, setFilterLabelIds]   = useState<string[]>([]);

  const openContactModalRef = useRef<(c: Contact | null) => void>(noop);

  const setActiveContact = useCallback((c: Contact | null) => {
    setActiveContactRaw(c);
    if (!c) setSearchQuery('');
  }, []);

  const loadData = useCallback(async () => {
    // Each request is tagged with whether it actually succeeded, instead of
    // the old `.catch(() => [])` — which made a failed request look exactly
    // like a genuinely empty result, so the whole loader could "succeed"
    // while, say, labels silently vanished with no indication why.
    const tagged = <T,>(p: Promise<T>) => p.then(data => ({ ok: true as const, data })).catch(() => ({ ok: false as const, data: null }));
    try {
      setLoading(true);
      const [active, trashed, labelsRes, smartGroupsRes, dupRes, customersRes] = await Promise.all([
        tagged(apiFetch('/v1/contacts?status=ACTIVE')),
        tagged(apiFetch('/v1/contacts?status=TRASHED')),
        tagged(apiFetch('/v1/contacts/labels')),
        tagged(apiFetch('/v1/contacts/smart-groups')),
        tagged(apiFetch('/v1/contacts/duplicates')),
        tagged(apiFetch('/v1/customers')),
      ]);

      const allContacts: Contact[] = [
        ...(Array.isArray(active.data)  ? active.data  : []).map((c: any) => ({ ...c, status: 'ACTIVE'  as const })),
        ...(Array.isArray(trashed.data) ? trashed.data : []).map((c: any) => ({ ...c, status: 'TRASHED' as const })),
      ];

      setContacts(allContacts);
      setLabels(Array.isArray(labelsRes.data) ? labelsRes.data : []);
      setSmartGroups(Array.isArray(smartGroupsRes.data) ? smartGroupsRes.data : []);
      setDuplicates(Array.isArray(dupRes.data) ? dupRes.data : []);
      const customerList = (customersRes.data as any)?.data ?? customersRes.data ?? [];
      setCompanies(Array.isArray(customerList) ? customerList.map((c: any) => ({ id: c.id, name: c.name })) : []);
      setLoadErrors({
        contacts: !active.ok || !trashed.ok,
        labels: !labelsRes.ok,
        smartGroups: !smartGroupsRes.ok,
        duplicates: !dupRes.ok,
        companies: !customersRes.ok,
      });

      setActiveContactRaw(prev => {
        if (!prev) return null;
        return allContacts.find(c => c.id === prev.id) ?? null;
      });
    } catch (err) {
      console.error('Failed to load contacts data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeleteLabel = useCallback(async (id: string) => {
    if (!(await showConfirm('Delete this label? Contacts will not be deleted.', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/contacts/labels/${id}`, { method: 'DELETE' });
      setSelectedLabelId(prev => (prev === id ? null : prev));
      setCurrentView(prev => (prev === 'label' && selectedLabelId === id ? 'contacts' : prev));
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete label');
    }
  }, [loadData, selectedLabelId]);

  // Uploads the raw file to the server — real CSV parsing (csv-parse,
  // handles quoted fields with embedded commas the old client-side
  // `line.split(',')` couldn't) or vCard (.vcf), not a re-implementation
  // here. See contacts.routes.ts POST /import.
  const handleImportCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    (async () => {
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await apiFetch('/v1/contacts/import', { method: 'POST', body: form });
        await loadData();
        showAlert(`Imported ${res.imported} of ${res.total} contact${res.total === 1 ? '' : 's'} found in the file.`);
      } catch (err: any) {
        showAlert(err.message || 'Failed to import file');
      } finally {
        e.target.value = '';
      }
    })();
  }, [loadData]);

  // Real server-side export (ContactsService.exportToCSV/exportToVCard) — a
  // round-trip through the actual export format (including the multi-value
  // emails/phones and structured address the old client-only CSV built here
  // never had, since it only ever saw the summary fields already loaded into
  // this context) rather than a second, weaker re-implementation in the
  // browser. apiDownload already carries the session cookie + auth-refresh
  // retry every other file download in the app uses (identity.ts, OndiKyc).
  const downloadExport = useCallback(async (format: 'csv' | 'vcf', ids?: string[]) => {
    const active = contacts.filter(c => c.status === 'ACTIVE');
    if (!ids && active.length === 0) { showAlert('No active contacts to export.'); return; }
    try {
      const qs = ids && ids.length > 0 ? `?ids=${ids.join(',')}` : '';
      await apiDownload(`/v1/contacts/export.${format}${qs}`, `contacts-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (err: any) {
      showAlert(err.message || 'Export failed');
    }
  }, [contacts]);

  const handleExportCSV = useCallback(() => { downloadExport('csv'); }, [downloadExport]);
  const handleExportVCard = useCallback(() => { downloadExport('vcf'); }, [downloadExport]);
  const exportSelected = useCallback((format: 'csv' | 'vcf', ids: string[]) => { downloadExport(format, ids); }, [downloadExport]);

  const handleCreateLabel = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    try {
      await apiFetch('/v1/contacts/labels', {
        method: 'POST',
        body: JSON.stringify({ name: newLabelName.trim(), parent_id: newLabelParentId }),
      });
      setNewLabelName('');
      setNewLabelParentId(null);
      setShowNewLabelModal(false);
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create label');
    }
  }, [newLabelName, newLabelParentId, loadData]);

  const handleUpdateLabel = useCallback(async (id: string, patch: { name?: string; parent_id?: string | null }) => {
    try {
      await apiFetch(`/v1/contacts/labels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update label');
    }
  }, [loadData]);

  const saveSmartGroup = useCallback(async (
    payload: { name: string; match_type: 'all' | 'any'; rules: SmartGroupRule[] },
    id?: string,
  ): Promise<SmartGroup | null> => {
    try {
      const res = await apiFetch(
        id ? `/v1/contacts/smart-groups/${id}` : '/v1/contacts/smart-groups',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      await loadData();
      return res as SmartGroup;
    } catch (err: any) {
      showAlert(err.message || 'Failed to save smart group');
      return null;
    }
  }, [loadData]);

  const handleDeleteSmartGroup = useCallback(async (id: string) => {
    if (!(await showConfirm('Delete this smart group? The contacts it matched are not affected.', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/contacts/smart-groups/${id}`, { method: 'DELETE' });
      setSelectedSmartGroupId(prev => (prev === id ? null : prev));
      setCurrentView(prev => (prev === 'smartgroup' ? 'contacts' : prev));
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete smart group');
    }
  }, [loadData]);

  return (
    <ContactsCtx.Provider value={{
      contacts, labels, smartGroups, duplicates, companies, loading, loadErrors,
      currentView, setCurrentView,
      selectedLabelId, setSelectedLabelId,
      selectedSmartGroupId, setSelectedSmartGroupId,
      activeContact, setActiveContact,
      searchQuery, setSearchQuery,
      loadData,
      handleDeleteLabel, handleUpdateLabel, saveSmartGroup, handleDeleteSmartGroup,
      handleImportCSV, handleExportCSV, handleExportVCard, exportSelected,
      showNewLabelModal, setShowNewLabelModal,
      newLabelName, setNewLabelName, newLabelParentId, setNewLabelParentId, handleCreateLabel,
      openContactModalRef,
      filterOpen, setFilterOpen,
      sortBy, setSortBy,
      filterLabelIds, setFilterLabelIds,
    }}>
      {children}
    </ContactsCtx.Provider>
  );
}
