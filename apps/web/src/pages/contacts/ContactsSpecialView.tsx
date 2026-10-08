import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import type { Contact } from '../../shells/contacts-context.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../../components/ui/dialog.js';
import { Tip } from '../../components/ui/tooltip.js';
import { showAlert } from '../../lib/alert.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { SectionLoading } from '../../components/ui/spinner.js';

interface SpecialPersonRow {
  contact_id?: string;
  id?: string;
  name?: string;
  email: string;
  phone?: string;
  role?: string;
  interaction_count?: number;
  last_interaction_at?: string | Date;
}

function inferEntityType(row: SpecialPersonRow): 'contact' | 'company' {
  const email = (row.email || '').toLowerCase().trim();
  const name = (row.name || '').toLowerCase().trim();

  const companyEmailPrefixes = /^(info|sales|support|admin|billing|contact|hello|help|finance|office|team|orders|accounts|service|operations|inquiry|inquiries|hr|press|media|marketing|customs|shipping|logistics)@/i;
  if (companyEmailPrefixes.test(email)) return 'company';

  const companyNameKeywords = /\b(ltd|limited|inc|incorporated|llc|corp|corporation|group|enterprises|logistics|freight|services|solutions|technologies|tech|holdings|agency|bank|co|company|associates|consulting|industries|transporters|haulage|clearing|forwarding)\b/i;
  if (companyNameKeywords.test(name)) return 'company';

  return 'contact';
}

function extractDomainCompany(email: string): string | null {
  const domain = (email || '').split('@')[1] || '';
  const isGenericDomain = /^(gmail|yahoo|hotmail|outlook|icloud|aol|mail|proton|zoho|live|msn)\./i.test(domain);
  if (isGenericDomain || !domain) return null;
  const base = domain.split('.')[0];
  return base.replace(/^./, (c: string) => c.toUpperCase());
}

