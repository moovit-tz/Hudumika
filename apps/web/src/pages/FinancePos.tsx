import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PosAnalytics, PosCashMovementDirection, PosHeldCart, PosPaymentMethod, PosSale, PosShift } from '@hudumika/types';
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
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion.js';
import { useCompany } from '../data/companyStore.js';
import { loadPosPrintSettings, posPrintKey, printPosReceipt } from '../lib/pos-print.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
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
const QUICK_DENOMINATIONS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

const cash = (value:number, currency='TZS') => new Intl.NumberFormat(undefined, { style:'currency', currency, maximumFractionDigits:2 }).format(value);
const fmtDenom = (n:number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

export function FinancePos() {
  const { user } = useAuth();
  const company = useCompany();
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);
  const [exitTarget, setExitTarget] = useState('/finance');
  const [productView, setProductView] = useState<'grid' | 'list'>('grid');
  const [loadError, setLoadError] = useState('');
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
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(12);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'products'|'sale'>('products');
  const searchRef = useRef<HTMLInputElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);

  /* ── Data loading ── */
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

  useEffect(() => { load().catch((e:any) => setLoadError(e.message)); }, [load]);
  useEffect(() => { const t = setTimeout(() => loadSales().catch((e:any) => showAlert(e.message)), 250); return () => clearTimeout(t); }, [loadSales]);
  useEffect(() => {
    if (!locationId) { setAvailability({}); return; }
    apiFetch(`/v1/finance/pos/availability?location_id=${encodeURIComponent(locationId)}`)
      .then(r => setAvailability(r as Record<string,number>))
      .catch((e:any) => showAlert(e.message));
  }, [locationId]);
  useEffect(() => {
    if (!locationId && data?.locations.length === 1) setLocationId(data.locations[0].id);
  }, [data, locationId]);

  /* ── Derived state ── */
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

  const safeProductPage = Math.min(productPage, Math.max(1, Math.ceil(filtered.length / productPageSize)));
  const pageProducts = filtered.slice((safeProductPage - 1) * productPageSize, safeProductPage * productPageSize);
  useEffect(() => { setProductPage(1); }, [search, selectedCategory, productPageSize]);
  useEffect(() => { productGridRef.current?.scrollTo({ top: 0 }); }, [safeProductPage, search, selectedCategory, productPageSize]);

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
  const quickTenders = useMemo(
    () => QUICK_DENOMINATIONS.filter(d => d >= totals.total).slice(0, 4),
    [totals.total],
  );
  const cartItemCount = cart.reduce((n, l) => n + l.qty, 0);

  /* ── Cart actions ── */
  function addProduct(product:Product) {
    if (!data?.shift || readOnly || saving) return;
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

  /* ── Shift / hold / checkout / refund — unchanged logic ── */
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
      if (mapped.some(l => l === null)) throw new Error('One or more products in this held cart are no longer available.');
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
      const printSettings = loadPosPrintSettings(posPrintKey(user?.tenant_id, user?.id));
      if (printSettings.autoPrint) printPosReceipt(full, printSettings, company.name);
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

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function onTerminalKey(event:KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (event.key === 'F4') { event.preventDefault(); setHoldDialog('list'); }
      else if (event.key === 'F8' && totals.total > 0) {
        event.preventDefault();
        const target = payments.find(p => p.method === 'CASH') ?? payments[0];
        updatePayment(target.id, { method:'CASH', amount:totals.total.toFixed(2) });
      } else if (event.key === 'F9') { event.preventDefault(); setHistoryOpen(true); }
      else if (event.ctrlKey && event.key === 'Enter' && paymentBalance <= 0.01 && !invalidChange && !saving) {
        event.preventDefault(); void checkout();
      }
    }
    window.addEventListener('keydown', onTerminalKey);
    return () => window.removeEventListener('keydown', onTerminalKey);
  }, [invalidChange, paymentBalance, payments, saving, totals.total]);

  if (!data) return <div className="pos-load-state"><Button variant="outline" asChild><Link to="/finance">Back office</Link></Button>{loadError ? <><p role="alert">{loadError}</p><Button onClick={() => { setLoadError(''); void load().catch((error: Error) => setLoadError(error.message)); }}>Try again</Button></> : <SectionLoading label="Loading Point of Sale…" />}</div>;

  const sel = data;

  return (
    <div className="pos-terminal" data-pane={mobilePane}>

      <Dialog open={exitOpen} onOpenChange={setExitOpen}><DialogContent><DialogHeader><DialogTitle>Leave the current sale?</DialogTitle></DialogHeader><DialogBody><p>This sale has not been saved. Hold it before leaving if you want to resume it later.</p></DialogBody><DialogFooter><Button variant="outline" onClick={() => setExitOpen(false)}>Keep selling</Button><Button variant="destructive" onClick={() => navigate(exitTarget)}>Leave without saving</Button></DialogFooter></DialogContent></Dialog>
      {/* ═══ Top Toolbar ═══ */}
      <div className="pos-toolbar">
        <Button variant="ghost" size="sm" onClick={() => { setExitTarget('/finance'); cart.length ? setExitOpen(true) : navigate('/finance'); }}><Icon name="arrowLeft" size={16} /><span>Back office</span></Button>
        <div className="pos-toolbar-brand">
          <FeaturedIcon size="sm" variant="brand"><Icon name="shoppingCart" size={18} /></FeaturedIcon>
          <div><strong>Point of sale</strong><small>Counter sales &amp; checkout</small></div>
        </div>

        <div className={`pos-toolbar-status ${sel.shift ? 'is-open' : 'is-closed'}`}>
          <span className="pos-toolbar-dot" />
          {sel.shift ? 'Register open' : 'Register closed'}
        </div>

        {sel.shift && (
          <div className="pos-toolbar-info">
            <span>Since {new Date(sel.shift.opened_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            <span className="pos-toolbar-sep" />
            <span><strong>{sel.shift.sales_count ?? 0}</strong> sales</span>
            <span className="pos-toolbar-sep" />
            <strong>{cash(sel.shift.sales_total ?? 0, currency)}</strong>
            <span className="pos-toolbar-sep" />
            <span>Expected {cash(sel.shift.expected_cash ?? 0, currency)}</span>
          </div>
        )}

        <div className="pos-shortcut-hints">
          <kbd>F2 Search</kbd>
          <kbd>F4 Held</kbd>
          <kbd>F8 Cash</kbd>
          <kbd>F9 History</kbd>
          <kbd>Ctrl+↵ Charge</kbd>
        </div>

        <div className="pos-toolbar-actions">
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Product display"><Icon name={productView === 'grid' ? 'grid' : 'list'} size={15} />View</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => setProductView('grid')}>Product grid</DropdownMenuItem><DropdownMenuItem onSelect={() => setProductView('list')}>Product list</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Button variant="outline" size="sm" aria-label="Receipt history" onClick={() => setHistoryOpen(true)}><Icon name="receipt" size={16}/>Receipts</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Till actions"><Icon name="moreHorizontal" size={16}/>More</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { setExitTarget('/finance/pos/settings'); cart.length ? setExitOpen(true) : navigate('/finance/pos/settings'); }}><Icon name="printer" size={15}/>Printer settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShiftHistoryOpen(true)}><Icon name="clock" size={15}/>Register history</DropdownMenuItem>
              {!readOnly && <>
                {holds.length > 0 && <DropdownMenuItem onSelect={() => setHoldDialog('list')}><Icon name="pause" size={15}/>Held carts ({holds.length})</DropdownMenuItem>}
                {sel.shift && <DropdownMenuItem onSelect={() => setCashMovementOpen(true)}><Icon name="coins" size={15}/>Cash movement</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => setShiftDialog(sel.shift ? 'close' : 'open')}><Icon name={sel.shift ? 'lock' : 'unlock'} size={15}/>{sel.shift ? 'Close register' : 'Open register'}</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ═══ Metrics strip ═══ */}
      {analytics && (
        <div className="pos-metrics">
          <div className="pos-metric"><span>Today sales</span><strong>{cash(analytics.today.revenue, currency)}</strong><small>{analytics.today.sales_count} transactions</small></div>
          <div className="pos-metric"><span>Average sale</span><strong>{cash(analytics.today.average_sale, currency)}</strong><small>Per receipt</small></div>
          <div className="pos-metric"><span>Gross margin</span><strong>{cash(analytics.today.margin, currency)}</strong><small>After tax &amp; cost</small></div>
          <div className="pos-metric"><span>Discounts</span><strong>{cash(analytics.today.discounts, currency)}</strong><small>{analytics.today.revenue ? `${((analytics.today.discounts / analytics.today.revenue) * 100).toFixed(1)}%` : '0%'} of revenue</small></div>
        </div>
      )}

      {!readOnly && <div className="pos-mobile-nav" role="group" aria-label="POS view">
        <Button size="sm" variant={mobilePane === 'products' ? 'secondary' : 'ghost'} aria-pressed={mobilePane === 'products'} onClick={() => setMobilePane('products')}><Icon name="package" size={16}/>Products</Button>
        <Button size="sm" variant={mobilePane === 'sale' ? 'secondary' : 'ghost'} aria-pressed={mobilePane === 'sale'} onClick={() => setMobilePane('sale')}><Icon name="shoppingCart" size={16}/>Current sale <Badge variant="brand">{cartItemCount}</Badge></Button>
      </div>}

      {/* ═══ Main Body: Catalogue + Cart ═══ */}
      {!readOnly && (
        <div className="pos-body">
          <nav className="pos-category-nav" aria-label="Product categories">
            <h2>Categories</h2>
            {[{ name: '', label: 'All items', count: data.products.length }, ...categories.map(name => ({ name, label: name, count: data.products.filter(product => product.category === name).length }))].map(category => <Button key={category.name} className="px-3" variant={selectedCategory === category.name ? 'secondary' : 'ghost'} size="sm" aria-pressed={selectedCategory === category.name} onClick={() => { setSelectedCategory(category.name); setProductPage(1); }}><span>{category.label}</span><small>{category.count}</small></Button>)}
          </nav>

          {/* ── LEFT: Catalogue ── */}
          <div className="pos-catalogue">
            <div className="pos-section-heading"><div><h2>Product catalogue</h2><p>Select an item or scan its barcode.</p></div><Badge variant="secondary">{filtered.length} products</Badge></div>
            <div className="pos-catalogue-head">
              <div className="pos-catalogue-search">
                <Icon name="search" size={16} />
                <Input
                  aria-label="Search products or scan barcode"
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleCatalogueKey}
                  placeholder="Search or scan barcode…"
                />
              </div>

            </div>

            {!sel.shift && <div className="pos-closed-banner"><FeaturedIcon variant="warning" size="sm"><Icon name="lock" size={16}/></FeaturedIcon><div><strong>Your register is closed</strong><span>Open the register to add products and take payments.</span></div><Button size="sm" onClick={() => setShiftDialog('open')}>Open register</Button></div>}

            <div className="pos-grid" data-view={productView} ref={productGridRef}>
              {pageProducts.map(product => {
                const available = availability[product.id];
                const unavailable = !!locationId && available !== undefined && available <= 0;
                const inCart = cart.find(line => line.id === product.id)?.qty ?? 0;
                return (
                  <Button variant="ghost" size="xs" type="button" className="pos-tile" data-in-cart={inCart > 0 || undefined} key={product.id} onClick={() => addProduct(product)} disabled={!sel.shift || unavailable}>
                    <div className="pos-tile-visual"><FeaturedIcon size="sm" variant="brand"><Icon name="package" size={18}/></FeaturedIcon><span className="pos-tile-category">{product.category ?? product.type}</span>{inCart > 0 && <Badge variant="brand">{inCart} in sale</Badge>}</div>
                    <div className="pos-tile-top">
                      <div>
                        <div className="pos-tile-name">{product.name}</div>
                        <div className="pos-tile-code">{product.code || product.category || '—'}</div>
                      </div>
                    </div>
                    <div className="pos-tile-bottom"><div className="pos-tile-price">{cash(product.sale_price, product.currency)}<small>per {product.unit}</small></div><span className="pos-tile-add" aria-hidden="true"><Icon name="plus" size={16}/></span></div>
                    {locationId && available !== undefined && (
                      <Badge variant={available <= 0 ? 'destructive' : available <= 5 ? 'warning' : 'success'} className="pos-tile-stock">
                        {available <= 0 ? 'Out of stock' : `${available} ${product.unit}`}
                      </Badge>
                    )}
                  </Button>
                );
              })}
              {!filtered.length && (
                <div className="pos-grid-empty">
                  <Icon name="search" size={28} />
                  <strong>No items found</strong>
                  <span>Try a different search or category.</span>
                </div>
              )}
            </div>
            <PaginationBar className="pos-product-pagination" page={safeProductPage} pageSize={productPageSize} total={filtered.length} onPageChange={setProductPage} onPageSizeChange={setProductPageSize} pageSizeOptions={[8,12,24]} itemLabel="product" />
          </div>

          {/* ── RIGHT: Cart Panel ── */}
          <div className="pos-cart-panel">
            <div className="pos-cart-head">
              <div><small className="pos-eyebrow">CHECKOUT</small><h2>Current sale <Badge variant="brand">{cartItemCount}</Badge></h2></div>
              {cart.length > 0 && <Button size="xs" variant="ghost" onClick={clearCart}>Clear all</Button>}
            </div>

            <div className="pos-cart-scroll">
            <Accordion type="single" collapsible className="pos-sale-settings">
              <AccordionItem value="details"><AccordionTrigger>Customer &amp; sale details<span className="pos-settings-summary">{customerId ? sel.customers.find(customer => customer.id === customerId)?.name : 'Walk-in customer'}</span></AccordionTrigger><AccordionContent>
            <div className="pos-cart-fields">
              <label className="pos-field"><span>Customer</span><Combobox
                options={[{value:'',label:'Walk-in customer'}, ...sel.customers.map(c => ({value:c.id,label:c.name,sublabel:c.email ?? undefined}))]}
                value={customerId} onChange={setCustomerId} placeholder="Walk-in customer" searchPlaceholder="Search customers…" /></label>
              <label className="pos-field"><span>Stock location</span><Combobox
                options={[{value:'',label:'No stock deduction'}, ...sel.locations.map(l => ({value:l.id,label:`${l.warehouse_name} · ${l.name}`,sublabel:l.code}))]}
                value={locationId} onChange={setLocationId} placeholder="No stock deduction" searchPlaceholder="Stock location…" /></label>
              <label className="pos-field"><span>Sale note <small>Optional</small></span><Input aria-label="Sale note" value={saleNotes} onChange={e => setSaleNotes(e.target.value)} placeholder="Add a customer or order reference" /></label>
            </div>
              </AccordionContent></AccordionItem>
            </Accordion>

            {/* Line items */}
            <div className="pos-lines">
              {!cart.length && (
                <div className="pos-lines-empty">
                  <FeaturedIcon variant="gray" size="lg"><Icon name="shoppingCart" size={28} /></FeaturedIcon>
                  <strong>Your sale starts here</strong>
                  <span>Add products from the catalogue.</span>
                </div>
              )}
              {cart.map(line => {
                const lineMax = line.sale_price * line.qty;
                const displayValue = line.discountMode === 'pct' && lineMax > 0
                  ? Math.round((line.discount / lineMax) * 10000) / 100
                  : line.discount;
                const lineTotal = (line.sale_price * line.qty - line.discount) * (1 + line.tax_rate / 100);
                return (
                  <div className="pos-line" key={line.id}>
                    <div className="pos-line-info">
                      <strong>{line.name}</strong>
                      <small>{cash(line.sale_price, line.currency)} × {line.qty}{line.tax_rate > 0 ? ` · ${line.tax_rate}% tax` : ''}</small>
                    </div>
                    <div className="pos-line-qty">
                      <Button variant="ghost" size="xs" type="button" aria-label={`Decrease quantity of ${line.name}`} onClick={() => changeQty(line.id, line.qty - 1)}>−</Button>
                      <span>{line.qty}</span>
                      <Button variant="ghost" size="xs" type="button" aria-label={`Increase quantity of ${line.name}`} onClick={() => changeQty(line.id, line.qty + 1)}>+</Button>
                    </div>
                    <div className="pos-line-total">{cash(lineTotal, line.currency)}</div>
                    {line.discount > 0 && (
                      <div className="pos-line-discount-row">
                        <Badge variant="success">−{cash(line.discount, line.currency)}</Badge>
                        <Tip label={line.discountMode === 'pct' ? 'Switch to fixed' : 'Switch to %'}>
                          <Button variant="ghost" size="xs" type="button" aria-label={`Switch discount mode for ${line.name}`} className="pos-line-discount-toggle" onClick={() => toggleDiscountMode(line.id)}>
                            {line.discountMode === 'pct' ? '%' : currency}
                          </Button>
                        </Tip>
                        <Input
                          aria-label={`Discount for ${line.name}`} type="number" min="0"
                          max={line.discountMode === 'pct' ? 100 : lineMax}
                          value={displayValue || ''}
                          onChange={e => changeDiscount(line.id, Number(e.target.value))}
                          className="pos-discount-input"
                        />
                      </div>
                    )}
                    {line.discount === 0 && (
                      <div className="pos-line-discount-row">
                        <Button variant="ghost" size="xs" type="button" className="pos-line-discount-toggle" onClick={() => changeDiscount(line.id, 1)} style={{ fontSize: 10, color: 'var(--ink3)' }}>+ Discount</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Cart Footer: Totals + Payment + Charge ── */}
            <div className="pos-cart-footer">
              <div className="pos-totals">
                <div><span>Subtotal</span><b>{cash(totals.subtotal, currency)}</b></div>
                {totals.discount > 0 && <div><span>Discount</span><b>−{cash(totals.discount, currency)}</b></div>}
                {totals.tax > 0 && <div><span>Tax</span><b>{cash(totals.tax, currency)}</b></div>}
                <div className="pos-total-grand"><span>Total</span><b>{cash(totals.total, currency)}</b></div>
              </div>

              {stockIssues.length > 0 && (
                <div className="pos-stock-alert"><Icon name="warning" size={14}/><span>{stockIssues.map(l => l.name).join(', ')} exceeds availability.</span></div>
              )}

              {/* Payment section */}
              <div className="pos-pay-section">
                <div className="pos-pay-head">
                  <span><Icon name="creditCard" size={16}/>Payment details</span>
                  <Button size="xs" variant="ghost" onClick={addPayment}><Icon name="plus" size={12}/>Split</Button>
                </div>
                {payments.map((payment, index) => (
                  <React.Fragment key={payment.id}>
                    <div className="pos-pay-row">
                      <Select value={payment.method} onValueChange={value => updatePayment(payment.id, { method:value as PosPaymentMethod })}>
                        <SelectTrigger aria-label={`Payment ${index + 1} method`}><SelectValue/></SelectTrigger>
                        <SelectContent>{METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input aria-label={`Payment ${index + 1} amount`} inputMode="decimal" type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => updatePayment(payment.id, { amount:e.target.value })} placeholder={index === 0 ? totals.total.toFixed(2) : 'Amount'} />
                      <Input aria-label={`Payment ${index + 1} reference`} value={payment.reference} onChange={e => updatePayment(payment.id, { reference:e.target.value })} placeholder="Reference (optional)" />
                      {payments.length > 1 && <Button size="icon" variant="ghost" aria-label={`Remove payment ${index + 1}`} onClick={() => removePayment(payment.id)}><Icon name="trash" size={14}/></Button>}
                    </div>
                    {payment.method === 'CASH' && totals.total > 0 && (
                      <div className="pos-quick-cash">
                        <Button variant="ghost" size="xs" type="button" className="pos-quick-pill" onClick={() => updatePayment(payment.id, { amount:totals.total.toFixed(2) })}>Exact</Button>
                        {quickTenders.map(d => (
                          <Button variant="ghost" size="xs" type="button" key={d} className="pos-quick-pill" onClick={() => updatePayment(payment.id, { amount:String(d) })}>{fmtDenom(d)}</Button>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Balance indicator */}
              <div className={`pos-pay-balance ${invalidChange ? 'invalid' : paymentBalance > 0 ? 'remaining' : paymentBalance < 0 ? 'overpaid' : totals.total > 0 ? 'balanced' : 'remaining'}`}>
                <span>{invalidChange ? 'Add cash tender for change' : paymentBalance > 0 ? 'Remaining' : paymentBalance < 0 ? 'Change due' : 'Fully allocated'}</span>
                <b>{cash(Math.abs(paymentBalance), currency)}</b>
                {paymentBalance > 0 && (
                  <Button variant="ghost" size="xs" type="button" onClick={() => updatePayment(payments[payments.length - 1].id, { amount:String((Number(payments[payments.length - 1].amount) || 0) + paymentBalance) })}>Pay balance</Button>
                )}
              </div>

              {quotaExhausted && (
                <div className="pos-quota-alert"><Icon name="lock" size={14}/><span>Monthly POS transaction allowance is used.</span></div>
              )}

              {/* Charge row */}
            </div>
            </div>
              <div className="pos-charge-row">
                <Button variant="outline" disabled={!cart.length || saving} onClick={() => {
                  setHoldLabel(customerId ? sel.customers.find(c => c.id === customerId)?.name ?? '' : `Walk-in · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
                  setHoldDialog('save');
                }}><Icon name="pause" size={14}/>Hold</Button>
                <Button size="lg"
                  type="button"
                  className="pos-charge-btn"
                  disabled={!sel.shift || !cart.length || saving || quotaExhausted || stockIssues.length > 0 || paymentBalance > 0.01 || invalidChange}
                  onClick={checkout}
                >
                  <Icon name="creditCard" size={18}/>
                  {saving ? 'Processing…' : `Charge ${cash(totals.total, currency)}`}
                </Button>
              </div>
              {!sel.shift && <p className="pos-register-closed-note">Open the register to start selling.</p>}
          </div>
        </div>
      )}

      {!readOnly && <div className="pos-mobile-basket"><div><small>{cartItemCount} items in your sale</small><strong>{cash(totals.total, currency)}</strong></div><Button onClick={() => setMobilePane('sale')}>Review sale<Icon name="shoppingCart" size={16}/></Button></div>}

      {/* ═══ Receipt History Side Panel ═══ */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="pos-history-panel" aria-describedby={undefined}>
          <div className="pos-history-head">
            <SheetTitle>Receipt history</SheetTitle>
          </div>
          <div className="pos-history-filters">
            <SearchToolbar search={receiptSearch} onSearch={value => { setReceiptSearch(value); setReceiptPage(1); }} placeholder="Receipt or customer…" />
            <Select value={receiptStatus} onValueChange={v => { setReceiptStatus(v); setReceiptPage(1); }}>
              <SelectTrigger aria-label="Receipt status"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="POSTING_FAILED">Failed</SelectItem>
                <SelectItem value="VOIDED">Voided</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pos-history-list">
            {sales.map(sale => (
              <Button variant="ghost" size="xs" type="button" key={sale.id} className="pos-history-item" onClick={() => { apiFetch(`/v1/finance/pos/sales/${sale.id}`).then(r => { setReceipt(r as PosSale); setHistoryOpen(false); }).catch((e:Error) => showAlert(e.message)); }}>
                <span><strong>{sale.sale_number}</strong><small>{sale.customer_name ?? 'Walk-in'} · {new Date(sale.sold_at).toLocaleString()}</small></span>
                <Badge variant={sale.status === 'POSTING_FAILED' || sale.status === 'VOIDED' ? 'destructive' : sale.status === 'REFUNDED' ? 'warning' : 'success'}>{sale.status === 'POSTING_FAILED' ? 'Failed' : sale.status}</Badge>
                <b>{cash(sale.grand_total, sale.currency)}</b>
              </Button>
            ))}
            {!sales.length && <div className="pos-history-empty">No receipts match these filters.</div>}
          </div>
          <div className="pos-history-footer">
            <PaginationBar page={receiptPage} pageSize={receiptPageSize} total={receiptTotal} onPageChange={setReceiptPage} onPageSizeChange={size => { setReceiptPageSize(size); setReceiptPage(1); }} pageSizeOptions={[10,20,50]} itemLabel="receipt" />
          </div>

          {/* Analytics inside history panel */}
          {analytics && (
            <div className="pos-analytics-grid">
              <div className="pos-analytics-card">
                <h3>Cashier leaderboard <small>Today</small></h3>
                {analytics.cashiers.map(c => (
                  <div key={c.user_id} className="pos-analytics-row"><PersonAvatar userId={c.user_id} name={c.name} size={28} /><span><strong>{c.name}</strong><small>{c.sales_count} sales · Avg {cash(c.average_sale, currency)}</small></span><b>{cash(c.revenue, currency)}</b></div>
                ))}
                {!analytics.cashiers.length && <div className="pos-history-empty">No sales today.</div>}
              </div>
              <div className="pos-analytics-card">
                <h3>Payment mix <small>Today</small></h3>
                {analytics.payments.map(p => (
                  <div key={p.method} className="pos-analytics-row"><span className="pos-pay-icon"><Icon name={p.method === 'CASH' ? 'coins' : 'creditCard'} size={14}/></span><span><strong>{METHODS.find(m => m.value === p.method)?.label ?? p.method}</strong><small>{p.count} entries</small></span><b>{cash(p.amount, currency)}</b></div>
                ))}
                {!analytics.payments.length && <div className="pos-history-empty">No payments today.</div>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ═══ Dialogs ═══ */}

      {/* Register history */}
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
            {!shifts.length && <div className="pos-history-empty">No register sessions recorded.</div>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Button variant="ghost" size="xs" asChild style={{ color: 'var(--teal)' }}><Link to="/finance/products"><Icon name="package" size={14}/>Products &amp; stock</Link></Button>
            <Button variant="ghost" size="xs" asChild style={{ color: 'var(--teal)' }}><Link to="/customers"><Icon name="users" size={14}/>Customers</Link></Button>
            <Button variant="ghost" size="xs" asChild style={{ color: 'var(--teal)' }}><Link to="/finance/payments"><Icon name="creditCard" size={14}/>Payments</Link></Button>
            <Button variant="ghost" size="xs" asChild style={{ color: 'var(--teal)' }}><Link to="/finance/reports/sales"><Icon name="barChart2" size={14}/>Sales report</Link></Button>
            <Button variant="ghost" size="xs" asChild style={{ color: 'var(--teal)' }}><Link to="/finance/accounts/profit-loss"><Icon name="trendingUp" size={14}/>Profit &amp; loss</Link></Button>
          </div>
        </DialogBody>
        <DialogFooter><Button onClick={() => setShiftHistoryOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash movement */}
      <Dialog open={cashMovementOpen} onOpenChange={setCashMovementOpen}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Cash movement</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="pos-dialog-help">Record non-sale cash added to or removed from the drawer.</p>
          <label className="pos-dialog-field"><span>Direction</span>
            <Select value={cashDirection} onValueChange={v => setCashDirection(v as PosCashMovementDirection)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="IN">Cash in</SelectItem><SelectItem value="OUT">Cash out</SelectItem></SelectContent>
            </Select>
          </label>
          <label className="pos-dialog-field"><span>Amount</span><Input type="number" min="0.01" step="0.01" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" /></label>
          <label className="pos-dialog-field"><span>Reason</span><Input value={cashReason} onChange={e => setCashReason(e.target.value)} placeholder={cashDirection === 'IN' ? 'Float top-up' : 'Petty cash payout'} /></label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCashMovementOpen(false)}>Cancel</Button>
          <Button disabled={saving || Number(cashAmount) <= 0 || cashReason.trim().length < 3} onClick={recordCashMovement}>{saving ? 'Recording…' : 'Record'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold cart */}
      <Dialog open={holdDialog === 'save'} onOpenChange={open => !open && setHoldDialog(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Hold current cart</DialogTitle></DialogHeader>
        <DialogBody>
          <label className="pos-dialog-field"><span>Cart label</span><Input autoFocus value={holdLabel} onChange={e => setHoldLabel(e.target.value)} placeholder="Customer, table or reference" /></label>
          <p className="pos-dialog-help">The basket, discounts and stock location will remain available to other cashiers.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setHoldDialog(null)}>Cancel</Button>
          <Button disabled={saving || !holdLabel.trim()} onClick={holdCart}>{saving ? 'Holding…' : 'Hold cart'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Held carts list */}
      <Dialog open={holdDialog === 'list'} onOpenChange={open => !open && setHoldDialog(null)}>
        <DialogContent size="md"><DialogHeader><DialogTitle>Held carts</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="pos-hold-list">
            {holds.map(held => (
              <div key={held.id}>
                <span className="pos-hold-icon"><Icon name="shoppingCart" size={14}/></span>
                <span><strong>{held.label}</strong><small>{held.items.reduce((s, i) => s + i.qty, 0)} items · {held.customer_name ?? 'Walk-in'} · {held.held_by_name}</small><small>{new Date(held.held_at).toLocaleString()}</small></span>
                <Button variant="outline" size="sm" disabled={saving || cart.length > 0} onClick={() => restoreHeld(held)}>Restore</Button>
              </div>
            ))}
            {!holds.length && <div className="pos-history-empty" style={{minHeight:140}}><Icon name="pause" size={22}/><strong>No held carts</strong></div>}
          </div>
          {cart.length > 0 && holds.length > 0 && <p className="pos-dialog-help">Clear or hold the current cart first.</p>}
        </DialogBody>
        <DialogFooter><Button onClick={() => setHoldDialog(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open/close register */}
      <Dialog open={!!shiftDialog} onOpenChange={open => !open && setShiftDialog(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>{shiftDialog === 'open' ? 'Open register' : 'Close register'}</DialogTitle></DialogHeader>
        <DialogBody>
          <label className="pos-dialog-field">
            <span>{shiftDialog === 'open' ? 'Opening cash float' : 'Counted closing cash'}</span>
            <Input type="number" min="0" value={shiftDialog === 'open' ? openingFloat : closingCash} onChange={e => shiftDialog === 'open' ? setOpeningFloat(e.target.value) : setClosingCash(e.target.value)} />
          </label>
          <p className="pos-dialog-help">
            {shiftDialog === 'open'
              ? 'Creates your cashier session and records the starting cash.'
              : `Expected cash is ${cash(sel.shift?.expected_cash ?? 0, currency)}. Enter the drawer count to record variance.`}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShiftDialog(null)}>Cancel</Button>
          <Button disabled={saving} onClick={shiftDialog === 'open' ? openShift : closeShift}>{shiftDialog === 'open' ? 'Open register' : 'Close register'}</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
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
                {receipt.refund_reason && <p className="pos-refund-reason">Refund: {receipt.refund_reason}</p>}
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
          {!readOnly && canRefund && receipt?.status === 'POSTING_FAILED' && <Button disabled={saving} onClick={retryPosting}><Icon name="refresh" size={14}/>{saving ? 'Retrying…' : 'Retry accounting'}</Button>}
          {!readOnly && canRefund && receipt?.status === 'COMPLETED' && <Button variant="destructive" onClick={() => { setRefundTarget(receipt); setReceipt(null); }}><Icon name="refresh" size={14}/>Refund</Button>}
          <Button variant="outline" onClick={() => receipt && printPosReceipt(receipt, loadPosPrintSettings(posPrintKey(user?.tenant_id, user?.id)), company.name)}><Icon name="fileText" size={14}/>Print</Button>
          <Button onClick={() => setReceipt(null)}>Done</Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund */}
      <Dialog open={!readOnly && !!refundTarget} onOpenChange={open => !open && setRefundTarget(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Refund {refundTarget?.sale_number}</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="pos-dialog-help">Reverses the accounting journal and marks the sale as refunded.</p>
          <label className="pos-dialog-field"><span>Refund reason</span><Input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Required audit reason" /></label>
          <label className="pos-dialog-field"><span>Return inventory to</span>
            <Combobox
              options={[{value:'',label:'Do not return stock'}, ...sel.locations.map(l => ({value:l.id,label:`${l.warehouse_name} · ${l.name}`,sublabel:l.code}))]}
              value={refundLocationId} onChange={setRefundLocationId} placeholder="Do not return stock" searchPlaceholder="Stock locations…" />
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
