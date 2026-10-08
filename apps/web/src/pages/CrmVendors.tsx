import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { VendorMaster } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Badge } from '../components/ui/badge.js';
import { SingleSelectFilter, SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import '../pages/FinanceIndustries.css';

const categories = ['port_services','customs','freight','warehouse','transport','consulting','utility','other'];
const statuses = ['active','inactive','blocked'];
const terms = ['cod','net_15','net_30','net_60','net_90','prepaid'];
const currency = ['TZS','USD','EUR','GBP','KES','UGX'];
const writerRoles = ['SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','FINANCE','SALES'];
export function CrmVendors() {
  const { user } = useAuth(); const [search, setSearch] = useState(''); const [status, setStatus] = useState<string | null>(null); const [page, setPage] = useState(1);
  const [vendors, setVendors] = useState<VendorMaster[]>([]); const [more, setMore] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let live = true; setLoading(true); const timer = setTimeout(() => {
    apiFetch<{ data: VendorMaster[]; has_more: boolean }>(`/v1/suppliers?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`)
      .then(result => { if (live) { setVendors(result.data); setMore(result.has_more); setError(''); } }).catch(err => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); });
  }, 250); return () => { live = false; clearTimeout(timer); }; }, [page, search, status]);
  return <div className="industry-page"><PageHeader crumbs={['CRM', 'Vendors']} titlePlain="Vendor" titleEm="directory" subtitle="One shared vendor record for CRM, Finance and procurement." actions={writerRoles.includes(user?.role || '') && <Button asChild><Link to="/crm/vendors/new">Add vendor</Link></Button>} />
    <SearchToolbar search={search} onSearch={value => { setSearch(value); setPage(1); }} placeholder="Search vendors or contacts" actions={<SingleSelectFilter label="Status" value={status} onChange={value => { setStatus(value); setPage(1); }} options={statuses.map(value => ({ value, label: value }))} />} />
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading vendors…</p> : <div className="industry-hub-grid">{vendors.map(vendor => <Card key={vendor.id}><CardHeader><div className="industry-check"><PersonAvatar userId={vendor.id} kind="suppliers" name={vendor.name} size={36} /><CardTitle className="min-w-0 break-words">{vendor.name}</CardTitle></div></CardHeader><CardContent className="industry-page"><div><Badge variant="secondary">{vendor.status}</Badge></div><p>{vendor.contact_name || 'No contact recorded'}<br />{vendor.email || vendor.phone || 'No contact details recorded'}</p><Button variant="outline" asChild><Link to={`/crm/vendors/${vendor.id}`}>View vendor</Link></Button></CardContent></Card>)}{!vendors.length && <p>No vendors match this view.</p>}</div>}
    <div className="industry-pagination"><span>Page {page}</span><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" disabled={!more || loading} onClick={() => setPage(value => value + 1)}>Next</Button></div>
  </div>;
}
export function CrmVendorRecord() {
  const { id } = useParams(); const { user } = useAuth(); const navigate = useNavigate();
  const [vendor, setVendor] = useState<Partial<VendorMaster>>({ name: '', category: 'other', currency: 'TZS', payment_terms: 'net_30', status: 'active', country: 'Tanzania' });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(Boolean(id)); const [busy, setBusy] = useState(false);
  const writable = writerRoles.includes(user?.role || '');
  useEffect(() => { if (!id) return; let live = true; apiFetch<VendorMaster>(`/v1/suppliers/${id}`).then(result => { if (live) setVendor(result); }).catch(err => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [id]);
  async function save() {
    setBusy(true); setError('');
    const keys = ['name','contact_name','email','phone','address','city','country','tax_id','category','currency','payment_terms','status','notes'] as const;
    const body = Object.fromEntries(keys.map(key => [key, vendor[key] ?? '']));
    try { const saved = await apiFetch<VendorMaster>(id ? `/v1/suppliers/${id}` : '/v1/suppliers', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) }); setVendor(saved); if (!id) navigate(`/crm/vendors/${saved.id}`); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to save vendor.'); } finally { setBusy(false); }
  }
  return <div className="industry-page"><PageHeader crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Vendors', to: '/crm/vendors' }, id ? vendor.name || 'Vendor' : 'New']} titlePlain={id ? 'Vendor' : 'New'} titleEm={id ? 'record' : 'vendor'} subtitle="Changes update the same supplier record used by Finance bills and purchase orders." actions={id && <Button asChild variant="outline"><Link to={`/finance/vendors?id=${id}`}>Finance activity</Link></Button>} />
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading vendor…</p> : <Card><CardContent className="pt-6"><form className="industry-page" onSubmit={event => { event.preventDefault(); void save(); }}><div className="industry-form-grid">
      {(['name','contact_name','email','phone','tax_id','address','city','country','notes'] as const).map(key => <div className="industry-field" key={key}><Label htmlFor={`vendor-${key}`}>{key.replaceAll('_',' ')}</Label><Input id={`vendor-${key}`} type={key === 'email' ? 'email' : 'text'} required={key === 'name'} maxLength={key === 'notes' ? 5000 : key === 'name' ? 300 : key === 'address' ? 500 : key === 'email' ? 320 : key === 'phone' ? 30 : key === 'tax_id' ? 50 : key === 'contact_name' ? 200 : 100} value={vendor[key] || ''} onChange={event => setVendor(current => ({ ...current, [key]: event.target.value }))} disabled={!writable || busy} /></div>)}
      {([['category', categories], ['currency', currency], ['payment_terms', terms], ['status', statuses]] as const).map(([key, options]) => <div className="industry-field" key={key}><Label htmlFor={`vendor-${key}`}>{key.replaceAll('_',' ')}</Label><Select value={vendor[key]} disabled={!writable || busy} onValueChange={value => setVendor(current => ({ ...current, [key]: value }))}><SelectTrigger id={`vendor-${key}`}><SelectValue /></SelectTrigger><SelectContent>{options.map(value => <SelectItem key={value} value={value}>{value.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select></div>)}
    </div>{writable && <div className="industry-form-actions"><Button disabled={busy || !vendor.name?.trim()}>Save vendor</Button></div>}</form></CardContent></Card>}
  </div>;
}
