import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { apiFetch } from '../lib/api.js';
import { formatAmount } from '../lib/currency.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Tip } from '../components/ui/tooltip.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Progress } from '../components/ui/progress.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { financeCatalogOptions, financeCatalogProfile, financeIndustryName, catalogBillingDescription, type FinanceIndustryKey, type IndustryCatalogData } from '@hudumika/types';
import { useCompany } from '../data/companyStore.js';
import { cn } from '../lib/utils.js';
import './ProductsServices.css';

// -- Types ---------------------------------------------------------------------

export interface Product extends IndustryCatalogData {
  id: string;
  name: string;
  code: string;
  type?: 'product' | 'service';
  category: string;
  description: string;
  unit: string;
  sale_price: number;
  purchase_price?: number;
  currency: string;
  tax_rate: number;
  tax_code_id?: string | null;
  status: 'active' | 'inactive';
  notes?: string;
  compare_at_price?: number | null;
  brand?: string;
  vendor_name?: string;
  image_urls?: string[];
  stock_quantity?: number | null;
  low_stock_threshold?: number;
  track_inventory?: boolean;
  weight_kg?: number | null;
  dimensions_cm?: { length: number; width: number; height: number } | null;
  shipping_class?: string;
  variants?: { name: string; values: string[] }[];
  meta_title?: string;
  meta_description?: string;
  url_handle?: string;
  visibility?: 'published' | 'draft' | 'scheduled';
  channels?: string[];
  created_at: string;
  updated_at?: string;
}

export interface ProductFormState {
  industry_key: FinanceIndustryKey | null;
  industry_attributes: Record<string, string>;
  name: string;
  code: string;
  type: 'product' | 'service';
  category: string;
  description: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  currency: string;
  tax_rate: number;
  tax_code_id: string | null;
  status: 'active' | 'inactive';
  notes: string;
  compare_at_price: number | null;
  brand: string;
  vendor_name: string;
  image_urls: string[];
  stock_quantity: number | null;
  low_stock_threshold: number;
  track_inventory: boolean;
  weight_kg: number | null;
  dimensions_cm: { length: number; width: number; height: number } | null;
  shipping_class: string;
  variants: { name: string; values: string[] }[];
  meta_title: string;
  meta_description: string;
  url_handle: string;
  visibility: 'published' | 'draft' | 'scheduled';
  channels: string[];
}

export interface CustomerPriceRow {
  customer_id: string;
  customer_name: string;
  price: number;
  currency: string;
  note: string;
}

// -- Constants -----------------------------------------------------------------

