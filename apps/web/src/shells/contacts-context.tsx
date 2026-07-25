import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

// ── Shared types ───────────────────────────────────────────────────────────

export interface ContactLabel {
  id: string;
  name: string;
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
  last_contacted_at: string | null;
  created_at?: string;
}

export interface DuplicateGroup {
  type: 'email' | 'phone';
  value: string;
  contacts: Contact[];
}

export type ContactView = 'contacts' | 'favorites' | 'merge' | 'trash' | 'label';

// ── Context value shape ────────────────────────────────────────────────────

export type SortBy = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc';

export interface ContactsCtxValue {
  contacts: Contact[];
  labels: ContactLabel[];
  duplicates: DuplicateGroup[];
  companies: RegisteredCompany[];
  loading: boolean;
  currentView: ContactView;
  setCurrentView: (v: ContactView) => void;
  selectedLabelId: string | null;
  setSelectedLabelId: (v: string | null) => void;
  activeContact: Contact | null;
  setActiveContact: (c: Contact | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loadData: () => Promise<void>;
  handleDeleteLabel: (id: string) => Promise<void>;
  handleImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportCSV: () => void;
  showNewLabelModal: boolean;
  setShowNewLabelModal: (v: boolean) => void;
  newLabelName: string;
  setNewLabelName: (v: string) => void;
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
  duplicates: [],
  companies: [],
  loading: false,
  currentView: 'contacts',
  setCurrentView: noop,
  selectedLabelId: null,
  setSelectedLabelId: noop,
  activeContact: null,
  setActiveContact: noop,
  searchQuery: '',
  setSearchQuery: noop,
  loadData: noopAsync,
  handleDeleteLabel: noopAsync,
  handleImportCSV: noop,
  handleExportCSV: noop,
  showNewLabelModal: false,
  setShowNewLabelModal: noop,
  newLabelName: '',
  setNewLabelName: noop,
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
  const [duplicates, setDuplicates]           = useState<DuplicateGroup[]>([]);
  const [companies, setCompanies]             = useState<RegisteredCompany[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [currentView, setCurrentView]         = useState<ContactView>('contacts');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [activeContact, setActiveContactRaw]  = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery]         = useState('');
  const [showNewLabelModal, setShowNewLabelModal] = useState(false);
  const [newLabelName, setNewLabelName]       = useState('');
  const [filterOpen, setFilterOpen]           = useState(true);
  const [sortBy, setSortBy]                   = useState<SortBy>('name-asc');
  const [filterLabelIds, setFilterLabelIds]   = useState<string[]>([]);

  const openContactModalRef = useRef<(c: Contact | null) => void>(noop);

  const setActiveContact = useCallback((c: Contact | null) => {
    setActiveContactRaw(c);
    if (!c) setSearchQuery('');
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [activeData, trashedData, labelsData, dupData, customersRes] = await Promise.all([
        apiFetch('/v1/contacts?status=ACTIVE').catch(() => []),
        apiFetch('/v1/contacts?status=TRASHED').catch(() => []),
        apiFetch('/v1/contacts/labels').catch(() => []),
        apiFetch('/v1/contacts/duplicates').catch(() => []),
        apiFetch('/v1/customers').catch(() => []),
      ]);

      const allContacts: Contact[] = [
        ...(Array.isArray(activeData)  ? activeData  : []).map((c: any) => ({ ...c, status: 'ACTIVE'  as const })),
        ...(Array.isArray(trashedData) ? trashedData : []).map((c: any) => ({ ...c, status: 'TRASHED' as const })),
      ];

      setContacts(allContacts);
      setLabels(Array.isArray(labelsData) ? labelsData : []);
      setDuplicates(Array.isArray(dupData) ? dupData : []);
      const customerList = (customersRes as any)?.data ?? customersRes ?? [];
      setCompanies(Array.isArray(customerList) ? customerList.map((c: any) => ({ id: c.id, name: c.name })) : []);

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

  const handleImportCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvText = event.target?.result as string;
      if (!csvText) return;
      const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const importedContacts: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const contact: any = {};
        headers.forEach((header, idx) => {
          if (header === 'first name' || header === 'firstname')          contact.first_name    = values[idx];
          else if (header === 'last name' || header === 'lastname')       contact.last_name     = values[idx];
          else if (header === 'email')                                    contact.email         = values[idx];
          else if (header === 'phone')                                    contact.phone         = values[idx];
          else if (header === 'company')                                  contact.company       = values[idx];
          else if (header === 'job title' || header === 'jobtitle')       contact.job_title     = values[idx];
          else if (header === 'notes')                                    contact.notes         = values[idx];
          else if (header === 'location')                                 contact.location      = values[idx];
          else if (header === 'website')                                  contact.website       = values[idx];
          else if (header === 'industry')                                 contact.industry      = values[idx];
          else if (header === 'company size' || header === 'companysize') contact.company_size  = values[idx];
          else if (header === 'sales owner' || header === 'salesowner')   contact.sales_owner   = values[idx];
        });
        if (contact.first_name) importedContacts.push(contact);
      }
      if (importedContacts.length === 0) { showAlert('No valid contacts found in CSV.'); return; }
      try {
        await apiFetch('/v1/contacts/import', { method: 'POST', body: JSON.stringify({ contacts: importedContacts }) });
        await loadData();
        showAlert(`Successfully imported ${importedContacts.length} contacts!`);
      } catch (err: any) {
        showAlert(err.message || 'Failed to import CSV');
      }
    };
    reader.readAsText(file);
  }, [loadData]);

  const handleExportCSV = useCallback(() => {
    const active = contacts.filter(c => c.status === 'ACTIVE');
    if (active.length === 0) { showAlert('No active contacts to export.'); return; }
    const headers = ['First Name','Last Name','Email','Phone','Company','Job Title','Notes','Location','Website','Industry','Company Size','Sales Owner'];
    const rows = active.map(c => [
      c.first_name, c.last_name||'', c.email||'', c.phone||'', c.company||'',
      c.job_title||'', c.notes||'', c.location||'', c.website||'',
      c.industry||'', c.company_size||'', c.sales_owner||'',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'contacts_export.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [contacts]);

  const handleCreateLabel = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    try {
      await apiFetch('/v1/contacts/labels', { method: 'POST', body: JSON.stringify({ name: newLabelName.trim() }) });
      setNewLabelName('');
      setShowNewLabelModal(false);
      await loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create label');
    }
  }, [newLabelName, loadData]);

  return (
    <ContactsCtx.Provider value={{
      contacts, labels, duplicates, companies, loading,
      currentView, setCurrentView,
      selectedLabelId, setSelectedLabelId,
      activeContact, setActiveContact,
      searchQuery, setSearchQuery,
      loadData,
      handleDeleteLabel, handleImportCSV, handleExportCSV,
      showNewLabelModal, setShowNewLabelModal,
      newLabelName, setNewLabelName, handleCreateLabel,
      openContactModalRef,
      filterOpen, setFilterOpen,
      sortBy, setSortBy,
      filterLabelIds, setFilterLabelIds,
    }}>
      {children}
    </ContactsCtx.Provider>
  );
}
