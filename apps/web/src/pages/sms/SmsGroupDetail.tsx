import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';

interface Member { id: string; phone: string; name: string | null; contact_source: string | null; created_at: string; }
interface GroupDetail { id: string; name: string; description: string | null; members: Member[]; }
interface RecipientHit { id: string; name: string; phone: string; source: string; }

export function SmsGroupDetail() {
  usePageSEO('Group members', 'Manage this SMS group\'s recipient list.');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [pasteBulk, setPasteBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Keyed by the same `${source}:${id}` composite EntityPicker gets as
  // PickerItem.id — populated on each search so addFromSearch can recover
  // the phone/source fields PickerItem itself doesn't carry.
  const hitsRef = useRef<Map<string, RecipientHit>>(new Map());

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/sms/groups/${id}`).then(res => setGroup(res.data)).catch(() => setGroup(null)).finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  async function searchGroupRecipients(query: string): Promise<PickerItem[]> {
    if (query.trim().length < 2) return [];
    const res = await apiFetch(`/v1/sms/recipients/search?q=${encodeURIComponent(query.trim())}`);
    const hits: RecipientHit[] = res.data || [];
    hitsRef.current = new Map(hits.map(h => [`${h.source}:${h.id}`, h]));
    return hits.map(h => ({ id: `${h.source}:${h.id}`, label: h.name, sublabel: h.phone }));
  }

  async function addOne(phone: string, name?: string, contactId?: string, contactSource?: string) {
    if (!id || !phone.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/sms/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ phone: phone.trim(), name: name?.trim() || undefined, contactId, contactSource }) });
      setPhoneInput(''); setNameInput('');
      load();
    } catch (err: any) { showAlert(err.message || 'Could not add member.'); }
    finally { setBusy(false); }
  }
  function addFromSearch(item: PickerItem | null) {
    if (!item) return;
    const hit = hitsRef.current.get(item.id);
    if (hit) addOne(hit.phone, hit.name, hit.id, hit.source);
  }

  async function submitBulkLines(lines: string[]) {
    if (!id) return;
    const members = lines.map(line => {
      const [phone, ...rest] = line.split(/\t|,|;/).map(s => s.trim());
      return { phone, name: rest.join(' ').replace(/^"|"$/g, '') || undefined };
    }).filter(m => m.phone && /\d/.test(m.phone));
    if (members.length === 0) { showAlert('No valid phone numbers found.'); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`/v1/sms/groups/${id}/members`, { method: 'POST', body: JSON.stringify(members) });
      showAlert(`Added ${res.data?.added ?? 0} member(s)${res.data?.skipped ? `, ${res.data.skipped} already in the group` : ''}.`);
      load();
    } catch (err: any) { showAlert(err.message || 'Bulk add failed.'); }
    finally { setBusy(false); }
  }

  async function addBulk() {
    const lines = pasteBulk.split('\n').map(l => l.trim()).filter(Boolean);
    await submitBulkLines(lines);
    setPasteBulk(''); setShowBulk(false);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  async function handleCsvFile(file: File) {
    const text = await file.text();
    let lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // Drop a header row if the first cell isn't itself a phone-looking value
    // (starts with a digit or '+') — matches "phone,name" / "Phone,Name" etc.
    if (lines.length > 0 && !/^["+]?\d/.test(lines[0].replace(/^"/, ''))) lines = lines.slice(1);
    await submitBulkLines(lines);
  }

  async function removeMember(memberId: string) {
    if (!id) return;
    setGroup(prev => prev ? { ...prev, members: prev.members.filter(m => m.id !== memberId) } : prev);
    await apiFetch(`/v1/sms/groups/${id}/members/${memberId}`, { method: 'DELETE' }).catch(load);
  }

  async function removeGroup() {
    if (!id || !group) return;
    if (!await showConfirm(`"${group.name}" and its member list will be permanently removed.`, { title: 'Delete group?', variant: 'danger', confirmLabel: 'Delete' })) return;
    await apiFetch(`/v1/sms/groups/${id}`, { method: 'DELETE' });
    navigate('/sms/groups');
  }

  if (loading) return <SectionLoading />;
  if (!group) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>Group not found. <Link to="/sms/groups">Back to groups</Link></div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Groups', group.name]}
        titlePlain={group.name.split(' ').slice(0, -1).join(' ') || 'Group'}
        titleEm={group.name.split(' ').slice(-1)[0] || group.name}
        subtitle={group.description || `${group.members.length} member(s)`}
        actions={<Button variant="ghost" onClick={removeGroup}><Icon name="trash" size={14} color="var(--red)" /> Delete group</Button>}
      />

      <SectionCard title="Add members" collapsible={false}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="Phone number" style={{ maxWidth: 220 }} />
          <Input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Name (optional)" style={{ maxWidth: 220 }} />
          <Button disabled={busy || !phoneInput.trim()} onClick={() => addOne(phoneInput, nameInput)}><Icon name="plus" size={14} /> Add</Button>
          <Button variant="outline" onClick={() => setShowBulk(s => !s)}>Paste list</Button>
          <Button variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}><Icon name="upload" size={14} /> Upload CSV</Button>
          <input
            ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={e => { const file = e.target.files?.[0]; if (file) handleCsvFile(file); e.target.value = ''; }}
          />
        </div>

        {showBulk && (
          <div style={{ marginBottom: 10 }}>
            <Textarea value={pasteBulk} onChange={e => setPasteBulk(e.target.value)} placeholder={'One per line: phone, or phone\\tname\ne.g.\n+255712345678\tJohn Doe\n+255798765432'} rows={4} />
            <div style={{ marginTop: 8 }}><Button size="sm" disabled={busy || !pasteBulk.trim()} onClick={addBulk}>Add all</Button></div>
          </div>
        )}

        <EntityPicker
          value={null}
          onChange={addFromSearch}
          search={searchGroupRecipients}
          placeholder="Or search contacts, leads, customers, staff…"
        />
      </SectionCard>

      <div style={{ marginTop: 20 }}>
        <SectionCard title={`Members (${group.members.length})`} padded={false} collapsible={false}>
          {group.members.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No members yet — add some above.</div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Phone', 'Name', 'Source', 'Added', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {group.members.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.phone}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{m.name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)', textTransform: 'capitalize' }}>{m.contact_source || 'Manual'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" onClick={() => removeMember(m.id)}><Icon name="x" size={13} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
