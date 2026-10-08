import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PosAnalytics, PosCashMovementDirection, PosHeldCart, PosPaymentMethod, PosSale, PosShift } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Badge } from '../components/ui/badge.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import { useFinanceReadOnly } from '../components/FinanceCapabilityGate.js';
import { Tip } from '../components/ui/tooltip.js';
import './FinancePos.css';

interface Product { id:string; code:string; name:string; category:string|null; unit:string; type:string; sale_price:number; currency:string; tax_rate:number }
interface Customer { id:string; name:string; email:string|null }
interface Location { id:string; code:string; name:string; warehouse_name:string }
interface Bootstrap { products:Product[]; customers:Customer[]; locations:Location[]; shift:PosShift|null }
interface CartLine extends Product { qty:number; discount:number; discountMode:'amount'|'pct' }
interface PaymentDraft { id:string; method:PosPaymentMethod; amount:string; reference:string }
interface SalesResponse { items:PosSale[]; total:number; page:number; page_size:number }
interface PosUsage { used:number; limit:number|null; period:string }

const METHODS: { value: PosPaymentMethod; label: string }[] = [
  { value:'CASH', label:'Cash' }, { value:'CARD', label:'Card' }, { value:'MOBILE_MONEY', label:'Mobile money' },
  { value:'BANK', label:'Bank transfer' }, { value:'OTHER', label:'Other' },
];
// Common EAF denominations; filter to those >= total at render time
const QUICK_DENOMINATIONS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

