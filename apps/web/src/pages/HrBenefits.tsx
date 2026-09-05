import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

/**
 * Benefits administration — confirmed entirely absent in the audit (no
 * health insurance or retirement-plan enrollment tracking anywhere).
 * Everyone sees "Your benefits" (real self-service, same MyHub precedent
 * as payslips/leave balances); management additionally sees plan
 * authoring and the full enrollment roster.
 */

const MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
const TYPE_LABEL: Record<string, string> = { health: 'Health', retirement: 'Retirement', life: 'Life insurance', other: 'Other' };
const TYPE_BADGE: Record<string, 'info' | 'success' | 'gray' | 'warning'> = { health: 'info', retirement: 'success', life: 'warning', other: 'gray' };

interface Plan { id: string; name: string; type: string; provider: string | null; description: string | null; employee_cost: string; employer_cost: string; currency: string }
interface MyEnrollment { id: string; plan_id: string; status: string; dependents: number; plan_name: string; plan_type: string; provider: string | null; employee_cost: string; currency: string }
interface Enrollment { id: string; employee_id: string; employee_name: string; plan_id: string; plan_name: string; plan_type: string; status: string; dependents: number; enrolled_at: string }

export function HrBenefits() {
  const { user } = useAuth();
  const canManage = !!user && MGMT_ROLES.includes(user.role);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<MyEnrollment[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/hr/benefits/plans').catch(() => []),
      apiFetch('/v1/hr/benefits/my-enrollments').catch(() => []),
      canManage ? apiFetch('/v1/hr/benefits/enrollments').catch(() => []) : Promise.resolve([]),
    ]).then(([p, mine, all]) => {
      setPlans(Array.isArray(p) ? p : []);
      setMyEnrollments(Array.isArray(mine) ? mine : []);
      setAllEnrollments(Array.isArray(all) ? all : []);
    }).finally(() => setLoading(false));
  }, [canManage]);
  useEffect(() => { load(); }, [load]);

  async function enroll(planId: string) {
    setBusy(planId);
    try {
      await apiFetch('/v1/hr/benefits/enrollments', { method: 'POST', body: JSON.stringify({ plan_id: planId }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not enroll in that plan.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(enrollmentId: string, status: string) {
    setBusy(enrollmentId);
    try {
      await apiFetch(`/v1/hr/benefits/enrollments/${enrollmentId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update that enrollment.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function deletePlan(plan: Plan) {
    const ok = await showConfirm(`Retire "${plan.name}"? Nobody will be able to newly enroll, but existing enrollment history is kept.`, { title: 'Retire plan?', confirmLabel: 'Retire plan' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/hr/benefits/plans/${plan.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not retire that plan.', { variant: 'error' });
    }
  }

  const myEnrollmentByPlan = new Map(myEnrollments.filter(e => e.status === 'enrolled').map(e => [e.plan_id, e]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['NexusHR', 'Benefits']}
        titlePlain="Benefits"
        titleEm="administration"
        subtitle="Health, retirement and other plans — real enrollment, not a static list."
        actions={canManage ? <Button onClick={() => setShowNewPlan(true)}><Icon name="plus" size={15} /> New plan</Button> : undefined}
      />

      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Your benefits</div>
        {loading ? (
          <SectionLoading />
        ) : plans.length === 0 ? (
          <SectionCard><div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>No benefit plans have been set up yet.</div></SectionCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {plans.map(p => {
              const mine = myEnrollmentByPlan.get(p.id);
              return (
                <SectionCard key={p.id}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                        {p.provider && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{p.provider}</div>}
                      </div>
                      <Badge variant={TYPE_BADGE[p.type]}>{TYPE_LABEL[p.type]}</Badge>
                    </div>
                    {p.description && <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 8 }}>{p.description}</div>}
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
                      Your cost: {p.currency} {Number(p.employee_cost).toLocaleString()}/mo
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {mine ? (
                        <Button size="sm" variant="outline" disabled={busy === mine.id} onClick={() => setStatus(mine.id, 'waived')}>
                          <Icon name="checkCircle" size={13} /> Enrolled — waive
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busy === p.id} onClick={() => enroll(p.id)}>Enroll</Button>
                      )}
                      {canManage && (
                        <button type="button" onClick={() => deletePlan(p)} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, cursor: 'pointer' }}>Retire</button>
                      )}
                    </div>
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}
      </div>

      {canManage && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>All enrollments</div>
          <SectionCard padded={false}>
            {allEnrollments.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>Nobody is enrolled in a plan yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                      {['Employee', 'Plan', 'Status', 'Dependents', 'Since'].map(h => (
                        <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allEnrollments.map(e => (
                      <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PersonAvatar userId={e.employee_id} name={e.employee_name} size={26} />
                            {e.employee_name}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{e.plan_name}</td>
                        <td style={{ padding: '12px 14px' }}><Badge variant={e.status === 'enrolled' ? 'success' : e.status === 'terminated' ? 'error' : 'gray'}>{e.status}</Badge></td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{e.dependents}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{new Date(e.enrolled_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {showNewPlan && <NewPlanModal onClose={() => setShowNewPlan(false)} onCreated={load} />}
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', borderRadius: 12, padding: 24, width: 480, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--elev-lg)' };

function NewPlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('health');
  const [provider, setProvider] = useState('');
  const [description, setDescription] = useState('');
  const [employeeCost, setEmployeeCost] = useState('0');
  const [employerCost, setEmployerCost] = useState('0');
  const [currency, setCurrency] = useState('TZS');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Plan name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/hr/benefits/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), type, provider: provider.trim() || undefined, description: description.trim() || undefined,
          employee_cost: Number(employeeCost) || 0, employer_cost: Number(employerCost) || 0, currency,
        }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not create that plan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={cardStyle} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>New benefit plan</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Plan name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="AAR Silver Health Cover" required />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="retirement">Retirement</SelectItem>
                <SelectItem value="life">Life insurance</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Provider (optional)</label>
            <Input value={provider} onChange={e => setProvider(e.target.value)} placeholder="AAR Insurance" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Description (optional)</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Employee cost / mo</label>
              <Input type="number" min={0} value={employeeCost} onChange={e => setEmployeeCost(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Employer cost / mo</label>
              <Input type="number" min={0} value={employerCost} onChange={e => setEmployerCost(e.target.value)} />
            </div>
            <div style={{ width: 90 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Currency</label>
              <Input value={currency} onChange={e => setCurrency(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create plan'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default HrBenefits;
