import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FINANCE_INDUSTRIES, type FinanceCapabilityKey, type FinanceIndustryKey, type IndustryWork, type IndustryWorkLine, type IndustryProductionRecipe } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Icon } from '../components/Icon.js';
import './FinanceIndustries.css';

const experiences: Record<FinanceIndustryKey, { title: string; noun: string; description: string; sections: string[]; kinds: IndustryWorkLine['kind'][]; fields: string[]; tools: { label: string; path: string; description: string }[] }> = {
  retail: { title: 'Retail counter', noun: 'Sale request', description: 'Serve customers, reconcile takings and manage stock.', sections: ['Customer requests', 'Counter tools'], kinds: ['service', 'material', 'expense'], fields: ['Collection point'], tools: [
    { label: 'Open till', path: '/finance/pos', description: 'Sales, shifts and payment capture.' }, { label: 'Stock catalogue', path: '/finance/products', description: 'Products and selling prices.' }, { label: 'Receipts', path: '/finance/payments', description: 'Review collections and settlement.' }] },
  wholesale: { title: 'Wholesale orders', noun: 'Trade order', description: 'Track bulk orders, commercial terms and customer billing.', sections: ['Order book', 'Trade desk'], kinds: ['material', 'service', 'expense'], fields: ['Delivery address', 'Trade terms', 'Purchase order reference'], tools: [
    { label: 'Quotes', path: '/finance/quotations', description: 'Prepare bulk pricing for customers.' }, { label: 'Purchasing', path: '/finance/purchase-orders', description: 'Restock from approved suppliers.' }, { label: 'Delivery records', path: '/finance/delivery-documents', description: 'Review goods handed over.' }] },
  manufacturing: { title: 'Production jobs', noun: 'Production job', description: 'Plan job requirements and compare quoted value with estimated costs.', sections: ['Production register', 'Supply planning'], kinds: ['material', 'time', 'expense', 'service'], fields: ['Output specification', 'Target quantity', 'Quality requirements'], tools: [
    { label: 'Material catalogue', path: '/finance/products', description: 'Review inputs and finished products.' }, { label: 'Purchase orders', path: '/finance/purchase-orders', description: 'Plan supplier requirements.' }, { label: 'Cost ledger', path: '/finance/accounts/ledger', description: 'Review posted accounting costs.' }] },
  warehousing: { title: 'Warehouse services', noun: 'Handling job', description: 'Track customer storage and handling charges alongside delivery records.', sections: ['Handling queue', 'Warehouse desk'], kinds: ['service', 'time', 'expense'], fields: ['Warehouse', 'Storage period', 'Handling instructions'], tools: [
    { label: 'Delivery records', path: '/finance/delivery-documents', description: 'Review inbound and outbound documents.' }, { label: 'Stock catalogue', path: '/finance/products', description: 'Review stocked products.' }, { label: 'Customer billing', path: '/finance/invoices', description: 'Storage and handling invoices.' }] },
  professional_services: { title: 'Client engagements', noun: 'Engagement', description: 'Approve time, bill delivered services and track engagement estimates.', sections: ['Engagements', 'Practice desk'], kinds: ['time', 'service', 'expense'], fields: ['Scope', 'Lead professional'], tools: [
    { label: 'Service quotes', path: '/finance/quotations', description: 'Agree the scope and fees.' }, { label: 'Expenses', path: '/finance/expenses', description: 'Record actual operating expenses.' }, { label: 'Client invoices', path: '/finance/invoices', description: 'Review drafts and outstanding fees.' }] },
  consulting: { title: 'Consulting projects', noun: 'Project', description: 'Track milestones, effort and budget exposure before billing.', sections: ['Project portfolio', 'Delivery desk'], kinds: ['milestone', 'time', 'expense', 'service'], fields: ['Deliverables', 'Billing agreement', 'Project sponsor'], tools: [
    { label: 'Proposals', path: '/finance/quotations', description: 'Agree milestones and commercial scope.' }, { label: 'Budgets', path: '/finance/accounts/budgets', description: 'Manage account-level budgets.' }, { label: 'Invoices', path: '/finance/invoices', description: 'Review milestone billing.' }] },
  printing: { title: 'Print job tickets', noun: 'Print job', description: 'Keep job specifications, materials, finishing and customer billing together.', sections: ['Job tickets', 'Print desk'], kinds: ['material', 'time', 'service', 'expense'], fields: ['Paper and stock', 'Finished size', 'Colours', 'Finishing', 'Proof approval'], tools: [
    { label: 'Print quotes', path: '/finance/quotations', description: 'Prepare customer pricing.' }, { label: 'Material purchases', path: '/finance/purchase-orders', description: 'Order paper, ink and supplies.' }, { label: 'Delivery records', path: '/finance/delivery-documents', description: 'Review customer handover.' }] },
};
function Picker({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  if (!['Status', 'Currency', 'Type'].includes(label)) return <div className="industry-field"><Label>{label}</Label><Combobox options={options} value={value} onChange={onChange} placeholder={`Choose ${label.toLowerCase()}`} searchPlaceholder={`Search ${label.toLowerCase()}`} /></div>;
  return <div className="industry-field"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder={`Choose ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="industry-field"><span>{label}</span>{children}</label>; }
function money(amount: number | string | undefined, currency = 'TZS') { return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount ?? 0)); }
const writers = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'];

export function FinanceIndustries() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');
  const configuration = useFinanceConfiguration();
  const { data: capData, setEnabled } = useFinanceCapabilities();
  const [savingIndustries, setSavingIndustries] = useState(false);
  const [savingCap, setSavingCap] = useState<FinanceCapabilityKey | null>(null);
  const [message, setMessage] = useState('');

  const selectedIndustries = configuration.data?.industries ?? [];

  const recommendations = useMemo(() => new Set(
    configuration.data?.industryDefinitions
      .filter(ind => selectedIndustries.includes(ind.key))
      .flatMap(ind => ind.recommendedCapabilities) ?? []
  ), [configuration.data, selectedIndustries]);

  const recommendedCapabilities = useMemo(() =>
    capData?.capabilities.filter(item => item.status === 'available' && recommendations.has(item.key)) ?? [],
    [capData, recommendations]
  );

  async function toggleIndustry(key: FinanceIndustryKey, checked: boolean) {
    setSavingIndustries(true);
    setMessage('');
    const next = checked
      ? [...selectedIndustries, key]
      : selectedIndustries.filter(k => k !== key);
    try { await configuration.saveIndustries(next as FinanceIndustryKey[]); }
    catch (err: any) { setMessage(err.message ?? 'Unable to save the business profile.'); }
    finally { setSavingIndustries(false); }
  }

  async function enableCap(key: FinanceCapabilityKey) {
    setSavingCap(key);
    setMessage('');
    try { await setEnabled(key, true); }
    catch (err: any) { setMessage(err.message ?? 'Unable to enable capability.'); }
    finally { setSavingCap(null); }
  }

  return (
    <div className="industry-page">
      <PageHeader
        crumbs={['Finance', 'Industries']}
        titlePlain="Industry"
        titleEm="workspaces"
        subtitle="Open any workspace to create and manage work. Check the activities your business performs to configure your Finance workspace."
      />
      {message && <p role="alert" className="industry-hub-alert">{message}</p>}
      <div className="industry-hub-grid">
        {FINANCE_INDUSTRIES.map(industry => {
          const isSelected = selectedIndustries.includes(industry.key);
          const exp = experiences[industry.key];
          return (
            <Card key={industry.key} className={isSelected ? 'industry-hub-card--active' : ''}>
              <CardHeader>
                <div className="industry-hub-card-top">
                  <CardTitle>{industry.name}</CardTitle>
                  {canManage ? (
                    <label className="industry-hub-profile-toggle">
                      <Checkbox
                        checked={isSelected}
                        disabled={savingIndustries}
                        onCheckedChange={value => void toggleIndustry(industry.key, value === true)}
                      />
                      <span>Our business</span>
                    </label>
                  ) : isSelected ? (
                    <Badge variant="brand">Active</Badge>
                  ) : null}
                </div>
                <CardDescription>{exp.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="industry-tags">
                  {exp.fields.slice(0, 3).map(field => <Badge key={field} variant="gray">{field}</Badge>)}
                </div>
                <Button asChild>
                  <Link to={`/finance/industries/${industry.key}`}>Open workspace</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {selectedIndustries.length > 0 && capData && recommendedCapabilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended tools</CardTitle>
            <CardDescription>
              Capabilities that match the {selectedIndustries.length === 1 ? '1 activity' : `${selectedIndustries.length} activities`} you selected. Enable included ones now — nothing here creates an additional subscription.
            </CardDescription>
          </CardHeader>
          <CardContent className="industry-recommendation-list">
            {recommendedCapabilities.map(item => (
              <div className="industry-recommendation-row" key={item.key}>
                <span className="industry-recommendation-icon">
                  <Icon name={item.enabled ? 'checkCircle' : item.entitled ? 'settings' : 'lock'} size={18} />
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.enabled ? 'Ready to use' : item.entitled ? 'Included — enable now' : 'Requires Finance Advanced'}</small>
                </div>
                {item.enabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : item.entitled ? (
                  <Button size="sm" variant="outline" disabled={!canManage || savingCap === item.key} onClick={() => void enableCap(item.key)}>Enable</Button>
                ) : (
                  <Button size="sm" variant="ghost" asChild><Link to="/workspace/billing">View plans</Link></Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
export function FinanceIndustryWorkspace() {
  const { industry: key } = useParams(); const industry = key as FinanceIndustryKey; const config = experiences[industry];
  const { user } = useAuth(); const canWrite = writers.includes(user?.role ?? '');
  const [data, setData] = useState<{ items: IndustryWork[]; total: number }>({ items: [], total: 0 });
  const [page, setPage] = useState(1); const [status, setStatus] = useState('all'); const [search, setSearch] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!config) return; let live = true; setLoading(true); setError('');
    const timer = window.setTimeout(() => apiFetch(`/v1/finance/industries?industry=${industry}&page=${page}&search=${encodeURIComponent(search)}${status === 'all' ? '' : `&status=${status}`}`)
      .then(result => { if (live) setData(result); }).catch(err => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); }), 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [industry, page, status, search]);
  if (!config) return <p role="alert">Industry not found.</p>;
  return <div className={`industry-page industry-${industry}`}><PageHeader crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Industries', to: '/finance/industries' }, config.title]} title={config.title} subtitle={config.description} actions={canWrite && <Button asChild><Link to={`/finance/industries/${industry}/new`}>New {config.noun.toLowerCase()}</Link></Button>} />
    <div className="industry-workspace-grid"><Card className="industry-register"><CardHeader><CardTitle>{config.sections[0]}</CardTitle><CardDescription>{data.total} records · Customer-linked work and approved billing lines</CardDescription></CardHeader><CardContent>
      <div className="industry-toolbar"><SearchToolbar placeholder="Search work" search={search} onSearch={value => { setSearch(value); setPage(1); }} /><Picker label="Status" value={status} onChange={value => { setStatus(value); setPage(1); }} options={['all', 'draft', 'active', 'completed', 'cancelled'].map(value => ({ value, label: value === 'all' ? 'All statuses' : value }))} /></div>
      {error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading work…</p> : data.items.length ? <div className="industry-records">{data.items.map(work => <Link className="industry-record" key={work.id} to={`/finance/industries/${industry}/${work.id}`}><div><small>{work.reference}</small><strong>{work.name}</strong><span>{work.customer_name}</span></div><div><Badge variant="gray">{work.status}</Badge><small>Budget {money(work.budget, work.currency)}</small>{work.due_date && <small>Due {String(work.due_date).slice(0, 10)}</small>}</div></Link>)}</div> : <div className="industry-empty"><h3>No {config.noun.toLowerCase()}s yet</h3><p>Create customer work, add delivery or cost lines, then approve charges for billing.</p>{canWrite && <Button asChild><Link to={`/finance/industries/${industry}/new`}>Create {config.noun.toLowerCase()}</Link></Button>}</div>}
      <div className="industry-pagination"><span>Page {page} of {Math.max(1, Math.ceil(data.total / 20))}</span><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * 20 >= data.total || loading} onClick={() => setPage(page + 1)}>Next</Button></div>
    </CardContent></Card><aside><Card><CardHeader><CardTitle>{config.sections[1]}</CardTitle></CardHeader><CardContent className="industry-tools">{config.tools.map(tool => <Link key={tool.path} to={tool.path}><strong>{tool.label}</strong><span>{tool.description}</span></Link>)}</CardContent></Card><Card><CardHeader><CardTitle>Accounting controls</CardTitle></CardHeader><CardContent><p>Work estimates do not post costs to the ledger. Record actual costs through expenses, bills and stock movements.</p><p>Approved charges become invoice drafts. Review taxes before issue.</p></CardContent></Card></aside></div>
  </div>;
}
export function FinanceIndustryNew() {
  const { industry: key } = useParams(); const industry = key as FinanceIndustryKey; const config = experiences[industry]; const navigate = useNavigate();
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', customer_id: '', currency: 'TZS', budget: '', due_date: '' });
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  useEffect(() => { let live = true; apiFetch('/v1/customers').then(result => { if (live) setCustomers(result.data ?? []); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, []);
  if (!config) return <p role="alert">Industry not found.</p>;
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(''); try {
    const work = await apiFetch('/v1/finance/industries', { method: 'POST', body: JSON.stringify({ ...form, industry, budget: Number(form.budget || 0), due_date: form.due_date || undefined, specifications }) });
    navigate(`/finance/industries/${industry}/${work.id}`);
  } catch (err: any) { setError(err.message); } finally { setSaving(false); } }
  return <div className="industry-page"><PageHeader crumbs={['Finance', config.title]} title={`New ${config.noun.toLowerCase()}`} variant="create" backTo={`/finance/industries/${industry}`} subtitle="Set the customer, budget and job requirements." /><Card><CardContent className="industry-form-content"><form onSubmit={submit}>
    <div className="industry-form-grid"><Field label="Name"><Input required maxLength={160} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field><Picker label="Customer" value={form.customer_id} onChange={customer_id => setForm({ ...form, customer_id })} options={customers.map(customer => ({ value: customer.id, label: customer.name }))} />
    <Picker label="Currency" value={form.currency} onChange={currency => setForm({ ...form, currency })} options={['TZS', 'USD', 'EUR', 'GBP', 'KES', 'UGX'].map(value => ({ value, label: value }))} /><Field label="Cost budget"><Input type="number" min="0" step="0.01" value={form.budget} onChange={event => setForm({ ...form, budget: event.target.value })} /></Field><Field label="Due date"><DatePicker date={parseDateOnly(form.due_date)} onChange={date => setForm({ ...form, due_date: toDateOnlyString(date) })} placeholder="Choose due date" /></Field>
    {config.fields.map(field => <Field key={field} label={field}><Input maxLength={1000} value={specifications[field] ?? ''} onChange={event => setSpecifications({ ...specifications, [field]: event.target.value })} /></Field>)}</div>
    {error && <p role="alert">{error}</p>}<div className="industry-form-actions"><Button asChild variant="outline"><Link to={`/finance/industries/${industry}`}>Cancel</Link></Button><Button type="submit" disabled={saving || !form.customer_id}>{saving ? 'Saving…' : 'Create work'}</Button></div>
  </form></CardContent></Card></div>;
}
export function FinanceIndustryWorkDetail() {
  const { industry: key, id } = useParams(); const industry = key as FinanceIndustryKey; const config = experiences[industry]; const navigate = useNavigate();
  const { user } = useAuth(); const canWrite = writers.includes(user?.role ?? '');
  const { data: access } = useFinanceCapabilities();
  const productionEnabled = ['finance.inventory', 'finance.accounting.advanced'].every(key => access?.capabilities.some(item => item.key === key && item.enabled));
  const inventoryEnabled = access?.capabilities.some(item => item.key === 'finance.inventory' && item.enabled);
  const accountingEnabled = access?.capabilities.some(item => item.key === 'finance.accounting.advanced' && item.enabled);
  const [work, setWork] = useState<IndustryWork | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [line, setLine] = useState({ kind: 'service', description: '', quantity: '1', unit: 'unit', rate: '', cost_rate: '', billable: true, work_date: new Date().toISOString().slice(0, 10) });
  const [outputQuantities, setOutputQuantities] = useState<Record<string, string>>({});
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  useEffect(() => { let live = true; setWork(null); setError(''); apiFetch(`/v1/finance/industries/${id}`).then(result => { if (live) setWork(result); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, [id]);
  async function refresh() { setWork(await apiFetch(`/v1/finance/industries/${id}`)); }
  async function action(path: string, method: string, body?: unknown) { setBusy(true); setError(''); try { await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined }); await refresh(); return true; } catch (err: any) { setError(err.message); return false; } finally { setBusy(false); } }
  async function bill() { setBusy(true); setError(''); try { const invoice = await apiFetch('/v1/invoices', { method: 'POST', body: JSON.stringify({ industry_work_id: id }) }); navigate(`/finance/invoices?id=${invoice.id}`); } catch (err: any) { setError(err.message); } finally { setBusy(false); } }
  if (!config) return <p role="alert">Industry not found.</p>;
  if (!work) return <p role={error ? 'alert' : 'status'}>{error || 'Loading work…'}</p>;
  if (work.industry !== industry) return <p role="alert">This work belongs to a different industry workspace.</p>;
  const editable = ['draft', 'active'].includes(work.status); const unbilled = work.lines?.some(item => item.approved && item.billable && !item.invoice_id);
  return <div className="industry-page"><PageHeader crumbs={[{ label: 'Finance', to: '/finance' }, { label: config.title, to: `/finance/industries/${industry}` }, work.reference]} title={work.name} subtitle={`${work.reference} · ${work.status}`} actions={<div className="industry-actions">{canWrite && work.status === 'draft' && <Button disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/status`, 'PATCH', { status: 'active' })}>Activate</Button>}{canWrite && work.status === 'active' && <Button variant="outline" disabled={busy || work.lines?.some(item => !item.approved)} onClick={() => action(`/v1/finance/industries/${id}/status`, 'PATCH', { status: 'completed' })}>Complete</Button>}{canWrite && unbilled && work.status !== 'draft' && work.status !== 'cancelled' && <Button disabled={busy} onClick={bill}>Create invoice draft</Button>}{work.invoice_id && <Button asChild variant="outline"><Link to={`/finance/invoices?id=${work.invoice_id}`}>View invoice</Link></Button>}</div>} />
    {error && <p role="alert">{error}</p>}<div className="industry-summary-grid">{[['Cost budget', work.budget], ['Estimated charges', work.estimated_revenue], ['Estimated costs', work.estimated_cost], ['Estimated margin', Number(work.estimated_revenue) - Number(work.estimated_cost)]].map(([label, amount]) => <Card key={String(label)}><CardHeader><CardDescription>{label}</CardDescription><CardTitle>{money(amount as number, work.currency)}</CardTitle></CardHeader></Card>)}</div>
    {work.currency === 'TZS' && <Card><CardHeader><CardTitle>Posted job results</CardTitle>{canWrite && accountingEnabled && <Button asChild variant="outline"><Link to={`/finance/industries/${industry}/${id}/costs`}>Allocate posted costs</Link></Button>}<CardDescription>Includes ledger entries tagged to this job and their reversals. Untagged costs elsewhere are excluded; review allocations before relying on the margin.</CardDescription></CardHeader><CardContent><div className="industry-summary-grid"><div><small>Revenue, excluding VAT</small><h3>{money(work.posted_revenue)}</h3></div><div><small>Recognised direct costs</small><h3>{money(work.posted_cost)}</h3></div><div><small>Posted margin</small><h3>{money(Number(work.posted_revenue) - Number(work.posted_cost))}</h3></div><div><small>Budget remaining</small><h3>{money(Number(work.budget) - Number(work.posted_cost))}</h3></div></div><p>Accrue approved direct service costs only when they have not already been recorded through payroll, expenses or supplier bills. Accrual posts to 5020 / 2100; inventory costs post automatically.</p><div className="industry-actions">{canWrite && accountingEnabled && ['active', 'completed'].includes(work.status) && work.lines?.filter(line => line.approved && !line.cost_journal_id && line.kind !== 'material' && Number(line.cost_rate) > 0).map(line => <Button key={line.id} variant="outline" disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/lines/${line.id}/accrue-cost`, 'POST')}>Accrue {line.description} · {money(Number(line.quantity) * Number(line.cost_rate))}</Button>)}</div></CardContent></Card>}
    {['retail', 'wholesale', 'warehousing', 'manufacturing', 'printing'].includes(industry) && <Card><CardHeader><CardTitle>Allocated stock and dispatch</CardTitle><CardDescription>Allocate owned stock in base units, then dispatch all or part of each allocation. Dispatch posts COGS. Customer-owned custody stock requires a separate off-ledger workflow.</CardDescription></CardHeader><CardContent>
      {canWrite && work.status === 'active' && inventoryEnabled && <Button asChild><Link to={`/finance/industries/${industry}/${id}/allocation/new`}>Allocate stock</Link></Button>}
      {!inventoryEnabled && <p>Enable Inventory to allocate and dispatch stock.</p>}
      <div className="industry-records">{work.allocations?.map(allocation => <div className="industry-record" key={allocation.id}><div><strong>{allocation.item_name}</strong><small>{allocation.quantity} {allocation.unit} allocated · {allocation.dispatched_quantity} dispatched{allocation.batch ? ` · Batch ${allocation.batch}` : ''}</small>{allocation.released && <Badge variant="gray">Released</Badge>}</div>{canWrite && inventoryEnabled && work.status === 'active' && !allocation.released && Number(allocation.dispatched_quantity) < Number(allocation.quantity) && <div><Input aria-label={`Dispatch quantity for ${allocation.item_name}`} type="number" min="0.0001" max={Number(allocation.quantity) - Number(allocation.dispatched_quantity)} step="0.0001" placeholder="Dispatch quantity" value={dispatchQuantities[allocation.id] ?? ''} onChange={event => setDispatchQuantities({ ...dispatchQuantities, [allocation.id]: event.target.value })} /><Button disabled={busy || !dispatchQuantities[allocation.id]} onClick={() => action(`/v1/finance/industries/${id}/allocations/${allocation.id}/dispatch`, 'POST', { quantity: Number(dispatchQuantities[allocation.id]) })}>Dispatch</Button><Button variant="outline" disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/allocations/${allocation.id}/release`, 'POST')}>Release remaining stock</Button></div>}</div>)}</div>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Job requirements</CardTitle><CardDescription>Estimated figures are planning values, separate from posted accounting results.</CardDescription></CardHeader><CardContent><dl className="industry-specifications">{Object.entries(work.specifications).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value || '—'}</dd></div>)}</dl></CardContent></Card>
    {['manufacturing', 'printing'].includes(industry) && <Card><CardHeader><CardTitle>Production and WIP</CardTitle><CardDescription>Release consumes the job's material recipe into WIP. Completion receives actual output at material plus conversion cost. Costs use the TZS base ledger.</CardDescription></CardHeader><CardContent>
      {canWrite && editable && productionEnabled && <Button asChild><Link to={`/finance/industries/${industry}/${id}/production/new`}>Add production order</Link></Button>}
      {!productionEnabled && <p>Enable Inventory and Advanced Accounting to run production.</p>}
      <div className="industry-records">{work.production?.map(order => <div className="industry-record" key={order.id}><div><strong>{order.status} · Planned output {order.planned_quantity}</strong><small>Material {money(order.material_cost)} · Conversion {money(order.conversion_cost)}</small>{order.actual_quantity && <small>Actual output {order.actual_quantity}</small>}</div>{canWrite && productionEnabled && work.status === 'active' && <div>{order.status === 'draft' && <Button disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/production/${order.id}/release`, 'POST', {})}>Release materials</Button>}{order.status === 'released' && <><Input aria-label="Actual output quantity" type="number" min="0.0001" step="0.0001" placeholder="Actual output" value={outputQuantities[order.id] ?? ''} onChange={event => setOutputQuantities({ ...outputQuantities, [order.id]: event.target.value })} /><Button disabled={busy || Number(outputQuantities[order.id]) <= 0 || !outputQuantities[order.id]} onClick={() => action(`/v1/finance/industries/${id}/production/${order.id}/complete`, 'POST', { actual_quantity: Number(outputQuantities[order.id]) })}>Receive output</Button></>}</div>}</div>)}</div>
    </CardContent></Card>}
    <Card>
      <CardHeader>
        <CardTitle>{industry === 'consulting' ? 'Milestones and effort' : industry === 'printing' ? 'Materials, labour and finishing' : industry === 'professional_services' ? 'Time and service fees' : 'Work and billing lines'}</CardTitle>
        <CardDescription>Approval locks a line for billing. An invoice draft reserves its lines so they cannot be billed twice.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="industry-records">{work.lines?.map(item => (
          <div className="industry-record" key={item.id}>
            <div>
              <strong>{item.description}</strong>
              <small>{item.kind} · {item.quantity} {item.unit} · {money(item.rate, work.currency)} each</small>
              <small>{item.billable ? 'Billable' : 'Internal cost'} · {item.approved ? 'Approved' : 'Awaiting approval'}</small>
            </div>
            <div>
              <strong>{money(Number(item.quantity) * Number(item.rate), work.currency)}</strong>
              {item.invoice_id ? (
                <Button asChild variant="outline" size="sm"><Link to={`/finance/invoices?id=${item.invoice_id}`}>Invoice</Link></Button>
              ) : canWrite && !item.approved && editable && (
                <div className="industry-actions">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                    setEditingLineId(item.id);
                    setLine({ kind: item.kind, description: item.description, quantity: String(item.quantity), unit: item.unit, rate: String(item.rate), cost_rate: String(item.cost_rate), billable: item.billable, work_date: item.work_date });
                  }}>Edit</Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/lines/${item.id}/approve`, 'POST')}>Approve</Button>
                </div>
              )}
            </div>
          </div>
        ))}</div>
    {canWrite && editable && <form className="industry-line-form" onSubmit={async event => {
      event.preventDefault();
      const saved = await action(`/v1/finance/industries/${id}/lines${editingLineId ? `/${editingLineId}` : ''}`, editingLineId ? 'PATCH' : 'POST', { ...line, kind: config.kinds.includes(line.kind as IndustryWorkLine['kind']) ? line.kind : config.kinds[0], quantity: Number(line.quantity), rate: Number(line.rate || 0), cost_rate: Number(line.cost_rate || 0) });
      if (saved) { setEditingLineId(null); setLine({ kind: config.kinds[0], description: '', quantity: '1', unit: 'unit', rate: '', cost_rate: '', billable: true, work_date: new Date().toISOString().slice(0, 10) }); }
    }}><h3>{editingLineId ? 'Edit work line' : 'Add work line'}</h3><div className="industry-form-grid"><Picker label="Type" value={config.kinds.includes(line.kind as IndustryWorkLine['kind']) ? line.kind : config.kinds[0]} onChange={kind => setLine({ ...line, kind })} options={config.kinds.map(value => ({ value, label: value }))} /><Field label="Description"><Input required maxLength={500} value={line.description} onChange={event => setLine({ ...line, description: event.target.value })} /></Field>
      <Field label="Quantity / hours"><Input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event => setLine({ ...line, quantity: event.target.value })} /></Field><Field label="Unit"><Input required maxLength={50} value={line.unit} onChange={event => setLine({ ...line, unit: event.target.value })} /></Field><Field label="Billing rate"><Input type="number" min="0" step="0.0001" value={line.rate} onChange={event => setLine({ ...line, rate: event.target.value })} /></Field><Field label="Estimated cost per unit"><Input type="number" min="0" step="0.0001" value={line.cost_rate} onChange={event => setLine({ ...line, cost_rate: event.target.value })} /></Field><Field label="Work date"><DatePicker date={parseDateOnly(line.work_date)} onChange={date => setLine({ ...line, work_date: toDateOnlyString(date) })} placeholder="Choose work date" /></Field></div><label className="industry-check"><Checkbox checked={line.billable} onCheckedChange={value => setLine({ ...line, billable: value === true })} />Billable to customer</label><div className="industry-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editingLineId ? 'Save changes' : 'Add line'}</Button>{editingLineId && <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditingLineId(null); setLine({ kind: config.kinds[0], description: '', quantity: '1', unit: 'unit', rate: '', cost_rate: '', billable: true, work_date: new Date().toISOString().slice(0, 10) }); }}>Cancel edit</Button>}</div></form>}
    </CardContent></Card>{canWrite && editable && !work.lines?.some(item => item.invoice_id) && <Button variant="outline" disabled={busy} onClick={() => action(`/v1/finance/industries/${id}/status`, 'PATCH', { status: 'cancelled' })}>Cancel work</Button>}
  </div>;
}

