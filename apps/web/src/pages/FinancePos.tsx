import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PosAnalytics, PosCashMovementDirection, PosHeldCart, PosPaymentMethod, PosSale, PosShift } from '@hudumika/types';
import { PaginationBar } from '../components/PaginationBar.js';
import { Icon, type IconName } from '../components/Icon.js';
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
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion.js';
import { useCompany } from '../data/companyStore.js';
import { loadPosPrintSettings, posPrintKey, printPosReceipt, buildPosReceiptHtml } from '../lib/pos-print.js';
import {loadSavedPosReceipt,type SavedPosReceipt} from '../lib/saved-pos-receipt.js';
import {PosReceiptPreview} from '../components/PosReceiptPreview.js';
import {Banner} from '../components/ui/alert.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import './FinancePos.css';

interface Product { id:string; code:string; name:string; category:string|null; unit:string; type:string; sale_price:number; currency:string; tax_rate:number }
interface Customer { id:string; name:string; email:string|null }
interface Location { id:string; code:string; name:string; warehouse_name:string }
interface Bootstrap { products:Product[]; customers:Customer[]; locations:Location[]; shift:PosShift|null }
interface CartLine extends Product { qty:number; discount:number; discountMode:'amount'|'pct' }
interface PaymentDraft { id:string; method:PosPaymentMethod; amount:string; reference:string; giftCardCode:string }
interface SalesResponse { items:PosSale[]; total:number; page:number; page_size:number }
interface PosUsage { used:number; limit:number|null; period:string }

const METHODS: { value: PosPaymentMethod; label: string }[] = [
  { value:'CASH', label:'Cash' }, { value:'CARD', label:'Card' }, { value:'MOBILE_MONEY', label:'Mobile money' },
  { value:'BANK', label:'Bank transfer' }, { value:'GIFT_CARD', label:'Gift card' }, { value:'OTHER', label:'Other' },
];

