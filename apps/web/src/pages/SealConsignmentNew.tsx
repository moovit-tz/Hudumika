import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader } from '../components/ui/card.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { ButtonSpinner, SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { Textarea } from '../components/ui/textarea.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';
import './SealConsignmentNew.css';

interface Compartment { id: string; code: string; name: string }
interface Customer { id: string; name: string; category?: string }
const DOCUMENT_TYPES = [
  { value: 'BL', label: 'Bill of Lading (BL)' },
  { value: 'AWB', label: 'Air Waybill (AWB)' },
  { value: 'CMR', label: 'Road Consignment Note (CMR)' },
  { value: 'RAIL_WAYBILL', label: 'Rail Waybill' },
];
const STEPS = [
  { title: 'Warehouse & owner', description: 'Where the goods belong' },
  { title: 'Transport & goods', description: 'Document and arrival details' },
  { title: 'Review & register', description: 'Check before creating' },
];

export function SealConsignmentNew() {
  const navigate = useNavigate();
  const [selectedCompartment] = useSealCompartmentId();
  const [step, setStep] = useState(0);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState({ compartmentId: '', ownerId: '', docType: 'BL', docNumber: '', expectedArrival: undefined as Date | undefined, goodsDescription: '' });

  async function loadOptions() {
    setLoading(true);
    setLoadError(null);
    try {
      const [warehouses, clients] = await Promise.all([
        apiFetch<Compartment[]>('/v1/seal/compartments'),
        apiFetch<Customer[] | { data?: Customer[]; customers?: Customer[] }>('/v1/customers'),
      ]);
      setCompartments(warehouses);
      setCustomers(Array.isArray(clients) ? clients : clients.data ?? clients.customers ?? []);
      setForm(previous => ({ ...previous, compartmentId: previous.compartmentId || (warehouses.some(row => row.id === selectedCompartment) ? selectedCompartment! : warehouses.length === 1 ? warehouses[0].id : '') }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unable to load warehouses and owners.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadOptions(); }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const warehouse = compartments.find(row => row.id === form.compartmentId);
  const owner = customers.find(row => row.id === form.ownerId);
  const ready = Boolean(warehouse && owner);

  function goTo(next: number) {
    setError(null);
    setStep(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!ready) {
      setError('Choose a warehouse compartment and an owner to continue.');
      setStep(0);
      return;
    }
    if (step < 2) { goTo(step + 1); return; }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>('/v1/seal/consignments', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: form.compartmentId, ownerId: form.ownerId, transportDocType: form.docType, transportDocNumber: form.docNumber.trim() || null, expectedArrival: form.expectedArrival ? toDateOnlyString(form.expectedArrival) : null, goodsDescription: form.goodsDescription.trim() || null }),
      });
      navigate(`/seal/consignments/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create consignment.');
      submitting.current = false;
      setSaving(false);
    }
  }

  return <div className="seal-page seal-consignment-new">
    <PageHeader variant="create" crumbs={[{ label: 'SEAL', to: '/seal' }, { label: 'Consignments', to: '/seal/consignments' }, 'New']} title="Register inbound consignment" subtitle="Prepare a pre-arrival record, then review and register it for gate tracking." backTo="/seal/consignments" backLabel="Back to consignments" />
    <ol className="scn-progress" aria-label="Registration progress">
      {STEPS.map((item, index) => <li key={item.title} aria-current={index === step ? 'step' : undefined} data-state={index < step ? 'complete' : index === step ? 'current' : 'upcoming'}><span className="scn-step-number" aria-hidden="true">{index < step ? <Icon name="check" size={17} /> : index + 1}</span><span><b>{item.title}</b><small>{item.description}</small></span></li>)}
    </ol>
    {loadError && <Banner variant="error"><div className="scn-load-error"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => void loadOptions()}>Retry loading</Button></div></Banner>}
    <form onSubmit={handleSubmit} aria-busy={saving}>
      <div className="scn-layout">
        <Card>
          <CardHeader><span className="scn-eyebrow">STEP {step + 1} OF {STEPS.length}</span><h2 ref={heading} tabIndex={-1}>{STEPS[step].title}</h2><p className="scn-muted">{step === 0 ? 'Select the receiving location and the CRM client who owns the goods.' : step === 1 ? 'Add the transport reference and what you expect to receive. These details are optional.' : 'Confirm the details below. Nothing is registered until you select Create Consignment.'}</p></CardHeader>
          <CardContent>
            {error && <div className="scn-error"><Banner variant="error">{error}</Banner></div>}
            {loading ? <SectionLoading /> : step === 0 ? <div className="scn-fields">
              <fieldset className="scn-field"><legend>Warehouse compartment <span aria-hidden="true">*</span></legend><Combobox options={compartments.map(row => ({ value: row.id, label: `${row.name} (${row.code})` }))} value={form.compartmentId} onChange={value => setForm(previous => ({ ...previous, compartmentId: value }))} placeholder="Choose warehouse compartment" emptyText="No warehouse compartments available." disabled={Boolean(loadError)} /><small>The warehouse that will receive this consignment.</small></fieldset>
              <fieldset className="scn-field"><legend>Owner (CRM client) <span aria-hidden="true">*</span></legend><Combobox options={customers.map(row => ({ value: row.id, label: row.name, sublabel: row.category }))} value={form.ownerId} onChange={value => setForm(previous => ({ ...previous, ownerId: value }))} placeholder="Search clients…" emptyText="No matching clients." disabled={Boolean(loadError)} /><small>Select the owner from your existing CRM clients.</small></fieldset>
              {!compartments.length && !loadError && <Banner variant="warning">Create a warehouse compartment in Warehouses & Locations before registering a consignment.</Banner>}
              {!customers.length && !loadError && <Banner variant="warning">Add an owner in CRM before registering a consignment.</Banner>}
              <p className="scn-muted">* Required fields</p>
            </div> : step === 1 ? <div className="scn-fields">
              <div className="scn-field"><Label htmlFor="consignment-doc-type">Document type</Label><Select value={form.docType} onValueChange={value => setForm(previous => ({ ...previous, docType: value }))}><SelectTrigger id="consignment-doc-type"><SelectValue /></SelectTrigger><SelectContent>{DOCUMENT_TYPES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="scn-field"><Label htmlFor="consignment-doc-number">Document number</Label><Input id="consignment-doc-number" value={form.docNumber} maxLength={100} onChange={event => setForm(previous => ({ ...previous, docNumber: event.target.value }))} placeholder="e.g. MEDU7291840" /></div>
              <fieldset className="scn-field"><legend>Expected arrival</legend><DatePicker date={form.expectedArrival} onChange={date => setForm(previous => ({ ...previous, expectedArrival: date }))} /><small>When the consignment is expected at the gate.</small></fieldset>
              <div className="scn-field scn-full"><Label htmlFor="consignment-goods">Goods description</Label><Textarea id="consignment-goods" value={form.goodsDescription} maxLength={2000} rows={4} onChange={event => setForm(previous => ({ ...previous, goodsDescription: event.target.value }))} placeholder="e.g. General cargo — hardware, steel coils, automotive parts" /></div>
            </div> : <div className="scn-review">
              <div className="scn-review-heading"><h3>Warehouse & owner</h3><Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => goTo(0)}>Edit</Button></div>
              <dl><div><dt>Warehouse compartment</dt><dd>{warehouse?.name} ({warehouse?.code})</dd></div><div><dt>Owner</dt><dd className="scn-owner"><PersonAvatar userId={owner?.id} kind="customers" name={owner?.name ?? ''} size={28} />{owner?.name}</dd></div></dl>
              <div className="scn-review-heading"><h3>Transport & goods</h3><Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => goTo(1)}>Edit</Button></div>
              <dl><div><dt>Document type</dt><dd>{DOCUMENT_TYPES.find(item => item.value === form.docType)?.label}</dd></div><div><dt>Document number</dt><dd>{form.docNumber.trim() || 'Not provided'}</dd></div><div><dt>Expected arrival</dt><dd>{form.expectedArrival?.toLocaleDateString() ?? 'Not provided'}</dd></div><div className="scn-full"><dt>Goods description</dt><dd>{form.goodsDescription.trim() || 'Not provided'}</dd></div></dl>
            </div>}
          </CardContent>
          <div className="scn-footer"><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => step > 0 ? goTo(step - 1) : navigate('/seal/consignments')}><Icon name="chevronLeft" size={15} />{step > 0 ? 'Back' : 'Cancel'}</Button><Button type="submit" size="sm" disabled={loading || Boolean(loadError) || saving || !ready}>{saving && <ButtonSpinner />}{saving ? 'Creating…' : step === 2 ? 'Create Consignment' : 'Continue'}{step < 2 && <Icon name="chevronRight" size={15} />}</Button></div>
        </Card>
        <aside><Card><CardHeader><FeaturedIcon size="md"><Icon name="truck" size={20} /></FeaturedIcon><h3>Ready for arrival</h3><p className="scn-muted">One consignment per transport document keeps receiving and gate tracking connected.</p></CardHeader><CardContent><Badge variant="gray">Pre-arrival registration</Badge><p className="scn-muted">After registration, continue to the consignment record to manage containers and arrival activity.</p><p className="scn-muted">Your entries are kept while you move between these steps. Leaving this page discards them.</p></CardContent></Card></aside>
      </div>
    </form>
  </div>;
}