const cash = (value:number, currency='TZS') => new Intl.NumberFormat(undefined, { style:'currency', currency, maximumFractionDigits:2 }).format(value);
const fmtDenom = (n:number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

export function FinancePos() {
  const { user } = useAuth();
  const readOnly = useFinanceReadOnly();
  const [data, setData] = useState<Bootstrap|null>(null);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [analytics, setAnalytics] = useState<PosAnalytics|null>(null);
  const [holds, setHolds] = useState<PosHeldCart[]>([]);
  const [shifts, setShifts] = useState<PosShift[]>([]);
  const [availability, setAvailability] = useState<Record<string,number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [payments, setPayments] = useState<PaymentDraft[]>([{ id:'primary', method:'CASH', amount:'', reference:'' }]);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [shiftDialog, setShiftDialog] = useState<'open'|'close'|null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<PosSale|null>(null);
  const [refundTarget, setRefundTarget] = useState<PosSale|null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundLocationId, setRefundLocationId] = useState('');
  const [holdDialog, setHoldDialog] = useState<'save'|'list'|null>(null);
  const [shiftHistoryOpen, setShiftHistoryOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [cashDirection, setCashDirection] = useState<PosCashMovementDirection>('IN');
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptStatus, setReceiptStatus] = useState('ALL');
  const [receiptPage, setReceiptPage] = useState(1);
  const [receiptPageSize, setReceiptPageSize] = useState(10);
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [usage, setUsage] = useState<PosUsage|null>(null);

  const load = useCallback(async () => {
    const [bootstrap, report, held, registerHistory, posUsage] = await Promise.all([
      apiFetch('/v1/finance/pos/bootstrap'), apiFetch('/v1/finance/pos/analytics'),
      apiFetch('/v1/finance/pos/holds'), apiFetch('/v1/finance/pos/shifts?limit=30'),
      apiFetch('/v1/finance/pos/usage'),
    ]);
    setData(bootstrap as Bootstrap);
    setAnalytics(report as PosAnalytics);
    setHolds(held as PosHeldCart[]);
    setShifts(registerHistory as PosShift[]);
    setUsage(posUsage as PosUsage);
  }, []);

  const loadSales = useCallback(async () => {
    const params = new URLSearchParams({ page:String(receiptPage), page_size:String(receiptPageSize) });
    if (receiptSearch.trim()) params.set('search', receiptSearch.trim());
    if (receiptStatus !== 'ALL') params.set('status', receiptStatus);
    const result = await apiFetch(`/v1/finance/pos/sales?${params}`) as SalesResponse;
    setSales(result.items); setReceiptTotal(result.total);
  }, [receiptPage, receiptPageSize, receiptSearch, receiptStatus]);

  useEffect(() => { load().catch((e:any) => showAlert(e.message)); }, [load]);
  useEffect(() => { const t = setTimeout(() => loadSales().catch((e:any) => showAlert(e.message)), 250); return () => clearTimeout(t); }, [loadSales]);
  useEffect(() => {
    if (!locationId) { setAvailability({}); return; }
    apiFetch(`/v1/finance/pos/availability?location_id=${encodeURIComponent(locationId)}`)
      .then(r => setAvailability(r as Record<string,number>))
      .catch((e:any) => showAlert(e.message));
  }, [locationId]);

  // Sorted unique categories derived from the product catalogue
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const p of data?.products ?? []) {
      if (p.category && !seen.has(p.category)) { seen.add(p.category); cats.push(p.category); }
    }
    return cats;
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = data?.products ?? [];
    if (selectedCategory) list = list.filter(p => p.category === selectedCategory);
    if (!query) return list;
    return list.filter(p => `${p.name} ${p.code} ${p.category ?? ''}`.toLowerCase().includes(query));
  }, [data, search, selectedCategory]);

  const currency = cart[0]?.currency ?? 'TZS';
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.sale_price * l.qty, 0);
    const discount = cart.reduce((s, l) => s + l.discount, 0);
    const tax = cart.reduce((s, l) => s + Math.max(0, l.sale_price * l.qty - l.discount) * l.tax_rate / 100, 0);
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  }, [cart]);

  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paymentBalance = Number((totals.total - paid).toFixed(2));
  const cashTendered = payments.filter(p => p.method === 'CASH').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const invalidChange = paymentBalance < 0 && cashTendered + paymentBalance < -0.001;
  const stockIssues = locationId ? cart.filter(l => availability[l.id] !== undefined && l.qty > availability[l.id]) : [];
  const canRefund = ['SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','FINANCE'].includes(user?.role ?? '');
  const quotaExhausted = usage?.limit != null && usage.used >= usage.limit;

  // Quick tender: denominations at or above the current cart total, up to 4 buttons
  const quickTenders = useMemo(
    () => QUICK_DENOMINATIONS.filter(d => d >= totals.total).slice(0, 4),
    [totals.total],
  );

  function addProduct(product:Product) {
    if (cart.length && cart[0].currency !== product.currency) {
      showAlert('A single sale cannot mix currencies. Complete or clear the current cart first.'); return;
    }
    const currentQty = cart.find(l => l.id === product.id)?.qty ?? 0;
    const available = availability[product.id];
    if (locationId && available !== undefined && currentQty + 1 > available) {
      showAlert(`Only ${available} ${product.unit} of ${product.name} is available at this location.`); return;
    }
    setCart(prev => {
      const found = prev.find(l => l.id === product.id);
      return found
        ? prev.map(l => l.id === product.id ? { ...l, qty: l.qty + 1 } : l)
        : [...prev, { ...product, qty:1, discount:0, discountMode:'amount' as const }];
    });
  }

  function changeQty(id:string, qty:number) {
    const line = cart.find(l => l.id === id);
    const available = availability[id];
    if (line && locationId && available !== undefined && qty > available) {
      showAlert(`Only ${available} ${line.unit} of ${line.name} is available at this location.`); return;
    }
    setCart(prev => qty <= 0 ? prev.filter(l => l.id !== id) : prev.map(l => l.id === id ? { ...l, qty } : l));
  }

  function changeDiscount(id:string, rawValue:number) {
    setCart(prev => prev.map(line => {
      if (line.id !== id) return line;
      const lineMax = line.sale_price * line.qty;
      if (line.discountMode === 'pct') {
        const pct = Math.min(Math.max(0, rawValue || 0), 100);
        return { ...line, discount: Math.round((pct / 100) * lineMax * 100) / 100 };
      }
      return { ...line, discount: Math.min(Math.max(0, rawValue || 0), lineMax) };
    }));
  }

  function toggleDiscountMode(id:string) {
    setCart(prev => prev.map(line => {
      if (line.id !== id) return line;
      return { ...line, discountMode: line.discountMode === 'amount' ? 'pct' as const : 'amount' as const };
    }));
  }

  function updatePayment(id:string, patch:Partial<PaymentDraft>) {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }
  function addPayment() { setPayments(prev => [...prev, { id:`payment-${Date.now()}`, method:'CARD', amount:'', reference:'' }]); }
  function removePayment(id:string) { setPayments(prev => prev.length === 1 ? prev : prev.filter(p => p.id !== id)); }

  function handleCatalogueKey(event:React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    const query = search.trim().toLowerCase();
    const exact = data?.products.find(p => p.code.toLowerCase() === query);
    if (exact) { addProduct(exact); setSearch(''); }
  }

  function clearCart() { setCart([]); setCustomerId(''); setLocationId(''); setSaleNotes(''); }

  async function holdCart() {
    if (!cart.length || !holdLabel.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/finance/pos/holds', { method:'POST', body:JSON.stringify({
        label:holdLabel.trim(), customer_id:customerId||null, inventory_location_id:locationId||null, currency,
        items:cart.map(l => ({ product_id:l.id, qty:l.qty, discount:l.discount })),
      }) });
      clearCart(); setHoldLabel(''); setHoldDialog(null); await load();
      showAlert('Cart held and available to this workspace.', { variant:'success' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function restoreHeld(held:PosHeldCart) {
    if (cart.length) { showAlert('Clear or hold the current cart before restoring another sale.'); return; }
    setSaving(true);
    try {
      const mapped = held.items.map(item => {
        const product = data?.products.find(p => p.id === item.product_id);
        return product ? { ...product, qty:item.qty, discount:item.discount, discountMode:'amount' as CartLine['discountMode'] } : null;
      });
      if (mapped.some(l => l === null)) throw new Error('One or more products in this held cart are no longer available. The cart was kept on hold.');
      const restored = mapped.filter(Boolean) as CartLine[];
      await apiFetch(`/v1/finance/pos/holds/${held.id}`, { method:'DELETE' });
      setCart(restored); setCustomerId(held.customer_id ?? ''); setLocationId(held.inventory_location_id ?? ''); setHoldDialog(null); await load();
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function openShift() {
    setSaving(true);
    try {
      await apiFetch('/v1/finance/pos/shifts/open', { method:'POST', body:JSON.stringify({ opening_float:Number(openingFloat) || 0 }) });
      setShiftDialog(null); await load();
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function closeShift() {
    if (!data?.shift) return;
    setSaving(true);
    try {
      const closed = await apiFetch(`/v1/finance/pos/shifts/${data.shift.id}/close`, { method:'POST', body:JSON.stringify({ closing_cash:Number(closingCash) || 0 }) }) as PosShift;
      const variance = Number(closed.closing_cash ?? 0) - Number(closed.expected_cash ?? 0);
      setShiftDialog(null); setClosingCash(''); await load();
      showAlert(`Register closed. Cash variance: ${cash(variance)}.`, { variant:variance === 0 ? 'success' : 'warning' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function recordCashMovement() {
    if (!data?.shift || !cashReason.trim() || Number(cashAmount) <= 0) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/finance/pos/shifts/${data.shift.id}/movements`, { method:'POST', body:JSON.stringify({ direction:cashDirection, amount:Number(cashAmount), reason:cashReason.trim() }) });
      setCashMovementOpen(false); setCashAmount(''); setCashReason(''); await load();
      showAlert(cashDirection === 'IN' ? 'Cash added to the register.' : 'Cash payout recorded.', { variant:'success' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function checkout() {
    if (!data?.shift || !cart.length) return;
    if (paymentBalance > 0.01) { showAlert(`Payment is short by ${cash(paymentBalance, currency)}.`); return; }
    if (invalidChange) { showAlert('Change can only be issued from the cash portion of the payment.'); return; }
    setSaving(true);
    try {
      const sale = await apiFetch('/v1/finance/pos/sales', { method:'POST', body:JSON.stringify({
        customer_id: customerId || null,
        inventory_location_id: locationId || null,
        currency,
        notes: saleNotes.trim() || null,
        items: cart.map(l => ({ product_id:l.id, qty:l.qty, discount:l.discount })),
        payments: payments.map(p => ({ method:p.method, amount:Number(p.amount), reference:p.reference || undefined })),
      }) }) as PosSale;
      const full = await apiFetch(`/v1/finance/pos/sales/${sale.id}`) as PosSale;
      setUsage(cur => cur ? { ...cur, used:cur.used + 1 } : cur);
      setReceipt(full);
      clearCart();
      setPayments([{ id:'primary', method:'CASH', amount:'', reference:'' }]);
      await Promise.all([load(), loadSales()]);
      if (full.status === 'POSTING_FAILED') showAlert('The sale was saved, but accounting posting failed. A manager can retry it from the receipt.', { variant:'warning' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function refundSale() {
    if (!refundTarget || !refundReason.trim()) return;
    setSaving(true);
    try {
      const refundedId = refundTarget.id;
      await apiFetch(`/v1/finance/pos/sales/${refundedId}/refund`, { method:'POST', body:JSON.stringify({ reason:refundReason.trim(), restock_location_id:refundLocationId || null }) });
      setRefundTarget(null); setRefundReason(''); setRefundLocationId('');
      await Promise.all([load(), loadSales()]);
      setReceipt(await apiFetch(`/v1/finance/pos/sales/${refundedId}`) as PosSale);
      showAlert('Sale refunded and accounting entries reversed.', { variant:'success' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function retryPosting() {
    if (!receipt || receipt.status !== 'POSTING_FAILED') return;
    setSaving(true);
    try {
      await apiFetch(`/v1/finance/pos/sales/${receipt.id}/retry-posting`, { method:'POST' });
      const refreshed = await apiFetch(`/v1/finance/pos/sales/${receipt.id}`) as PosSale;
      setReceipt(refreshed); await Promise.all([load(), loadSales()]);
      showAlert('Accounting journal posted successfully.', { variant:'success' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  if (!data) return <SectionLoading label="Loading point of sale…" />;

  return (
    <div className="pos-page">
      <PageHeader
        crumbs={['Finance','Operations']}
        titlePlain="" titleEm="POS"
        subtitle="Sell from the shared catalogue, collect payment and post the transaction automatically."
        actions={<>
          <Button variant="outline" onClick={() => setShiftHistoryOpen(true)}><Icon name="receipt" size={15}/>Registers</Button>
          {!readOnly && <>
            <Button variant="outline" onClick={() => setHoldDialog('list')}><Icon name="clock" size={15}/>Held carts{holds.length > 0 && <Badge variant="brand">{holds.length}</Badge>}</Button>
            {data.shift && <Button variant="outline" onClick={() => setCashMovementOpen(true)}><Icon name="coins" size={15}/>Cash movement</Button>}
            {data.shift
              ? <Button variant="outline" onClick={() => setShiftDialog('close')}><Icon name="lock" size={15}/>Close register</Button>
              : <Button onClick={() => setShiftDialog('open')}><Icon name="unlock" size={15}/>Open register</Button>}
          </>}
        </>}
      />

      <div className="pos-statusbar">
        <div>
          <span className={`pos-statusdot ${data.shift ? 'is-open' : ''}`}/>
          <strong>{data.shift ? 'Register open' : 'Register closed'}</strong>
          {data.shift && <span>Since {new Date(data.shift.opened_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
        <div>
          {data.shift && <>
            <span>{data.shift.sales_count ?? 0} shift sales</span>
            <strong>{cash(data.shift.sales_total ?? 0, currency)}</strong>
            {(data.shift.cash_in ?? 0) > 0 && <span>+{cash(data.shift.cash_in ?? 0, currency)} added</span>}
            {(data.shift.cash_out ?? 0) > 0 && <span>−{cash(data.shift.cash_out ?? 0, currency)} paid out</span>}
            <span>Expected cash {cash(data.shift.expected_cash ?? 0, currency)}</span>
          </>}
          <span>{usage?.limit == null ? `${usage?.used ?? 0} plan transactions · Unlimited` : `${usage.used} / ${usage.limit} plan transactions`}</span>
        </div>
      </div>

      {analytics && <section className="pos-metrics" aria-label="Today's POS performance">
        <div className="pos-metric"><span>Today sales</span><strong>{cash(analytics.today.revenue, currency)}</strong><small>{analytics.today.sales_count} transactions</small></div>
        <div className="pos-metric"><span>Average sale</span><strong>{cash(analytics.today.average_sale, currency)}</strong><small>Per completed receipt</small></div>
        <div className="pos-metric"><span>Gross margin</span><strong>{cash(analytics.today.margin, currency)}</strong><small>After tax and recorded cost</small></div>
        <div className="pos-metric"><span>Discounts</span><strong>{cash(analytics.today.discounts, currency)}</strong><small>{analytics.today.revenue ? `${((analytics.today.discounts / analytics.today.revenue) * 100).toFixed(1)}% of revenue` : 'No discounts today'}</small></div>
      </section>}

      {!readOnly && <div className="pos-workspace">
        {/* ── Catalogue ── */}
        <section className="pos-catalog card">
          <div className="pos-section-head">
            <div><h2>Catalogue</h2><p>{filtered.length} available items</p></div>
            <div className="pos-search"><Icon name="search" size={16}/><Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleCatalogueKey} placeholder="Search or scan product code…" /></div>
          </div>

          {categories.length > 0 && (
            <div className="pos-category-tabs">
              <button type="button" className={`pos-cat-tab${!selectedCategory ? ' is-active' : ''}`} onClick={() => setSelectedCategory('')} data-ui-native-button="">All</button>
              {categories.map(cat => (
                <button type="button" key={cat} className={`pos-cat-tab${selectedCategory === cat ? ' is-active' : ''}`} onClick={() => setSelectedCategory(cat)} data-ui-native-button="">{cat}</button>
              ))}
            </div>
          )}

          <div className="pos-product-grid">
            {filtered.map(product => {
              const available = availability[product.id];
              const unavailable = !!locationId && available !== undefined && available <= 0;
              return (
                <button type="button" className={`pos-product${unavailable ? ' is-unavailable' : ''}`} key={product.id} onClick={() => addProduct(product)} disabled={!data.shift || unavailable} data-ui-native-button="">
                  <div className="pos-product-icon"><Icon name="package" size={18}/></div>
                  <div className="pos-product-copy"><strong>{product.name}</strong><span>{product.code || product.category || 'Catalogue item'}</span></div>
                  <b>{cash(product.sale_price, product.currency)}</b>
                  {locationId && available !== undefined && (
                    <span className={`pos-stock${available <= 0 ? ' is-out' : available <= 5 ? ' is-low' : ''}`}>
                      {available <= 0 ? 'Out of stock' : `${available} ${product.unit} available`}
                    </span>
                  )}
                </button>
              );
            })}
            {!filtered.length && <div className="pos-empty">No catalogue items match this search.</div>}
          </div>
        </section>

        {/* ── Cart ── */}
        <aside className="pos-cart card">
          <div className="pos-section-head">
            <div><h2>Current sale</h2><p>{cart.reduce((n, l) => n + l.qty, 0)} items</p></div>
            {cart.length > 0 && <Button size="xs" variant="ghost" onClick={clearCart}>Clear</Button>}
          </div>

          <div className="pos-cart-fields">
            <Combobox
              options={[{value:'',label:'Walk-in customer'}, ...data.customers.map(c => ({value:c.id,label:c.name,sublabel:c.email ?? undefined}))]}
              value={customerId} onChange={setCustomerId} placeholder="Walk-in customer" searchPlaceholder="Search customers…" />
            <Combobox
              options={[{value:'',label:'No stock deduction'}, ...data.locations.map(l => ({value:l.id,label:`${l.warehouse_name} · ${l.name}`,sublabel:l.code}))]}
              value={locationId} onChange={setLocationId} placeholder="No stock deduction" searchPlaceholder="Search stock locations…" />
            <Input value={saleNotes} onChange={e => setSaleNotes(e.target.value)} placeholder="Add sale note (optional)" />
          </div>

          <div className="pos-cart-lines">
            {!cart.length && (
              <div className="pos-empty">
                <Icon name="shoppingCart" size={24}/>
                <strong>Your cart is empty</strong>
                <span>Select a catalogue item to begin.</span>
              </div>
            )}
            {cart.map(line => {
              const lineMax = line.sale_price * line.qty;
              // Display value: if pct mode, back-calculate the % from the stored absolute discount
              const displayValue = line.discountMode === 'pct' && lineMax > 0
                ? Math.round((line.discount / lineMax) * 10000) / 100
                : line.discount;
              return (
                <div className="pos-cart-line" key={line.id}>
                  <div><strong>{line.name}</strong><span>{cash(line.sale_price, line.currency)} · {line.tax_rate}% tax</span></div>
                  <div className="pos-qty">
                    <button onClick={() => changeQty(line.id, line.qty - 1)} data-ui-native-button="">−</button>
                    <span>{line.qty}</span>
                    <button onClick={() => changeQty(line.id, line.qty + 1)} data-ui-native-button="">+</button>
                  </div>
                  <div className="pos-line-discount">
                    <Input
                      aria-label={`Discount for ${line.name}`}
                      type="number" min="0"
                      max={line.discountMode === 'pct' ? 100 : lineMax}
                      value={displayValue || ''}
                      onChange={e => changeDiscount(line.id, Number(e.target.value))}
                    />
                    <Tip label={line.discountMode === 'pct' ? 'Switch to fixed amount' : 'Switch to percentage'}>
                      <button type="button" className="pos-discount-mode-btn" aria-label={line.discountMode === 'pct' ? 'Switch to fixed amount' : 'Switch to percentage'} onClick={() => toggleDiscountMode(line.id)} data-ui-native-button="">
                        {line.discountMode === 'pct' ? '%' : 'TZS'}
                      </button>
                    </Tip>
                  </div>
                  <b>{cash((line.sale_price * line.qty - line.discount) * (1 + line.tax_rate / 100), line.currency)}</b>
                </div>
              );
            })}
          </div>

          <div className="pos-totals">
            <div><span>Subtotal</span><b>{cash(totals.subtotal, currency)}</b></div>
            <div><span>Discount</span><b>− {cash(totals.discount, currency)}</b></div>
            <div><span>Tax</span><b>{cash(totals.tax, currency)}</b></div>
            <div className="pos-grand"><span>Total</span><b>{cash(totals.total, currency)}</b></div>
          </div>

          {stockIssues.length > 0 && (
            <div className="pos-stock-warning"><Icon name="warning" size={15}/><span>{stockIssues.map(l => l.name).join(', ')} exceeds availability at the selected location.</span></div>
          )}

          <div className="pos-payments">
            <div className="pos-payment-head"><strong>Payments</strong><Button size="xs" variant="ghost" onClick={addPayment}><Icon name="plus" size={14}/>Split payment</Button></div>
            {payments.map((payment, index) => (
              <div className="pos-payment-wrap" key={payment.id}>
                <div className="pos-payment">
                  <Select value={payment.method} onValueChange={value => updatePayment(payment.id, { method:value as PosPaymentMethod })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => updatePayment(payment.id, { amount:e.target.value })} placeholder={index === 0 ? totals.total.toFixed(2) : 'Amount'} />
                  <Input value={payment.reference} onChange={e => updatePayment(payment.id, { reference:e.target.value })} placeholder="Reference (optional)" />
                  {payments.length > 1 && <Button size="icon" variant="ghost" aria-label="Remove payment" onClick={() => removePayment(payment.id)}><Icon name="trash" size={15}/></Button>}
                </div>
                {/* Quick cash denominations — only shown for the CASH method when a total exists */}
                {payment.method === 'CASH' && totals.total > 0 && (
                  <div className="pos-quick-tender">
                    <button type="button" className="pos-tender-btn" onClick={() => updatePayment(payment.id, { amount:totals.total.toFixed(2) })} data-ui-native-button="">Exact</button>
                    {quickTenders.map(d => (
                      <button type="button" key={d} className="pos-tender-btn" onClick={() => updatePayment(payment.id, { amount:String(d) })} data-ui-native-button="">{fmtDenom(d)}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className={`pos-payment-balance${paymentBalance === 0 && totals.total > 0 ? ' is-balanced' : ''}${invalidChange ? ' is-invalid' : ''}`}>
              <span>{invalidChange ? 'Add cash tender for change' : paymentBalance > 0 ? 'Remaining' : paymentBalance < 0 ? 'Change due' : 'Fully allocated'}</span>
              <b>{cash(Math.abs(paymentBalance), currency)}</b>
              {paymentBalance > 0 && (
                <button type="button" onClick={() => updatePayment(payments[payments.length - 1].id, { amount:String((Number(payments[payments.length - 1].amount) || 0) + paymentBalance) })} data-ui-native-button="">Pay balance</button>
              )}
            </div>
          </div>

          {quotaExhausted && (
            <div className="pos-quota-warning"><Icon name="lock" size={15}/><span>Your plan's monthly POS transaction allowance is used. Receipts and register controls remain available.</span></div>
          )}

          <div className="pos-cart-actions">
            <Button variant="outline" disabled={!cart.length || saving} onClick={() => {
              setHoldLabel(customerId ? data.customers.find(c => c.id === customerId)?.name ?? '' : `Walk-in · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
              setHoldDialog('save');
            }}><Icon name="clock" size={15}/>Hold</Button>
            <Button size="lg" disabled={!data.shift || !cart.length || saving || quotaExhausted || stockIssues.length > 0 || paymentBalance > 0.01 || invalidChange} onClick={checkout}>
              {saving ? 'Processing…' : `Charge ${cash(totals.total, currency)}`}
            </Button>
          </div>
          {!data.shift && <p className="pos-register-note">Open the register to start selling.</p>}
        </aside>
      </div>}

      {/* ── Receipt history ── */}
      <section className="pos-history card">
        <div className="pos-section-head pos-history-head">
          <div><h2>Receipt history</h2><p>Find, review and refund workspace transactions</p></div>
          <div className="pos-history-filters">
            <div className="pos-search"><Icon name="search" size={16}/><Input value={receiptSearch} onChange={e => { setReceiptSearch(e.target.value); setReceiptPage(1); }} placeholder="Receipt or customer…" /></div>
            <Select value={receiptStatus} onValueChange={v => { setReceiptStatus(v); setReceiptPage(1); }}>
              <SelectTrigger aria-label="Receipt status"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="POSTING_FAILED">Posting failed</SelectItem>
                <SelectItem value="VOIDED">Voided</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="pos-history-list">
          {sales.map(sale => (
            <button type="button" key={sale.id} onClick={() => apiFetch(`/v1/finance/pos/sales/${sale.id}`).then(r => setReceipt(r as PosSale))} data-ui-native-button="">
              <span><strong>{sale.sale_number}</strong><small>{sale.customer_name ?? 'Walk-in customer'} · {new Date(sale.sold_at).toLocaleString()}</small></span>
              <Badge variant={sale.status === 'POSTING_FAILED' || sale.status === 'VOIDED' ? 'destructive' : sale.status === 'REFUNDED' ? 'warning' : 'success'}>{sale.status === 'POSTING_FAILED' ? 'Posting failed' : sale.status}</Badge>
              <b>{cash(sale.grand_total, sale.currency)}</b>
            </button>
          ))}
          {!sales.length && <div className="pos-empty">No receipts match these filters.</div>}
        </div>
        <PaginationBar page={receiptPage} pageSize={receiptPageSize} total={receiptTotal} onPageChange={setReceiptPage} onPageSizeChange={size => { setReceiptPageSize(size); setReceiptPage(1); }} pageSizeOptions={[10,20,50]} itemLabel="receipt" />
      </section>

      {/* ── Analytics ── */}
      {analytics && <section className="pos-performance-grid">
        <div className="card pos-performance">
          <div className="pos-section-head"><div><h2>Cashier performance</h2><p>Completed sales today</p></div></div>
          <div className="pos-performance-list">
            {analytics.cashiers.map((c, i) => (
              <div key={c.user_id}><span className="pos-rank">{i + 1}</span><span><strong>{c.name}</strong><small>{c.sales_count} sales · Avg {cash(c.average_sale, currency)}</small></span><b>{cash(c.revenue, currency)}</b></div>
            ))}
            {!analytics.cashiers.length && <div className="pos-empty">No completed sales today.</div>}
          </div>
        </div>
        <div className="card pos-performance">
          <div className="pos-section-head"><div><h2>Payment mix</h2><p>Tenders collected today</p></div></div>
          <div className="pos-performance-list">
            {analytics.payments.map(p => (
              <div key={p.method}><span className="pos-payment-icon"><Icon name={p.method === 'CASH' ? 'coins' : 'creditCard'} size={16}/></span><span><strong>{METHODS.find(m => m.value === p.method)?.label ?? p.method}</strong><small>{p.count} payment entries</small></span><b>{cash(p.amount, currency)}</b></div>
            ))}
            {!analytics.payments.length && <div className="pos-empty">No payments collected today.</div>}
          </div>
        </div>
      </section>}

      {/* ── Dialogs ── */}

      <Dialog open={shiftHistoryOpen} onOpenChange={setShiftHistoryOpen}>
        <DialogContent size="lg"><DialogHeader><DialogTitle>Register history</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="pos-register-table">
            <div className="pos-register-row pos-register-head"><span>Cashier</span><span>Session</span><span>Sales</span><span>Expected</span><span>Counted</span><span>Variance</span></div>
            {shifts.map(shift => (
              <div className="pos-register-row" key={shift.id}>
                <span><strong>{shift.opened_by_name ?? 'Cashier'}</strong><small>{shift.status}</small></span>
                <span><strong>{new Date(shift.opened_at).toLocaleDateString()}</strong><small>{new Date(shift.opened_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{shift.closed_at ? ` – ${new Date(shift.closed_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : ' – Open'}</small></span>
                <span><strong>{cash(shift.sales_total ?? 0, currency)}</strong><small>{shift.sales_count ?? 0} receipts</small></span>
                <span>{cash(shift.expected_cash ?? shift.opening_float, currency)}</span>
                <span>{shift.closing_cash == null ? '—' : cash(shift.closing_cash, currency)}</span>
                <span className={(shift.variance ?? 0) === 0 ? 'is-even' : (shift.variance ?? 0) < 0 ? 'is-short' : 'is-over'}>{shift.variance == null ? 'Open' : cash(shift.variance, currency)}</span>
              </div>
            ))}
            {!shifts.length && <div className="pos-empty">No register sessions recorded yet.</div>}
          </div>
        </DialogBody>
        <DialogFooter><Button onClick={() => setShiftHistoryOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cashMovementOpen} onOpenChange={setCashMovementOpen}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Record cash movement</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="pos-dialog-help">Record non-sale cash added to or removed from this drawer. The amount updates the expected cash for register reconciliation.</p>
          <label className="pos-dialog-field"><span>Movement</span>
            <Select value={cashDirection} onValueChange={v => setCashDirection(v as PosCashMovementDirection)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="IN">Cash in</SelectItem><SelectItem value="OUT">Cash out</SelectItem></SelectContent>
            </Select>
          </label>
          <label className="pos-dialog-field"><span>Amount</span><Input type="number" min="0.01" step="0.01" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" /></label>
          <label className="pos-dialog-field"><span>Reason</span><Input value={cashReason} onChange={e => setCashReason(e.target.value)} placeholder={cashDirection === 'IN' ? 'Float top-up or other reason' : 'Petty cash payout or other reason'} /></label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCashMovementOpen(false)}>Cancel</Button>
          <Button disabled={saving || Number(cashAmount) <= 0 || cashReason.trim().length < 3} onClick={recordCashMovement}>{saving ? 'Recording…' : 'Record movement'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdDialog === 'save'} onOpenChange={open => !open && setHoldDialog(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Hold current cart</DialogTitle></DialogHeader>
        <DialogBody>
          <label className="pos-dialog-field"><span>Cart label</span><Input autoFocus value={holdLabel} onChange={e => setHoldLabel(e.target.value)} placeholder="Customer, table or reference" /></label>
          <p className="pos-dialog-help">The basket, discounts, customer, and stock location will remain available to other authorized cashiers.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setHoldDialog(null)}>Cancel</Button>
          <Button disabled={saving || !holdLabel.trim()} onClick={holdCart}>{saving ? 'Holding…' : 'Hold cart'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdDialog === 'list'} onOpenChange={open => !open && setHoldDialog(null)}>
        <DialogContent size="md"><DialogHeader><DialogTitle>Held carts</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="pos-hold-list">
            {holds.map(held => (
              <div key={held.id}>
                <span className="pos-payment-icon"><Icon name="shoppingCart" size={16}/></span>
                <span><strong>{held.label}</strong><small>{held.items.reduce((s, i) => s + i.qty, 0)} items · {held.customer_name ?? 'Walk-in customer'} · Held by {held.held_by_name}</small><small>{new Date(held.held_at).toLocaleString()}</small></span>
                <Button variant="outline" size="sm" disabled={saving || cart.length > 0} onClick={() => restoreHeld(held)}>Restore</Button>
              </div>
            ))}
            {!holds.length && <div className="pos-empty"><Icon name="clock" size={22}/><strong>No held carts</strong><span>Suspended sales will appear here.</span></div>}
          </div>
          {cart.length > 0 && holds.length > 0 && <p className="pos-dialog-help">Clear or hold the current cart before restoring another one.</p>}
        </DialogBody>
        <DialogFooter><Button onClick={() => setHoldDialog(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!shiftDialog} onOpenChange={open => !open && setShiftDialog(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>{shiftDialog === 'open' ? 'Open register' : 'Close register'}</DialogTitle></DialogHeader>
        <DialogBody>
          <label className="pos-dialog-field">
            <span>{shiftDialog === 'open' ? 'Opening cash float' : 'Counted closing cash'}</span>
            <Input type="number" min="0" value={shiftDialog === 'open' ? openingFloat : closingCash} onChange={e => shiftDialog === 'open' ? setOpeningFloat(e.target.value) : setClosingCash(e.target.value)} />
          </label>
          <p className="pos-dialog-help">
            {shiftDialog === 'open'
              ? 'This creates your cashier session and records the starting cash amount.'
              : `Expected cash is ${cash(data.shift?.expected_cash ?? 0, currency)} from the opening float and cash sales. Enter the physical drawer count to record the variance.`}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShiftDialog(null)}>Cancel</Button>
          <Button disabled={saving} onClick={shiftDialog === 'open' ? openShift : closeShift}>{shiftDialog === 'open' ? 'Open register' : 'Close register'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog — also the print target */}
      <Dialog open={!!receipt} onOpenChange={open => !open && setReceipt(null)}>
        <DialogContent size="md"><DialogHeader><DialogTitle>Sale receipt</DialogTitle></DialogHeader>
        <DialogBody>
          {receipt && (
            <div className="pos-receipt">
              <div className="pos-receipt-head">
                <Badge variant={receipt.status === 'POSTING_FAILED' ? 'destructive' : receipt.status === 'REFUNDED' ? 'warning' : 'success'}>
                  {receipt.status === 'POSTING_FAILED' ? 'Accounting failed' : receipt.status === 'REFUNDED' ? 'Refunded' : 'Paid'}
                </Badge>
                <h2>{receipt.sale_number}</h2>
                <p>{new Date(receipt.sold_at).toLocaleString()} · {receipt.customer_name ?? 'Walk-in customer'}</p>
                {receipt.notes && <p className="pos-receipt-note">{receipt.notes}</p>}
                {receipt.refund_reason && <p className="pos-refund-reason">Refund reason: {receipt.refund_reason}</p>}
                {receipt.posting_error && <p className="pos-posting-error">{receipt.posting_error}</p>}
              </div>

              <div className="pos-receipt-lines">
                {receipt.lines?.map(line => (
                  <div key={line.id}>
                    <span>{line.product_name}<small>{line.qty} × {cash(line.unit_price, receipt.currency)}{line.discount > 0 ? ` − ${cash(line.discount, receipt.currency)} off` : ''}</small></span>
                    <b>{cash(line.line_total, receipt.currency)}</b>
                  </div>
                ))}
              </div>

              <div className="pos-receipt-subtotals">
                {receipt.discount_total > 0 && <div><span>Discount</span><b>− {cash(receipt.discount_total, receipt.currency)}</b></div>}
                {receipt.tax_total > 0 && <div><span>Tax</span><b>{cash(receipt.tax_total, receipt.currency)}</b></div>}
              </div>

              <div className="pos-receipt-total"><span>Total</span><b>{cash(receipt.grand_total, receipt.currency)}</b></div>

              {receipt.payments && receipt.payments.length > 0 && (
                <div className="pos-receipt-payments">
                  <p className="pos-receipt-payments-label">Tendered</p>
                  {receipt.payments.map(p => (
                    <div key={p.id}>
                      <span>{METHODS.find(m => m.value === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <b>{cash(p.amount, receipt.currency)}</b>
                    </div>
                  ))}
                  {receipt.change_due > 0 && (
                    <div className="pos-receipt-change"><span>Change</span><b>{cash(receipt.change_due, receipt.currency)}</b></div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {!readOnly && canRefund && receipt?.status === 'POSTING_FAILED' && <Button disabled={saving} onClick={retryPosting}><Icon name="refresh" size={15}/>{saving ? 'Retrying…' : 'Retry accounting'}</Button>}
          {!readOnly && canRefund && receipt?.status === 'COMPLETED' && <Button variant="destructive" onClick={() => { setRefundTarget(receipt); setReceipt(null); }}><Icon name="refresh" size={15}/>Refund sale</Button>}
          <Button variant="outline" onClick={() => window.print()}><Icon name="fileText" size={15}/>Print receipt</Button>
          <Button onClick={() => setReceipt(null)}>Done</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!readOnly && !!refundTarget} onOpenChange={open => !open && setRefundTarget(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Refund {refundTarget?.sale_number}</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="pos-dialog-help">This reverses the accounting journal and marks the full sale as refunded. Select a stock location only when the goods were physically returned.</p>
          <label className="pos-dialog-field"><span>Refund reason</span><Input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Required audit reason" /></label>
          <label className="pos-dialog-field"><span>Return inventory to</span>
            <Combobox
              options={[{value:'',label:'Do not return stock'}, ...data.locations.map(l => ({value:l.id,label:`${l.warehouse_name} · ${l.name}`,sublabel:l.code}))]}
              value={refundLocationId} onChange={setRefundLocationId} placeholder="Do not return stock" searchPlaceholder="Search stock locations…" />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
          <Button variant="destructive" disabled={saving || !refundReason.trim()} onClick={refundSale}>{saving ? 'Refunding…' : 'Confirm refund'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
