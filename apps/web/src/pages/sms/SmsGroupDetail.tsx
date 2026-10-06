import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';

interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  members: Member[];
}

interface Member {
  id: string;
  phone: string;
  name: string | null;
  created_at: string;
}

/** RFC-4180 CSV row parser — handles quoted fields containing commas. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { fields.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
  }
  fields.push(cur.trim());
  return fields;
}

export function SmsGroupDetail() {
  usePageSEO('Group Members & Importer', 'Manage contact list, batch CSV phonebook imports, and audience enrollment.');
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddSingle, setShowAddSingle] = useState(false);
  const [singlePhone, setSinglePhone] = useState('');
  const [singleName, setSingleName] = useState('');
  const [addingSingle, setAddingSingle] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // CSV Import State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [parsedCsvMembers, setParsedCsvMembers] = useState<{ phone: string; name?: string }[]>([]);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/sms/groups/${id}`)
      .then(res => setGroup(res.data))
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  async function handleAddSingle() {
    if (!singlePhone.trim()) {
      setSingleError('Phone number is required.');
      return;
    }
    setAddingSingle(true);
    setSingleError(null);
    try {
      await apiFetch(`/v1/sms/groups/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ phone: singlePhone.trim(), name: singleName.trim() || undefined }),
      });
      setSinglePhone('');
      setSingleName('');
      setShowAddSingle(false);
      load();
    } catch (err: any) {
      setSingleError(err.message || 'Failed to add contact.');
    } finally {
      setAddingSingle(false);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = evt => {
      const text = String(evt.target?.result || '');
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) return;

      const firstLine = parseCsvRow(lines[0]);
      const hasHeader = /phone|number|mobile|name/i.test(lines[0]);
      const startIndex = hasHeader ? 1 : 0;

      const phoneIdx = hasHeader ? firstLine.findIndex(h => /phone|mobile|number/i.test(h)) : 0;
      const nameIdx = hasHeader ? firstLine.findIndex(h => /name|contact/i.test(h)) : 1;

      const members: { phone: string; name?: string }[] = [];
      for (let i = startIndex; i < lines.length; i++) {
        const cols = parseCsvRow(lines[i]);
        const rawPhone = cols[phoneIdx >= 0 ? phoneIdx : 0];
        const rawName = nameIdx >= 0 ? cols[nameIdx] : undefined;

        if (rawPhone && rawPhone.length >= 6) {
          members.push({ phone: rawPhone, name: rawName });
        }
      }
      setParsedCsvMembers(members);
    };
    reader.readAsText(file);
  }

  async function handleBatchImport() {
    if (parsedCsvMembers.length === 0) return;
    setImportingCsv(true);
    try {
      const res = await apiFetch(`/v1/sms/groups/${id}/members`, {
        method: 'POST',
        body: JSON.stringify(parsedCsvMembers),
      });
      setImportResult(`Successfully imported ${res.data?.added ?? parsedCsvMembers.length} members.`);
      setParsedCsvMembers([]);
      setCsvFileName('');
      load();
    } catch (err: any) {
      setImportResult(`Import failed: ${err.message}`);
    } finally {
      setImportingCsv(false);
    }
  }

  async function handleRemoveMember(memberId: string, phone: string) {
    if (
      !(await showConfirm(`Remove "${phone}" from this group?`, {
        title: 'Remove member?',
        confirmLabel: 'Remove',
      }))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/groups/${id}/members/${memberId}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove member.');
    }
  }

  function exportCsv() {
    if (!group || !group.members || group.members.length === 0) return;
    const csvContent =
      'Phone Number,Name,Added Date\n' +
      group.members.map(m => `"${m.phone}","${m.name || ''}","${m.created_at}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${group.name}-members.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const members = group?.members || [];
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const matchSearch =
        !search.trim() ||
        m.phone.toLowerCase().includes(search.toLowerCase()) ||
        (m.name && m.name.toLowerCase().includes(search.toLowerCase()));
      return matchSearch;
    });
  }, [members, search]);

  if (loading) return <SectionLoading />;
  if (!group) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>
        Group not found. <Link to="/sms/groups">Back to groups</Link>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Groups', group.name]}
        titlePlain="Group"
        titleEm={group.name}
        subtitle={group.description || `${members.length} enrolled members`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/sms/compose">
              <Button>
                <Icon name="send" size={14} /> Launch Campaign
              </Button>
            </Link>
            <Button variant="outline" onClick={() => { setShowCsvModal(true); setImportResult(null); }}>
              <Icon name="upload" size={14} /> Batch CSV Import
            </Button>
            <Button variant="outline" onClick={() => { setShowAddSingle(true); setSingleError(null); }}>
              <Icon name="plus" size={14} /> Add Contact
            </Button>
            {members.length > 0 && (
              <Button variant="ghost" onClick={exportCsv}>
                <Icon name="download" size={14} />
              </Button>
            )}
          </div>
        }
      />

      {/* Single Add Drawer */}
      {showAddSingle && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="Add Contact to Group" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Phone Number *
                </label>
                <Input
                  value={singlePhone}
                  onChange={e => setSinglePhone(e.target.value)}
                  placeholder="+255712345678"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Contact Name (Optional)
                </label>
                <Input
                  value={singleName}
                  onChange={e => setSingleName(e.target.value)}
                  placeholder="e.g. Amani Joseph"
                />
              </div>
            </div>

            {singleError && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{singleError}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button disabled={addingSingle} onClick={handleAddSingle}>
                {addingSingle ? 'Adding…' : 'Save Member'}
              </Button>
              <Button variant="outline" onClick={() => setShowAddSingle(false)}>
                Cancel
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* CSV Batch Import Modal */}
      {showCsvModal && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="Batch CSV Contact Import" collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--r)',
                  padding: '24px 20px',
                  textAlign: 'center',
                  background: 'var(--bg)',
                }}
              >
                <Icon name="fileText" size={24} color="var(--teal)" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {csvFileName || 'Select CSV or TXT file with phone numbers'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, marginBottom: 12 }}>
                  File format: Phone, Name (or comma-separated list of numbers)
                </div>
                <input
                  type="file"
                  accept=".csv,.txt"
                  id="group-csv-upload"
                  style={{ display: 'none' }}
                  onChange={handleCsvFile}
                />
                <label htmlFor="group-csv-upload">
                  <Button type="button" variant="outline" style={{ pointerEvents: 'none' }}>
                    <Icon name="upload" size={14} /> Choose File
                  </Button>
                </label>
              </div>

              {parsedCsvMembers.length > 0 && (
                <div style={{ background: 'var(--teal-l)', padding: '12px 16px', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--ink)' }}>
                  <strong>{parsedCsvMembers.length} valid contacts ready to import.</strong>
                </div>
              )}

              {importResult && (
                <div style={{ fontSize: 13, color: importResult.includes('failed') ? 'var(--red)' : 'var(--green)' }}>
                  {importResult}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  disabled={parsedCsvMembers.length === 0 || importingCsv}
                  onClick={handleBatchImport}
                >
                  {importingCsv ? 'Importing…' : `Import ${parsedCsvMembers.length} Members`}
                </Button>
                <Button variant="outline" onClick={() => setShowCsvModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Search & Members Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>
          {filteredMembers.length} Enrolled Member(s)
        </div>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by phone or name…"
          style={{ maxWidth: 280 }}
        />
      </div>

      <SectionCard title="Enrolled Members" padded={false} collapsible={false}>
        {members.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No contacts in this group yet. Click <strong>Batch CSV Import</strong> or <strong>Add Contact</strong> to enroll numbers.
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>
            No contacts match the search query.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Phone Number', 'Contact Name', 'Enrolled Date', ''].map(h => (
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
                {filteredMembers.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>
                      {m.phone}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>
                      {m.name || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(m.id, m.phone)}>
                        <Icon name="x" size={13} color="var(--red)" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
