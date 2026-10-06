import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsFilterMenu, SmsListPagination, SmsListToolbar, useSmsList } from './SmsListControls.js';

interface Group {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  created_at: string;
}

export function SmsGroups() {
  usePageSEO('SMS Contact Groups & Segments', 'Manage contact segments, bulk address books, and target audiences for SMS blasts.');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'members'>('newest');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/groups')
      .then(res => setGroups(res.data || []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/sms/groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      setName('');
      setDescription('');
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create group.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, groupName: string) {
    if (
      !(await showConfirm(`"${groupName}" and its contact associations will be deleted.`, {
        title: 'Delete group?',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/groups/${id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete group.');
    }
  }

  const filteredGroups = useMemo(() => {
    const result = groups.filter(g => {
      const matchSearch =
        !search.trim() ||
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.description && g.description.toLowerCase().includes(search.toLowerCase()));
      return matchSearch;
    });
    return result.sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'members' ? b.memberCount - a.memberCount : Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [groups, search, sortBy]);
  const list = useSmsList(filteredGroups);

  function exportSelected() {
    downloadSmsCsv(`sms-groups-${new Date().toISOString().slice(0, 10)}.csv`, ['Group', 'Description', 'Members', 'Created At'],
      list.selectedItems.map(g => [g.name, g.description, g.memberCount, g.created_at]));
  }

  const totalContacts = groups.reduce((acc, g) => acc + (g.memberCount || 0), 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Groups']}
        titlePlain="Contact"
        titleEm="Groups"
        subtitle="Segment your audience into targeted distribution lists for one-click SMS broadcasts."
        actions={
          <Button onClick={() => { setShowForm(true); setError(null); }}>
            <Icon name="plus" size={14} /> New Group
          </Button>
        }
      />

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="brand" size="md" shape="circle"><Icon name="users" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Groups</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : groups.length}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="success" size="md" shape="circle"><Icon name="phone" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Enrolled Phone Numbers</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : totalContacts.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="info" size="md" shape="circle"><Icon name="send" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quick Action</div>
            <div style={{ marginTop: 4 }}>
              <Link to="/sms/compose" style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
                Launch Broadcast →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Create Group Card */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Create Contact Group" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Group Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. VIP Customers or Sales Leads" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Description (Optional)</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. High priority wholesale clients" />
              </div>
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button disabled={saving} onClick={handleCreate}>
                {saving ? 'Creating…' : 'Save Group'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>
                Cancel
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SmsListToolbar search={search} onSearch={setSearch} placeholder="Search groups…" total={filteredGroups.length}
          page={list.page} pageSize={list.pageSize} selectedCount={list.selectedIds.size} onPageSizeChange={list.setPageSize}
          onExport={exportSelected} activeFilterCount={sortBy === 'newest' ? 0 : 1}
          filterContent={() => <SmsFilterMenu showClear={sortBy !== 'newest'} onClear={() => setSortBy('newest')}>
            <SingleSelectFilter label="Sort" value={sortBy} onChange={value => setSortBy((value ?? 'newest') as typeof sortBy)} options={[
              { value: 'newest', label: 'Newest first' }, { value: 'name', label: 'Name A–Z' }, { value: 'members', label: 'Most members' },
            ]} />
          </SmsFilterMenu>} />
      </div>

      <SectionCard title="Audience Groups" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : filteredGroups.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No groups found. Click <strong>New Group</strong> to create an audience list.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 44, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <Checkbox checked={list.allSelected ? true : list.someSelected ? 'indeterminate' : false} onCheckedChange={list.toggleAll} aria-label="Select all filtered groups" />
                  </th>
                  {['Group Name', 'Description', 'Member Count', 'Created', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'var(--ink3)',
                        background: 'var(--bg)',
                        borderBottom: '1px solid var(--border)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.pageItems.map(g => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}><Checkbox checked={list.selectedIds.has(g.id)} onCheckedChange={() => list.toggle(g.id)} aria-label={`Select ${g.name}`} /></td>
                    <td style={{ padding: '12px 16px' }}>
                      <Link
                        to={`/sms/groups/${g.id}`}
                        style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}
                      >
                        {g.name}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>
                      {g.description || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant="brand">{g.memberCount} members</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {new Date(g.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Link to={`/sms/groups/${g.id}`}>
                          <Button size="sm" variant="outline">
                            <Icon name="users" size={12} /> View Members
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id, g.name)}>
                          <Icon name="trash" size={13} color="var(--red)" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SmsListPagination page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </SectionCard>
    </div>
  );
}