const CATEGORIES = ['FREIGHT','CLEARANCE','HANDLING','TRANSPORT','WAREHOUSING','FULFILLMENT','PACKAGING','PROCUREMENT','DUTY','INSURANCE','LABOR','OTHER'];
const CAT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  FREIGHT:      { label: 'Freight',        color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  CLEARANCE:    { label: 'Clearance',      color: 'var(--teal)',   bg: 'var(--teal-l)'   },
  HANDLING:     { label: 'Handling',       color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  TRANSPORT:    { label: 'Transport',      color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  WAREHOUSING:  { label: 'Warehousing',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  FULFILLMENT:  { label: 'Fulfillment',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  PACKAGING:    { label: 'Packaging',      color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  PROCUREMENT:  { label: 'Procurement',    color: 'var(--green)',  bg: 'var(--green-l)'  },
  DUTY:         { label: 'Duty & Taxes',   color: 'var(--red)',    bg: 'var(--red-l)'    },
  INSURANCE:    { label: 'Insurance',      color: 'var(--green)',  bg: 'var(--green-l)'  },
  LABOR:        { label: 'Labor',          color: 'var(--ink3)',   bg: 'var(--bg)'       },
  OTHER:        { label: 'Other',          color: 'var(--ink3)',   bg: 'var(--bg)'       },
};

const UNITS = ['shipment','container','kg','CBM','trip','day','hour','set','certificate','declaration','audit','order','delivery','pallet','%','unit','m3','ton','MT','BL','AWB','transire','vehicle'];
const CURRENCIES = ['USD','TZS','EUR','GBP','KES','ZAR','AED'];

const STARTER_CATALOG: Omit<Product, 'id' | 'created_at' | 'updated_at'>[] = [
  // Freight
  { name:'Sea Freight — 20ft FCL',        code:'SF-FCL-20',   category:'FREIGHT',     unit:'container',   sale_price:1200, currency:'USD', tax_rate:0,  status:'active', description:'Full container load sea freight — 20ft standard container' },
  { name:'Sea Freight — 40ft FCL',        code:'SF-FCL-40',   category:'FREIGHT',     unit:'container',   sale_price:1800, currency:'USD', tax_rate:0,  status:'active', description:'Full container load sea freight — 40ft standard container' },
  { name:'Sea Freight — 40ft HC',         code:'SF-FCL-40H',  category:'FREIGHT',     unit:'container',   sale_price:2000, currency:'USD', tax_rate:0,  status:'active', description:'Full container load sea freight — 40ft high cube container' },
  { name:'Sea Freight — LCL',             code:'SF-LCL',      category:'FREIGHT',     unit:'CBM',         sale_price:85,   currency:'USD', tax_rate:0,  status:'active', description:'Less than container load sea freight (per CBM)' },
  { name:'Air Freight',                   code:'AF-KG',       category:'FREIGHT',     unit:'kg',          sale_price:4.5,  currency:'USD', tax_rate:0,  status:'active', description:'Air freight charge per kilogram (chargeable weight)' },
  { name:'Air Freight — Minimum',         code:'AF-MIN',      category:'FREIGHT',     unit:'shipment',    sale_price:350,  currency:'USD', tax_rate:0,  status:'active', description:'Air freight minimum charge per shipment' },
  { name:'Rail Freight — Container',      code:'SF-RAIL',     category:'FREIGHT',     unit:'container',   sale_price:900,  currency:'USD', tax_rate:0,  status:'active', description:'Rail freight, per container' },
  { name:'Bulk / Break-Bulk Cargo',       code:'SF-BULK',     category:'FREIGHT',     unit:'ton',         sale_price:45,   currency:'USD', tax_rate:0,  status:'active', description:'Bulk or break-bulk ocean freight, per metric ton' },
  // Clearance
  { name:'Clearing Agency Fee — Import · Sea · 20ft Container',        code:'CL-IMP-SEA-20FT',      category:'CLEARANCE', unit:'container', sale_price:150, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, 20-foot container' },
  { name:'Clearing Agency Fee — Import · Sea · 40ft Container',        code:'CL-IMP-SEA-40FT',      category:'CLEARANCE', unit:'container', sale_price:200, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, 40-foot container' },
  { name:'Clearing Agency Fee — Import · Sea · Dry Bulk Cargo',        code:'CL-IMP-SEA-DRYBULK',   category:'CLEARANCE', unit:'MT',        sale_price:0.6, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, dry bulk cargo, per metric ton' },
  { name:'Clearing Agency Fee — Import · Sea · Bulk Liquid',           code:'CL-IMP-SEA-BULKLIQ',   category:'CLEARANCE', unit:'MT',        sale_price:0.6, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, bulk liquid, per metric ton' },
  { name:'Clearing Agency Fee — Import · Sea · Motor Vehicle',         code:'CL-IMP-SEA-VEHICLE',   category:'CLEARANCE', unit:'unit',      sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, motor vehicle' },
  { name:'Clearing Agency Fee — Import · Sea · Heavy Machines & Equipment', code:'CL-IMP-SEA-MACHINE', category:'CLEARANCE', unit:'unit',    sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, heavy machines & equipment' },
  { name:'Clearing Agency Fee — Import · Sea · Live Animal',           code:'CL-IMP-SEA-LIVEANIMAL',category:'CLEARANCE', unit:'BL',        sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, live animal, per BL' },
  { name:'Clearing Agency Fee — Import · Sea · Loose Cargo/LCL',       code:'CL-IMP-SEA-LCL',       category:'CLEARANCE', unit:'BL',        sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, loose cargo / less than container load, per BL' },
  { name:'Clearing Agency Fee — Import · Sea · Post Entry & Ex-Bond',  code:'CL-IMP-SEA-POSTENTRY', category:'CLEARANCE', unit:'BL',        sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, post entry & ex-bond, per BL' },
  { name:'Clearing Agency Fee — Import · Sea · Carriage Coastwise',    code:'CL-IMP-SEA-COASTWISE', category:'CLEARANCE', unit:'transire',  sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, sea/inland waterways, carriage coastwise, per transire' },
  { name:'Clearing Agency Fee — Import · Road (Border) · 20ft Container', code:'CL-IMP-ROAD-20FT',  category:'CLEARANCE', unit:'container', sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, road transport (border), 20-foot container' },
  { name:'Clearing Agency Fee — Import · Road (Border) · 40ft Container', code:'CL-IMP-ROAD-40FT',  category:'CLEARANCE', unit:'container', sale_price:190, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, road transport (border), 40-foot container' },
  { name:'Clearing Agency Fee — Import · Road (Border) · Motor Vehicle', code:'CL-IMP-ROAD-VEHICLE',category:'CLEARANCE', unit:'unit',      sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, road transport (border), motor vehicle' },
  { name:'Clearing Agency Fee — Import · Road (Border) · Heavy Machines & Equipment', code:'CL-IMP-ROAD-MACHINE', category:'CLEARANCE', unit:'unit', sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, road transport (border), heavy machines & equipment' },
  { name:'Clearing Agency Fee — Import · Road (Border) · Live Animal', code:'CL-IMP-ROAD-LIVEANIMAL',category:'CLEARANCE', unit:'BL',      sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, road transport (border), live animal, per BL' },
  { name:'Clearing Agency Fee — Import · Road (Border) · Loose Cargo/LCL', code:'CL-IMP-ROAD-LCL',  category:'CLEARANCE', unit:'vehicle',   sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, road transport (border), loose cargo / less than container load, per vehicle' },
  { name:'Clearing Agency Fee — Import · Air · Parcel/Courier',        code:'CL-IMP-AIR-PARCEL',    category:'CLEARANCE', unit:'AWB',       sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, air transport, parcel / courier, per AWB' },
  { name:'Clearing Agency Fee — Import · Air · General Cargo',         code:'CL-IMP-AIR-GENERAL',   category:'CLEARANCE', unit:'AWB',       sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, air transport, general cargo, per AWB' },
  { name:'Clearing Agency Fee — Import · Air · Live Animal',           code:'CL-IMP-AIR-LIVEANIMAL',category:'CLEARANCE', unit:'AWB',       sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — import, air transport, live animal, per AWB' },
  { name:'Documentation Fee',             code:'CL-DOCS',     category:'CLEARANCE',   unit:'set',         sale_price:75,   currency:'USD', tax_rate:18, status:'active', description:'Preparation of shipping documentation and certificates' },
  { name:'Bill of Lading Processing',     code:'CL-BL',       category:'CLEARANCE',   unit:'set',         sale_price:60,   currency:'USD', tax_rate:18, status:'active', description:'Bill of lading processing and handling fee' },
  { name:'Pre-Shipment Inspection',       code:'CL-PSI',      category:'CLEARANCE',   unit:'shipment',    sale_price:200,  currency:'USD', tax_rate:18, status:'active', description:'Pre-shipment inspection (PVoC / CoC)' },
  { name:'Phytosanitary Certificate',     code:'CL-PHYTO',    category:'CLEARANCE',   unit:'certificate', sale_price:80,   currency:'USD', tax_rate:18, status:'active', description:'Phytosanitary / health certificate processing' },
  { name:'TANCIS Declaration Lodgement',  code:'CL-TANCIS',   category:'CLEARANCE',   unit:'declaration', sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Customs declaration lodgement via TANCIS' },
  { name:'Certificate of Origin',         code:'CL-COO',      category:'CLEARANCE',   unit:'certificate', sale_price:50,   currency:'USD', tax_rate:18, status:'active', description:'Certificate of origin processing and endorsement' },
  // Handling
  { name:'Terminal Handling Charge',      code:'PH-THC',      category:'HANDLING',    unit:'container',   sale_price:250,  currency:'USD', tax_rate:0,  status:'active', description:'Terminal handling charges at port of loading or discharge' },
  { name:'Port Scanning / X-Ray',         code:'PH-SCAN',     category:'HANDLING',    unit:'container',   sale_price:50,   currency:'USD', tax_rate:0,  status:'active', description:'Port scanner / X-ray inspection fee' },
  { name:'Weighbridge Certificate',       code:'PH-WGH',      category:'HANDLING',    unit:'unit',        sale_price:30,   currency:'USD', tax_rate:18, status:'active', description:'Weighbridge measurement and certificate fee' },
  { name:'Fumigation Treatment',          code:'PH-FUM',      category:'HANDLING',    unit:'container',   sale_price:150,  currency:'USD', tax_rate:18, status:'active', description:'Fumigation treatment and phytosanitary certificate' },
  { name:'Container Devanning',           code:'PH-DEVAN',    category:'HANDLING',    unit:'container',   sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Unloading / stripping a container at the warehouse' },
  { name:'Container Stuffing',            code:'PH-STUFF',    category:'HANDLING',    unit:'container',   sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Loading / stuffing a container for export' },
  // Transport
  { name:'Road Transport — Local',        code:'RT-LOCAL',    category:'TRANSPORT',   unit:'trip',        sale_price:450,  currency:'USD', tax_rate:18, status:'active', description:'Local inland transport and delivery' },
  { name:'Road Transport — Upcountry',    code:'RT-UPCTRY',   category:'TRANSPORT',   unit:'trip',        sale_price:850,  currency:'USD', tax_rate:18, status:'active', description:'Upcountry delivery to inland destination' },
  { name:'Cross-Border Haulage',          code:'RT-XBORDER',  category:'TRANSPORT',   unit:'trip',        sale_price:1500, currency:'USD', tax_rate:0,  status:'active', description:'Cross-border road haulage to a neighboring country' },
  { name:'Last-Mile Delivery',            code:'RT-LASTMILE', category:'TRANSPORT',   unit:'delivery',    sale_price:25,   currency:'USD', tax_rate:18, status:'active', description:'Final-leg delivery to the consignee' },
  // Warehousing
  { name:'Warehouse Storage — General',   code:'WH-STOR',     category:'WAREHOUSING', unit:'day',         sale_price:15,   currency:'USD', tax_rate:18, status:'active', description:'General goods storage, per pallet per day' },
  { name:'Bonded Warehouse Storage',      code:'WH-BOND',     category:'WAREHOUSING', unit:'day',         sale_price:25,   currency:'USD', tax_rate:18, status:'active', description:'Bonded (duty-suspended) warehouse storage, per day' },
  { name:'Cold Chain / Reefer Storage',   code:'WH-COLD',     category:'WAREHOUSING', unit:'day',         sale_price:40,   currency:'USD', tax_rate:18, status:'active', description:'Temperature-controlled storage, per day' },
  // Fulfillment
  { name:'Pick & Pack',                   code:'FF-PICKPACK', category:'FULFILLMENT', unit:'order',       sale_price:3.5,  currency:'USD', tax_rate:18, status:'active', description:'Order picking and packing, per order' },
  { name:'Kitting / Assembly',            code:'FF-KIT',      category:'FULFILLMENT', unit:'unit',        sale_price:2,    currency:'USD', tax_rate:18, status:'active', description:'Kitting or light assembly of components, per unit' },
  { name:'Returns Processing',            code:'FF-RETURN',   category:'FULFILLMENT', unit:'unit',        sale_price:5,    currency:'USD', tax_rate:18, status:'active', description:'Reverse-logistics inspection and restocking of a returned unit' },
  // Duty & Taxes
  { name:'Import Duty',                   code:'DT-IMP',      category:'DUTY',        unit:'%',           sale_price:0,    currency:'USD', tax_rate:0,  status:'active', description:'Customs import duty — percentage of CIF value, rate varies by HS code' },
  { name:'VAT on Import',                 code:'DT-VAT',      category:'DUTY',        unit:'%',           sale_price:0,    currency:'USD', tax_rate:0,  status:'active', description:'Value added tax assessed on imported goods' },
];

function genCode(name: string, category: string): string {
  const abbr: Record<string, string> = {
    FREIGHT: 'SF', CLEARANCE: 'CL', HANDLING: 'PH', TRANSPORT: 'RT', WAREHOUSING: 'WH',
    FULFILLMENT: 'FF', PACKAGING: 'PK', PROCUREMENT: 'PR', DUTY: 'DT', INSURANCE: 'INS', LABOR: 'LB', OTHER: 'OT',
  };
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return `${abbr[category] ?? 'SV'}-${slug || 'ITEM'}`;
}

function fmt(amount: number, currency = 'USD') {
  if (amount === 0) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  } catch { return `${currency} ${amount}`; }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_CFG[cat] ?? CAT_CFG.OTHER;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap', border: `1px solid color-mix(in srgb, ${c.color} 18%, transparent)` }}>
      {c.label}
    </span>
  );
}

function StatusPill({ status }: { status: 'active' | 'inactive' }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'gray'}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block', opacity: 0.7 }} />
      {status === 'active' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function ProductTypeBadge({ type }: { type?: 'product' | 'service' }) {
  const isProd = type === 'product';
  return (
    <span className={cn('product-type-badge', isProd ? 'product-type-badge--product' : 'product-type-badge--service')}>
      <Icon name={isProd ? 'package' : 'zap'} size={11} />
      {isProd ? 'Product' : 'Service'}
    </span>
  );
}

function StockPill({ product }: { product: Product }) {
  if (product.type !== 'product' || !product.track_inventory) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const qty = product.stock_quantity ?? 0;
  const threshold = product.low_stock_threshold ?? 5;
  if (qty <= 0) {
    return <span className="stock-pill stock-pill--out"><Icon name="alertCircle" size={10} /> Out of stock</span>;
  }
  if (qty <= threshold) {
    return <span className="stock-pill stock-pill--low"><Icon name="clock" size={10} /> Low ({qty})</span>;
  }
  return <span className="stock-pill stock-pill--in"><Icon name="check" size={10} /> {qty} in stock</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 1: Dedicated Product Detail Page
// ─────────────────────────────────────────────────────────────────────────────

function ProductDetailPage({
  product,
  onEdit,
  onDelete,
  onToggleStatus,
  baseRoute,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  baseRoute: string;
}) {
  const [prices, setPrices] = useState<CustomerPriceRow[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);

  useEffect(() => {
    if (!product?.id) return;
    setLoadingPrices(true);
    apiFetch(`/v1/products/${product.id}/customer-prices`)
      .then((rows: any) => {
        setPrices(Array.isArray(rows) ? rows.map((r: any) => ({
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          price: Number(r.price) || 0,
          currency: r.currency || product.currency,
          note: r.note || '',
        })) : []);
      })
      .catch(() => setPrices([]))
      .finally(() => setLoadingPrices(false));
  }, [product.id, product.currency]);

  const hasCost = typeof product.purchase_price === 'number' && product.purchase_price > 0;
  const grossProfit = hasCost ? product.sale_price - (product.purchase_price || 0) : null;
  const marginPct = hasCost && product.sale_price > 0 ? Math.round(((grossProfit || 0) / product.sale_price) * 100) : null;

  return (
    <div className="products-services-page">
      <PageHeader
        crumbs={['Finance', { label: 'Products & Services', to: `${baseRoute}/products` }, product.name]}
        titlePlain={product.name}
        titleEm={product.code}
        subtitle={`${CAT_CFG[product.category]?.label ?? product.category} · ${product.type === 'product' ? 'Physical Product' : 'Invoiceable Service'}`}
        backTo={`${baseRoute}/products`}
        backLabel="Back to products"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={onEdit} size="sm">
              <Icon name="edit" size={13} /> Edit Item
            </Button>
            <Button variant="outline" size="sm" onClick={onToggleStatus}>
              <Icon name="eye" size={13} /> {product.status === 'active' ? 'Set Inactive' : 'Set Active'}
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Icon name="trash" size={13} /> Delete
            </Button>
          </div>
        }
      />

      <div className="product-detail-layout mt-4">
        {/* Main Column */}
        <div className="flex flex-col gap-5">
          {/* Hero Pricing & Margin Card */}
          <div className="product-hero-pricing">
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Selling Price
              </div>
              <div className="product-hero-amount">
                {product.sale_price > 0 ? fmt(product.sale_price, product.currency) : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span>per <strong>{product.unit}</strong></span>
                <span>•</span>
                <span>{product.tax_rate > 0 ? `${product.tax_rate}% tax` : 'Tax exempt'}</span>
                {product.compare_at_price && product.compare_at_price > product.sale_price && (
                  <>
                    <span>•</span>
                    <span className="line-through text-muted-foreground">{fmt(product.compare_at_price, product.currency)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {hasCost && (
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">Unit Cost</div>
                  <div className="text-sm font-semibold tabular-nums text-foreground">
                    {fmt(product.purchase_price || 0, product.currency)}
                  </div>
                  {marginPct !== null && (
                    <div className="product-margin-badge mt-1">
                      +{marginPct}% Margin ({fmt(grossProfit || 0, product.currency)})
                    </div>
                  )}
                </div>
              )}
              <StatusPill status={product.status} />
            </div>
          </div>

          {/* Inventory & Logistics (if physical product) */}
          {product.type === 'product' && (
            <SectionCard title="Inventory & Logistics">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="p-3 rounded-lg border border-border bg-card">
                  <div className="text-xs text-muted-foreground mb-1">Inventory Level</div>
                  <div><StockPill product={product} /></div>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <div className="text-xs text-muted-foreground mb-1">Tracking Status</div>
                  <div className="text-sm font-semibold text-foreground">
                    {product.track_inventory ? 'Tracked' : 'Unmanaged'}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <div className="text-xs text-muted-foreground mb-1">Low Alert At</div>
                  <div className="text-sm font-semibold text-foreground">
                    {product.low_stock_threshold ? `${product.low_stock_threshold} units` : '5 units'}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <div className="text-xs text-muted-foreground mb-1">Shipping Class</div>
                  <div className="text-sm font-semibold text-foreground capitalize">
                    {product.shipping_class || 'Standard'}
                  </div>
                </div>
              </div>

              {(product.weight_kg || product.dimensions_cm) && (
                <div className="flex flex-wrap gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
                  {product.weight_kg && (
                    <div>Weight: <strong className="text-foreground">{product.weight_kg} kg</strong></div>
                  )}
                  {product.dimensions_cm && (
                    <div>
                      Dimensions: <strong className="text-foreground">
                        {product.dimensions_cm.length} × {product.dimensions_cm.width} × {product.dimensions_cm.height} cm
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}

          {/* Description & Scope */}
          <SectionCard title="Service Specifications & Scope">
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
              {catalogBillingDescription(product) || product.description || 'No description provided for this item.'}
            </p>
            {product.notes && (
              <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--gold-l)', border: '1px solid color-mix(in srgb, var(--gold) 20%, transparent)', color: 'var(--ink)' }}>
                <strong className="block mb-1 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--gold)' }}>Internal Notes:</strong>
                {product.notes}
              </div>
            )}
          </SectionCard>

          {/* Customer Negotiated Rates */}
          <SectionCard
            title="Customer Contract Rates"
            action={<span className="text-xs text-muted-foreground">{prices.length} special agreements</span>}
          >
            <p className="text-xs text-muted-foreground mb-3">
              When one of these customers is added to an invoice or quotation, their agreed rate applies automatically instead of the standard {fmt(product.sale_price, product.currency)} catalog price.
            </p>
            {loadingPrices ? (
              <SectionLoading label="Loading contract rates…" />
            ) : prices.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                No customer-specific agreed prices registered yet. Click Edit Item to add agreed customer contracts.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="p-2.5 font-semibold text-muted-foreground">Customer</th>
                      <th className="p-2.5 font-semibold text-muted-foreground text-right">Agreed Rate</th>
                      <th className="p-2.5 font-semibold text-muted-foreground">Contract Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map(pr => (
                      <tr key={pr.customer_id} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="p-2.5 font-medium text-foreground flex items-center gap-2">
                          <CompanyAvatar id={pr.customer_id} name={pr.customer_name} size={22} shape="square" />
                          <span>{pr.customer_name}</span>
                        </td>
                        <td className="p-2.5 text-right font-semibold tabular-nums" style={{ color: 'var(--teal)' }}>
                          {fmt(pr.price, pr.currency)}
                        </td>
                        <td className="p-2.5 text-muted-foreground">{pr.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Side Column */}
        <div className="flex flex-col gap-5">
          {/* Images preview (if product) */}
          {product.image_urls && product.image_urls.length > 0 && (
            <SectionCard title="Product Media">
              <div className="grid grid-cols-2 gap-2">
                {product.image_urls.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt=""
                    className="w-full h-32 object-cover rounded-lg border border-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {/* Classification & Properties */}
          <SectionCard title="Classification & Meta">
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <span className="text-muted-foreground">Category</span>
                <CatBadge cat={product.category} />
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <span className="text-muted-foreground">Catalog Type</span>
                <ProductTypeBadge type={product.type} />
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <span className="text-muted-foreground">Currency</span>
                <strong className="text-foreground">{product.currency}</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <span className="text-muted-foreground">Industry</span>
                <span className="font-medium text-foreground">
                  {product.industry_key ? financeIndustryName(product.industry_key) : 'General'}
                </span>
              </div>
              {product.brand && (
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted-foreground">Brand</span>
                  <span className="font-medium text-foreground">{product.brand}</span>
                </div>
              )}
              {product.vendor_name && (
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium text-foreground">{product.vendor_name}</span>
                </div>
              )}
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <span className="text-muted-foreground">Created On</span>
                <span>{fmtDate(product.created_at)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{fmtDate(product.updated_at || product.created_at)}</span>
              </div>
            </div>
          </SectionCard>

          {/* Channels & SEO */}
          <SectionCard title="Channels & Visibility">
            <div className="flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Publication Status</span>
                <Badge variant={product.visibility === 'published' ? 'brand' : 'outline'}>
                  {product.visibility || 'published'}
                </Badge>
              </div>
              {product.url_handle && (
                <div className="pt-2 border-t border-border">
                  <div className="text-[11px] text-muted-foreground mb-1">URL Slug</div>
                  <div className="font-mono text-[11px] text-foreground bg-muted p-1.5 rounded truncate">
                    /{product.url_handle}
                  </div>
                </div>
              )}
              {product.channels && product.channels.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="text-[11px] text-muted-foreground mb-1.5">Active Channels</div>
                  <div className="flex flex-wrap gap-1">
                    {product.channels.map(c => (
                      <span key={c} className="px-2 py-0.5 rounded bg-muted text-[10.5px] font-medium text-foreground">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 2: Dedicated Full-Page Product Form (New & Edit)
// ─────────────────────────────────────────────────────────────────────────────

function ProductFormPage({
  initial,
  industries,
  onSave,
  onCancel,
  baseRoute,
}: {
  initial?: Product;
  industries: FinanceIndustryKey[];
  onSave: (data: ProductFormState, prices: CustomerPriceRow[]) => Promise<Product>;
  onCancel: () => void;
  baseRoute: string;
}) {
  const company = useCompany();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('identity');
  const [stepError, setStepError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const ext = initial as any;

  const defaultInd = initial?.industry_key ?? industries[0] ?? null;
  const profile = financeCatalogProfile(defaultInd);

  const [f, setF] = useState<ProductFormState>({
    industry_key: defaultInd,
    industry_attributes: initial?.industry_attributes ?? {},
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    type: initial?.type ?? profile.defaultType,
    category: initial?.category ?? profile.categories[0],
    description: initial?.description ?? '',
    unit: initial?.unit ?? profile.units[0],
    sale_price: initial?.sale_price ?? 0,
    purchase_price: initial?.purchase_price ?? 0,
    currency: initial?.currency ?? company.currency ?? 'USD',
    tax_rate: initial?.tax_rate ?? 0,
    tax_code_id: initial?.tax_code_id ?? null,
    status: initial?.status ?? 'active',
    notes: initial?.notes ?? '',
    compare_at_price: ext?.compare_at_price ?? null,
    brand: ext?.brand ?? '',
    vendor_name: ext?.vendor_name ?? '',
    image_urls: Array.isArray(ext?.image_urls) ? ext.image_urls : [],
    stock_quantity: ext?.stock_quantity ?? null,
    low_stock_threshold: ext?.low_stock_threshold ?? 5,
    track_inventory: ext?.track_inventory ?? false,
    weight_kg: ext?.weight_kg ?? null,
    dimensions_cm: ext?.dimensions_cm ?? null,
    shipping_class: ext?.shipping_class ?? 'standard',
    variants: Array.isArray(ext?.variants) ? ext.variants : [],
    meta_title: ext?.meta_title ?? '',
    meta_description: ext?.meta_description ?? '',
    url_handle: ext?.url_handle ?? '',
    visibility: ext?.visibility ?? 'published',
    channels: Array.isArray(ext?.channels) ? ext.channels : ['pos', 'direct'],
  });

  const [prices, setPrices] = useState<CustomerPriceRow[]>([]);

  useEffect(() => {
    if (!initial?.id) return;
    apiFetch(`/v1/products/${initial.id}/customer-prices`)
      .then((rows: any) => {
        setPrices(Array.isArray(rows) ? rows.map((r: any) => ({
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          price: Number(r.price) || 0,
          currency: r.currency || f.currency,
          note: r.note || '',
        })) : []);
      })
      .catch(() => {});
  }, [initial?.id]);

  function set<K extends keyof ProductFormState>(k: K, v: ProductFormState[K]) {
    setF(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'name' && !initial && !prev.code) {
        next.code = genCode(String(v), next.category);
        if (!prev.url_handle) {
          next.url_handle = String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
      }
      return next;
    });
  }

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch(`/v1/customers${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`).catch(() => []);
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    const filtered = q.trim() ? list.filter((c: any) => (c.name || '').toLowerCase().includes(q.toLowerCase())) : list;
    return filtered.slice(0, 25).map((c: any) => ({
      id: c.id,
      label: c.name,
      sublabel: c.email || undefined,
      avatarUserId: c.id,
      avatarKind: 'customers' as const,
      avatarType: 'company' as const,
    }));
  }

  function addCustomerPrice(item: PickerItem | null) {
    if (!item) return;
    if (prices.some(p => p.customer_id === item.id)) {
      showAlert(`${item.label} already has a special rate configured.`);
      return;
    }
    setPrices(prev => [
      ...prev,
      { customer_id: item.id, customer_name: item.label, price: f.sale_price, currency: f.currency, note: '' },
    ]);
  }

  function updatePriceRow(idx: number, patch: Partial<CustomerPriceRow>) {
    setPrices(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function removePriceRow(idx: number) {
    setPrices(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (step !== 'review') { advanceStep(); return; }
    if (!f.name.trim() || !f.code.trim()) { goToStep('identity'); setStepError('Enter an item name and catalogue code.'); return; }
    if ([f.sale_price, f.purchase_price, f.tax_rate, ...prices.map(p => p.price)].some(v => !Number.isFinite(v) || v < 0) || f.tax_rate > 100) { goToStep('pricing'); setStepError('Check prices and tax rate before saving.'); return; }
    setSaving(true);
    try {
      await onSave(f, prices);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  const isProduct = f.type === 'product';
  const indProfile = financeCatalogProfile(f.industry_key);
  const activeCategories = [...new Set([...indProfile.categories, ...CATEGORIES, f.category])].filter(Boolean);
  const activeUnits = [...new Set([...indProfile.units, ...UNITS, f.unit])].filter(Boolean);

  const steps = [
    { id: 'identity', label: 'Identity', title: 'Identity & Classification', hint: 'Industry, type and description' },
    { id: 'pricing', label: 'Pricing', title: 'Pricing & Taxation', hint: 'Prices, currency and tax' },
    ...(isProduct ? [{ id: 'inventory', label: 'Inventory', title: 'Physical Inventory & Shipping', hint: 'Stock and shipping' }] : []),
    { id: 'contracts', label: 'Customer rates', title: 'Customer Contract Pricing', hint: 'Optional agreed prices' },
    { id: 'publication', label: 'Availability', title: 'Publication & Channels', hint: 'Status and internal notes' },
    { id: 'review', label: 'Review', title: 'Review your item', hint: 'Check and create your item' },
  ];
  const stepIndex = steps.findIndex(s => s.id === step);
  function goToStep(id: string) {
    setStep(id); setStepError('');
    requestAnimationFrame(() => { headingRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); headingRef.current?.focus(); });
  }
  function advanceStep() {
    if (!formRef.current?.reportValidity()) return;
    if (step === 'identity' && (!f.name.trim() || !f.code.trim())) { setStepError('Enter an item name and catalogue code.'); return; }
    goToStep(steps[Math.min(stepIndex + 1, steps.length - 1)].id);
  }

  return (
    <div className="products-services-page">
      <div className="product-form-container">
        <PageHeader
          crumbs={['Finance', { label: 'Products & Services', to: `${baseRoute}/products` }, initial ? `Edit ${initial.name}` : 'New Item']}
          titlePlain={initial ? 'Edit' : 'New'}
          titleEm={isProduct ? 'Product' : 'Service'}
          subtitle={initial ? `Editing catalog item ${initial.code}` : 'Define item codes, pricing, units, and inventory properties.'}
          variant="create"
          backTo={initial ? `${baseRoute}/products/${initial.id}` : `${baseRoute}/products`}
          backLabel="Cancel"
        />

        <div className="product-wizard-progress">
          <div aria-live="polite" style={{ fontSize: 13, color: 'var(--ink2)' }}>Step {stepIndex + 1} of {steps.length} · {steps[stepIndex]?.label}</div>
          <Progress value={(stepIndex + 1) / steps.length * 100} aria-label="Creation progress" />
          <Tabs value={step} onValueChange={id => goToStep(id)}>
            <TabsList wrap aria-label="Product creation steps">
              {steps.map((item, index) => (
                <TabsTrigger key={item.id} value={item.id} disabled={saving || index > stepIndex}>
                  {index < stepIndex ? '✓' : index + 1}. {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <SectionCard collapsible={false}>
          <form ref={formRef} onSubmit={handleSubmit} className="product-form-body">
            <div ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>
              <h2 className="product-form-heading">{steps[stepIndex]?.title}</h2>
              <p className="product-form-hint">{steps[stepIndex]?.hint}</p>
            </div>
            {stepError && <p role="alert" className="text-sm text-destructive">{stepError}</p>}
          {step === 'identity' && (<div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Industry profile</label>
                <Select value={f.industry_key || '__general__'} onValueChange={v => {
                  const key = v === '__general__' ? null : v as FinanceIndustryKey;
                  const selected = financeCatalogProfile(key);
                  setF(prev => ({ ...prev, industry_key: key, category: selected.categories[0], unit: selected.units[0] }));
                }}>
                  <SelectTrigger aria-label="Industry profile"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__general__">General</SelectItem>{[...new Set([...industries, ...(f.industry_key ? [f.industry_key] : [])])].map(key => <SelectItem key={key} value={key}>{financeIndustryName(key)}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">{indProfile.billingHint}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Item Classification</label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => set('type', 'service')}
                    className={cn(
                      "flex-1 min-w-56 flex-col items-start whitespace-normal p-3 text-left",
                      f.type === 'service'
                        ? "border-border bg-card"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                    style={f.type === 'service' ? { borderColor: 'var(--teal)', background: 'var(--teal-l)', boxShadow: '0 0 0 2px var(--teal-m)' } : undefined}
                  >
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      <Icon name="zap" size={14} style={{ color: 'var(--teal)' }} /> Invoiceable Service
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Work, expertise or subscriptions billed by time, project or agreed unit.
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => set('type', 'product')}
                    className={cn(
                      "flex-1 min-w-56 flex-col items-start whitespace-normal p-3 text-left",
                      f.type === 'product'
                        ? "border-border bg-card"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                    style={f.type === 'product' ? { borderColor: 'var(--teal)', background: 'var(--teal-l)', boxShadow: '0 0 0 2px var(--teal-m)' } : undefined}
                  >
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      <Icon name="package" size={14} style={{ color: 'var(--purple)' }} /> Physical Product / Stock
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Physical goods with inventory counts, warehouse spots, weights, and dimensions.
                    </div>
                  </Button>
                </div>
              </div>

              <div className="product-form-grid">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Item Name *</label>
                  <Input aria-label="Item name"
                    type="text"
                    required
                    placeholder="e.g. Sea Freight — 20ft FCL or Container Seal"
                    value={f.name}
                    onChange={e => set('name', e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-muted-foreground">Catalog Code / SKU *</label>
                    <button data-ui-native-button=""
                      type="button"
                      onClick={() => set('code', genCode(f.name || 'ITEM', f.category))}
                      className="text-[11px] hover:underline"
                      style={{ color: 'var(--teal)' }}
                    >
                      Generate Code
                    </button>
                  </div>
                  <Input aria-label="Catalogue code / SKU"
                    type="text"
                    required
                    placeholder="e.g. SF-FCL-20"
                    value={f.code}
                    onChange={e => set('code', e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="product-form-grid">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Category</label>
                  <Select value={f.category} onValueChange={v => set('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>
                          {CAT_CFG[cat]?.label ?? cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Billing / Inventory Unit</label>
                  <Select value={f.unit} onValueChange={v => set('unit', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeUnits.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Description & Scope</label>
                <Textarea aria-label="Description and scope"
                  rows={2}
                  placeholder="Detailed description of what is included in this charge or product specification…"
                  value={f.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>
            </div>
          <div className="product-form-grid mt-4">{indProfile.fields.map(field => <label key={field.key} className="text-xs font-semibold text-muted-foreground">{field.label}<Input className="mt-1" value={f.industry_attributes[field.key] || ''} onChange={e => set('industry_attributes', { ...f.industry_attributes, [field.key]: e.target.value })} /></label>)}</div>
          </div>)}

          {step === 'pricing' && (<div>
            <div className="flex flex-col gap-4">
              <div className="product-form-grid">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Selling Price *</label>
                  <div className="flex gap-2">
                    <Input aria-label="Selling price"
                      type="number"
                      min={0}
                      step={0.01}
                      required
                      value={f.sale_price}
                      onChange={e => set('sale_price', parseFloat(e.target.value) || 0)}
                      className="flex-1 font-semibold tabular-nums"
                    />
                    <Select value={f.currency} onValueChange={v => set('currency', v)}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Purchase / Cost Price</label>
                  <Input aria-label="Purchase / cost price"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Optional cost baseline"
                    value={f.purchase_price || ''}
                    onChange={e => set('purchase_price', parseFloat(e.target.value) || 0)}
                    className="tabular-nums"
                  />
                  {f.purchase_price > 0 && f.sale_price > 0 && (
                    <div className="text-[11px] mt-1 font-medium" style={{ color: 'var(--green)' }}>
                      Projected margin: {Math.round(((f.sale_price - f.purchase_price) / f.sale_price) * 100)}% ({fmt(f.sale_price - f.purchase_price, f.currency)})
                    </div>
                  )}
                </div>
              </div>

              <div className="product-form-grid">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Compare-at Price (Discount baseline)</label>
                  <Input aria-label="Compare-at price"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="e.g. higher strike-through retail price"
                    value={f.compare_at_price || ''}
                    onChange={e => set('compare_at_price', parseFloat(e.target.value) || null)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Standard Tax Rate (%)</label>
                  <Input aria-label="Standard tax rate (%)"
                    type="number"
                    min={0}
                    max={100}
                    value={f.tax_rate}
                    onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          </div>)}

          {isProduct && step === 'inventory' && (
            <div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 p-3 rounded-(--r-sm) bg-muted/40 border border-border">
                  <Checkbox
                    id="track_inv"
                    checked={f.track_inventory}
                    onCheckedChange={v => set('track_inventory', Boolean(v))}
                  />
                  <label htmlFor="track_inv" className="text-sm font-medium text-foreground cursor-pointer">
                    Track inventory quantity for this product
                  </label>
                </div>

                {f.track_inventory && (
                  <div className="product-form-grid">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Stock on Hand</label>
                      <Input aria-label="Stock on hand"
                        type="number"
                        min={0}
                        value={f.stock_quantity ?? ''}
                        onChange={e => set('stock_quantity', parseInt(e.target.value, 10) || 0)}
                        placeholder="Current units in stock"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Low Stock Warning Threshold</label>
                      <Input aria-label="Low stock warning threshold"
                        type="number"
                        min={0}
                        value={f.low_stock_threshold}
                        onChange={e => set('low_stock_threshold', parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>
                )}

                <div className="product-form-grid">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Weight (kg)</label>
                    <Input aria-label="Weight (kg)"
                      type="number"
                      step={0.01}
                      min={0}
                      value={f.weight_kg ?? ''}
                      onChange={e => set('weight_kg', parseFloat(e.target.value) || null)}
                      placeholder="e.g. 1.25"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Shipping Class</label>
                    <Select value={f.shipping_class} onValueChange={v => set('shipping_class', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="heavy">Heavy / Pallet</SelectItem>
                        <SelectItem value="fragile">Fragile</SelectItem>
                        <SelectItem value="cold_chain">Cold Chain</SelectItem>
                        <SelectItem value="hazardous">Dangerous Goods (DG)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'contracts' && (<div>
            <p className="text-xs text-muted-foreground mb-3">
              Configure special negotiated pricing for specific accounts. When generating invoices or quotations for these customers, their rate overrides the catalog price.
            </p>

            {prices.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {prices.map((p, idx) => (
                  <div key={p.customer_id} className="p-2.5 rounded-lg border border-border bg-card flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[140px] font-semibold text-xs text-foreground truncate">
                      {p.customer_name}
                    </div>
                    <div className="w-32">
                      <Input aria-label="Customer agreed price"
                        type="number"
                        min={0}
                        step={0.01}
                        value={p.price}
                        onChange={e => updatePriceRow(idx, { price: parseFloat(e.target.value) || 0 })}
                        className="font-semibold tabular-nums text-xs"
                        style={{ minHeight: 'var(--ctl-h-xs)' }}
                      />
                    </div>
                    <div className="w-44">
                      <Input aria-label="Contract reference / note"
                        type="text"
                        placeholder="Contract ref / note"
                        value={p.note}
                        onChange={e => updatePriceRow(idx, { note: e.target.value })}
                        className="text-xs"
                        style={{ minHeight: 'var(--ctl-h-xs)' }}
                      />
                    </div>
                    <Tip label="Remove contract rate">
                      <button data-ui-native-button=""
                        type="button"
                        onClick={() => removePriceRow(idx)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </Tip>
                  </div>
                ))}
              </div>
            )}

            <EntityPicker
              value={null}
              onChange={addCustomerPrice}
              search={searchCustomers}
              placeholder="Search and add customer for special agreed rate…"
            />
          </div>)}

          {step === 'publication' && (<div>
            <div className="product-form-grid">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Catalog Status</label>
                <Select value={f.status} onValueChange={v => set('status', v as 'active' | 'inactive')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Visible in billing pickers)</SelectItem>
                    <SelectItem value="inactive">Inactive (Hidden from new documents)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">SEO URL Slug</label>
                <Input aria-label="SEO URL slug"
                  type="text"
                  value={f.url_handle}
                  onChange={e => set('url_handle', e.target.value)}
                  placeholder="e.g. sea-freight-fcl-20"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Internal Notes</label>
              <Textarea aria-label="Internal notes"
                rows={2}
                placeholder="Any internal operational notes regarding vendor agreements, exclusions, or rules…"
                value={f.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </div>)}

          {step === 'review' && <div>
            <dl className="product-review-grid">
              {[
                ['Name', f.name], ['Code / SKU', f.code], ['Industry', f.industry_key ? financeIndustryName(f.industry_key) : 'General'],
                ['Type', isProduct ? 'Physical product' : 'Service'], ['Category', CAT_CFG[f.category]?.label ?? f.category], ['Unit', f.unit],
                ['Selling price', fmt(f.sale_price, f.currency)], ['Cost price', fmt(f.purchase_price, f.currency)], ['Tax rate', `${f.tax_rate}%`],
                ['Inventory', isProduct && f.track_inventory ? `${f.stock_quantity ?? 0} units; warning at ${f.low_stock_threshold}` : 'Not tracked'],
                ['Customer rates', String(prices.length)], ['Status', f.status], ['Description', catalogBillingDescription(f) || 'Not provided'], ['Internal notes', f.notes || 'None'],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="text-xs text-muted-foreground mt-4">Nothing is saved until you confirm below. Use Back to make changes.</p>
          </div>}

          <div className="product-form-actions">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <div className="flex flex-wrap gap-2">
            {stepIndex > 0 && <Button type="button" variant="outline" disabled={saving} onClick={() => goToStep(steps[stepIndex - 1].id)}>Back</Button>}
            {step !== 'review' ? <Button type="submit">Continue <Icon name="arrowRight" size={14} /></Button> : <Button type="submit" disabled={saving}>
              <Icon name="check" size={14} />
              {saving ? 'Saving Item…' : initial ? 'Save Changes' : 'Create Item'}
            </Button>}
            </div>
          </div>
        </form>
        </SectionCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 3: Dedicated Full-Page Tariff Import Page
// ─────────────────────────────────────────────────────────────────────────────

function ProductTariffImportPage({
  onImportComplete,
  baseRoute,
}: {
  onImportComplete: () => void;
  baseRoute: string;
}) {
  const [query, setQuery] = useState('');
  const [authorityFilter, setAuthorityFilter] = useState<'ALL' | 'TPA' | 'TASAC' | 'TRA'>('ALL');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      apiFetch(`/v1/reference/tariff?q=${encodeURIComponent(query)}&limit=150`)
        .then(res => {
          const list = (res.data ?? []).filter((r: any) => r.rate_amount != null);
          setResults(list);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = results.filter(r => authorityFilter === 'ALL' || r.authority?.toUpperCase().includes(authorityFilter));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  };

  const TARIFF_CAT_MAP: Record<string, string> = { TPA: 'HANDLING', TASAC_CFA: 'CLEARANCE', TRA: 'DUTY' };

  async function handleImport() {
    const chosen = results.filter(r => selectedIds.has(r.id));
    if (chosen.length === 0) return;
    setImporting(true);
    try {
      await Promise.all(
        chosen.map(r =>
          apiFetch('/v1/products', {
            method: 'POST',
            body: JSON.stringify({
              name: r.item_name,
              code: r.clause_ref ? `${r.authority}-${r.clause_ref}`.replace(/[^A-Za-z0-9.-]/g, '') : undefined,
              category: TARIFF_CAT_MAP[r.authority] ?? 'OTHER',
              description: [r.source_document, r.category, r.subcategory].filter(Boolean).join(' — '),
              unit: r.unit || 'unit',
              sale_price: Number(r.rate_amount) || 0,
              currency: r.rate_currency || 'USD',
              tax_rate: 0,
              status: 'active',
            }),
          })
        )
      );
      showAlert(`Successfully imported ${chosen.length} tariff items into your catalog.`);
      onImportComplete();
    } catch (err: any) {
      showAlert(err.message || 'Failed to import selected items.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="products-services-page">
      <div className="tariff-import-container">
        <PageHeader
          crumbs={['Finance', { label: 'Products & Services', to: `${baseRoute}/products` }, 'Import Tariff']}
          titlePlain="Import Port & TASAC"
          titleEm="Tariffs"
          subtitle="Select items from official sea port authority tariffs and government agency fee schedules to add into your catalog."
          backTo={`${baseRoute}/products`}
          backLabel="Back to products"
        />

        <SectionCard className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <Input
                type="search"
                placeholder="Search clause, handling service, or charge name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              {(['ALL', 'TPA', 'TASAC', 'TRA'] as const).map(auth => (
                <button data-ui-native-button=""
                  key={auth}
                  type="button"
                  onClick={() => setAuthorityFilter(auth)}
                  className={cn(
                    "px-3 h-9 rounded-(--r-sm) text-xs font-semibold border transition-colors",
                    authorityFilter !== auth && "bg-background border-border text-muted-foreground hover:bg-muted"
                  )}
                  style={authorityFilter === auth ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary))' } : undefined}
                >
                  {auth === 'ALL' ? 'All Authorities' : auth}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard padded={false} className="mt-4">
          {loading ? (
            <SectionLoading label="Searching tariff schedules…" />
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No tariff clauses match your query.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="p-3 w-10 text-center">
                      <Checkbox
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-3 font-semibold text-muted-foreground">Clause / Authority</th>
                    <th className="p-3 font-semibold text-muted-foreground">Service Name & Scope</th>
                    <th className="p-3 font-semibold text-muted-foreground text-right">Official Tariff Rate</th>
                    <th className="p-3 font-semibold text-muted-foreground">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isChecked = selectedIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => toggleSelect(r.id)}
                        className="border-b border-border/60 hover:bg-muted/30 cursor-pointer transition-colors"
                        style={isChecked ? { background: 'var(--teal-l)' } : undefined}
                      >
                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleSelect(r.id)} />
                        </td>
                        <td className="p-3 font-mono font-medium" style={{ color: 'var(--teal)' }}>
                          {r.clause_ref || r.authority || '—'}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-sm text-foreground">{r.item_name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {[r.source_document, r.category, r.subcategory].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums text-foreground">
                          {r.rate_currency} {Number(r.rate_amount).toLocaleString('en-US')}
                        </td>
                        <td className="p-3 text-muted-foreground">{r.unit || 'unit'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {selectedIds.size > 0 && (
          <div className="tariff-sticky-bar">
            <div className="font-semibold text-sm text-foreground">
              {selectedIds.size} tariff item{selectedIds.size === 1 ? '' : 's'} selected
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
              <Button size="sm" disabled={importing} onClick={handleImport}>
                <Icon name="download" size={13} />
                {importing ? 'Importing…' : `Import ${selectedIds.size} into Catalog`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 4: Main Products List Page (Table & Grid)
// ─────────────────────────────────────────────────────────────────────────────

export const ProductsServices: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();

  const isClearOS = location.pathname.startsWith('/clearos');
  const baseRoute = isClearOS ? '/clearos' : '/finance';

  const isNew = location.pathname.endsWith('/new');
  const isTariff = location.pathname.endsWith('/tariff');
  const isEdit = location.pathname.endsWith('/edit');
  const isDetail = Boolean(id && !isNew && !isTariff && !isEdit && id !== 'categories' && id !== 'reviews');

  const financeConfiguration = useFinanceConfiguration(!isClearOS);
  const industries = financeConfiguration.data?.industries ?? [];
  const industryOptions = financeCatalogOptions(industries);
  const isLogistics = isClearOS || industries.includes('logistics');

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'product' | 'service'>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'category' | 'created'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [industryFilter, setIndustryFilter] = useState<FinanceIndustryKey | null>(null);

  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    physical: 0,
    tracked: 0,
    low_stock: 0,
    out_of_stock: 0,
    priced: 0,
    free: 0,
    categories: [] as { category: string | null; count: number }[],
    currencies: [] as { currency: string; average_price: number; inventory_value: number }[],
  });

  const loadId = useRef(0);
  const catalogCategories = [...new Set([...industryOptions.categories, ...stats.categories.map(row => row.category).filter((v): v is string => !!v)])];

  async function loadProducts() {
    const requestId = ++loadId.current;
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort: sortBy,
      direction: sortDir,
    });
    if (search.trim()) params.set('search', search.trim());
    if (catFilter !== 'ALL') params.set('category', catFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (typeFilter !== 'ALL') params.set('type', typeFilter);
    if (industryFilter) params.set('industry', industryFilter);

    try {
      const [result, summary] = await Promise.all([
        apiFetch(`/v1/products?${params}`),
        apiFetch('/v1/products/stats'),
      ]);
      if (requestId !== loadId.current) return;
      setProducts(result.items || []);
      setTotal(result.total || 0);
      setStats(summary);
    } catch (error: any) {
      if (requestId === loadId.current) setLoadError(error.message || 'Failed to load catalog items.');
    } finally {
      if (requestId === loadId.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void loadProducts(), 200);
    return () => { clearTimeout(timer); ++loadId.current; };
  }, [page, pageSize, search, catFilter, statusFilter, typeFilter, sortBy, sortDir, industryFilter]);

  // Handle Form Save (Create or Edit)
  async function handleSaveItem(data: ProductFormState, contractPrices: CustomerPriceRow[]): Promise<Product> {
    const isEditingMode = isEdit && id;
    let saved: Product;
    if (isEditingMode) {
      saved = await apiFetch(`/v1/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    } else {
      saved = await apiFetch('/v1/products', { method: 'POST', body: JSON.stringify(data) });
    }

    if (contractPrices.length > 0) {
      await apiFetch(`/v1/products/${saved.id}/customer-prices`, {
        method: 'PUT',
        body: JSON.stringify({
          prices: contractPrices.map(p => ({
            customer_id: p.customer_id,
            price: Number(p.price) || 0,
            currency: p.currency,
            note: p.note,
          })),
        }),
      });
    }

    void loadProducts();
    navigate(`${baseRoute}/products/${saved.id}`);
    return saved;
  }

  // Handle Item Delete
  async function handleDeleteItem(product: Product) {
    const confirmed = await showConfirm(
      `Are you sure you want to delete ${product.name} (${product.code})? This action cannot be undone.`,
      { confirmLabel: 'Delete Item' }
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/v1/products/${product.id}`, { method: 'DELETE' });
      void loadProducts();
      showAlert(`Deleted ${product.name}.`);
      navigate(`${baseRoute}/products`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete item.');
    }
  }

  // Handle Status Toggle
  async function handleToggleStatus(product: Product) {
    const nextStatus = product.status === 'active' ? 'inactive' : 'active';
    try {
      const updated = await apiFetch(`/v1/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
      void loadProducts();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update status.');
    }
  }

  // Handle Starter Catalog Seed
  async function handleSeedStarterCatalog() {
    const confirmed = await showConfirm(
      `Add ${STARTER_CATALOG.length} pre-configured logistics and clearing services to your catalog as a template? You can customize or delete any item afterward.`,
      { confirmLabel: 'Add Template Catalog' }
    );
    if (!confirmed) return;
    try {
      await Promise.all(
        STARTER_CATALOG.map(p => apiFetch('/v1/products', { method: 'POST', body: JSON.stringify(p) }))
      );
      void loadProducts();
      showAlert('Starter catalog added successfully.');
    } catch (err: any) {
      showAlert(err.message || 'Could not add starter catalog.');
    }
  }

  // 1. ROUTE: Dedicated Tariff Import Page
  if (isTariff) {
    return (
      <ProductTariffImportPage
        baseRoute={baseRoute}
        onImportComplete={() => {
          void loadProducts();
          navigate(`${baseRoute}/products`);
        }}
      />
    );
  }

  // 2. ROUTE: Dedicated Create or Edit Page
  if (isNew || isEdit) {
    const targetProduct = isEdit ? products.find(p => p.id === id) : undefined;
    return (
      <ProductFormPage
        initial={targetProduct}
        industries={industries}
        baseRoute={baseRoute}
        onSave={handleSaveItem}
        onCancel={() => {
          if (isEdit && id) navigate(`${baseRoute}/products/${id}`);
          else navigate(`${baseRoute}/products`);
        }}
      />
    );
  }

  // 3. ROUTE: Dedicated Product Detail Page
  if (isDetail && id) {
    const currentProduct = products.find(p => p.id === id);
    if (!currentProduct && !loading) {
      // If direct deep link, fetch it directly
      return (
        <ProductDetailFetcher
          productId={id}
          baseRoute={baseRoute}
          onEdit={() => navigate(`${baseRoute}/products/${id}/edit`)}
          onDelete={(p) => handleDeleteItem(p)}
          onToggleStatus={(p) => handleToggleStatus(p)}
        />
      );
    }
    if (currentProduct) {
      return (
        <ProductDetailPage
          product={currentProduct}
          baseRoute={baseRoute}
          onEdit={() => navigate(`${baseRoute}/products/${id}/edit`)}
          onDelete={() => handleDeleteItem(currentProduct)}
          onToggleStatus={() => handleToggleStatus(currentProduct)}
        />
      );
    }
  }

  // 4. ROUTE: Main Products List Page
  return (
    <div className="products-services-page">
      <PageHeader
        crumbs={[isClearOS ? 'CLEAROS' : 'FINANCE', 'PRODUCTS & SERVICES']}
        titlePlain="Products &"
        titleEm="catalog"
        subtitle="Manage sales items, service specifications, pricing units, and customer contracts."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate(`${baseRoute}/products/new`)} size="sm">
              <Icon name="plus" size={13} /> New Item
            </Button>
            {isLogistics && (
              <Button variant="outline" size="sm" onClick={() => navigate(`${baseRoute}/products/tariff`)}>
                <Icon name="download" size={13} /> Import Tariff
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(`${baseRoute}/products/categories`)}>
              <Icon name="tag" size={13} /> Categories
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`${baseRoute}/products/reviews`)}>
              <Icon name="star" size={13} /> Reviews
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <MetricsRow cards={[
        {
          emphasis: 'primary', title: 'Total Catalog',
          value: String(stats.total),
          sub1Label: 'PRODUCTS',
          sub1Value: String(stats.physical),
          sub2Label: 'SERVICES',
          sub2Value: String(stats.total - stats.physical),
          barHighlight: 'var(--teal)',
        },
        {
          title: 'Active Items',
          value: String(stats.active),
          sub1Label: 'ACTIVE',
          sub1Value: String(stats.active),
          sub2Label: 'INACTIVE',
          sub2Value: String(stats.inactive),
          barHighlight: 'var(--green)',
        },
        {
          title: stats.physical > 0 ? 'Stock Status' : 'Avg Unit Price',
          value: stats.physical > 0
            ? `${stats.tracked} tracked`
            : stats.currencies.length === 1
              ? formatAmount(stats.currencies[0].average_price, stats.currencies[0].currency)
              : `${stats.currencies.length} currencies`,
          sub1Label: stats.physical > 0 ? 'LOW STOCK' : 'PRICED',
          sub1Value: stats.physical > 0 ? String(stats.low_stock) : String(stats.priced),
          sub2Label: stats.physical > 0 ? 'OUT OF STOCK' : 'EXEMPT',
          sub2Value: stats.physical > 0 ? String(stats.out_of_stock) : String(stats.free),
          barHighlight: stats.low_stock > 0 ? 'var(--gold)' : 'var(--blue)',
        },
        {
          title: 'Categories',
          value: String(stats.categories.length),
          sub1Label: 'TOP CATEGORY',
          sub1Value: stats.categories[0]?.category ? (CAT_CFG[stats.categories[0].category]?.label ?? stats.categories[0].category) : '—',
          sub2Label: 'TOP ITEMS',
          sub2Value: String(stats.categories[0]?.count ?? 0),
          barHighlight: 'var(--purple)',
        },
      ]} />

      {/* Search & Filters */}
      <div className="products-toolbar-wrap mt-4">
        <SearchToolbar
            layout="register"
            search={search}
            onSearch={v => { setSearch(v); setPage(1); }}
            placeholder="Search items, SKU codes, categories, or descriptions…"
            quickFilters={[
              ...(industries.length > 0 ? [{
                label: 'Industry',
                allLabel: 'All Industries',
                value: industryFilter,
                onChange: (v: string | null) => { setIndustryFilter(v as FinanceIndustryKey | null); setPage(1); },
                options: industries.map(k => ({ value: k, label: financeIndustryName(k) })),
              }] : []),
              {
                label: 'Category',
                allLabel: `All Categories (${stats.total})`,
                value: catFilter === 'ALL' ? null : catFilter,
                onChange: v => { setCatFilter(v || 'ALL'); setPage(1); },
                options: catalogCategories.map(c => ({
                  value: c,
                  label: `${CAT_CFG[c]?.label ?? c} (${stats.categories.find(r => r.category === c)?.count ?? 0})`,
                })),
                columns: 2,
              },
              {
                label: 'Type',
                allLabel: 'All Types',
                value: typeFilter === 'ALL' ? null : typeFilter,
                onChange: v => { setTypeFilter((v || 'ALL') as 'ALL' | 'product' | 'service'); setPage(1); },
                options: [
                  { value: 'service', label: `Services (${stats.total - stats.physical})` },
                  { value: 'product', label: `Products (${stats.physical})` },
                ],
              },
              {
                label: 'Status',
                allLabel: 'All Status',
                value: statusFilter === 'ALL' ? null : statusFilter,
                onChange: v => { setStatusFilter((v || 'ALL') as any); setPage(1); },
                options: [
                  { value: 'active', label: `Active (${stats.active})` },
                  { value: 'inactive', label: `Inactive (${stats.inactive})` },
                ],
              },
            ]}
            actions={
              <div className="products-view-toggle">
                <Tip label="Table view">
                  <button data-ui-native-button=""
                    type="button"
                    className={viewMode === 'table' ? 'is-active' : ''}
                    onClick={() => setViewMode('table')}
                    aria-label="Table view"
                  >
                    <Icon name="list" size={14} />
                  </button>
                </Tip>
                <Tip label="Card grid view">
                  <button data-ui-native-button=""
                    type="button"
                    className={viewMode === 'grid' ? 'is-active' : ''}
                    onClick={() => setViewMode('grid')}
                    aria-label="Card grid view"
                  >
                    <Icon name="layoutGrid" size={14} />
                  </button>
                </Tip>
              </div>
            }
          />
      </div>

      {/* Content Table or Grid */}
      <SectionCard padded={false} className="mt-3">
        {loading ? (
          <SectionLoading label="Loading catalog items…" />
        ) : loadError ? (
          <div className="py-16 text-center flex flex-col items-center">
            <FeaturedIcon variant="error" size="lg" shape="circle" className="mb-3">
              <Icon name="alertCircle" size={22} />
            </FeaturedIcon>
            <div className="text-sm font-semibold text-foreground mb-1">Could not load catalog</div>
            <div className="text-xs text-muted-foreground mb-4">{loadError}</div>
            <Button variant="outline" size="sm" onClick={loadProducts}>
              <Icon name="refresh" size={13} /> Retry
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center">
            <FeaturedIcon variant="gray" size="lg" shape="circle" className="mb-3">
              <Icon name="package" size={22} />
            </FeaturedIcon>
            <div className="text-sm font-semibold text-foreground mb-1">No items found</div>
            <div className="text-xs text-muted-foreground mb-4">
              {search ? 'No items match your filter criteria.' : 'Your catalog is empty. Start by adding your first service or product.'}
            </div>
            {!search && (
              <div className="flex justify-center gap-2">
                <Button onClick={() => navigate(`${baseRoute}/products/new`)} size="sm">
                  <Icon name="plus" size={13} /> New Item
                </Button>
                {isLogistics && (
                  <Button variant="outline" size="sm" onClick={handleSeedStarterCatalog}>
                    <Icon name="refresh" size={13} /> Load Starter Catalog
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <div className="rtbl-wrap">
            <table className="rtbl w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="p-3 font-semibold text-muted-foreground w-28">Code</th>
                  <th
                    className="p-3 font-semibold text-muted-foreground cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy === 'name') setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('name'); setSortDir('asc'); }
                    }}
                  >
                    <span className="flex items-center gap-1">
                      Item Name & Description
                      <Icon name={sortBy === 'name' ? (sortDir === 'asc' ? 'arrowUp' : 'arrowDown') : 'arrowUp'} size={11} className={sortBy !== 'name' ? 'opacity-30' : ''} style={sortBy === 'name' ? { color: 'var(--teal)' } : undefined} />
                    </span>
                  </th>
                  <th className="p-3 font-semibold text-muted-foreground">Type</th>
                  <th className="p-3 font-semibold text-muted-foreground">Category</th>
                  <th className="p-3 font-semibold text-muted-foreground">Unit</th>
                  <th
                    className="p-3 font-semibold text-muted-foreground text-right cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy === 'price') setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('price'); setSortDir('asc'); }
                    }}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Selling Price
                      <Icon name={sortBy === 'price' ? (sortDir === 'asc' ? 'arrowUp' : 'arrowDown') : 'arrowUp'} size={11} className={sortBy !== 'price' ? 'opacity-30' : ''} style={sortBy === 'price' ? { color: 'var(--teal)' } : undefined} />
                    </span>
                  </th>
                  <th className="p-3 font-semibold text-muted-foreground">Inventory</th>
                  <th className="p-3 font-semibold text-muted-foreground">Status</th>
                  <th className="p-3 w-10 text-right pr-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`${baseRoute}/products/${p.id}`)}
                    className="products-table-row border-b border-border/60"
                  >
                    <td className="p-3">
                      <span className="product-code-pill">{p.code}</span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-sm text-foreground">{p.name}</div>
                      {p.description && (
                        <div className="text-[11.5px] text-muted-foreground truncate max-w-sm mt-0.5">
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <ProductTypeBadge type={p.type} />
                    </td>
                    <td className="p-3">
                      <CatBadge cat={p.category} />
                    </td>
                    <td className="p-3 text-muted-foreground font-medium">{p.unit}</td>
                    <td className="p-3 text-right font-semibold tabular-nums text-foreground">
                      {p.sale_price > 0 ? fmt(p.sale_price, p.currency) : <span className="text-muted-foreground font-normal">—</span>}
                    </td>
                    <td className="p-3">
                      <StockPill product={p} />
                    </td>
                    <td className="p-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="p-3 text-right pr-3" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button data-ui-native-button=""
                            type="button"
                            className="w-7 h-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            <Icon name="moreHorizontal" size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onSelect={() => navigate(`${baseRoute}/products/${p.id}`)}>
                            <Icon name="eye" size={13} className="mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => navigate(`${baseRoute}/products/${p.id}/edit`)}>
                            <Icon name="edit" size={13} className="mr-2" /> Edit Item
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleToggleStatus(p)}>
                            <Icon name="refresh" size={13} className="mr-2" />
                            {p.status === 'active' ? 'Set Inactive' : 'Set Active'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => handleDeleteItem(p)} style={{ color: 'var(--red)' }}>
                            <Icon name="trash" size={13} className="mr-2" /> Delete Item
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="products-grid p-4">
            {products.map(p => (
              <button data-ui-native-button=""
                key={p.id}
                type="button"
                onClick={() => navigate(`${baseRoute}/products/${p.id}`)}
                className="product-card"
              >
                <div>
                  <div className="product-card-top">
                    <span className="product-code-pill">{p.code}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="product-card-body">
                    <div className="product-card-title">{p.name}</div>
                    <div className="product-card-desc">{p.description || 'No description provided.'}</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 my-2">
                    <ProductTypeBadge type={p.type} />
                    <CatBadge cat={p.category} />
                  </div>
                  <div className="product-card-footer">
                    <div>
                      <div className="product-card-price">
                        {p.sale_price > 0 ? fmt(p.sale_price, p.currency) : '—'}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">per {p.unit}</div>
                    </div>
                    <div><StockPill product={p} /></div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          itemLabel="item"
          onPageChange={setPage}
          onPageSizeChange={size => { setPageSize(size); setPage(1); }}
          pageSizeOptions={[10, 20, 50, 100]}
          bordered={true}
        />
      </SectionCard>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: Detail Fetcher for Direct Deep Link Navigation
// ─────────────────────────────────────────────────────────────────────────────

function ProductDetailFetcher({
  productId,
  baseRoute,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  productId: string;
  baseRoute: string;
  onEdit: () => void;
  onDelete: (p: Product) => void;
  onToggleStatus: (p: Product) => void;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/products/${productId}`)
      .then(res => setProduct(res))
      .catch(err => setError(err.message || 'Item not found.'))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="products-services-page">
        <SectionLoading label="Loading item specifications…" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="products-services-page">
        <PageHeader
          crumbs={['Finance', { label: 'Products & Services', to: `${baseRoute}/products` }, 'Item Not Found']}
          titlePlain="Item"
          titleEm="not found"
          backTo={`${baseRoute}/products`}
          backLabel="Back to products"
        />
        <div className="py-16 text-center flex flex-col items-center">
          <FeaturedIcon variant="error" size="lg" shape="circle" className="mb-3">
            <Icon name="alertCircle" size={22} />
          </FeaturedIcon>
          <div className="text-sm font-semibold text-foreground mb-1">Catalog item not found</div>
          <div className="text-xs text-muted-foreground mb-4">{error || 'This item may have been removed.'}</div>
          <Button asChild size="sm">
            <Link to={`${baseRoute}/products`}>Return to catalog</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ProductDetailPage
      product={product}
      baseRoute={baseRoute}
      onEdit={onEdit}
      onDelete={() => onDelete(product)}
      onToggleStatus={() => onToggleStatus(product)}
    />
  );
}
