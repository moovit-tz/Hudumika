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

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' };
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
          ...(membershipType === 'dynamic' ? { rule: { attribute: ruleAttribute, operator: 'equals', value: ruleValue } } : {}),
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
    try {
      const [d, list] = await Promise.all([apiFetch(`/v1/ondi/org/groups/${groupId}`), apiFetch('/v1/ondi/org/groups')]);
      setDetail(prev => ({ ...prev, [groupId]: d }));
      setGroups(list);
    } catch { /* keep existing */ }
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

  const dynamicCount = groups ? groups.filter(g => g.membership_type === 'dynamic').length : 0;
  const staticCount = groups ? groups.filter(g => g.membership_type === 'static').length : 0;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['NexusHR', 'Groups']}
        titlePlain="Org"
        titleEm="groups"
        subtitle="Bulk-manage role access by group — static member assignments or dynamic rule-based evaluators."
        actions={!showNew ? (
          <button type="button" onClick={() => { setShowNew(true); resetForm(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
            <Icon name="plus" size={15} /> New Group
          </button>
        ) : undefined}
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Groups</span>
            <div className="ondi-kpi-icon-box"><Icon name="users" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{groups ? groups.length : 0}</span>
            <span className="ondi-kpi-sub">org groups</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Dynamic Rules</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfeff', color: 'var(--teal)' }}><Icon name="zap" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--teal)' }}>{dynamicCount}</span>
            <span className="ondi-kpi-sub">auto-evaluated</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Static Groups</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#f1f5f9', color: '#475569' }}><Icon name="userCheck" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#475569' }}>{staticCount}</span>
            <span className="ondi-kpi-sub">manual members</span>
          </div>
        </div>
      </div>

      {showNew && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="Create New Group">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Group Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nairobi Engineering Managers" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Membership Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['static', 'dynamic'] as const).map(t => (
                    <div key={t} onClick={() => setMembershipType(t)}
                      style={{ flex: 1, textAlign: 'center', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: `2px solid ${membershipType === t ? 'var(--teal)' : 'var(--border)'}`, background: membershipType === t ? 'var(--teal-l, #ecfeff)' : 'var(--white)', color: membershipType === t ? 'var(--teal)' : 'var(--ink2)', transition: 'all 0.15s ease' }}>
                      {t === 'static' ? 'Static (Manual List)' : 'Dynamic (Rule Evaluator)'}
                    </div>
                  ))}
                </div>
              </div>
              {membershipType === 'dynamic' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Evaluate where…</label>
                    <Select value={ruleAttribute} onValueChange={v => { setRuleAttribute(v as 'role' | 'active'); setRuleValue(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="role">Account Role</SelectItem>
                        <SelectItem value="active">Active Status</SelectItem>
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
                        <SelectTrigger><SelectValue placeholder="Pick status…" /></SelectTrigger>
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
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.6 : 1, boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
                  {creating ? 'Creating…' : 'Create Group'}
                </button>
                <button type="button" onClick={() => { setShowNew(false); resetForm(); }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard padded={false}>
        {groups === null && <div style={{ padding: 24, fontSize: 13, color: 'var(--ink3)' }}>Loading groups…</div>}
        {groups?.length === 0 && !showNew && <div style={{ padding: 36, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No groups defined yet — create one above.</div>}
        {groups?.map((g, i, arr) => {
          const open = expandedId === g.id;
          const d = detail[g.id];
          return (
            <div key={g.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div onClick={() => toggleExpand(g)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', background: open ? 'rgba(0, 181, 137, 0.02)' : 'transparent', transition: 'background 0.15s ease' }}>
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} color="var(--ink3)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {g.name}
                    <span className={`ondi-status-pill ${g.membership_type === 'dynamic' ? 'success' : 'gray'}`}>
                      {g.membership_type === 'dynamic' ? '⚡ Dynamic Rule' : 'Static'}
                    </span>
                  </div>
                  {g.description && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{g.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 280 }}>
                  {g.roles.map(r => <span key={r.id} className="ondi-perm-chip">{r.name}</span>)}
                  {g.roles.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink4)' }}>No roles granted</span>}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', minWidth: 80, textAlign: 'right' }}>{g.member_count} member{g.member_count === 1 ? '' : 's'}</span>
                <button type="button" onClick={e => { e.stopPropagation(); deleteGroup(g); }} title="Delete group"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}>
                  <Icon name="trash" size={15} />
                </button>
              </div>

              {open && (
                <div style={{ padding: '0 20px 20px 50px', display: 'flex', flexDirection: 'column', gap: 18, borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
                  {!d ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading details…</div>
                  ) : (
                    <>
                      {g.membership_type === 'dynamic' && g.rule && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ecfeff', border: '1px solid var(--teal)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
                          <Icon name="zap" size={15} color="var(--teal)" />
                          <span style={{ color: 'var(--ink)' }}>
                            Rule: <strong>{g.rule.attribute === 'active' ? 'Active status' : 'Account role'}</strong> equals{' '}
                            <strong>{g.rule.attribute === 'active' ? (g.rule.value === 'true' ? 'Active' : 'Inactive') : String(g.rule.value)}</strong>
                          </span>
                          <button type="button" disabled={recalculating === g.id} onClick={() => recalculate(g.id)}
                            style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
                            {recalculating === g.id ? 'Recalculating…' : 'Recalculate Now'}
                          </button>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Granted Roles</div>
                        {d.roles.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>No roles attached — group members receive no extra permissions yet.</div>}
                        {d.roles.map(r => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                            <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{r.name}{r.description ? <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> · {r.description}</span> : null}</div>
                            <button type="button" onClick={() => detachRole(g.id, r.id)}
                              style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                              Detach
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <div style={{ flex: 1 }}>
                            <Select value={rolePick[g.id] ?? ''} onValueChange={v => setRolePick(prev => ({ ...prev, [g.id]: v }))}>
                              <SelectTrigger><SelectValue placeholder="Attach a role to group…" /></SelectTrigger>
                              <SelectContent>
                                {availableRoles.filter(r => !d.roles.some(dr => dr.id === r.id)).map(r => (
                                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <button type="button" onClick={() => attachRole(g.id)}
                            style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 8, padding: '0 16px', cursor: 'pointer' }}>
                            Attach
                          </button>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Group Members ({d.members.length})</div>
                        {d.members.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>No members assigned to group.</div>}
                        {d.members.map(m => (
                          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-soft)' }}>
                            <PersonAvatar userId={m.user_id} name={m.user_name} size={28} />
                            <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{m.user_name} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· {m.user_email}</span></div>
                            <span className={`ondi-status-pill ${m.source === 'rule' ? 'success' : 'gray'}`}>
                              {m.source === 'rule' ? 'Rule Match' : 'Manual'}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{fmtDate(m.added_at)}</span>
                            <button type="button" onClick={() => removeMember(g.id, m.user_id)} title="Remove"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <div style={{ flex: 1 }}>
                            <EntityPicker value={memberPick[g.id] ?? null} onChange={p => setMemberPick(prev => ({ ...prev, [g.id]: p }))} search={searchStaff} placeholder="Add colleague to group…" />
                          </div>
                          <button type="button" onClick={() => addMember(g.id)}
                            style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'var(--ink)', border: 'none', borderRadius: 8, padding: '0 16px', cursor: 'pointer' }}>
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
