// ─── OndiGroups.tsx — Ondi Enterprise · Groups ───────────────────
// Ondi feature-gap pass, continued. The benchmark doc's own gap list flags
// static-only group membership as "an explicitly documented follow-up" in
// the fork's org-groups.ts — but that file, and the group concept itself,
// only exist in the disconnected fork (services/ondi-api). The real
// integrated system had no group concept at all before this: only
// per-user custom-role grants (OndiRoles.tsx). This is a group primitive
// built fresh on top of that existing role system — a group carries a
// static or rule-based member list, and zero or more roles; being in the
// group grants those roles, tracked separately from a direct grant so
// leaving the group (or a rule no longer matching) cleanly revokes only
// what the group itself gave.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface GroupRule { attribute: 'role' | 'active'; operator: 'equals' | 'in'; value: string | string[] }
interface GroupSummary {
  id: string; name: string; description: string | null;
  membership_type: 'static' | 'dynamic'; rule: GroupRule | null;
  member_count: number; roles: { id: string; name: string }[];
}
interface GroupMember { user_id: string; user_name: string; user_email: string; source: 'manual' | 'rule'; added_at: string }
interface GroupDetail extends Omit<GroupSummary, 'roles'> {
  members: GroupMember[];
  roles: { id: string; name: string; description: string | null }[];
}
interface AvailableRole { id: string; name: string; description: string | null }

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OndiGroups: React.FC = () => {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [detail, setDetail] = useState<Record<string, GroupDetail>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const staffCache = useRef<PickerItem[] | null>(null);
  const [knownRoles, setKnownRoles] = useState<string[]>([]);

  // Create-group form
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [membershipType, setMembershipType] = useState<'static' | 'dynamic'>('static');
  const [ruleAttribute, setRuleAttribute] = useState<'role' | 'active'>('role');
  const [ruleValue, setRuleValue] = useState('');
  const [creating, setCreating] = useState(false);

  // Per-group add-member / attach-role pickers
  const [memberPick, setMemberPick] = useState<Record<string, PickerItem | null>>({});
  const [rolePick, setRolePick] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try { setGroups(await apiFetch('/v1/ondi/org/groups')); } catch { setGroups([]); }
    try { setAvailableRoles(await apiFetch('/v1/ondi/org/roles/available')); } catch { setAvailableRoles([]); }
    try {
      const users = await apiFetch('/v1/ondi/users');
      staffCache.current = users.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
      const roleSet: string[] = [...new Set<string>(users.map((u: any) => u.role as string))].sort();
      setKnownRoles(roleSet);
    } catch { staffCache.current = []; }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const searchStaff = useCallback(async (query: string): Promise<PickerItem[]> => {
    const q = query.trim().toLowerCase();
    const all = staffCache.current ?? [];
    return q ? all.filter(u => u.label.toLowerCase().includes(q) || u.sublabel?.toLowerCase().includes(q)) : all;
  }, []);

  function resetForm() { setName(''); setDescription(''); setMembershipType('static'); setRuleAttribute('role'); setRuleValue(''); }

  async function createGroup() {
    if (!name.trim()) { showAlert('A group name is required.'); return; }
    if (membershipType === 'dynamic' && !ruleValue) { showAlert('Pick a value for the rule.'); return; }
    setCreating(true);
    try {
      await apiFetch('/v1/ondi/org/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), description: description.trim() || undefined, membership_type: membershipType,
          ...(membershipType === 'dynamic' ? { rule: { attribute: ruleAttribute, operator: 'equals', value: ruleAttribute === 'active' ? ruleValue : ruleValue } } : {}),
        }),
      });
      resetForm(); setShowNew(false);
      await reload();
    } catch (err: any) { showAlert(err.message); } finally { setCreating(false); }
  }

  async function deleteGroup(g: GroupSummary) {
    if (!(await showConfirm(`Delete "${g.name}"? Anyone who holds a role only because of this group loses it.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/ondi/org/groups/${g.id}`, { method: 'DELETE' }); if (expandedId === g.id) setExpandedId(null); await reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function toggleExpand(g: GroupSummary) {
    if (expandedId === g.id) { setExpandedId(null); return; }
    setExpandedId(g.id);
    if (!detail[g.id]) {
      try { const d = await apiFetch(`/v1/ondi/org/groups/${g.id}`); setDetail(prev => ({ ...prev, [g.id]: d })); }
      catch (err: any) { showAlert(err.message); }
    }
  }

  async function refreshDetail(groupId: string) {
    try { setDetail(prev => ({ ...prev, [groupId]: prev[groupId] ? { ...prev[groupId] } : prev[groupId] })); } catch { /* noop */ }
    try {
      const [d, list] = await Promise.all([apiFetch(`/v1/ondi/org/groups/${groupId}`), apiFetch('/v1/ondi/org/groups')]);
      setDetail(prev => ({ ...prev, [groupId]: d }));
      setGroups(list);
    } catch { /* keep stale view rather than clearing it */ }
  }

  async function addMember(groupId: string) {
    const picked = memberPick[groupId];
    if (!picked) { showAlert('Pick a colleague first.'); return; }
    try {
      await apiFetch(`/v1/ondi/org/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ user_id: picked.id }) });
      setMemberPick(prev => ({ ...prev, [groupId]: null }));
      await refreshDetail(groupId);
    } catch (err: any) { showAlert(err.message); }
  }

  async function removeMember(groupId: string, userId: string) {
    try { await apiFetch(`/v1/ondi/org/groups/${groupId}/members/${userId}`, { method: 'DELETE' }); await refreshDetail(groupId); }
    catch (err: any) { showAlert(err.message); }
  }

  async function attachRole(groupId: string) {
    const roleId = rolePick[groupId];
    if (!roleId) { showAlert('Pick a role first.'); return; }
    try {
      await apiFetch(`/v1/ondi/org/groups/${groupId}/roles`, { method: 'POST', body: JSON.stringify({ role_id: roleId }) });
      setRolePick(prev => ({ ...prev, [groupId]: '' }));
      await refreshDetail(groupId);
    } catch (err: any) { showAlert(err.message); }
  }

  async function detachRole(groupId: string, roleId: string) {
    try { await apiFetch(`/v1/ondi/org/groups/${groupId}/roles/${roleId}`, { method: 'DELETE' }); await refreshDetail(groupId); }
    catch (err: any) { showAlert(err.message); }
  }

  async function recalculate(groupId: string) {
    setRecalculating(groupId);
    try {
      const res = await apiFetch(`/v1/ondi/org/groups/${groupId}/recalculate`, { method: 'POST' });
      await refreshDetail(groupId);
      showAlert(`Membership recalculated — ${res.member_count} member${res.member_count === 1 ? '' : 's'} now match.`, { variant: 'success', title: 'Recalculated' });
    } catch (err: any) { showAlert(err.message); } finally { setRecalculating(null); }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Org"
        titleEm="groups"
        subtitle="Bulk-manage role access by group instead of one person at a time — static membership, or a live rule."
        actions={!showNew ? (
          <button type="button" onClick={() => { setShowNew(true); resetForm(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            <Icon name="plus" size={15} /> New group
          </button>
        ) : undefined}
      />

      {showNew && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="New group">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nairobi Managers" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Membership</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['static', 'dynamic'] as const).map(t => (
                    <div key={t} onClick={() => setMembershipType(t)}
                      style={{ flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1.5px solid ${membershipType === t ? 'var(--teal)' : 'var(--border)'}`, background: membershipType === t ? 'var(--teal-l)' : 'var(--white)', color: membershipType === t ? 'var(--teal)' : 'var(--ink2)' }}>
                      {t === 'static' ? 'Static — I add people' : 'Dynamic — a rule decides'}
                    </div>
                  ))}
                </div>
              </div>
              {membershipType === 'dynamic' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Everyone where…</label>
                    <Select value={ruleAttribute} onValueChange={v => { setRuleAttribute(v as 'role' | 'active'); setRuleValue(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="role">Account role</SelectItem>
                        <SelectItem value="active">Active status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>equals</label>
                    {ruleAttribute === 'role' ? (
                      <Select value={ruleValue} onValueChange={setRuleValue}>
                        <SelectTrigger><SelectValue placeholder="Pick a role…" /></SelectTrigger>
                        <SelectContent>
                          {knownRoles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={ruleValue} onValueChange={setRuleValue}>
                        <SelectTrigger><SelectValue placeholder="Pick a status…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" disabled={creating} onClick={createGroup}
                  style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', opacity: creating ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
                  {creating ? 'Creating…' : 'Create group'}
                </button>
                <button type="button" onClick={() => { setShowNew(false); resetForm(); }}
                  style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
                  Cancel
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard padded={false}>
        {groups === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {groups?.length === 0 && !showNew && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>No groups yet — create one above.</div>}
        {groups?.map((g, i, arr) => {
          const open = expandedId === g.id;
          const d = detail[g.id];
          return (
            <div key={g.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div onClick={() => toggleExpand(g)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer' }}>
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} color="var(--ink3)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {g.name}
                    <Badge variant={g.membership_type === 'dynamic' ? 'brand' : 'gray'}>{g.membership_type === 'dynamic' ? 'Dynamic' : 'Static'}</Badge>
                  </div>
                  {g.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{g.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 280 }}>
                  {g.roles.map(r => <Badge key={r.id} variant="info">{r.name}</Badge>)}
                  {g.roles.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink4)' }}>No roles attached</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink3)', minWidth: 70, textAlign: 'right' }}>{g.member_count} member{g.member_count === 1 ? '' : 's'}</span>
                <button type="button" onClick={e => { e.stopPropagation(); deleteGroup(g); }} title="Delete group"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                  <Icon name="trash2" size={15} />
                </button>
              </div>

              {open && (
                <div style={{ padding: '0 20px 18px 46px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {!d ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading…</div>
                  ) : (
                    <>
                      {g.membership_type === 'dynamic' && g.rule && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                          <Icon name="zap" size={14} color="var(--teal)" />
                          <span style={{ color: 'var(--ink)' }}>
                            Rule: <strong>{g.rule.attribute === 'active' ? 'Active status' : 'Account role'}</strong> equals{' '}
                            <strong>{g.rule.attribute === 'active' ? (g.rule.value === 'true' ? 'Active' : 'Inactive') : String(g.rule.value)}</strong>
                          </span>
                          <button type="button" disabled={recalculating === g.id} onClick={() => recalculate(g.id)}
                            style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', background: 'var(--white)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                            {recalculating === g.id ? 'Recalculating…' : 'Recalculate now'}
                          </button>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Roles this group grants</div>
                        {d.roles.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>No roles attached — members get no extra access yet.</div>}
                        {d.roles.map(r => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{r.name}{r.description ? <span style={{ color: 'var(--ink3)' }}> · {r.description}</span> : null}</div>
                            <button type="button" onClick={() => detachRole(g.id, r.id)}
                              style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--red)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
                              Detach
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <div style={{ flex: 1 }}>
                            <Select value={rolePick[g.id] ?? ''} onValueChange={v => setRolePick(prev => ({ ...prev, [g.id]: v }))}>
                              <SelectTrigger><SelectValue placeholder="Attach a role…" /></SelectTrigger>
                              <SelectContent>
                                {availableRoles.filter(r => !d.roles.some(dr => dr.id === r.id)).map(r => (
                                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <button type="button" onClick={() => attachRole(g.id)}
                            style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer' }}>
                            Attach
                          </button>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Members ({d.members.length})</div>
                        {d.members.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Nobody in this group yet.</div>}
                        {d.members.map(m => (
                          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                            <PersonAvatar userId={m.user_id} name={m.user_name} size={26} />
                            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>{m.user_name} <span style={{ color: 'var(--ink3)' }}>· {m.user_email}</span></div>
                            <Badge variant={m.source === 'rule' ? 'brand' : 'gray'}>{m.source === 'rule' ? 'via rule' : 'manual'}</Badge>
                            <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{fmtDate(m.added_at)}</span>
                            <button type="button" onClick={() => removeMember(g.id, m.user_id)} title="Remove"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                              <Icon name="x" size={13} />
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <div style={{ flex: 1 }}>
                            <EntityPicker value={memberPick[g.id] ?? null} onChange={p => setMemberPick(prev => ({ ...prev, [g.id]: p }))} search={searchStaff} placeholder="Add a colleague…" />
                          </div>
                          <button type="button" onClick={() => addMember(g.id)}
                            style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer' }}>
                            Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
};

export default OndiGroups;