export function FinanceIndustryProductionNew() {
  const { industry, id } = useParams(); const navigate = useNavigate();
  const [options, setOptions] = useState<{ items: { id: string; name: string; sku: string; base_uom: string }[]; locations: { id: string; name: string; code: string }[] }>({ items: [], locations: [] });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ output_item_id: '', source_location_id: '', target_location_id: '', planned_quantity: '1', output_batch: '', conversion_cost: '' });
  const [materials, setMaterials] = useState([{ item_id: '', quantity: '1', unit: '', batch: '' }]);
  const [recipes, setRecipes] = useState<IndustryProductionRecipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [recipeMessage, setRecipeMessage] = useState('');
  useEffect(() => { let live = true; apiFetch('/v1/finance/industries/stock-options').then(result => { if (live) setOptions(result); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; apiFetch('/v1/finance/industries/recipes').then(result => { if (live) setRecipes(result); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, []);
  function loadRecipe(recipeId: string) {
    setSelectedRecipe(recipeId);
    const saved = recipes.find(recipe => recipe.id === recipeId); if (!saved) return;
    const { materials: recipeMaterials, ...fields } = saved.recipe;
    setForm({ ...fields, planned_quantity: String(fields.planned_quantity), conversion_cost: String(fields.conversion_cost) });
    setMaterials(recipeMaterials.map(line => ({ ...line, quantity: String(line.quantity) })));
    setRecipeName(saved.name);
  }
  async function saveRecipe() {
    setSaving(true); setError(''); setRecipeMessage('');
    try {
      const saved = await apiFetch<IndustryProductionRecipe>('/v1/finance/industries/recipes', { method: 'POST', body: JSON.stringify({ name: recipeName, recipe: { ...form, planned_quantity: Number(form.planned_quantity), conversion_cost: Number(form.conversion_cost || 0), materials: materials.map(line => ({ ...line, quantity: Number(line.quantity) })) } }) });
      setRecipes([saved, ...recipes]); setSelectedRecipe(saved.id); setRecipeMessage(`Saved ${saved.name}, version ${saved.version}.`);
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }
  const items = options.items.map(item => ({ value: item.id, label: `${item.sku} · ${item.name}` })); const locations = options.locations.map(location => ({ value: location.id, label: `${location.code} · ${location.name}` }));
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(''); try {
    await apiFetch(`/v1/finance/industries/${id}/production`, { method: 'POST', body: JSON.stringify({ ...form, planned_quantity: Number(form.planned_quantity), conversion_cost: Number(form.conversion_cost || 0), materials: materials.map(line => ({ ...line, quantity: Number(line.quantity) })) }) });
    navigate(`/finance/industries/${industry}/${id}`);
  } catch (err: any) { setError(err.message); } finally { setSaving(false); } }
  return <div className="industry-page"><PageHeader crumbs={['Finance', 'Production']} variant="create" title="Production order" backTo={`/finance/industries/${industry}/${id}`} subtitle="Define the bill of materials for this output batch. Release posts material consumption; receive records actual yield." /><form onSubmit={submit}>
    <Card><CardHeader><CardTitle>Reusable BOM recipe</CardTitle><CardDescription>Load a saved version or save the current recipe as a new version. Saved versions stay unchanged.</CardDescription></CardHeader><CardContent><div className="industry-form-grid"><Picker label="Saved recipe" value={selectedRecipe} onChange={loadRecipe} options={recipes.map(recipe => ({ value: recipe.id, label: `${recipe.name} · v${recipe.version}` }))} /><Field label="Recipe name"><Input maxLength={120} value={recipeName} onChange={event => setRecipeName(event.target.value)} /></Field></div><Button type="button" variant="outline" disabled={saving || !recipeName.trim() || !form.output_item_id || materials.some(line => !line.item_id)} onClick={saveRecipe}>Save new version</Button>{recipeMessage && <p role="status">{recipeMessage}</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Output and locations</CardTitle></CardHeader><CardContent><div className="industry-form-grid"><Picker label="Output item" value={form.output_item_id} onChange={output_item_id => setForm({ ...form, output_item_id })} options={items} /><Field label="Planned output (base units)"><Input required type="number" min="0.0001" step="0.0001" value={form.planned_quantity} onChange={event => setForm({ ...form, planned_quantity: event.target.value })} /></Field><Picker label="Material source" value={form.source_location_id} onChange={source_location_id => setForm({ ...form, source_location_id })} options={locations} /><Picker label="Output destination" value={form.target_location_id} onChange={target_location_id => setForm({ ...form, target_location_id })} options={locations} /><Field label="Output batch"><Input value={form.output_batch} onChange={event => setForm({ ...form, output_batch: event.target.value })} /></Field><Field label="Conversion costs (TZS)"><Input type="number" min="0" step="0.01" value={form.conversion_cost} onChange={event => setForm({ ...form, conversion_cost: event.target.value })} /></Field></div><p>Conversion costs accrue to account 2100. Do not enter labour or overhead already capitalised elsewhere.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Material recipe</CardTitle><CardDescription>Enter total input quantities for this batch, including expected waste. Completion costs are divided by actual usable output.</CardDescription></CardHeader><CardContent>{materials.map((line, index) => <div className="industry-material-row" key={index}><Picker label={`Material ${index + 1}`} value={line.item_id} onChange={item_id => setMaterials(materials.map((entry, position) => position === index ? { ...entry, item_id, unit: options.items.find(item => item.id === item_id)?.base_uom ?? '' } : entry))} options={items.filter(item => item.value !== form.output_item_id)} /><Field label="Quantity"><Input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event => setMaterials(materials.map((entry, position) => position === index ? { ...entry, quantity: event.target.value } : entry))} /></Field><Field label="Unit"><Input required value={line.unit} onChange={event => setMaterials(materials.map((entry, position) => position === index ? { ...entry, unit: event.target.value } : entry))} /></Field><Field label="Batch"><Input value={line.batch} onChange={event => setMaterials(materials.map((entry, position) => position === index ? { ...entry, batch: event.target.value } : entry))} /></Field><Button type="button" variant="outline" disabled={materials.length <= 1} onClick={() => setMaterials(materials.filter((_entry, position) => position !== index))}>Remove</Button></div>)}<Button type="button" variant="outline" disabled={materials.length >= 200} onClick={() => setMaterials([...materials, { item_id: '', quantity: '1', unit: '', batch: '' }])}>Add material</Button></CardContent></Card>{error && <p role="alert">{error}</p>}<div className="industry-form-actions"><Button type="submit" disabled={saving || !form.output_item_id || !form.source_location_id || !form.target_location_id || materials.some(line => !line.item_id)}>{saving ? 'Saving…' : 'Save production order'}</Button></div></form></div>;
}

export function FinanceIndustryAllocationNew() {
  const { industry, id } = useParams(); const navigate = useNavigate();
  const [options, setOptions] = useState<{ items: { id: string; name: string; sku: string; base_uom: string }[]; locations: { id: string; name: string; code: string }[] }>({ items: [], locations: [] });
  const [form, setForm] = useState({ item_id: '', location_id: '', quantity: '1', batch: '' }); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { let live = true; apiFetch('/v1/finance/industries/stock-options').then(result => { if (live) setOptions(result); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, []);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(''); try {
    await apiFetch(`/v1/finance/industries/${id}/allocations`, { method: 'POST', body: JSON.stringify({ ...form, quantity: Number(form.quantity) }) }); navigate(`/finance/industries/${industry}/${id}`);
  } catch (err: any) { setError(err.message); } finally { setSaving(false); } }
  return <div className="industry-page"><PageHeader variant="create" crumbs={['Finance', 'Allocation']} title="Allocate owned stock" backTo={`/finance/industries/${industry}/${id}`} subtitle="Reserve stock for this job. Quantities already held for other jobs cannot be allocated again." /><Card><CardContent className="industry-form-content"><form onSubmit={submit}><div className="industry-form-grid"><Picker label="Item" value={form.item_id} onChange={item_id => setForm({ ...form, item_id })} options={options.items.map(item => ({ value: item.id, label: `${item.sku} · ${item.name}` }))} /><Picker label="Location" value={form.location_id} onChange={location_id => setForm({ ...form, location_id })} options={options.locations.map(location => ({ value: location.id, label: `${location.code} · ${location.name}` }))} /><Field label={`Quantity (${options.items.find(item => item.id === form.item_id)?.base_uom ?? 'base units'})`}><Input required type="number" min="0.0001" step="0.0001" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></Field><Field label="Batch"><Input maxLength={100} value={form.batch} onChange={event => setForm({ ...form, batch: event.target.value })} /></Field></div>{error && <p role="alert">{error}</p>}<div className="industry-form-actions"><Button type="submit" disabled={saving || !form.item_id || !form.location_id}>{saving ? 'Allocating…' : 'Reserve stock'}</Button></div></form></CardContent></Card></div>;
}