const CATEGORY_ICONS: Record<string, IconName> = {
  clothing: 'tag', apparel: 'tag', fashion: 'tag', garments: 'tag',
  footwear: 'layers', shoes: 'layers',
  watches: 'clock', jewellery: 'star', jewelry: 'star', accessories: 'star',
  food: 'leaf', beverages: 'leaf', drinks: 'leaf', groceries: 'leaf',
  electronics: 'smartphone', phones: 'smartphone', computers: 'smartphone',
  bags: 'briefcase', luggage: 'briefcase',
  beauty: 'leaf', health: 'leaf', cosmetics: 'leaf',
  stationery: 'bookOpen', books: 'bookOpen', office: 'bookOpen',
  home: 'home', furniture: 'home', decor: 'home',
  sports: 'flag', fitness: 'flag',
  toys: 'package', gifts: 'package',
  tools: 'tool', hardware: 'tool',
  automotive: 'truck', parts: 'truck',
};
function categoryIcon(name: string): IconName {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) if (key.includes(k)) return v;
  return 'package';
}
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
  const [payments, setPayments] = useState<PaymentDraft[]>([{ id:'primary', method:'CASH', amount:'', reference:'', giftCardCode:'' }]);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [shiftDialog, setShiftDialog] = useState<'open'|'close'|null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<PosSale|null>(null);
  useEffect(()=>{setReceipt(null);},[user?.tenant_id,user?.id]);
  const [receiptOutput,setReceiptOutput]=useState<SavedPosReceipt|null>(null);
  const [receiptLayoutError,setReceiptLayoutError]=useState('');
  const [receiptRevision,setReceiptRevision]=useState(0);
  useEffect(()=>{
    let controller:AbortController|undefined;
    if(!receipt||!user){setReceiptOutput(null);return;}
    const refresh=()=>{
      controller?.abort();const request=new AbortController();controller=request;
      setReceiptOutput(null);setReceiptLayoutError('');
      loadSavedPosReceipt(user.tenant_id,user.id,request.signal).then(output=>{if(!request.signal.aborted)setReceiptOutput(output);}).catch(error=>{if(!request.signal.aborted)setReceiptLayoutError(error instanceof Error?error.message:'Could not load the saved receipt design.');});
    };
    refresh();window.addEventListener('focus',refresh);window.addEventListener('hudumika-pos-receipt-saved',refresh);
    return()=>{controller?.abort();window.removeEventListener('focus',refresh);window.removeEventListener('hudumika-pos-receipt-saved',refresh);};
  },[receipt?.id,receipt?.status,user?.tenant_id,user?.id,receiptRevision]);
  const receiptHtml=useMemo(()=>receipt&&receiptOutput?buildPosReceiptHtml(receipt,receiptOutput.device,receiptOutput.company,receiptOutput.profile,getComputedStyle(document.documentElement).getPropertyValue('--font').trim()):'',[receipt,receiptOutput]);
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
  const [giftCardIssueOpen, setGiftCardIssueOpen] = useState(false);
  const [giftCardAmount, setGiftCardAmount] = useState('');
  const [giftCardMethod, setGiftCardMethod] = useState<PosPaymentMethod>('CASH');
  const [giftCardIssuedCode, setGiftCardIssuedCode] = useState<string|null>(null);
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptStatus, setReceiptStatus] = useState('ALL');
  const [receiptPage, setReceiptPage] = useState(1);
  const [receiptPageSize, setReceiptPageSize] = useState(10);
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [usage, setUsage] = useState<PosUsage|null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'receipts'|'analytics'>('receipts');
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
  function addPayment() { setPayments(prev => [...prev, { id:`payment-${Date.now()}`, method:'CARD', amount:'', reference:'', giftCardCode:'' }]); }
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

  async function issueGiftCard() {
    if (Number(giftCardAmount) <= 0 || giftCardMethod === 'GIFT_CARD') return;
    setSaving(true);
    try {
      const card = await apiFetch('/v1/gift-cards', { method:'POST', body:JSON.stringify({ initial_value:Number(giftCardAmount), method:giftCardMethod }) }) as { code:string };
      setGiftCardIssuedCode(card.code); setGiftCardAmount('');
      showAlert('Gift card issued.', { variant:'success' });
    } catch (e:any) { showAlert(e.message); } finally { setSaving(false); }
  }

  async function printSale(sale:PosSale) {
    try {
      if(!user)throw new Error('Sign in before printing.');
      const [output,currentSale]=await Promise.all([loadSavedPosReceipt(user.tenant_id,user.id),apiFetch<PosSale>(`/v1/finance/pos/sales/${sale.id}`)]);
      if(receipt?.id===sale.id){setReceipt(currentSale);setReceiptOutput(output);}
      printPosReceipt(currentSale,output.device,output.company,output.profile,message=>showAlert(message));
    } catch(error) { showAlert(`The sale is saved, but printing could not start: ${error instanceof Error?error.message:'Check printer settings and retry.'}`); }
  }

  async function checkout() {
    if (!data?.shift || !cart.length) return;
    if (paymentBalance > 0.01) { showAlert(`Payment is short by ${cash(paymentBalance, currency)}.`); return; }
    if (invalidChange) { showAlert('Change can only be issued from the cash portion of the payment.'); return; }
    const missingGiftCardCode = payments.some(p => p.method === 'GIFT_CARD' && !p.giftCardCode.trim());
    if (missingGiftCardCode) { showAlert('Enter the gift card code for the gift card payment.'); return; }
    setSaving(true);
    try {
      const sale = await apiFetch('/v1/finance/pos/sales', { method:'POST', body:JSON.stringify({
        customer_id: customerId || null,
        inventory_location_id: locationId || null,
        currency,
        notes: saleNotes.trim() || null,
        items: cart.map(l => ({ product_id:l.id, qty:l.qty, discount:l.discount })),
        payments: payments.map(p => ({
          method:p.method, amount:Number(p.amount), reference:p.reference || undefined,
          gift_card_code: p.method === 'GIFT_CARD' ? p.giftCardCode.trim() : undefined,
        })),
      }) }) as PosSale;
      const full = await apiFetch(`/v1/finance/pos/sales/${sale.id}`) as PosSale;
      setUsage(cur => cur ? { ...cur, used:cur.used + 1 } : cur);
      setReceipt(full);
      const printSettings = loadPosPrintSettings(posPrintKey(user?.tenant_id, user?.id));
      if (printSettings.autoPrint) void printSale(full);
      clearCart();
      setPayments([{ id:'primary', method:'CASH', amount:'', reference:'', giftCardCode:'' }]);
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
      } else if (event.key === 'F9') { event.preventDefault(); setHistoryTab('receipts'); setHistoryOpen(true); }
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
          <strong>POS</strong>
        </div>
        <div className="pos-toolbar-datetime">
          <Icon name="calendar" size={14} />
          <span>{new Date().toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' })}</span>
          <span className="pos-toolbar-sep" />
          <Icon name="clock" size={14} />
          <span>{new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
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
          <Button variant="outline" size="sm" aria-label="Receipt history" onClick={() => { setHistoryTab('receipts'); setHistoryOpen(true); }}><Icon name="receipt" size={16}/>Receipts</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Till actions"><Icon name="moreHorizontal" size={16}/>More</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { setExitTarget('/finance/pos/settings'); cart.length ? setExitOpen(true) : navigate('/finance/pos/settings'); }}><Icon name="printer" size={15}/>Printer settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setHistoryTab('analytics'); setHistoryOpen(true); }}><Icon name="barChart" size={15}/>Shift insights</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShiftHistoryOpen(true)}><Icon name="clock" size={15}/>Register history</DropdownMenuItem>
              {!readOnly && <>
                {holds.length > 0 && <DropdownMenuItem onSelect={() => setHoldDialog('list')}><Icon name="pause" size={15}/>Held carts ({holds.length})</DropdownMenuItem>}
                {sel.shift && <DropdownMenuItem onSelect={() => setCashMovementOpen(true)}><Icon name="coins" size={15}/>Cash movement</DropdownMenuItem>}
                {sel.shift && <DropdownMenuItem onSelect={() => { setGiftCardIssuedCode(null); setGiftCardIssueOpen(true); }}><Icon name="package" size={15}/>Issue gift card</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => setShiftDialog(sel.shift ? 'close' : 'open')}><Icon name={sel.shift ? 'lock' : 'unlock'} size={15}/>{sel.shift ? 'Close register' : 'Open register'}</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ═══ Metrics strip ═══ */}
      {analytics && (
        <div className="pos-metrics">
          <div className="pos-metric pos-metric--primary"><span>Today’s sales</span><strong>{cash(analytics.today.revenue, currency)}</strong><small>{analytics.today.sales_count} transactions</small></div>
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
        <ResizablePanelGroup direction="horizontal" className="pos-body" autoSaveId="hudumika-pos-columns-v2">
          <ResizablePanel id="pos-categories" order={1} defaultSize={8} minSize={7} maxSize={18} className="pos-column">
          <nav className="pos-category-nav" aria-label="Product categories">
            {[{ name: '', label: 'All', icon: 'grid' as IconName, count: data.products.length }, ...categories.map(name => ({ name, label: name, icon: categoryIcon(name), count: data.products.filter(product => product.category === name).length }))].map(category => (
              <button data-ui-native-button="" key={category.name} className={`pos-cat-tile${selectedCategory === category.name ? ' is-active' : ''}`} aria-pressed={selectedCategory === category.name} onClick={() => { setSelectedCategory(category.name); setProductPage(1); }}>
                <span className="pos-cat-icon"><Icon name={category.icon} size={20} /></span>
                <span className="pos-cat-label">{category.label}</span>
              </button>
            ))}
          </nav>
          </ResizablePanel>
          <ResizableHandle className="pos-column-divider" aria-label="Resize product categories" />

          {/* ── LEFT: Catalogue ── */}
          <ResizablePanel id="pos-products" order={2} defaultSize={60} minSize={30} className="pos-column">
          <div className="pos-catalogue">
            <div className="pos-catalogue-head">
              <div className="pos-catalogue-left">
                <Button variant="outline" size="sm"><Icon name="filter" size={15} />Filter</Button>
                <Badge variant="secondary">{filtered.length} products</Badge>
              </div>
              <div className="pos-catalogue-search">
                <Icon name="search" size={16} />
                <Input
                  aria-label="Search products or scan barcode"
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleCatalogueKey}
                  data-field-appearance="bare"
                  placeholder="Search products or scan barcode…"
                />
              </div>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Product display"><Icon name={productView === 'grid' ? 'grid' : 'list'} size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => setProductView('grid')}>Grid view</DropdownMenuItem><DropdownMenuItem onSelect={() => setProductView('list')}>List view</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>

            {!sel.shift && <div className="pos-closed-banner"><FeaturedIcon variant="brand" size="sm"><Icon name="lock" size={16}/></FeaturedIcon><div><strong>Your register is closed</strong><span>Open the register to add products and take payments.</span></div><Button size="sm" onClick={() => setShiftDialog('open')}>Open register</Button></div>}

            <div className="pos-grid" data-view={productView} ref={productGridRef}>
              {pageProducts.map(product => {
                const available = availability[product.id];
                const unavailable = !!locationId && available !== undefined && available <= 0;
                const inCart = cart.find(line => line.id === product.id)?.qty ?? 0;
                return (
                  <button data-ui-native-button="" type="button" className={`pos-tile${inCart > 0 ? ' is-in-cart' : ''}`} key={product.id} onClick={() => addProduct(product)} disabled={!sel.shift || unavailable}>
                    <div className="pos-tile-img">
                      <FeaturedIcon size="md" variant={inCart > 0 ? 'brand' : 'gray'}><Icon name={categoryIcon(product.category ?? '')} size={22}/></FeaturedIcon>
                      {locationId && available !== undefined && (
                        <Badge variant={available <= 0 ? 'secondary' : 'brand'} className="pos-tile-stock">
                          {available <= 0 ? 'Out of stock' : `${available} ${product.unit}`}
                        </Badge>
                      )}
                      {inCart > 0 && <Badge variant="brand" className="pos-tile-qty">{inCart}</Badge>}
                      {unavailable && <span className="pos-tile-unavail">Not Available</span>}
                    </div>
                    <div className="pos-tile-info">
                      <div className="pos-tile-name">{product.name}</div>
                      <div className="pos-tile-code">SKU: {product.code || '—'}</div>
                    </div>
                    <div className="pos-tile-bottom">
                      <div className="pos-tile-price">{cash(product.sale_price, product.currency)}</div>
                      <span className="pos-tile-add" aria-hidden="true"><Icon name="plus" size={16}/></span>
                    </div>
                  </button>
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
          </ResizablePanel>
          <ResizableHandle className="pos-column-divider" aria-label="Resize order details" />

          {/* ── RIGHT: Cart Panel ── */}
          <ResizablePanel id="pos-order" order={3} defaultSize={32} minSize={26} maxSize={50} className="pos-column">
          <div className="pos-cart-panel">
            <div className="pos-cart-head">
              <div className="pos-cart-head-top">
                <h2>Order Detail</h2>
                <small>Items: {cartItemCount}</small>
              </div>
              {cart.length > 0 && <Button size="xs" variant="ghost" onClick={clearCart}>Clear All</Button>}
            </div>

            <div className="pos-customer-bar">
              <PersonAvatar userId={customerId || undefined} name={customerId ? sel.customers.find(c => c.id === customerId)?.name ?? 'Customer' : 'Walk-in'} size={36} />
              <div className="pos-customer-info">
                <Combobox
                  options={[{value:'',label:'Walk-in customer'}, ...sel.customers.map(c => ({value:c.id,label:c.name,sublabel:c.email ?? undefined}))]}
                  value={customerId} onChange={setCustomerId} placeholder="Walk-in customer" searchPlaceholder="Search customers…" />
              </div>
            </div>

            <div className="pos-cart-scroll">
              <Accordion type="single" collapsible className="pos-sale-settings">
                <AccordionItem value="details"><AccordionTrigger>Sale details<span className="pos-settings-summary">{locationId ? sel.locations.find(l => l.id === locationId)?.name ?? '' : ''}{saleNotes ? ` · ${saleNotes}` : ''}</span></AccordionTrigger><AccordionContent>
              <div className="pos-cart-fields">
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
                    <FeaturedIcon variant="brand" size="md"><Icon name="shoppingCart" size={24} /></FeaturedIcon>
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
                      <div className="pos-line-bottom">
                        {line.discount > 0 ? (
                          <div className="pos-line-discount-row">
                            <Badge variant="brand">−{cash(line.discount, line.currency)}</Badge>
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
                        ) : (
                          <div className="pos-line-discount-row">
                            <Button variant="ghost" size="xs" type="button" className="pos-line-discount-toggle" onClick={() => changeDiscount(line.id, 1)} style={{ fontSize: "var(--text-xs)", color: 'var(--ink3)' }}>+ Discount</Button>
                          </div>
                        )}
                        <div className="pos-line-total">{cash(lineTotal, line.currency)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Docked Cart Footer: Totals + Payment + Balance ── */}
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
                  <span><Icon name="creditCard" size={15}/>Payment details</span>
                  <Button size="xs" variant="ghost" onClick={addPayment}><Icon name="plus" size={12}/>Split</Button>
                </div>
                {payments.map((payment, index) => (
                  <React.Fragment key={payment.id}>
                    <div className={`pos-pay-row${payments.length > 1 ? ' is-multi' : ''}`}>
                      <Select value={payment.method} onValueChange={value => updatePayment(payment.id, { method:value as PosPaymentMethod })}>
                        <SelectTrigger aria-label={`Payment ${index + 1} method`}><SelectValue/></SelectTrigger>
                        <SelectContent>{METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input aria-label={`Payment ${index + 1} amount`} inputMode="decimal" type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => updatePayment(payment.id, { amount:e.target.value })} placeholder={index === 0 ? totals.total.toFixed(2) : 'Amount'} />
                      {payment.method === 'GIFT_CARD' ? (
                        <Input aria-label={`Payment ${index + 1} gift card code`} value={payment.giftCardCode} onChange={e => updatePayment(payment.id, { giftCardCode:e.target.value })} placeholder="Gift card code" />
                      ) : (
                        <Input aria-label={`Payment ${index + 1} reference`} value={payment.reference} onChange={e => updatePayment(payment.id, { reference:e.target.value })} placeholder="Reference (optional)" />
                      )}
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
            </div>
              <div className="pos-checkout-footer">
                <button data-ui-native-button="" type="button" className="pos-action-btn" disabled={!cart.length || saving} onClick={() => { setHoldLabel(customerId ? sel.customers.find(c => c.id === customerId)?.name ?? '' : `Walk-in · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`); setHoldDialog('save'); }}><span className="pos-action-icon"><Icon name="pause" size={18}/></span><span>Hold</span></button>
                <button data-ui-native-button="" type="button" className="pos-action-btn" disabled={!sel.shift || !cart.length || saving} onClick={() => { showAlert('Invoice mode is available after checkout — select a customer and check out to generate a linked invoice.'); }}><span className="pos-action-icon"><Icon name="fileText" size={18}/></span><span>Bill</span></button>
                <Button size="lg"
                  type="button"
                  className="pos-charge-btn"
                  disabled={!sel.shift || !cart.length || saving || quotaExhausted || stockIssues.length > 0 || paymentBalance > 0.01 || invalidChange}
                  onClick={checkout}
                >
                  <Icon name="shoppingCart" size={18} />
                  {saving ? 'Processing…' : 'Submit Order'}
                </Button>
              </div>
              {!sel.shift && <p className="pos-register-closed-note">Open the register to start selling.</p>}
          </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {!readOnly && <div className="pos-mobile-basket"><div><small>{cartItemCount} items in your sale</small><strong>{cash(totals.total, currency)}</strong></div><Button onClick={() => setMobilePane('sale')}>Review sale<Icon name="shoppingCart" size={16}/></Button></div>}

      {/* ═══ Receipt History & Shift Insights Side Panel ═══ */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-[520px] pos-history-panel" aria-describedby={undefined}>
          <div className="pos-history-head">
            <div className="pos-history-title-group">
              <SheetTitle className="pos-history-title">
                {historyTab === 'receipts' ? 'Receipt history' : 'Shift insights'}
              </SheetTitle>
              <p className="pos-history-subtitle">
                {historyTab === 'receipts'
                  ? `${receiptTotal} recorded sale${receiptTotal === 1 ? '' : 's'}`
                  : `${analytics?.today.sales_count ?? 0} transactions today`}
              </p>
            </div>
          </div>

          <div className="pos-history-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={historyTab === 'receipts'}
              className={`pos-history-tab${historyTab === 'receipts' ? ' is-active' : ''}`}
              onClick={() => setHistoryTab('receipts')}
            >
              <Icon name="receipt" size={15} />
              <span>Receipts</span>
              {receiptTotal > 0 && <span className="pos-tab-badge">{receiptTotal}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={historyTab === 'analytics'}
              className={`pos-history-tab${historyTab === 'analytics' ? ' is-active' : ''}`}
              onClick={() => setHistoryTab('analytics')}
            >
              <Icon name="barChart" size={15} />
              <span>Today’s shift</span>
            </button>
          </div>

          {historyTab === 'receipts' ? (
            <div className="pos-history-body">
              <div className="pos-history-filters">
                <div className="pos-history-search">
                  <Icon name="search" size={15} className="pos-search-icon" />
                  <input data-ui-field="input"
                    type="text"
                    value={receiptSearch}
                    onChange={e => { setReceiptSearch(e.target.value); setReceiptPage(1); }}
                    placeholder="Search receipt # or customer…"
                    aria-label="Search receipts"
                  />
                  {receiptSearch && (
                    <button data-ui-native-button=""
                      type="button"
                      className="pos-search-clear"
                      onClick={() => { setReceiptSearch(''); setReceiptPage(1); }}
                      aria-label="Clear search"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
                <Select value={receiptStatus} onValueChange={v => { setReceiptStatus(v); setReceiptPage(1); }}>
                  <SelectTrigger className="w-[125px] shrink-0 h-9" aria-label="Receipt status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="REFUNDED">Refunded</SelectItem>
                    <SelectItem value="POSTING_FAILED">Failed</SelectItem>
                    <SelectItem value="VOIDED">Voided</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pos-history-list">
                {sales.map(sale => (
                  <button data-ui-native-button=""
                    type="button"
                    key={sale.id}
                    className="pos-history-item"
                    onClick={() => {
                      apiFetch(`/v1/finance/pos/sales/${sale.id}`)
                        .then(r => { setReceipt(r as PosSale); setHistoryOpen(false); })
                        .catch((e: Error) => showAlert(e.message));
                    }}
                  >
                    <div className="pos-history-item-top">
                      <span className="pos-history-receipt-num">{sale.sale_number}</span>
                      <div className="pos-history-item-status">
                        <Badge variant={sale.status === 'POSTING_FAILED' || sale.status === 'VOIDED' ? 'destructive' : sale.status === 'REFUNDED' ? 'warning' : 'success'}>
                          {sale.status === 'POSTING_FAILED' ? 'Failed' : sale.status}
                        </Badge>
                        <strong className="pos-history-item-total">{cash(sale.grand_total, sale.currency)}</strong>
                      </div>
                    </div>
                    <div className="pos-history-item-meta">
                      <span className="pos-history-customer">
                        <Icon name="user" size={13} />
                        {sale.customer_name ?? 'Walk-in'}
                      </span>
                      <span className="pos-history-dot">·</span>
                      <span className="pos-history-date">
                        <Icon name="clock" size={13} />
                        {new Date(sale.sold_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                      <Icon name="chevronRight" size={14} className="pos-history-chevron" />
                    </div>
                  </button>
                ))}
                {!sales.length && (
                  <div className="pos-history-empty">
                    <div className="pos-empty-icon-wrap">
                      <Icon name="receipt" size={26} />
                    </div>
                    <strong>No receipts found</strong>
                    <p>
                      {receiptSearch || receiptStatus !== 'ALL'
                        ? 'No receipts match your search or status filter.'
                        : 'Completed sales will appear in this log.'}
                    </p>
                    {(receiptSearch || receiptStatus !== 'ALL') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setReceiptSearch(''); setReceiptStatus('ALL'); setReceiptPage(1); }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="pos-history-footer">
                <PaginationBar
                  page={receiptPage}
                  pageSize={receiptPageSize}
                  total={receiptTotal}
                  onPageChange={setReceiptPage}
                  onPageSizeChange={size => { setReceiptPageSize(size); setReceiptPage(1); }}
                  pageSizeOptions={[10, 20, 50]}
                  itemLabel="receipt"
                />
              </div>
            </div>
          ) : (
            <div className="pos-shift-insights">
              <div className="pos-shift-kpi-grid">
                <div className="pos-shift-kpi-card">
                  <span className="pos-shift-kpi-label">Today's Sales</span>
                  <strong className="pos-shift-kpi-val">{cash(analytics?.today.revenue ?? 0, currency)}</strong>
                  <small className="pos-shift-kpi-sub">{analytics?.today.sales_count ?? 0} receipts</small>
                </div>
                <div className="pos-shift-kpi-card">
                  <span className="pos-shift-kpi-label">Average Sale</span>
                  <strong className="pos-shift-kpi-val">{cash(analytics?.today.average_sale ?? 0, currency)}</strong>
                  <small className="pos-shift-kpi-sub">Per transaction</small>
                </div>
                <div className="pos-shift-kpi-card">
                  <span className="pos-shift-kpi-label">Gross Margin</span>
                  <strong className="pos-shift-kpi-val">{cash(analytics?.today.margin ?? 0, currency)}</strong>
                  <small className="pos-shift-kpi-sub">After tax &amp; cost</small>
                </div>
                <div className="pos-shift-kpi-card">
                  <span className="pos-shift-kpi-label">Discounts</span>
                  <strong className="pos-shift-kpi-val">{cash(analytics?.today.discounts ?? 0, currency)}</strong>
                  <small className="pos-shift-kpi-sub">{analytics?.today.revenue ? `${((analytics.today.discounts / analytics.today.revenue) * 100).toFixed(1)}%` : '0%'} rate</small>
                </div>
              </div>

              <div className="pos-analytics-card">
                <div className="pos-analytics-card-header">
                  <div className="pos-analytics-card-title">
                    <Icon name="users" size={15} />
                    <h3>Cashier Leaderboard</h3>
                  </div>
                  <Badge variant="outline">Today</Badge>
                </div>
                {analytics?.cashiers && analytics.cashiers.length > 0 ? (
                  <div className="pos-analytics-list">
                    {analytics.cashiers.map((c, idx) => (
                      <div key={c.user_id} className="pos-analytics-row">
                        <span className={`pos-rank pos-rank-${idx + 1}`}>#{idx + 1}</span>
                        <PersonAvatar userId={c.user_id} name={c.name} size={30} />
                        <div className="pos-cashier-info">
                          <strong>{c.name}</strong>
                          <small>{c.sales_count} sales · Avg {cash(c.average_sale, currency)}</small>
                        </div>
                        <b className="pos-cashier-revenue">{cash(c.revenue, currency)}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pos-insights-empty">
                    <Icon name="users" size={24} />
                    <strong>No cashier sales today</strong>
                    <p>Sales processed during today’s shifts will be ranked here.</p>
                  </div>
                )}
              </div>

              <div className="pos-analytics-card">
                <div className="pos-analytics-card-header">
                  <div className="pos-analytics-card-title">
                    <Icon name="creditCard" size={15} />
                    <h3>Payment Mix</h3>
                  </div>
                  <Badge variant="outline">Today</Badge>
                </div>
                {analytics?.payments && analytics.payments.length > 0 ? (
                  <div className="pos-analytics-list">
                    {analytics.payments.map(p => {
                      const totalPay = analytics.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
                      const pct = totalPay > 0 ? Math.round(((Number(p.amount) || 0) / totalPay) * 100) : 0;
                      return (
                        <div key={p.method} className="pos-pay-mix-item">
                          <div className="pos-analytics-row">
                            <span className="pos-pay-icon">
                              <Icon name={p.method === 'CASH' ? 'coins' : p.method === 'CARD' ? 'creditCard' : p.method === 'MOBILE_MONEY' ? 'smartphone' : p.method === 'BANK' ? 'bankNote' : p.method === 'GIFT_CARD' ? 'package' : 'creditCard'} size={14} />
                            </span>
                            <div className="pos-pay-info">
                              <strong>{METHODS.find(m => m.value === p.method)?.label ?? p.method}</strong>
                              <small>{p.count} entries · {pct}%</small>
                            </div>
                            <b className="pos-pay-amount">{cash(p.amount, currency)}</b>
                          </div>
                          <div className="pos-pay-progress-bar">
                            <div className="pos-pay-progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="pos-insights-empty">
                    <Icon name="creditCard" size={24} />
                    <strong>No payments today</strong>
                    <p>Payments collected across all tenders will display here.</p>
                  </div>
                )}
              </div>

              <div className="pos-shift-actions-card">
                <div>
                  <strong>Register Sessions &amp; Cash Float</strong>
                  <p>Inspect opened/closed drawer records, counted cash, and variance.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setShiftHistoryOpen(true); setHistoryOpen(false); }}>
                  <Icon name="clock" size={14} /> Register history
                </Button>
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

      {/* Issue gift card */}
      <Dialog open={giftCardIssueOpen} onOpenChange={open => { setGiftCardIssueOpen(open); if (!open) setGiftCardIssuedCode(null); }}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Issue gift card</DialogTitle></DialogHeader>
        <DialogBody>
          {giftCardIssuedCode ? (
            <>
              <p className="pos-dialog-help">Give this code to the customer — it's what they'll hand back at checkout to redeem it.</p>
              <div className="pos-gift-card-code">
                <strong>{giftCardIssuedCode}</strong>
                <Button variant="outline" size="xs" type="button" onClick={async () => { try { await navigator.clipboard.writeText(giftCardIssuedCode); showAlert('Copied.', { variant:'success' }); } catch { /* clipboard unavailable */ } }}>Copy</Button>
              </div>
            </>
          ) : (
            <>
              <p className="pos-dialog-help">Sells a new gift card for cash received now at the register.</p>
              <label className="pos-dialog-field"><span>Amount</span><Input type="number" min="0.01" step="0.01" value={giftCardAmount} onChange={e => setGiftCardAmount(e.target.value)} placeholder="0.00" /></label>
              <label className="pos-dialog-field"><span>Tender received</span>
                <Select value={giftCardMethod} onValueChange={v => setGiftCardMethod(v as PosPaymentMethod)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{METHODS.filter(m => m.value !== 'GIFT_CARD').map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {giftCardIssuedCode ? (
            <Button onClick={() => setGiftCardIssueOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGiftCardIssueOpen(false)}>Cancel</Button>
              <Button disabled={saving || Number(giftCardAmount) <= 0} onClick={issueGiftCard}>{saving ? 'Issuing…' : 'Issue'}</Button>
            </>
          )}
        </DialogFooter>
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
        <DialogContent size="lg" style={{height:'min(90dvh,1000px)'}}><DialogHeader><DialogTitle>Sale receipt</DialogTitle></DialogHeader>
        <DialogBody>
          {receipt?.posting_error&&<Banner variant="error">{receipt.posting_error}</Banner>}
          {receipt?.refund_reason&&<Banner variant="info">Refund: {receipt.refund_reason}</Banner>}
          {receiptLayoutError?<Banner variant="error">Could not load the saved receipt design: {receiptLayoutError}<Button variant="outline" size="sm" onClick={()=>setReceiptRevision(r=>r+1)}>Retry</Button></Banner>:!receiptOutput?<SectionLoading/>:<>
            <p className="mb-3 text-xs text-muted-foreground">Saved tenant receipt design · {receiptOutput.profile.template} · {receiptOutput.device.paper}</p>
            <PosReceiptPreview html={receiptHtml} title="Saved sale receipt preview"/>
          </>}
        </DialogBody>
        <DialogFooter>
          {!readOnly && canRefund && receipt?.status === 'POSTING_FAILED' && <Button disabled={saving} onClick={retryPosting}><Icon name="refresh" size={14}/>{saving ? 'Retrying…' : 'Retry accounting'}</Button>}
          {!readOnly && canRefund && receipt?.status === 'COMPLETED' && <Button variant="destructive" onClick={() => { setRefundTarget(receipt); setReceipt(null); }}><Icon name="refresh" size={14}/>Refund</Button>}
          <Button variant="outline" disabled={!receiptOutput||!!receiptLayoutError} onClick={() => receipt && void printSale(receipt)}><Icon name="fileText" size={14}/>Print</Button>
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
