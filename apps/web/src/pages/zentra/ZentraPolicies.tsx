import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Banner } from '../../components/ui/alert.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showConfirm } from '../../lib/confirm.js';
import { useAuth } from '../../hooks/useAuth.js';
import './Zentra.css';

interface CheckResult {
  allowed: boolean;
  reason: string;
  policy_id?: string;
  simulated: true;
  basis: 'record' | 'supplied_fields';
  record: { owner_id?: string | null; assigned_to_user_id?: string | null; amount?: number | null } | null;
}
interface Policy {
  id: string; name: string; description: string | null; resource_type: string; action: string;
  subject_type: 'role' | 'user' | 'team' | 'service'; subject_id: string; effect: 'allow' | 'deny';
  condition_type: string; condition_value: Record<string, unknown>; enabled: boolean;
}

const ROLES = ['JUNIOR', 'SENIOR', 'SALES', 'FINANCE', 'MANAGER', 'ADMIN'];
const TYPES = [
  { value: 'shipment', label: 'Shipment (looked up)' }, { value: 'support_ticket', label: 'Support ticket (looked up)' },
  { value: 'invoice', label: 'Invoice (looked up)' }, { value: 'customer', label: 'Customer (looked up)' },
  { value: 'employee', label: 'Employee / salary (looked up)' }, { value: 'contact', label: 'Contact (exports only)' },
  { value: 'document', label: 'Other — use the details below' },
];
const CONDITIONS: Record<string, string> = {
  always: 'Always', owner_only: 'Only if they own the record', assigned_only: 'Only if assigned to them',
  team_only: 'Only within their department', classification_le: 'Up to a classification', amount_lt: 'Up to an amount',
};
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function ZentraPolicies() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role as string);

  // ── Simulator ──
  const [asRole, setAsRole] = useState('JUNIOR');
  const [asUserId, setAsUserId] = useState('');
  const [action, setAction] = useState('read');
  const [resourceType, setResourceType] = useState('shipment');
  const [resourceId, setResourceId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [classification, setClassification] = useState('internal');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const lookedUp = resourceType !== 'document';

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true); setCheckError(null); setResult(null);
    try {
      setResult(await apiFetch('/v1/zentra/auth/check', {
        method: 'POST',
        body: JSON.stringify({
          action, resource_type: resourceType, resource_id: resourceId.trim() || 'example',
          as_role: asRole, as_user_id: asUserId.trim() || undefined, classification,
          ...(lookedUp ? {} : { assigned_to_user_id: assignedTo.trim() || undefined }),
        }),
      }));
    } catch (err: any) {
      setCheckError(err?.message || 'Could not run the check.');
    } finally { setChecking(false); }
  }

  // ── Policies ──
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [draft, setDraft] = useState<Partial<Policy> & { amount?: string; level?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const load = () => apiFetch('/v1/zentra/policies').then(setPolicies).catch((e: any) => setPolicyError(e?.message || 'Could not load policies.'));
  useEffect(() => { load(); }, []);
  // "Team" policies mean a department (users.department_id).
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => { apiFetch('/v1/hr/departments').then((r: any) => setDepartments((Array.isArray(r) ? r : r?.departments ?? r?.data ?? []).map((d: any) => ({ id: d.id, name: d.name })))).catch(() => setDepartments([])); }, []);

  async function savePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true); setPolicyError(null);
    try {
      const condition_value = draft.condition_type === 'amount_lt' ? { max: Number(draft.amount) || 0 }
        : draft.condition_type === 'classification_le' ? { max: draft.level ?? 'internal' } : {};
      await apiFetch('/v1/zentra/policies', {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name, description: draft.description || undefined, resource_type: draft.resource_type, action: draft.action,
          subject_type: draft.subject_type ?? 'role', subject_id: draft.subject_id, effect: draft.effect ?? 'deny',
          condition_type: draft.condition_type ?? 'always', condition_value,
        }),
      });
      setDraft(null); load();
    } catch (err: any) { setPolicyError(err?.message || 'Could not save the policy.'); } finally { setSaving(false); }
  }
  async function remove(p: Policy) {
    if (!(await showConfirm(`Delete the policy "${p.name}"?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/zentra/policies/${p.id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { setPolicyError(err?.message || 'Could not delete the policy.'); }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Access Policies' }]}
        titlePlain="Access"
        titleEm="Policies"
        subtitle="Record-level rules, and a simulator to see how they decide"
      />

      <Banner variant="info" title="Where these rules apply">
        Read rules hide matching shipments, customers, invoices, support tickets and employees from lists, global search
        and opening them. Search rules apply to global search. Export rules block downloads of those records, salary bank
        files, timesheets, VAT returns and contacts. An Allow is an exception to a Deny for the same person (for example,
        deny Juniors all invoices and allow them the ones assigned to them). A department rule covers its members, and
        "within their department" means the record's assignee (or owner) is in the same department. Rules only narrow
        what each app already permits; they never grant more.
      </Banner>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="lock" size={16} />
            <h2 className="text-sm font-bold text-foreground">Policy simulator</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick a real record and a role. For shipments, tickets, invoices and customers the record's actual owner and assignee are
            looked up — what you type can't change them.
          </p>
          <form onSubmit={handleEvaluate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Test as role"><Pick value={asRole} onChange={setAsRole} options={ROLES.map(r => ({ value: r, label: r.charAt(0) + r.slice(1).toLowerCase() }))} /></Field>
              <Field label="Test as user ID (optional)"><Input value={asUserId} onChange={e => setAsUserId(e.target.value)} placeholder="A user's ID, to test ownership" /></Field>
              <Field label="Action"><Pick value={action} onChange={setAction} options={['read', 'search', 'update', 'export', 'approve', 'delete'].map(a => ({ value: a, label: a }))} /></Field>
              <Field label="Record type"><Pick value={resourceType} onChange={setResourceType} options={TYPES} /></Field>
              <Field label="Record ID"><Input value={resourceId} onChange={e => setResourceId(e.target.value)} placeholder="Paste the record's ID" /></Field>
              <Field label="Classification"><Pick value={classification} onChange={setClassification} options={['public', 'internal', 'confidential', 'restricted'].map(c => ({ value: c, label: c }))} /></Field>
              {!lookedUp && <Field label="Assigned to (user ID)"><Input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} /></Field>}
            </div>
            <Button type="submit" size="sm" loading={checking} className="w-full">Check decision</Button>
          </form>
          {checkError && <Banner variant="error">{checkError}</Banner>}
          {result && (
            <Banner variant={result.allowed ? 'success' : 'error'} title={result.allowed ? 'Allowed' : 'Denied'}>
              <div className="space-y-1">
                <div>{result.reason}</div>
                <div className="text-xs opacity-80">
                  {result.basis === 'record'
                    ? `Decided on the real record (assigned to ${result.record?.assigned_to_user_id ?? 'nobody'}${result.record?.owner_id ? `, owned by ${result.record.owner_id}` : ''}).`
                    : 'Decided on the details typed above — this record type is not looked up.'} Simulation only.
                </div>
              </div>
            </Banner>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">Policies ({policies?.length ?? 0})</h2>
            {isAdmin && !draft && <Button size="sm" variant="outline" onClick={() => setDraft({ subject_type: 'role', effect: 'deny', condition_type: 'always', resource_type: 'shipment', action: 'read' })}><Icon name="plus" size={14} /> Add policy</Button>}
          </div>
          {policyError && <Banner variant="error" onDismiss={() => setPolicyError(null)}>{policyError}</Banner>}
          {draft && (
            <form onSubmit={savePolicy} className="space-y-3 rounded-md border border-border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Name"><Input required value={draft.name ?? ''} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Juniors: own shipments only" /></Field>
                <Field label="Effect"><Pick value={draft.effect ?? 'deny'} onChange={v => setDraft({ ...draft, effect: v as Policy['effect'] })} options={[{ value: 'deny', label: 'Deny' }, { value: 'allow', label: 'Allow' }]} /></Field>
                <Field label="Applies to"><Pick value={draft.subject_type ?? 'role'} onChange={v => setDraft({ ...draft, subject_type: v as Policy['subject_type'] })} options={[{ value: 'role', label: 'A role' }, { value: 'user', label: 'One user (ID)' }, { value: 'team', label: 'A department' }]} /></Field>
                {draft.subject_type === 'role'
                  ? <Field label="Role"><Pick value={draft.subject_id ?? 'JUNIOR'} onChange={v => setDraft({ ...draft, subject_id: v })} options={ROLES.map(r => ({ value: r, label: r }))} /></Field>
                  : draft.subject_type === 'team'
                  ? <Field label="Department">{departments.length
                      ? <Pick value={draft.subject_id ?? ''} onChange={v => setDraft({ ...draft, subject_id: v })} options={departments.map(d => ({ value: d.id, label: d.name }))} />
                      : <span className="text-xs text-muted-foreground">No departments yet. Add them in Axis.</span>}</Field>
                  : <Field label="ID"><Input required value={draft.subject_id ?? ''} onChange={e => setDraft({ ...draft, subject_id: e.target.value })} /></Field>}
                <Field label="Record type"><Pick value={draft.resource_type ?? 'shipment'} onChange={v => setDraft({ ...draft, resource_type: v })} options={TYPES.map(t => ({ value: t.value, label: t.value }))} /></Field>
                <Field label="Action"><Pick value={draft.action ?? 'read'} onChange={v => setDraft({ ...draft, action: v })} options={['read', 'search', 'update', 'export', 'approve', 'delete'].map(a => ({ value: a, label: a }))} /></Field>
                <Field label="Condition"><Pick value={draft.condition_type ?? 'always'} onChange={v => setDraft({ ...draft, condition_type: v })} options={Object.entries(CONDITIONS).map(([value, label]) => ({ value, label }))} /></Field>
                {draft.condition_type === 'amount_lt' && <Field label="Maximum amount"><Input inputMode="decimal" value={draft.amount ?? ''} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></Field>}
                {draft.condition_type === 'classification_le' && <Field label="Up to"><Pick value={draft.level ?? 'internal'} onChange={v => setDraft({ ...draft, level: v })} options={['public', 'internal', 'confidential', 'restricted'].map(c => ({ value: c, label: c }))} /></Field>}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                <Button type="submit" size="sm" loading={saving}>Save policy</Button>
              </div>
            </form>
          )}
          {!policies?.length ? (
            <p className="text-xs text-muted-foreground">No custom policies. The built-in rules apply: admins and managers see everything in the workspace; Juniors see only records they own or are assigned; exports, approvals and deletes need an explicit allow.</p>
          ) : (
            <ul className="space-y-2">
              {policies.map(p => (
                <li key={p.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-xs">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={p.effect === 'deny' ? 'error' : 'success'}>{p.effect}</Badge>
                      <strong className="text-foreground">{p.name}</strong>
                      {!p.enabled && <Badge variant="gray">Off</Badge>}
                    </div>
                    <div className="text-muted-foreground">
                      {p.subject_type === 'team' ? `department ${departments.find(d => d.id === p.subject_id)?.name ?? p.subject_id}` : `${p.subject_type} ${p.subject_id}`} · {p.action} on {p.resource_type} · {CONDITIONS[p.condition_type] ?? p.condition_type}
                    </div>
                  </div>
                  {isAdmin && <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}><Icon name="trash" size={14} /></Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