export function ContactsSpecialView({ view, loading, directory, discovery, contacts, onOpen, onSave, onRefresh }: {
  view: 'directory' | 'frequent' | 'other'; loading: boolean; directory: any[];
  discovery: { frequent: any[]; other: any[] }; contacts: Contact[];
  onOpen: (contact: Contact) => void; onSave: (person: any) => void;
  onRefresh?: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'contact' | 'company'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [entityTypeOverrides, setEntityTypeOverrides] = useState<Record<string, 'contact' | 'company'>>({});
  const [modalNameOverrides, setModalNameOverrides] = useState<Record<string, string>>({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  // ── Directory — full table view ──────────────────────────────────────────
  if (view === 'directory') {
    const q = searchTerm.trim().toLowerCase();
    const filtered = q
      ? directory.filter(r =>
          r.name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q)
        )
      : directory;

    const total = filtered.length;
    const paginatedDir = filtered.slice((page - 1) * pageSize, page * pageSize);

    return (
      <div className="cts-special-view cts-dir-view">
        <div className="cts-dir-page-head">
          <PageHeader
            crumbs={['Contacts']}
            titlePlain="Workspace"
            titleEm="directory"
            subtitle={`Active members of your workspace${directory.length ? ` — ${directory.length} people` : ''}.`}
          />
          <div className="cts-dir-toolbar">
            <div className="cts-dir-search">
              <Icon name="search" size={15} />
              <input
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Search by name, email or phone…"
                aria-label="Search directory"
              />
              {searchTerm && (
                <button type="button" onClick={() => { setSearchTerm(''); setPage(1); }} aria-label="Clear" data-ui-native-button="">
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
            <span className="cts-dir-count">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="cts-dir-table-wrap">
          {loading ? (
            <SectionLoading label="Loading directory…" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', justifyContent: 'space-between' }}>
              <table className="cts-dir-table">
                <colgroup>
                  <col className="cts-dir-col--name" />
                  <col className="cts-dir-col--email" />
                  <col className="cts-dir-col--phone" />
                  <col className="cts-dir-col--role" />
                  <col className="cts-dir-col--actions" />
                </colgroup>
                <thead>
                  <tr className="cts-dir-thead-row">
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone number</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDir.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="cts-dir-empty-cell">
                        {searchTerm ? `No members match "${searchTerm}".` : 'No active members found.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedDir.map(row => (
                      <tr
                        key={row.id}
                        className="cts-dir-row"
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${row.name}'s NexusHR profile`}
                        onClick={() => navigate(`/nexushr/staff/${row.id}`)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/nexushr/staff/${row.id}`);
                          }
                        }}
                      >
                        <td className="cts-dir-name-cell">
                          <PersonAvatar userId={row.id} kind="people" name={row.name} size={32} />
                          <span className="cts-dir-name">{row.name}</span>
                        </td>
                        <td className="cts-dir-cell">
                          {row.email ? (
                            <button
                              type="button"
                              className="cts-dir-email-btn"
                              onClick={e => { e.stopPropagation(); navigate(`/email?compose=1&to=${encodeURIComponent(row.email)}`); }}
                             data-ui-native-button="">
                              {row.email}
                            </button>
                          ) : <span className="cts-dir-dash">—</span>}
                        </td>
                        <td className="cts-dir-cell">
                          {row.phone || <span className="cts-dir-dash">—</span>}
                        </td>
                        <td className="cts-dir-cell">
                          {row.role ? (
                            <Badge variant="gray" style={{ textTransform: 'capitalize' }}>
                              {row.role.replaceAll('_', ' ').toLowerCase()}
                            </Badge>
                          ) : <span className="cts-dir-dash">—</span>}
                        </td>
                        <td className="cts-dir-actions-cell">
                          {row.email && (
                            <Tip label={`Email ${row.name}`}>
                              <button
                                type="button"
                                className="cts-dir-action-btn"
                                onClick={e => { e.stopPropagation(); navigate(`/email?compose=1&to=${encodeURIComponent(row.email)}`); }}
                               data-ui-native-button="">
                                <Icon name="mail" size={15} />
                              </button>
                            </Tip>
                          )}
                          {row.phone && (
                            <Tip label={`Call ${row.name} by phone`}>
                              <a
                                className="cts-dir-action-btn"
                                href={`tel:${row.phone}`}
                                onClick={e => e.stopPropagation()}
                                aria-label={`Call ${row.name} by phone`}
                              >
                                <Icon name="phone" size={15} />
                              </a>
                            </Tip>
                          )}
                          <Tip label={`Start a workspace voice call with ${row.name}`}>
                            <button
                              type="button"
                              className="cts-dir-action-btn"
                              onClick={e => { e.stopPropagation(); navigate(`/bliss/calls?call=${row.id}&kind=VOICE`); }}
                             data-ui-native-button="">
                              <Icon name="headphones" size={15} />
                            </button>
                          </Tip>
                          <Tip label={`Start a video call with ${row.name}`}>
                            <button
                              type="button"
                              className="cts-dir-action-btn"
                              onClick={e => { e.stopPropagation(); navigate(`/bliss/calls?call=${row.id}&kind=VIDEO`); }}
                             data-ui-native-button="">
                              <Icon name="video" size={15} />
                            </button>
                          </Tip>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationBar
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={s => { setPageSize(s); setPage(1); }}
                pageSizeOptions={[10, 20, 50, 100]}
                itemLabel="member"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Frequent / Other views — compressed table with bulk CRM import & pagination ────
  const title = view === 'frequent' ? 'Frequent contacts' : 'Other contacts';
  const subtitle = view === 'frequent'
    ? 'Saved contacts you communicate with most.'
    : 'People and companies found in your mailbox who are not yet saved to CRM.';
  const allRows: SpecialPersonRow[] = view === 'frequent' ? discovery.frequent : discovery.other;

  const getType = (row: SpecialPersonRow): 'contact' | 'company' => {
    return entityTypeOverrides[row.email] || inferEntityType(row);
  };

  const toggleType = (email: string) => {
    const row = allRows.find(r => r.email === email);
    if (!row) return;
    const current = getType(row);
    const next = current === 'contact' ? 'company' : 'contact';
    setEntityTypeOverrides(prev => ({ ...prev, [email]: next }));
  };

  const q = searchTerm.trim().toLowerCase();
  const filteredRows = allRows.filter((r: SpecialPersonRow) => {
    if (q) {
      const matchName = (r.name || '').toLowerCase().includes(q);
      const matchEmail = (r.email || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }
    if (filterType !== 'all') {
      const t = getType(r);
      if (t !== filterType) return false;
    }
    return true;
  });

  const total = filteredRows.length;
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const currentPageAllSelected = paginatedRows.length > 0 && paginatedRows.every(r => selectedEmails.has(r.email));

  const toggleSelectPage = () => {
    const next = new Set(selectedEmails);
    if (currentPageAllSelected) {
      paginatedRows.forEach(r => next.delete(r.email));
    } else {
      paginatedRows.forEach(r => next.add(r.email));
    }
    setSelectedEmails(next);
  };

  const toggleSelectRow = (email: string) => {
    const next = new Set(selectedEmails);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setSelectedEmails(next);
  };

  const clearSelection = () => {
    setSelectedEmails(new Set());
  };

  const importSingleItem = async (row: SpecialPersonRow, type: 'contact' | 'company', customName?: string) => {
    setBusyEmail(row.email);
    try {
      const effectiveName = customName || row.name || row.email;
      if (type === 'contact') {
        const parts = String(effectiveName).trim().split(/\s+/);
        const firstName = parts.shift() || row.email;
        const lastName = parts.join(' ') || null;
        const guessedCompany = extractDomainCompany(row.email);
        await apiFetch('/v1/contacts', {
          method: 'POST',
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: row.email,
            company: guessedCompany,
            source: 'email_discovery',
          }),
        });
        showAlert(`Saved "${effectiveName}" as CRM Contact.`, { variant: 'success' });
      } else {
        const domainCompany = extractDomainCompany(row.email) || 'Company';
        const companyName = (effectiveName && effectiveName !== row.email) ? effectiveName : domainCompany;
        const contactPerson = (row.name && row.name !== row.email) ? row.name : null;
        await apiFetch('/v1/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: companyName,
            contact_name: contactPerson,
            email: row.email,
            category: 'sme',
          }),
        });
        showAlert(`Saved "${companyName}" as CRM Company.`, { variant: 'success' });
      }
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      showAlert(err.message || `Could not save as ${type}.`);
    } finally {
      setBusyEmail(null);
    }
  };

  const handleBulkImport = async (targetMode: 'contact' | 'company' | 'auto') => {
    if (selectedEmails.size === 0) return;
    setBulkBusy(true);
    const selectedRows = allRows.filter(r => selectedEmails.has(r.email));
    let contactCount = 0;
    let companyCount = 0;
    const errors: string[] = [];

    const results = await Promise.allSettled(selectedRows.map(async (row) => {
      const type = targetMode === 'auto' ? getType(row) : targetMode;
      const customName = modalNameOverrides[row.email] || row.name || row.email;
      if (type === 'contact') {
        const parts = String(customName).trim().split(/\s+/);
        const firstName = parts.shift() || row.email;
        const lastName = parts.join(' ') || null;
        const guessedCompany = extractDomainCompany(row.email);
        await apiFetch('/v1/contacts', {
          method: 'POST',
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: row.email,
            company: guessedCompany,
            source: 'email_discovery',
          }),
        });
        contactCount++;
      } else {
        const domainCompany = extractDomainCompany(row.email) || 'Company';
        const companyName = (customName && customName !== row.email) ? customName : domainCompany;
        const contactPerson = (row.name && row.name !== row.email) ? row.name : null;
        await apiFetch('/v1/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: companyName,
            contact_name: contactPerson,
            email: row.email,
            category: 'sme',
          }),
        });
        companyCount++;
      }
    }));

    results.forEach((res, i) => {
      if (res.status === 'rejected') {
        errors.push(`${selectedRows[i]?.email}: ${res.reason?.message || 'Failed'}`);
      }
    });

    setBulkBusy(false);
    clearSelection();
    setShowReviewModal(false);

    if (errors.length === 0) {
      const parts = [];
      if (contactCount > 0) parts.push(`${contactCount} contact${contactCount !== 1 ? 's' : ''}`);
      if (companyCount > 0) parts.push(`${companyCount} compan${companyCount !== 1 ? 'ies' : 'y'}`);
      showAlert(`Successfully imported ${parts.join(' and ')} to CRM.`, { variant: 'success' });
    } else {
      showAlert(`Imported with ${errors.length} error${errors.length !== 1 ? 's' : ''}.`);
    }

    if (onRefresh) await onRefresh();
  };

  const selectedRows = allRows.filter(r => selectedEmails.has(r.email));
  const contactCounts = allRows.filter(r => getType(r) === 'contact').length;
  const companyCounts = allRows.filter(r => getType(r) === 'company').length;

  return (
    <div className="cts-special-view">
      <div className="cts-special-page-head">
        <PageHeader
          crumbs={['Contacts']}
          titlePlain={title.split(' ').slice(0, -1).join(' ') || 'Contact'}
          titleEm={title.split(' ').at(-1)!}
          subtitle={subtitle}
        />

        {/* Bulk Action Bar */}
        {selectedEmails.size > 0 && (
          <div className="cts-special-bulk-bar">
            <div className="cts-special-bulk-left">
              <span className="cts-special-bulk-count">{selectedEmails.size} selected</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelection} data-ui-native-button="">
                Deselect all
              </button>
            </div>
            <div className="cts-special-bulk-right">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleBulkImport('contact')}
                disabled={bulkBusy}
              >
                <Icon name="user" size={13} />
                Import as Contacts ({selectedEmails.size})
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleBulkImport('company')}
                disabled={bulkBusy}
              >
                <Icon name="building" size={13} />
                Import as Companies ({selectedEmails.size})
              </Button>
              <Button
                size="sm"
                onClick={() => handleBulkImport('auto')}
                disabled={bulkBusy}
              >
                <Icon name="upload" size={13} />
                Smart Import to CRM ({selectedEmails.size})
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowReviewModal(true)}
                disabled={bulkBusy}
              >
                Review & Import…
              </Button>
            </div>
          </div>
        )}

        {/* Special Toolbar */}
        <div className="cts-special-toolbar">
          <div className="cts-special-filters">
            <button
              type="button"
              className={`cts-special-filter-tab${filterType === 'all' ? ' cts-special-filter-tab--active' : ''}`}
              onClick={() => { setFilterType('all'); setPage(1); }}
             data-ui-native-button="">
              All ({allRows.length})
            </button>
            <button
              type="button"
              className={`cts-special-filter-tab${filterType === 'contact' ? ' cts-special-filter-tab--active' : ''}`}
              onClick={() => { setFilterType('contact'); setPage(1); }}
             data-ui-native-button="">
              <Icon name="user" size={12} />
              Contacts ({contactCounts})
            </button>
            <button
              type="button"
              className={`cts-special-filter-tab${filterType === 'company' ? ' cts-special-filter-tab--active' : ''}`}
              onClick={() => { setFilterType('company'); setPage(1); }}
             data-ui-native-button="">
              <Icon name="building" size={12} />
              Companies ({companyCounts})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="cts-special-search">
              <Icon name="search" size={14} color="var(--ink3)" />
              <input
                placeholder="Search by name or email…"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                aria-label="Search contacts"
              />
              {searchTerm && (
                <button type="button" onClick={() => { setSearchTerm(''); setPage(1); }} aria-label="Clear" data-ui-native-button="">
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
            <span className="cts-special-count">
              {loading ? '…' : `${total} ${total === 1 ? 'item' : 'items'}`}
            </span>
          </div>
        </div>
      </div>

      {/* Compressed Table Container */}
      <div className="cts-special-table-wrap">
        {loading ? (
          <SectionLoading label="Discovering mailbox contacts…" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', justifyContent: 'space-between' }}>
            <table className="cts-special-table">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ minWidth: 220 }} />
                <col style={{ minWidth: 220 }} />
                <col style={{ minWidth: 170 }} />
                <col style={{ minWidth: 130 }} />
                <col style={{ minWidth: 160 }} />
              </colgroup>
              <thead>
                <tr className="cts-special-thead-row">
                  <th style={{ paddingLeft: 12 }}>
                    <Checkbox
                      checked={currentPageAllSelected}
                      onCheckedChange={toggleSelectPage}
                      aria-label="Select all on current page"
                    />
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Activity</th>
                  <th>CRM Entity</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)' }}>
                      {searchTerm ? `No records match "${searchTerm}".` : 'No mailbox contacts discovered yet.'}
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row: SpecialPersonRow) => {
                    const contact = row.contact_id ? contacts.find(c => c.id === row.contact_id) : null;
                    const name = row.name || row.email;
                    const key = row.id || row.contact_id || row.email;
                    const lastDate = row.last_interaction_at ? new Date(row.last_interaction_at) : null;
                    const lastLabel = lastDate ? lastDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
                    const currentType = getType(row);
                    const isSelected = selectedEmails.has(row.email);
                    const isBusy = busyEmail === row.email;

                    return (
                      <tr
                        key={key}
                        className={`cts-special-row${isSelected ? ' cts-special-row--selected' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="cts-special-cell" style={{ paddingLeft: 12 }}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectRow(row.email)}
                            aria-label={`Select ${name}`}
                          />
                        </td>

                        {/* Name + Avatar */}
                        <td className="cts-special-cell">
                          <div className="cts-special-name-cell">
                            {currentType === 'company' ? (
                              <CompanyAvatar
                                name={name}
                                size={28}
                              />
                            ) : (
                              <PersonAvatar
                                userId={contact?.id}
                                kind="contacts"
                                name={contact ? `${contact.first_name} ${contact.last_name || ''}` : name}
                                size={28}
                              />
                            )}
                            <span className="cts-special-name" title={name}>
                              {contact ? `${contact.first_name} ${contact.last_name || ''}` : name}
                            </span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="cts-special-cell">
                          <button
                            type="button"
                            className="cts-dir-email-btn"
                            onClick={() => navigate(`/email?compose=1&to=${encodeURIComponent(row.email)}`)}
                            title={`Compose email to ${row.email}`}
                           data-ui-native-button="">
                            {row.email}
                          </button>
                        </td>

                        {/* Activity (Emails count + Last contact date) */}
                        <td className="cts-special-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                            <Badge variant="gray">
                              {row.interaction_count} {row.interaction_count === 1 ? 'email' : 'emails'}
                            </Badge>
                            {lastLabel && (
                              <span style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                                {lastLabel}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* CRM Entity Type toggle */}
                        <td className="cts-special-cell">
                          <Tip label="Click to toggle between Contact and Company">
                            <button
                              type="button"
                              className={`cts-type-pill cts-type-pill--${currentType}`}
                              onClick={() => toggleType(row.email)}
                             data-ui-native-button="">
                              <Icon name={currentType === 'company' ? 'building' : 'user'} size={11} />
                              {currentType === 'company' ? 'Company' : 'Contact'}
                            </button>
                          </Tip>
                        </td>

                        {/* Actions */}
                        <td className="cts-special-cell" style={{ textAlign: 'right' }}>
                          <div className="cts-special-actions">
                            {contact ? (
                              <Button size="xs" variant="secondary" onClick={() => onOpen(contact)}>
                                Open
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="xs"
                                  onClick={() => importSingleItem(row, currentType)}
                                  disabled={isBusy}
                                >
                                  {isBusy ? 'Saving…' : `+ ${currentType === 'company' ? 'Company' : 'Contact'}`}
                                </Button>
                                <DropdownMenu>
                                  <Tip label="More actions">
                                    <DropdownMenuTrigger asChild>
                                      <button type="button" className="cts-special-action-btn" aria-label="More actions" data-ui-native-button="">
                                        <Icon name="moreVertical" size={13} />
                                      </button>
                                    </DropdownMenuTrigger>
                                  </Tip>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => importSingleItem(row, 'contact')}>
                                      Save as Contact (Person)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => importSingleItem(row, 'company')}>
                                      Save as Company (Organization)
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => navigate(`/email?compose=1&to=${encodeURIComponent(row.email)}`)}>
                                      Compose Email
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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

            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={s => { setPageSize(s); setPage(1); }}
              pageSizeOptions={[10, 20, 50, 100]}
              itemLabel="contact"
            />
          </div>
        )}
      </div>

      {/* Bulk Review & Import Dialog */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Bulk Import to CRM</DialogTitle>
            <p style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
              Review and configure the {selectedRows.length} selected records before importing into CRM.
            </p>
          </DialogHeader>
          <DialogBody style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Quick configure:</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  const next: Record<string, 'contact' | 'company'> = { ...entityTypeOverrides };
                  selectedRows.forEach(r => { next[r.email] = 'contact'; });
                  setEntityTypeOverrides(next);
                }}
               data-ui-native-button="">
                All as Contacts
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  const next: Record<string, 'contact' | 'company'> = { ...entityTypeOverrides };
                  selectedRows.forEach(r => { next[r.email] = 'company'; });
                  setEntityTypeOverrides(next);
                }}
               data-ui-native-button="">
                All as Companies
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  const next: Record<string, 'contact' | 'company'> = { ...entityTypeOverrides };
                  selectedRows.forEach(r => { delete next[r.email]; });
                  setEntityTypeOverrides(next);
                }}
               data-ui-native-button="">
                Reset to Auto-detect
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink2)' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Record</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Target Entity</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>CRM Name</th>
                </tr>
              </thead>
              <tbody>
                {selectedRows.map(row => {
                  const currentType = getType(row);
                  const customName = modalNameOverrides[row.email] ?? (row.name || row.email);
                  return (
                    <tr key={row.email} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {currentType === 'company' ? (
                            <CompanyAvatar name={customName} size={24} />
                          ) : (
                            <PersonAvatar name={customName} kind="contacts" size={24} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.name || row.email}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{row.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <Select
                          value={currentType}
                          onValueChange={(val: 'contact' | 'company') => {
                            setEntityTypeOverrides(prev => ({ ...prev, [row.email]: val }));
                          }}
                        >
                          <SelectTrigger style={{ width: 130, height: 30, fontSize: 12 }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contact">Contact (Person)</SelectItem>
                            <SelectItem value="company">Company (Org)</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          className="input-field"
                          style={{ height: 30, fontSize: 12.5, padding: '0 8px' }}
                          value={customName}
                          onChange={e => setModalNameOverrides(prev => ({ ...prev, [row.email]: e.target.value }))}
                          placeholder={currentType === 'company' ? 'Company name…' : 'Full name…'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowReviewModal(false)}
              disabled={bulkBusy}
             data-ui-native-button="">
              Cancel
            </button>
            <Button
              size="sm"
              onClick={() => handleBulkImport('auto')}
              disabled={bulkBusy}
            >
              {bulkBusy ? 'Importing…' : `Import ${selectedRows.length} to CRM`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
