import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { FormPage } from '../components/FormPage.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Button } from '../components/ui/button.js';
import './ProductsServices.css';

// -- Types ---------------------------------------------------------------------
// Field names/values below mirror the real `products` table (migration
// 052_products.sql) and the /v1/products routes exactly — this catalog is the
// same one Billing.tsx's line-item "add from catalog" picker already reads
// from (ChargeSectionEditor.searchProducts), so a mismatch here would mean
// services created here silently fail to price correctly on invoices.

export interface Product {
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
  /** The tax treatment, when one was recorded — preserved through edits so a
   *  code set elsewhere is never silently dropped. */
  tax_code_id?: string | null;
  status: 'active' | 'inactive';
  notes?: string;
  created_at: string;
  updated_at?: string;
}

interface ProductForm {
  name: string; code: string; type: 'product' | 'service'; category: string; description: string;
  unit: string; sale_price: number; purchase_price: number; currency: string; tax_rate: number;
  tax_code_id: string | null;
  status: 'active' | 'inactive'; notes: string;
  // Retail/POS fields — only shown/sent when type === 'product'
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

type CatFilter = 'ALL' | string;

/** A customer's agreed (contract) price for this service — overrides the
 *  catalog sale_price on that customer's invoices/quotes/POs. */
interface CustomerPriceRow {
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

// -- Starter catalog (supply-chain service templates spanning freight,
// clearance, handling, transport, warehousing, fulfillment, packaging,
// procurement, duty, insurance and labor — offered once when a tenant's real
// catalog is empty. Each item is POSTed to /v1/products like any other new
// service, never written straight into local state.) -------------------------

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
  // Clearance — statutory minimum clearing/forwarding agency fees per the
  // Tanzania Shipping Agencies (Fees for Clearing and Forwarding Services)
  // Order, 2026 (GN. No. 83, published 20/3/2026, Schedule to order 5). A
  // registered clearing and forwarding agent may not charge below these
  // minimums; rates are USD-equivalent, payable in TZS at the prevailing rate.
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
  { name:'Clearing Agency Fee — Export · Sea · 20ft Container',        code:'CL-EXP-SEA-20FT',      category:'CLEARANCE', unit:'container', sale_price:150, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, 20-foot container' },
  { name:'Clearing Agency Fee — Export · Sea · 40ft Container',        code:'CL-EXP-SEA-40FT',      category:'CLEARANCE', unit:'container', sale_price:200, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, 40-foot container' },
  { name:'Clearing Agency Fee — Export · Sea · Dry Bulk Cargo',        code:'CL-EXP-SEA-DRYBULK',   category:'CLEARANCE', unit:'MT',        sale_price:0.6, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, dry bulk cargo, per metric ton' },
  { name:'Clearing Agency Fee — Export · Sea · Bulk Liquid',           code:'CL-EXP-SEA-BULKLIQ',   category:'CLEARANCE', unit:'MT',        sale_price:0.6, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, bulk liquid, per metric ton' },
  { name:'Clearing Agency Fee — Export · Sea · Motor Vehicle',         code:'CL-EXP-SEA-VEHICLE',   category:'CLEARANCE', unit:'unit',      sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, motor vehicle' },
  { name:'Clearing Agency Fee — Export · Sea · Heavy Machines & Equipment', code:'CL-EXP-SEA-MACHINE', category:'CLEARANCE', unit:'unit',    sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, heavy machines & equipment' },
  { name:'Clearing Agency Fee — Export · Sea · Live Animal',           code:'CL-EXP-SEA-LIVEANIMAL',category:'CLEARANCE', unit:'BL',        sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, live animal, per BL' },
  { name:'Clearing Agency Fee — Export · Sea · Loose Cargo/LCL',       code:'CL-EXP-SEA-LCL',       category:'CLEARANCE', unit:'BL',        sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, loose cargo / less than container load, per BL' },
  { name:'Clearing Agency Fee — Export · Sea · Carriage Coastwise',    code:'CL-EXP-SEA-COASTWISE', category:'CLEARANCE', unit:'transire',  sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, sea/inland waterways, carriage coastwise, per transire' },
  { name:'Clearing Agency Fee — Export · Road (Border) · 20ft Container', code:'CL-EXP-ROAD-20FT',  category:'CLEARANCE', unit:'container', sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, road transport (border), 20-foot container' },
  { name:'Clearing Agency Fee — Export · Road (Border) · 40ft Container', code:'CL-EXP-ROAD-40FT',  category:'CLEARANCE', unit:'container', sale_price:190, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, road transport (border), 40-foot container' },
  { name:'Clearing Agency Fee — Export · Road (Border) · Motor Vehicle', code:'CL-EXP-ROAD-VEHICLE',category:'CLEARANCE', unit:'unit',      sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, road transport (border), motor vehicle' },
  { name:'Clearing Agency Fee — Export · Road (Border) · Heavy Machines & Equipment', code:'CL-EXP-ROAD-MACHINE', category:'CLEARANCE', unit:'unit', sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, road transport (border), heavy machines & equipment' },
  { name:'Clearing Agency Fee — Export · Road (Border) · Live Animal', code:'CL-EXP-ROAD-LIVEANIMAL',category:'CLEARANCE', unit:'BL',      sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, road transport (border), live animal, per BL' },
  { name:'Clearing Agency Fee — Export · Road (Border) · Loose Cargo/LCL', code:'CL-EXP-ROAD-LCL',  category:'CLEARANCE', unit:'vehicle',   sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, road transport (border), loose cargo / less than container load, per vehicle' },
  { name:'Clearing Agency Fee — Export · Air · Parcel/Courier',        code:'CL-EXP-AIR-PARCEL',    category:'CLEARANCE', unit:'AWB',       sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, air transport, parcel / courier, per AWB' },
  { name:'Clearing Agency Fee — Export · Air · General Cargo',         code:'CL-EXP-AIR-GENERAL',   category:'CLEARANCE', unit:'AWB',       sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, air transport, general cargo, per AWB' },
  { name:'Clearing Agency Fee — Export · Air · Precious Metal/Minerals', code:'CL-EXP-AIR-PRECIOUS',category:'CLEARANCE', unit:'AWB',       sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, air transport, precious metal / minerals, per AWB' },
  { name:'Clearing Agency Fee — Export · Air · Live Animal',           code:'CL-EXP-AIR-LIVEANIMAL',category:'CLEARANCE', unit:'AWB',       sale_price:60,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — export, air transport, live animal, per AWB' },
  { name:'Clearing Agency Fee — Transit · Sea · 20ft Container',       code:'CL-TRN-SEA-20FT',      category:'CLEARANCE', unit:'container', sale_price:200, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, 20-foot container' },
  { name:'Clearing Agency Fee — Transit · Sea · 40ft Container',       code:'CL-TRN-SEA-40FT',      category:'CLEARANCE', unit:'container', sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, 40-foot container' },
  { name:'Clearing Agency Fee — Transit · Sea · Dry Bulk Cargo',       code:'CL-TRN-SEA-DRYBULK',   category:'CLEARANCE', unit:'MT',        sale_price:0.5, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, dry bulk cargo, per metric ton' },
  { name:'Clearing Agency Fee — Transit · Sea · Bulk Liquid',          code:'CL-TRN-SEA-BULKLIQ',   category:'CLEARANCE', unit:'MT',        sale_price:0.5, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, bulk liquid, per metric ton' },
  { name:'Clearing Agency Fee — Transit · Sea · Motor Vehicle',        code:'CL-TRN-SEA-VEHICLE',   category:'CLEARANCE', unit:'unit',      sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, motor vehicle' },
  { name:'Clearing Agency Fee — Transit · Sea · Heavy Machines & Equipment', code:'CL-TRN-SEA-MACHINE', category:'CLEARANCE', unit:'unit',   sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, heavy machines & equipment' },
  { name:'Clearing Agency Fee — Transit · Sea · Live Animal',          code:'CL-TRN-SEA-LIVEANIMAL',category:'CLEARANCE', unit:'BL',        sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, live animal, per BL' },
  { name:'Clearing Agency Fee — Transit · Sea · Loose Cargo/LCL',      code:'CL-TRN-SEA-LCL',       category:'CLEARANCE', unit:'BL',        sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, sea/inland waterways, loose cargo / less than container load, per BL' },
  { name:'Clearing Agency Fee — Transit · Road (Border) · 20ft Container', code:'CL-TRN-ROAD-20FT', category:'CLEARANCE', unit:'container', sale_price:210, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, road transport (border), 20-foot container' },
  { name:'Clearing Agency Fee — Transit · Road (Border) · 40ft Container', code:'CL-TRN-ROAD-40FT', category:'CLEARANCE', unit:'container', sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, road transport (border), 40-foot container' },
  { name:'Clearing Agency Fee — Transit · Road (Border) · Motor Vehicle', code:'CL-TRN-ROAD-VEHICLE', category:'CLEARANCE', unit:'unit',    sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, road transport (border), motor vehicle' },
  { name:'Clearing Agency Fee — Transit · Road (Border) · Heavy Machines & Equipment', code:'CL-TRN-ROAD-MACHINE', category:'CLEARANCE', unit:'unit', sale_price:250, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, road transport (border), heavy machines & equipment' },
  { name:'Clearing Agency Fee — Transit · Road (Border) · Live Animal', code:'CL-TRN-ROAD-LIVEANIMAL', category:'CLEARANCE', unit:'BL',    sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, road transport (border), live animal, per BL' },
  { name:'Clearing Agency Fee — Transit · Road (Border) · Loose Cargo/LCL', code:'CL-TRN-ROAD-LCL', category:'CLEARANCE', unit:'vehicle',   sale_price:90,  currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, road transport (border), loose cargo / less than container load, per vehicle' },
  { name:'Clearing Agency Fee — Transit · Air · General Cargo',        code:'CL-TRN-AIR-GENERAL',   category:'CLEARANCE', unit:'AWB',       sale_price:130, currency:'USD', tax_rate:0, status:'active', description:'GN. 83-2026 statutory minimum agency fee — transit, air transport, general cargo, per AWB' },
  { name:'Documentation Fee',             code:'CL-DOCS',     category:'CLEARANCE',   unit:'set',         sale_price:75,   currency:'USD', tax_rate:18, status:'active', description:'Preparation of shipping documentation and certificates' },
  { name:'Bill of Lading Processing',     code:'CL-BL',       category:'CLEARANCE',   unit:'set',         sale_price:60,   currency:'USD', tax_rate:18, status:'active', description:'Bill of lading processing and handling fee' },
  { name:'Pre-Shipment Inspection',       code:'CL-PSI',      category:'CLEARANCE',   unit:'shipment',    sale_price:200,  currency:'USD', tax_rate:18, status:'active', description:'Pre-shipment inspection (PVoC / CoC)' },
  { name:'Phytosanitary Certificate',     code:'CL-PHYTO',    category:'CLEARANCE',   unit:'certificate', sale_price:80,   currency:'USD', tax_rate:18, status:'active', description:'Phytosanitary / health certificate processing' },
  { name:'TANCIS Declaration Lodgement',  code:'CL-TANCIS',   category:'CLEARANCE',   unit:'declaration', sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Customs declaration lodgement via TANCIS' },
  { name:'Certificate of Origin',         code:'CL-COO',      category:'CLEARANCE',   unit:'certificate', sale_price:50,   currency:'USD', tax_rate:18, status:'active', description:'Certificate of origin processing and endorsement' },
  { name:'Customs Bond / Guarantee Setup',code:'CL-BOND',     category:'CLEARANCE',   unit:'shipment',    sale_price:150,  currency:'USD', tax_rate:18, status:'active', description:'Arranging a customs bond or guarantee for a shipment' },
  // Handling
  { name:'Terminal Handling Charge',      code:'PH-THC',      category:'HANDLING',    unit:'container',   sale_price:250,  currency:'USD', tax_rate:0,  status:'active', description:'Terminal handling charges at port of loading or discharge' },
  { name:'Port Scanning / X-Ray',         code:'PH-SCAN',     category:'HANDLING',    unit:'container',   sale_price:50,   currency:'USD', tax_rate:0,  status:'active', description:'Port scanner / X-ray inspection fee' },
  { name:'Weighbridge Certificate',       code:'PH-WGH',      category:'HANDLING',    unit:'unit',        sale_price:30,   currency:'USD', tax_rate:18, status:'active', description:'Weighbridge measurement and certificate fee' },
  { name:'Fumigation Treatment',          code:'PH-FUM',      category:'HANDLING',    unit:'container',   sale_price:150,  currency:'USD', tax_rate:18, status:'active', description:'Fumigation treatment and phytosanitary certificate' },
  { name:'Container Devanning',           code:'PH-DEVAN',    category:'HANDLING',    unit:'container',   sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Unloading / stripping a container at the warehouse' },
  { name:'Container Stuffing',            code:'PH-STUFF',    category:'HANDLING',    unit:'container',   sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Loading / stuffing a container for export' },
  { name:'Crane / Forklift Handling',     code:'PH-CRANE',    category:'HANDLING',    unit:'hour',        sale_price:40,   currency:'USD', tax_rate:18, status:'active', description:'Crane or forklift operation, per hour' },
  // Transport
  { name:'Road Transport — Local',        code:'RT-LOCAL',    category:'TRANSPORT',   unit:'trip',        sale_price:450,  currency:'USD', tax_rate:18, status:'active', description:'Local inland transport and delivery' },
  { name:'Road Transport — Upcountry',    code:'RT-UPCTRY',   category:'TRANSPORT',   unit:'trip',        sale_price:850,  currency:'USD', tax_rate:18, status:'active', description:'Upcountry delivery to inland destination' },
  { name:'Cross-Border Haulage',          code:'RT-XBORDER',  category:'TRANSPORT',   unit:'trip',        sale_price:1500, currency:'USD', tax_rate:0,  status:'active', description:'Cross-border road haulage to a neighboring country' },
  { name:'Last-Mile Delivery',            code:'RT-LASTMILE', category:'TRANSPORT',   unit:'delivery',    sale_price:25,   currency:'USD', tax_rate:18, status:'active', description:'Final-leg delivery to the consignee' },
  { name:'Container Drayage (Port→CFS)',  code:'RT-DRAY',     category:'TRANSPORT',   unit:'container',   sale_price:180,  currency:'USD', tax_rate:18, status:'active', description:'Short-haul container move from port to CFS/warehouse' },
  // Warehousing
  { name:'Warehouse Storage — General',   code:'WH-STOR',     category:'WAREHOUSING', unit:'day',         sale_price:15,   currency:'USD', tax_rate:18, status:'active', description:'General goods storage, per pallet per day' },
  { name:'Bonded Warehouse Storage',      code:'WH-BOND',     category:'WAREHOUSING', unit:'day',         sale_price:25,   currency:'USD', tax_rate:18, status:'active', description:'Bonded (duty-suspended) warehouse storage, per day' },
  { name:'Cold Chain / Reefer Storage',   code:'WH-COLD',     category:'WAREHOUSING', unit:'day',         sale_price:40,   currency:'USD', tax_rate:18, status:'active', description:'Temperature-controlled storage, per day' },
  { name:'Pallet Racking / Slot Fee',     code:'WH-SLOT',     category:'WAREHOUSING', unit:'unit',        sale_price:8,    currency:'USD', tax_rate:18, status:'active', description:'Racking slot allocation fee, per pallet position' },
  { name:'Cross-Docking Service',         code:'WH-XDOCK',    category:'WAREHOUSING', unit:'shipment',    sale_price:90,   currency:'USD', tax_rate:18, status:'active', description:'Direct transfer from inbound to outbound with no long-term storage' },
  // Fulfillment
  { name:'Pick & Pack',                   code:'FF-PICKPACK', category:'FULFILLMENT', unit:'order',       sale_price:3.5,  currency:'USD', tax_rate:18, status:'active', description:'Order picking and packing, per order' },
  { name:'Kitting / Assembly',            code:'FF-KIT',      category:'FULFILLMENT', unit:'unit',        sale_price:2,    currency:'USD', tax_rate:18, status:'active', description:'Kitting or light assembly of components, per unit' },
  { name:'Returns Processing',            code:'FF-RETURN',   category:'FULFILLMENT', unit:'unit',        sale_price:5,    currency:'USD', tax_rate:18, status:'active', description:'Reverse-logistics inspection and restocking of a returned unit' },
  { name:'Inventory Cycle Count',         code:'FF-CYCLE',    category:'FULFILLMENT', unit:'hour',        sale_price:20,   currency:'USD', tax_rate:18, status:'active', description:'Scheduled inventory cycle counting, per hour' },
  { name:'E-commerce Order Fulfillment',  code:'FF-ECOM',     category:'FULFILLMENT', unit:'order',       sale_price:4,    currency:'USD', tax_rate:18, status:'active', description:'End-to-end e-commerce order fulfillment, per order' },
  // Packaging
  { name:'Standard Export Packaging',     code:'PK-STD',      category:'PACKAGING',   unit:'unit',        sale_price:10,   currency:'USD', tax_rate:18, status:'active', description:'Standard export-grade packaging, per unit' },
  { name:'Custom Crating',                code:'PK-CRATE',    category:'PACKAGING',   unit:'unit',        sale_price:60,   currency:'USD', tax_rate:18, status:'active', description:'Custom wooden crate build for oversized or fragile cargo' },
  { name:'Shrink Wrap / Palletizing',     code:'PK-WRAP',     category:'PACKAGING',   unit:'pallet',      sale_price:12,   currency:'USD', tax_rate:18, status:'active', description:'Shrink-wrapping and palletizing, per pallet' },
  { name:'Labeling & Barcoding',          code:'PK-LABEL',    category:'PACKAGING',   unit:'unit',        sale_price:0.5,  currency:'USD', tax_rate:18, status:'active', description:'Labeling and barcode application, per unit' },
  { name:'Dangerous Goods Packaging',     code:'PK-DG',       category:'PACKAGING',   unit:'unit',        sale_price:45,   currency:'USD', tax_rate:18, status:'active', description:'IMO/IATA-compliant hazardous goods packaging, per unit' },
  // Procurement
  { name:'Sourcing & Vendor Management',  code:'PR-SOURCE',   category:'PROCUREMENT', unit:'hour',        sale_price:35,   currency:'USD', tax_rate:18, status:'active', description:'Supplier sourcing and vendor management, per hour' },
  { name:'Purchase Order Processing',     code:'PR-PO',       category:'PROCUREMENT', unit:'order',       sale_price:20,   currency:'USD', tax_rate:18, status:'active', description:'Purchase order creation and processing, per order' },
  { name:'Supplier Quality Audit',        code:'PR-AUDIT',    category:'PROCUREMENT', unit:'audit',       sale_price:300,  currency:'USD', tax_rate:18, status:'active', description:'On-site supplier quality/compliance audit' },
  { name:'Supply Chain Consultancy',      code:'PR-CONSULT',  category:'PROCUREMENT', unit:'hour',        sale_price:60,   currency:'USD', tax_rate:18, status:'active', description:'Freight forwarding / supply chain advisory, per hour' },
  // Duty & Taxes (rate is typically set per shipment against the CIF/customs value)
  { name:'Import Duty',                   code:'DT-IMP',      category:'DUTY',        unit:'%',           sale_price:0,    currency:'USD', tax_rate:0,  status:'active', description:'Customs import duty — percentage of CIF value, rate varies by HS code' },
  { name:'VAT on Import',                 code:'DT-VAT',      category:'DUTY',        unit:'%',           sale_price:0,    currency:'USD', tax_rate:0,  status:'active', description:'Value added tax assessed on imported goods' },
  { name:'Excise Duty',                   code:'DT-EXC',      category:'DUTY',        unit:'%',           sale_price:0,    currency:'USD', tax_rate:0,  status:'active', description:'Excise duty applicable on specific commodities' },
  { name:'Railway Development Levy',      code:'DT-RDL',      category:'DUTY',        unit:'%',           sale_price:0,    currency:'USD', tax_rate:0,  status:'active', description:'Railway Development Levy on imports' },
  // Insurance
  { name:'Marine Cargo Insurance',        code:'INS-CARGO',   category:'INSURANCE',   unit:'%',           sale_price:0,    currency:'USD', tax_rate:18, status:'active', description:'Marine cargo insurance — percentage of insured cargo value, set per shipment' },
  { name:'Goods-in-Storage Insurance',    code:'INS-WH',      category:'INSURANCE',   unit:'%',           sale_price:0,    currency:'USD', tax_rate:18, status:'active', description:'Insurance on goods held in warehouse — percentage of insured value' },
  // Labor
  { name:'Casual Labor — Loading',        code:'LB-CASUAL',   category:'LABOR',       unit:'hour',        sale_price:6,    currency:'USD', tax_rate:18, status:'active', description:'Casual loading/offloading labor, per hour' },
  { name:'Skilled Technician / Operator', code:'LB-SKILLED',  category:'LABOR',       unit:'hour',        sale_price:15,   currency:'USD', tax_rate:18, status:'active', description:'Skilled equipment operator or technician, per hour' },
  { name:'Supervisor / Team Lead',        code:'LB-SUPER',    category:'LABOR',       unit:'hour',        sale_price:25,   currency:'USD', tax_rate:18, status:'active', description:'On-site supervisor or team lead, per hour' },
  // Other
  { name:'Storage / Demurrage',           code:'OT-STOR',     category:'OTHER',       unit:'day',         sale_price:25,   currency:'USD', tax_rate:18, status:'active', description:'Container or cargo storage charge per day' },
  { name:'Port Congestion Surcharge',     code:'OT-CONG',     category:'OTHER',       unit:'container',   sale_price:150,  currency:'USD', tax_rate:0,  status:'active', description:'Port congestion surcharge (applied when applicable)' },
  { name:'Dangerous Goods / IMO Fee',     code:'OT-DG',       category:'OTHER',       unit:'shipment',    sale_price:120,  currency:'USD', tax_rate:18, status:'active', description:'Handling surcharge for IMO / DG classified cargo' },
  { name:'Detention Charges',             code:'OT-DET',      category:'OTHER',       unit:'day',         sale_price:30,   currency:'USD', tax_rate:0,  status:'active', description:'Detention charge for container held beyond free time' },
];

function genCode(name: string, category: string): string {
  const abbr: Record<string, string> = {
    FREIGHT: 'SF', CLEARANCE: 'CL', HANDLING: 'PH', TRANSPORT: 'RT', WAREHOUSING: 'WH',
    FULFILLMENT: 'FF', PACKAGING: 'PK', PROCUREMENT: 'PR', DUTY: 'DT', INSURANCE: 'INS', LABOR: 'LB', OTHER: 'OT',
  };
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return `${abbr[category] ?? 'SV'}-${slug}`;
}

// -- Helpers -------------------------------------------------------------------

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

// -- Pagination ------------------------------------------------------------

const PAGE_SIZE = 20;

// -- Category badge ------------------------------------------------------------

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_CFG[cat] ?? CAT_CFG.OTHER;
  return <span style={{ padding: '2px 9px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>;
}

// -- Status toggle -------------------------------------------------------------

function StatusPill({ status }: { status: 'active' | 'inactive' }) {
  const isActive = status === 'active';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, background: isActive ? 'var(--green-l)' : 'var(--bg)', color: isActive ? 'var(--green)' : 'var(--ink3)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? 'var(--green)' : 'var(--ink3)', display: 'inline-block' }} />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// -- Delete confirm modal ------------------------------------------------------

function DeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-100 gap-0">
        <DialogTitle style={{ fontSize: 16, marginBottom: 8 }}>Delete Service</DialogTitle>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20 }}>
          Are you sure you want to delete <strong>{name}</strong>? This cannot be undone and may affect invoices or quotations referencing this item.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" title="Cancel" onClick={onCancel} style={{ padding: 'var(--ds-btn-py) 18px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
          <Button type="button" variant="destructive" title="Confirm delete" onClick={onConfirm}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -- Product Form (slide-in panel) ---------------------------------------------

function ProductForm({ initial, onSave, onClose, isMobile }: {
  initial?: Product;
  onSave: (data: ProductForm) => Promise<Product>;
  onClose: () => void;
  isMobile: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const ext = initial as any;
  const [f, setF] = useState<ProductForm>({
    name:              initial?.name           ?? '',
    code:              initial?.code           ?? '',
    type:              initial?.type           ?? 'service',
    category:          initial?.category       ?? 'FREIGHT',
    description:       initial?.description    ?? '',
    unit:              initial?.unit           ?? 'shipment',
    sale_price:        initial?.sale_price     ?? 0,
    purchase_price:    initial?.purchase_price ?? 0,
    currency:          initial?.currency       ?? 'USD',
    tax_rate:          initial?.tax_rate       ?? 0,
    tax_code_id:       initial?.tax_code_id    ?? null,
    status:            initial?.status         ?? 'active',
    notes:             initial?.notes          ?? '',
    compare_at_price:  ext?.compare_at_price   ?? null,
    brand:             ext?.brand              ?? '',
    vendor_name:       ext?.vendor_name        ?? '',
    image_urls:        Array.isArray(ext?.image_urls) ? ext.image_urls : [],
    stock_quantity:    ext?.stock_quantity     ?? null,
    low_stock_threshold: ext?.low_stock_threshold ?? 5,
    track_inventory:   ext?.track_inventory    ?? false,
    weight_kg:         ext?.weight_kg          ?? null,
    dimensions_cm:     ext?.dimensions_cm      ?? null,
    shipping_class:    ext?.shipping_class     ?? 'standard',
    variants:          Array.isArray(ext?.variants) ? ext.variants : [],
    meta_title:        ext?.meta_title         ?? '',
    meta_description:  ext?.meta_description   ?? '',
    url_handle:        ext?.url_handle         ?? '',
    visibility:        ext?.visibility         ?? 'published',
    channels:          Array.isArray(ext?.channels) ? ext.channels : ['online_store'],
  });

  // Customer-specific (contract) prices. Loaded for an existing service; for a
  // new one they are held here and saved right after the service is created.
  const [prices, setPrices] = useState<CustomerPriceRow[]>([]);
  useEffect(() => {
    if (!initial?.id) return;
    apiFetch(`/v1/products/${initial.id}/customer-prices`)
      .then((rows: any) => setPrices((Array.isArray(rows) ? rows : []).map((r: any) => ({
        customer_id: r.customer_id, customer_name: r.customer_name,
        price: Number(r.price) || 0, currency: r.currency || 'USD', note: r.note || '',
      }))))
      .catch(() => {});
  }, [initial?.id]);

  function set<K extends keyof ProductForm>(k: K, v: ProductForm[K]) {
    setF(p => {
      const next = { ...p, [k]: v };
      if (k === 'name' && !initial) next.code = genCode(String(v), next.category);
      if (k === 'category' && !initial) next.code = genCode(next.name, String(v));
      return next;
    });
  }

  function setPriceRow(i: number, patch: Partial<CustomerPriceRow>) {
    setPrices(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch(`/v1/customers${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`).catch(() => []);
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    const filtered = q.trim() ? list.filter((c: any) => (c.name || '').toLowerCase().includes(q.toLowerCase())) : list;
    return filtered.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
  }
  function addCustomer(item: PickerItem | null) {
    if (!item) return;
    setPrices(prev => prev.some(p => p.customer_id === item.id) ? prev
      : [...prev, { customer_id: item.id, customer_name: item.label, price: f.sale_price, currency: f.currency, note: '' }]);
  }

  async function submit() {
    if (!f.name.trim()) { showAlert('Service name is required.'); return; }
    setSaving(true);
    try {
      const saved = await onSave(f);
      // The service now has an id (whether it was just created or already
      // existed), so its agreed prices can be written against it.
      await apiFetch(`/v1/products/${saved.id}/customer-prices`, {
        method: 'PUT',
        body: JSON.stringify({ prices: prices.map(p => ({ customer_id: p.customer_id, price: Number(p.price) || 0, currency: p.currency, note: p.note })) }),
      });
      onClose();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save this service.');
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box' as const, color: 'var(--ink)', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };
  const row: React.CSSProperties = { marginBottom: 16 };

  const isProduct = f.type === 'product';
  const typeName = isProduct ? 'Product' : 'Service';

  function toggleChannel(ch: string) {
    setF(p => ({ ...p, channels: p.channels.includes(ch) ? p.channels.filter(c => c !== ch) : [...p.channels, ch] }));
  }
  function setVariantValues(i: number, raw: string) {
    const vals = raw.split(',').map(v => v.trim()).filter(Boolean);
    setF(p => ({ ...p, variants: p.variants.map((v, idx) => idx === i ? { ...v, values: vals } : v) }));
  }
  function addVariant() { setF(p => ({ ...p, variants: [...p.variants, { name: '', values: [] }] })); }
  function removeVariant(i: number) { setF(p => ({ ...p, variants: p.variants.filter((_, idx) => idx !== i) })); }
  function setImageUrl(i: number, val: string) { setF(p => { const a = [...p.image_urls]; a[i] = val; return { ...p, image_urls: a }; }); }
  function addImageSlot() { setF(p => ({ ...p, image_urls: [...p.image_urls, ''] })); }
  function removeImageSlot(i: number) { setF(p => ({ ...p, image_urls: p.image_urls.filter((_, idx) => idx !== i) })); }

  return (
    <FormPage
      title={initial ? `Edit ${typeName}` : `New ${typeName}`}
      subtitle={initial ? `Editing ${initial.code}` : `Add a ${typeName.toLowerCase()} to your catalog — its code, price, unit and tax.`}
      onCancel={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" title={`Save ${typeName.toLowerCase()}`} onClick={submit} disabled={saving} className="btn btn-primary">
            <Icon name="save" size={13} /> {saving ? 'Saving…' : initial ? `Update ${typeName}` : `Add ${typeName}`}
          </button>
        </>
      }
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={row}>
            <label style={lbl}>{typeName} Name *</label>
            <input type="text" title={`${typeName} name`} placeholder={isProduct ? 'e.g. Wireless Bluetooth Speaker' : 'e.g. Sea Freight — 20ft FCL'} value={f.name} onChange={e => set('name', e.target.value)} style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Type</label>
              <Select value={f.type} onValueChange={v => set('type', v as 'product' | 'service')}>
                <SelectTrigger aria-label="Type" style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={lbl}>Code / SKU</label>
              <input type="text" title="Service code" placeholder="e.g. SF-FCL-20" value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'var(--font)', fontSize: 12 }} />
            </div>
            <div>
              <label style={lbl}>Category</label>
              <Select value={f.category} onValueChange={v => set('category', v)}>
                <SelectTrigger aria-label="Category" style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_CFG[c].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={row}>
            <label style={lbl}>Description</label>
            <textarea title="Description" placeholder="Brief description of the service…" value={f.description} onChange={e => set('description', e.target.value)} rows={3}
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {/* Pricing */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Sale Price</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{f.currency}</span>
                  <input type="number" title="Sale price" value={f.sale_price} min={0} step={0.01} onChange={e => set('sale_price', parseFloat(e.target.value) || 0)}
                    style={{ ...inp, paddingLeft: f.currency.length * 8 + 14 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Purchase / Cost Price</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{f.currency}</span>
                  <input type="number" title="Purchase price" value={f.purchase_price} min={0} step={0.01} onChange={e => set('purchase_price', parseFloat(e.target.value) || 0)}
                    style={{ ...inp, paddingLeft: f.currency.length * 8 + 14 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <Select value={f.currency} onValueChange={v => set('currency', v)}>
                  <SelectTrigger aria-label="Currency" style={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Unit of Measure</label>
                <Select value={f.unit} onValueChange={v => set('unit', v)}>
                  <SelectTrigger aria-label="Unit" style={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={lbl}>Tax Rate (%)</label>
                <input type="number" title="Tax rate" value={f.tax_rate} min={0} max={100} step={0.5} onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)} style={inp} />
              </div>
            </div>
            {isProduct && (
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Compare-at Price (crossed-out "was" price)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{f.currency}</span>
                  <input type="number" title="Compare-at price" value={f.compare_at_price ?? ''} min={0} step={0.01}
                    onChange={e => set('compare_at_price', e.target.value ? parseFloat(e.target.value) : null)}
                    style={{ ...inp, paddingLeft: f.currency.length * 8 + 14 }} />
                </div>
              </div>
            )}
          </div>

          {/* ── Product-only sections ─────────────────────────── */}
          {isProduct && (<>

          {/* Media */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Product Images</div>
            {f.image_urls.map((url, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input type="url" title={`Image URL ${i + 1}`} placeholder="https://…" value={url} onChange={e => setImageUrl(i, e.target.value)} style={{ ...inp, flex: 1 }} />
                {url && <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', whiteSpace: 'nowrap' }}>COVER</span>}
                <button type="button" title="Remove image" onClick={() => removeImageSlot(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {f.image_urls.length < 5 && (
              <button type="button" onClick={addImageSlot} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', background: 'none', border: '1px dashed var(--teal-m, var(--teal))', borderRadius: 'var(--r)', padding: '6px 12px', cursor: 'pointer' }}>
                <Icon name="plus" size={12} /> Add image URL
              </button>
            )}
          </div>

          {/* Brand & Vendor */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Brand</label>
              <input type="text" title="Brand" placeholder="e.g. Sony" value={f.brand} onChange={e => set('brand', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Vendor / Supplier</label>
              <input type="text" title="Vendor name" placeholder="e.g. Tech Distributors Ltd" value={f.vendor_name} onChange={e => set('vendor_name', e.target.value)} style={inp} />
            </div>
          </div>

          {/* Inventory */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Inventory</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Checkbox id="track-inv" checked={f.track_inventory} onCheckedChange={v => set('track_inventory', !!v)} />
              <label htmlFor="track-inv" style={{ fontSize: 13, cursor: 'pointer' }}>Track inventory for this product</label>
            </div>
            {f.track_inventory && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Stock Quantity</label>
                  <input type="number" title="Stock quantity" value={f.stock_quantity ?? ''} min={0} onChange={e => set('stock_quantity', e.target.value ? parseInt(e.target.value) : null)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Low-Stock Alert At</label>
                  <input type="number" title="Low stock threshold" value={f.low_stock_threshold} min={0} onChange={e => set('low_stock_threshold', parseInt(e.target.value) || 0)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Weight (kg)</label>
                  <input type="number" title="Weight in kg" value={f.weight_kg ?? ''} min={0} step={0.001} onChange={e => set('weight_kg', e.target.value ? parseFloat(e.target.value) : null)} style={inp} />
                </div>
              </div>
            )}
          </div>

          {/* Variants */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Variants</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>Define option groups like Color or Size. Values are comma-separated.</div>
            {f.variants.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input type="text" title="Option name" placeholder="e.g. Color" value={v.name} onChange={e => setF(p => ({ ...p, variants: p.variants.map((vv, idx) => idx === i ? { ...vv, name: e.target.value } : vv) }))} style={{ ...inp, padding: '7px 10px' }} />
                <input type="text" title="Option values" placeholder="e.g. Black, White, Silver" value={v.values.join(', ')} onChange={e => setVariantValues(i, e.target.value)} style={{ ...inp, padding: '7px 10px' }} />
                <button type="button" title="Remove variant" onClick={() => removeVariant(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, display: 'flex', justifyContent: 'center' }}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            <button type="button" onClick={addVariant} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', background: 'none', border: '1px dashed var(--teal-m, var(--teal))', borderRadius: 'var(--r)', padding: '6px 12px', cursor: 'pointer', marginTop: 4 }}>
              <Icon name="plus" size={12} /> Add option
            </button>
          </div>

          {/* Shipping */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Shipping</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Shipping Class</label>
              <Select value={f.shipping_class || 'standard'} onValueChange={v => set('shipping_class', v)}>
                <SelectTrigger aria-label="Shipping class" style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="express">Express</SelectItem>
                  <SelectItem value="freight">Freight</SelectItem>
                  <SelectItem value="digital">Digital / No shipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={lbl}>Dimensions (cm) — L × W × H</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {(['length', 'width', 'height'] as const).map(dim => (
                  <input key={dim} type="number" title={dim} placeholder={dim.charAt(0).toUpperCase() + dim.slice(1)} min={0} step={0.1}
                    value={f.dimensions_cm?.[dim] ?? ''}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setF(p => ({ ...p, dimensions_cm: { length: p.dimensions_cm?.length ?? 0, width: p.dimensions_cm?.width ?? 0, height: p.dimensions_cm?.height ?? 0, [dim]: v } }));
                    }}
                    style={{ ...inp, padding: '7px 10px' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Visibility & Channels */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Visibility</div>
              {(['published', 'draft', 'scheduled'] as const).map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="visibility" checked={f.visibility === opt} onChange={() => set('visibility', opt)} />
                  <span style={{ fontWeight: f.visibility === opt ? 700 : 400 }}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                </label>
              ))}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Sales Channels</div>
              {[{ id: 'online_store', label: 'Online Store' }, { id: 'pos', label: 'Point of Sale' }, { id: 'marketplace', label: 'Marketplace' }].map(ch => (
                <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <Checkbox checked={f.channels.includes(ch.id)} onCheckedChange={() => toggleChannel(ch.id)} />
                  {ch.label}
                </label>
              ))}
            </div>
          </div>

          {/* SEO */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>SEO</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>URL Handle (slug)</label>
              <input type="text" title="URL handle" placeholder="e.g. wireless-bluetooth-speaker" value={f.url_handle} onChange={e => set('url_handle', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-'))} style={inp} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Meta Title</label>
              <input type="text" title="Meta title" value={f.meta_title} onChange={e => set('meta_title', e.target.value)} style={inp} />
              <div style={{ fontSize: 11, color: f.meta_title.length > 60 ? 'var(--red)' : 'var(--ink3)', marginTop: 4 }}>{f.meta_title.length}/60 characters</div>
            </div>
            <div>
              <label style={lbl}>Meta Description</label>
              <textarea title="Meta description" value={f.meta_description} onChange={e => set('meta_description', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
              <div style={{ fontSize: 11, color: f.meta_description.length > 160 ? 'var(--red)' : 'var(--ink3)', marginTop: 4 }}>{f.meta_description.length}/160 characters</div>
            </div>
          </div>

          </>)}

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Status</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Inactive {typeName.toLowerCase()}s don't appear in the invoice line-item picker</div>
            </div>
            <button type="button" title="Toggle status" onClick={() => set('status', f.status === 'active' ? 'inactive' : 'active')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: f.status === 'active' ? 'var(--green)' : 'var(--ink3)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.status === 'active' ? 'var(--green)' : 'var(--ink3)' }} />
              {f.status === 'active' ? 'Active' : 'Inactive'}
            </button>
          </div>

          <div style={row}>
            <label style={lbl}>Internal Notes</label>
            <textarea title="Notes" placeholder={`Any internal notes about this ${typeName.toLowerCase()}…`} value={f.notes} onChange={e => set('notes', e.target.value)} rows={2}
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {/* Customer-specific (contract) prices */}
          <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, background: 'var(--bg)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Customer-specific prices</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12, lineHeight: 1.5 }}>
              Agreed contract rates. When one of these customers is on an invoice, quotation or purchase order, their price for this service is triggered instead of the catalog price of{' '}
              <strong style={{ color: 'var(--ink2)' }}>{f.sale_price > 0 ? fmt(f.sale_price, f.currency) : '—'}</strong>.
            </div>
            {prices.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {prices.map((p, i) => (
                  <div key={p.customer_id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.4fr) 120px 92px minmax(0,1fr) 32px', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.customer_name}>{p.customer_name}</div>
                    <input type="number" title="Agreed price" value={p.price} min={0} step={0.01} onChange={e => setPriceRow(i, { price: parseFloat(e.target.value) || 0 })} style={{ ...inp, padding: '7px 10px' }} />
                    <Select value={p.currency} onValueChange={v => setPriceRow(i, { currency: v })}>
                      <SelectTrigger aria-label="Currency" style={{ ...inp, padding: '7px 10px' }}><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <input type="text" title="Note" placeholder="Contract ref / note" value={p.note} onChange={e => setPriceRow(i, { note: e.target.value })} style={{ ...inp, padding: '7px 10px' }} />
                    <button type="button" title="Remove agreed price" onClick={() => setPrices(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex', justifyContent: 'center', padding: 4 }}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <EntityPicker value={null} onChange={addCustomer} search={searchCustomers} placeholder="Add a customer with an agreed price…" />
          </div>

          {/* Live preview */}
          <div style={{ background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 'var(--r)', padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {isProduct && f.image_urls[0] && (
                  <img src={f.image_urls[0]} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{f.name || `${typeName} Name`}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, fontFamily: 'var(--font)' }}>{f.code || '—'} · {CAT_CFG[f.category]?.label}</div>
                  {isProduct && f.brand && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{f.brand}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {isProduct && f.compare_at_price && f.compare_at_price > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink3)', textDecoration: 'line-through' }}>{fmt(f.compare_at_price, f.currency)}</div>
                )}
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--teal)' }}>{f.sale_price > 0 ? fmt(f.sale_price, f.currency) : '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>per {f.unit}{f.tax_rate > 0 ? ` · ${f.tax_rate}% tax` : ' · no tax'}</div>
                {isProduct && f.track_inventory && f.stock_quantity !== null && (
                  <div style={{ fontSize: 11, color: (f.stock_quantity ?? 0) <= f.low_stock_threshold ? 'var(--red)' : 'var(--green)' }}>{f.stock_quantity} in stock</div>
                )}
              </div>
            </div>
          </div>
        </div>

    </FormPage>
  );
}

// -- Detail Panel (right slide-in) ---------------------------------------------

function DetailPanel({ product, onEdit, onDelete, onToggleStatus, onClose }: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-95 sm:max-w-95 flex flex-col p-0 gap-0">
        <SheetHeader style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>{product.code}</div>
          <SheetTitle style={{ fontSize: 16, lineHeight: 1.3 }}>{product.name}</SheetTitle>
        </SheetHeader>

        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {/* Pricing hero */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '18px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Unit Price</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', letterSpacing: '-0.5px' }}>{product.sale_price > 0 ? fmt(product.sale_price, product.currency) : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>per {product.unit}{product.tax_rate > 0 ? ` · +${product.tax_rate}% tax` : ''}</div>
            </div>
            <StatusPill status={product.status} />
          </div>

          {/* Meta */}
          {[
            { label: 'Category',   value: <CatBadge cat={product.category} /> },
            { label: 'Unit',       value: product.unit },
            { label: 'Currency',   value: product.currency },
            { label: 'Tax Rate',   value: product.tax_rate > 0 ? `${product.tax_rate}%` : 'No tax' },
            { label: 'Created',    value: fmtDate(product.created_at) },
            { label: 'Updated',    value: fmtDate(product.updated_at) },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--ink3)' }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.value}</span>
            </div>
          ))}

          {product.description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>{product.description}</div>
            </div>
          )}

          {product.notes && (
            <div style={{ background: 'var(--gold-l)', borderRadius: 'var(--r)', padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{product.notes}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" title="Edit service" onClick={onEdit}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 16px', border: 'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: 'pointer', fontWeight: 600, fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="edit" size={14} /> Edit Service
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" title="Toggle active/inactive" onClick={onToggleStatus}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)' }}>
              <Icon name="eye" size={13} /> {product.status === 'active' ? 'Set Inactive' : 'Set Active'}
            </button>
            <button type="button" title="Delete service" onClick={onDelete}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '1px solid var(--red)', borderRadius: 'var(--r)', background: 'var(--red-l)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--red)' }}>
              <Icon name="trash" size={13} /> Delete
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// -- Main Page -----------------------------------------------------------------

export const ProductsServices: React.FC = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const isClearOS = location.pathname.startsWith('/clearos');
  const baseRoute = isClearOS ? '/clearos' : '/finance';
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');
  const [catFilter, setCatFilter] = useState<CatFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Product | null>(null);
  const [editing, setEditing]     = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting]   = useState<Product | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(false);
  const [tariffSheetOpen, setTariffSheetOpen] = useState(false);
  const [tariffQuery, setTariffQuery] = useState('');
  const [tariffResults, setTariffResults] = useState<any[]>([]);
  const [tariffLoading, setTariffLoading] = useState(false);
  const [tariffSelected, setTariffSelected] = useState<Set<string>>(new Set());
  const [tariffImporting, setTariffImporting] = useState(false);
  const [sortBy, setSortBy]       = useState<'name' | 'price' | 'category' | 'created'>('name');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');
  const [page, setPage]           = useState(1);

  // -- Load -------------------------------------------------------------------

  function loadProducts() {
    setLoading(true);
    setLoadError('');
    apiFetch('/v1/products')
      .then(data => setProducts(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(err => setLoadError(err.message || 'Failed to load the service catalog.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProducts(); }, []);

  // -- CRUD -------------------------------------------------------------------
  // Every mutation round-trips through the real API and reconciles local state
  // from the response it actually returns — no optimistic writes that could
  // drift from what's in the database, no swallowed failures.

  // Returns the saved product so the form can write its customer-specific
  // prices against the id (needed for a brand-new service). The form itself
  // reports failures and closes on success.
  async function handleSave(data: ProductForm): Promise<Product> {
    const isNew = editing === 'new';
    if (isNew) {
      const created: Product = await apiFetch('/v1/products', { method: 'POST', body: JSON.stringify(data) });
      setProducts(prev => [created, ...prev]);
      return created;
    }
    const target = editing as Product;
    const updated: Product = await apiFetch(`/v1/products/${target.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setProducts(prev => prev.map(p => p.id === target.id ? updated : p));
    if (selected?.id === target.id) setSelected(updated);
    return updated;
  }

  async function handleDelete(product: Product) {
    try {
      await apiFetch(`/v1/products/${product.id}`, { method: 'DELETE' });
      setProducts(prev => prev.filter(p => p.id !== product.id));
      if (selected?.id === product.id) setSelected(null);
      setDeleting(null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete this service.');
    }
  }

  async function handleToggleStatus(product: Product) {
    const nextStatus = product.status === 'active' ? 'inactive' : 'active';
    try {
      const updated: Product = await apiFetch(`/v1/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
      if (selected?.id === product.id) setSelected(updated);
    } catch (err: any) {
      showAlert(err.message || 'Failed to update this service.');
    }
  }

  async function handleLoadStarterCatalog() {
    if (!(await showConfirm(`Add ${STARTER_CATALOG.length} common freight & clearing services to your catalog as a starting point? You can edit or delete any of them afterward.`, { confirmLabel: 'Add Services' }))) return;
    setLoadingStarter(true);
    try {
      const created = await Promise.all(STARTER_CATALOG.map(p => apiFetch('/v1/products', { method: 'POST', body: JSON.stringify(p) })));
      setProducts(prev => [...created, ...prev]);
    } catch (err: any) {
      showAlert(err.message || 'Failed to add the starter catalog — some services may not have been added.');
      loadProducts();
    } finally {
      setLoadingStarter(false);
    }
  }

  // -- Import from TPA/TASAC tariff reference ---------------------------------
  // Distinct from Load Starter Catalog: that seeds a small curated common
  // baseline for every new tenant; this browses the full ~335-row TPA/TASAC
  // tariff reference (Tools > Reference > Tariff, port_tariff_items) so a
  // tenant can pick only the specific charges relevant to their operation
  // (e.g. one container-hire tier, not all of Clause 22) into their own
  // invoiceable catalog.
  useEffect(() => {
    if (!tariffSheetOpen) return;
    setTariffLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/reference/tariff?q=${encodeURIComponent(tariffQuery)}&limit=100`)
        .then(res => setTariffResults((res.data ?? []).filter((r: any) => r.rate_amount != null)))
        .catch(() => setTariffResults([]))
        .finally(() => setTariffLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [tariffSheetOpen, tariffQuery]);

  function toggleTariffSelected(id: string) {
    setTariffSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const TARIFF_CATEGORY: Record<string, string> = { TPA: 'HANDLING', TASAC_CFA: 'CLEARANCE', TRA: 'DUTY' };

  async function handleImportSelectedTariff() {
    const chosen = tariffResults.filter(r => tariffSelected.has(r.id));
    if (chosen.length === 0) return;
    setTariffImporting(true);
    try {
      const created = await Promise.all(chosen.map(r => apiFetch('/v1/products', {
        method: 'POST',
        body: JSON.stringify({
          name: r.item_name,
          code: r.clause_ref ? `${r.authority}-${r.clause_ref}`.replace(/[^A-Za-z0-9.\-]/g, '') : undefined,
          category: TARIFF_CATEGORY[r.authority] ?? 'OTHER',
          description: [r.source_document, r.category, r.subcategory].filter(Boolean).join(' — '),
          unit: r.unit || 'unit',
          sale_price: Number(r.rate_amount) || 0,
          currency: r.rate_currency || 'USD',
          tax_rate: 0,
          status: 'active',
        }),
      })));
      setProducts(prev => [...created, ...prev]);
      setTariffSelected(new Set());
      setTariffSheetOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'Failed to import the selected tariff items — some may not have been added.');
      loadProducts();
    } finally {
      setTariffImporting(false);
    }
  }

  // -- Filter + Sort ----------------------------------------------------------

  const displayed = products
    .filter(p => {
      if (catFilter !== 'ALL' && p.category !== catFilter) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s) || p.category.toLowerCase().includes(s);
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name')     cmp = a.name.localeCompare(b.name);
      if (sortBy === 'price')    cmp = a.sale_price - b.sale_price;
      if (sortBy === 'category') cmp = a.category.localeCompare(b.category);
      if (sortBy === 'created')  cmp = a.created_at.localeCompare(b.created_at);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = displayed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: typeof sortBy }) {
    if (sortBy !== col) return <Icon name="arrowUp" size={10} color="var(--border)" />;
    return <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={10} color="var(--teal)" />;
  }

  // -- Metrics ----------------------------------------------------------------

  const active    = products.filter(p => p.status === 'active').length;
  const inactive  = products.filter(p => p.status === 'inactive').length;
  const priced    = products.filter(p => Number(p.sale_price) > 0);
  const avgPrice  = priced.length ? priced.reduce((s, p) => s + Number(p.sale_price), 0) / priced.length : 0;
  const topCat    = CATEGORIES.reduce((best, c) => products.filter(p => p.category === c).length > products.filter(p => p.category === best).length ? c : best, 'FREIGHT');

  // Product inventory KPIs (only meaningful when there are tracked products)
  const physicalProducts = products.filter(p => p.type === 'product');
  const tracked = physicalProducts.filter(p => (p as any).track_inventory);
  const lowStock = tracked.filter(p => { const pany = p as any; return pany.stock_quantity !== null && pany.stock_quantity <= (pany.low_stock_threshold ?? 5) && pany.stock_quantity > 0; });
  const outOfStock = tracked.filter(p => (p as any).stock_quantity !== null && (p as any).stock_quantity <= 0);
  const inventoryValue = tracked.reduce((sum, p) => sum + (Number((p as any).stock_quantity) || 0) * Number(p.sale_price), 0);

  // -- Render -----------------------------------------------------------------

  // The form replaces the list rather than layering over it — the same
  // full-page pattern every other finance document create/edit now uses.
  if (editing !== null) {
    return (
      <ProductForm
        initial={editing === 'new' ? undefined : editing}
        onSave={handleSave}
        onClose={() => setEditing(null)}
        isMobile={isMobile}
      />
    );
  }

  return (
    <>
      {deleting && (
        <DeleteModal
          name={deleting.name}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {selected && !editing && !deleting && (
        <DetailPanel
          product={selected}
          onEdit={() => setEditing(selected)}
          onDelete={() => { setDeleting(selected); setSelected(null); }}
          onToggleStatus={() => handleToggleStatus(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="products-services-page">
        <PageHeader
          crumbs={[isClearOS ? 'CLEAROS' : 'FINANCE', 'PRODUCTS & SERVICES']}
          titlePlain="Product"
          titleEm="catalog"
          subtitle="Service pricing, billable inventory items and unit rates."
        />

        <Sheet open={tariffSheetOpen} onOpenChange={setTariffSheetOpen}>
          <SheetContent side="right" style={{ width: 480, maxWidth: '100vw', display: 'flex', flexDirection: 'column' }}>
            <SheetHeader>
              <SheetTitle>Import from TPA / TASAC Tariff</SheetTitle>
            </SheetHeader>
            <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 12px', lineHeight: 1.5 }}>
              Browse the TPA Sea Ports Tariff Book and TASAC agency-fee guide and pick only the specific charges your operation actually bills for — each becomes its own invoiceable service in your catalog, editable afterward like any other.
            </p>
            <input
              value={tariffQuery}
              onChange={e => setTariffQuery(e.target.value)}
              placeholder="Search clause, item, category…"
              style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, marginBottom: 10 }}
            />
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)'}}>
              {tariffLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Searching…</div>}
              {!tariffLoading && tariffResults.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No tariff items match.</div>}
              {!tariffLoading && tariffResults.map(r => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Checkbox checked={tariffSelected.has(r.id)} onCheckedChange={() => toggleTariffSelected(r.id)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{r.item_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                      {[r.clause_ref, r.category, r.subcategory].filter(Boolean).join(' · ')} — {r.rate_currency} {Number(r.rate_amount).toLocaleString('en-US')}{r.unit ? ` / ${r.unit}` : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{tariffSelected.size} selected</span>
              <button type="button" disabled={tariffSelected.size === 0 || tariffImporting} onClick={handleImportSelectedTariff}
                style={{ padding: 'var(--ds-btn-py) 16px', border: 'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: tariffSelected.size === 0 ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, opacity: tariffSelected.size === 0 || tariffImporting ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                {tariffImporting ? 'Adding…' : `Add ${tariffSelected.size || ''} Service${tariffSelected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Metrics */}
        <MetricsRow cards={[
          { title: 'Total Catalog', value: String(products.length), sub1Label: 'PRODUCTS', sub1Value: String(physicalProducts.length), sub2Label: 'SERVICES', sub2Value: String(products.length - physicalProducts.length), barHighlight: 'var(--blue)' },
          { title: 'Active', value: String(active), sub1Label: 'WITH PRICE', sub1Value: String(priced.length), sub2Label: 'INACTIVE', sub2Value: String(inactive), barHighlight: 'var(--green)' },
          ...(physicalProducts.length > 0 ? [
            { title: 'Low Stock', value: String(lowStock.length), sub1Label: 'OUT OF STOCK', sub1Value: String(outOfStock.length), sub2Label: 'TRACKED', sub2Value: String(tracked.length), barHighlight: lowStock.length > 0 ? 'var(--gold)' : 'var(--green)' },
            { title: 'Inventory Value', value: inventoryValue > 0 ? `$${Math.round(inventoryValue).toLocaleString()}` : '—', sub1Label: 'PRODUCTS', sub1Value: String(physicalProducts.length), sub2Label: 'TRACKED', sub2Value: String(tracked.length), barHighlight: 'var(--purple)' },
          ] : [
            { title: 'Avg Unit Price', value: avgPrice > 0 ? `$${Math.round(avgPrice)}` : '—', sub1Label: 'PRICED', sub1Value: String(priced.length), sub2Label: 'FREE/DUTY', sub2Value: String(products.filter(p => Number(p.sale_price) === 0).length), barHighlight: 'var(--gold)' },
            { title: 'Categories', value: String(new Set(products.map(p => p.category)).size), sub1Label: 'TOP CATEGORY', sub1Value: products.length ? (CAT_CFG[topCat]?.label ?? '—') : '—', sub2Label: 'ITEMS', sub2Value: String(products.filter(p => p.category === topCat).length), barHighlight: 'var(--purple)' },
          ]),
        ]} />

        <div className="products-action-bar">
          {!loading && products.length === 0 && (
            <button type="button" title="Add starter catalog" disabled={loadingStarter} onClick={handleLoadStarterCatalog} className="btn btn-secondary btn-sm">
              <Icon name="refresh" size={13} /> {loadingStarter ? 'Adding…' : 'Load Starter Catalog'}
            </button>
          )}
          <button type="button" title="Import from TPA/TASAC tariff reference" onClick={() => setTariffSheetOpen(true)} className="btn btn-secondary btn-sm">
            <Icon name="layers" size={13} /> Import from Tariff
          </button>
          <button type="button" title="Manage categories" onClick={() => navigate(`${baseRoute}/products/categories`)} className="btn btn-secondary btn-sm">
            <Icon name="tag" size={13} /> Categories
          </button>
          <button type="button" title="Product reviews" onClick={() => navigate(`${baseRoute}/products/reviews`)} className="btn btn-secondary btn-sm">
            <Icon name="star" size={13} /> Reviews
          </button>
          <button type="button" title="Add new service or product" onClick={() => setEditing('new')}
            style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
            <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Item
          </button>
        </div>

        {/* Filters Toolbar Card */}
        <div className="products-filter-card">
        <SectionCard>
          <div className="products-filter-layout">
          <div className="products-filter-controls">
            {/* Category Dropdown */}
            <Select value={catFilter} onValueChange={v => { setCatFilter(v as CatFilter); setPage(1); }}>
              <SelectTrigger aria-label="Category" style={{ width: 'auto', minWidth: 160, height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories ({products.length})</SelectItem>
                {CATEGORIES.map(c => {
                  const count = products.filter(p => p.category === c).length;
                  return (
                    <SelectItem key={c} value={c}>
                      {CAT_CFG[c].label} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Status Segmented Buttons */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', padding: 3, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              {(['ALL', 'active', 'inactive'] as const).map(s => (
                <button key={s} type="button" title={`Status: ${s}`} onClick={() => { setStatusFilter(s); setPage(1); }}
                  style={{
                    padding: '4px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--r, 6px)',
                    cursor: 'pointer',
                    background: statusFilter === s ? 'var(--white)' : 'transparent',
                    color: statusFilter === s ? 'var(--ink)' : 'var(--ink3)',
                    boxShadow: statusFilter === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    height: 28, display: 'inline-flex', alignItems: 'center', lineHeight: 1
                  }}>
                  {s === 'ALL' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Search Box */}
          <div className="products-search">
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
            <input type="text" title="Search services" placeholder="Search services…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{
                width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)',
                borderRadius: 'var(--r, 6px)', fontSize: 13, fontFamily: 'var(--font)',
                background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box'
              }} />
          </div>
          </div>
        </SectionCard>
        </div>

        {/* Table */}
        <SectionCard padded={false}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading services…</div>
          ) : loadError ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}><Icon name="alertCircle" size={44} color="var(--red)" /></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Couldn't load the catalog</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>{loadError}</div>
              <button type="button" title="Retry" onClick={loadProducts} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 20px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="refresh" size={13} /> Retry</button>
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}><Icon name="package" size={44} color="var(--border)" /></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>No services found</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>{search ? 'Try a different search.' : 'Add your first service to the catalog.'}</div>
              {!search && <button type="button" title="Add service" onClick={() => setEditing('new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 20px', border: 'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: 'pointer', fontWeight: 600, fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="plus" size={13} /> New Service</button>}
            </div>
          ) : (
            <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {[
                      { label: 'Code',      col: null        },
                      { label: 'Name',      col: 'name' as const },
                      { label: 'Category',  col: 'category' as const },
                      { label: 'Unit',      col: null        },
                      { label: 'Unit Price',col: 'price' as const },
                      { label: 'Tax',       col: null        },
                      { label: 'Status',    col: null        },
                      { label: 'Added',     col: 'created' as const },
                      { label: 'Last Edited', col: null      },
                      { label: '',          col: null        },
                    ].map(h => (
                      <th key={h.label}
                        onClick={() => h.col && toggleSort(h.col)}
                        style={{ padding: '10px 14px', textAlign: h.label === 'Unit Price' ? 'right' : 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: h.col ? 'pointer' : 'default', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {h.label}{h.col && <SortIcon col={h.col} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(p => (
                    <tr key={p.id}
                      onClick={() => setSelected(p)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s', opacity: p.status === 'inactive' ? 0.6 : 1 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 14px', fontFamily: 'var(--font)', fontSize: 11.5, color: 'var(--teal)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.code}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                      </td>
                      <td style={{ padding: '11px 14px' }}><CatBadge cat={p.category} /></td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink2)' }}>{p.unit}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700 }}>{p.sale_price > 0 ? fmt(p.sale_price, p.currency) : <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>—</span>}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink3)' }}>{p.tax_rate > 0 ? `${p.tax_rate}%` : '—'}</td>
                      <td style={{ padding: '11px 14px' }}><StatusPill status={p.status} /></td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(p.created_at)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink3)' }}>{p.updated_at && p.updated_at !== p.created_at ? fmtDate(p.updated_at) : '—'}</td>
                      <td style={{ padding: '11px 10px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {[
                            { title: 'Edit',   icon: 'edit'  as const, fn: () => setEditing(p)              },
                            { title: 'Delete', icon: 'trash' as const, fn: () => setDeleting(p), red: true  },
                          ].map(a => (
                            <button key={a.title} type="button" title={a.title} onClick={a.fn}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: a.red ? 'var(--red)' : 'var(--ink3)', padding: 5, borderRadius: 'var(--r-sm)', display: 'flex' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <Icon name={a.icon} size={14} />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '6px 16px 0', fontSize: 12, color: 'var(--ink3)', textAlign: 'right' }}>
                {active} active · {inactive} inactive
              </div>
              <PaginationBar
                page={safePage}
                pageSize={PAGE_SIZE}
                total={displayed.length}
                itemLabel="service"
                onPageChange={setPage}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
};
