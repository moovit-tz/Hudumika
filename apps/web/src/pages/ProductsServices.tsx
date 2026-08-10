import React, { useState, useEffect } from 'react';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { FormPage } from '../components/FormPage.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';

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

function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function PagBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ minWidth: 32, height: 32, padding: '0 8px', border: active ? 'none' : '1.5px solid var(--border)', borderRadius: 'var(--r)', background: active ? 'var(--navy)' : disabled ? 'var(--bg)' : 'var(--white)', color: active ? '#fff' : disabled ? 'var(--ink3)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}>
      {label}
    </button>
  );
}

// -- Category badge ------------------------------------------------------------

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_CFG[cat] ?? CAT_CFG.OTHER;
  return <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>;
}

// -- Status toggle -------------------------------------------------------------

function StatusPill({ status }: { status: 'active' | 'inactive' }) {
  const isActive = status === 'active';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: isActive ? 'var(--green-l)' : 'var(--bg)', color: isActive ? 'var(--green)' : 'var(--ink3)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? 'var(--green)' : 'var(--ink3)', display: 'inline-block' }} />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// -- Delete confirm modal ------------------------------------------------------

function DeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 400, boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Delete Service</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20 }}>
          Are you sure you want to delete <strong>{name}</strong>? This cannot be undone and may affect invoices or quotations referencing this item.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" title="Cancel" onClick={onCancel} style={{ padding: 'var(--ds-btn-py) 18px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
          <button type="button" title="Confirm delete" onClick={onConfirm} style={{ padding: 'var(--ds-btn-py) 18px', border: 'none', borderRadius: 'var(--r)', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Delete</button>
        </div>
      </div>
    </div>
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
  const [f, setF] = useState<ProductForm>({
    name:           initial?.name           ?? '',
    code:           initial?.code           ?? '',
    type:           initial?.type           ?? 'service',
    category:       initial?.category       ?? 'FREIGHT',
    description:    initial?.description    ?? '',
    unit:           initial?.unit           ?? 'shipment',
    sale_price:     initial?.sale_price     ?? 0,
    purchase_price: initial?.purchase_price ?? 0,
    currency:       initial?.currency       ?? 'USD',
    tax_rate:       initial?.tax_rate       ?? 0,
    tax_code_id:    initial?.tax_code_id    ?? null,
    status:         initial?.status         ?? 'active',
    notes:          initial?.notes          ?? '',
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

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box' as const, color: 'var(--ink)', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };
  const row: React.CSSProperties = { marginBottom: 16 };

  return (
    <FormPage
      title={initial ? 'Edit Service' : 'New Service'}
      subtitle={initial ? `Editing ${initial.code}` : 'Add a service to your catalog — its code, price, unit and tax.'}
      onCancel={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" title="Save service" onClick={submit} disabled={saving} className="btn btn-primary">
            <Icon name="save" size={13} /> {saving ? 'Saving…' : initial ? 'Update Service' : 'Add Service'}
          </button>
        </>
      }
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={row}>
            <label style={lbl}>Service Name *</label>
            <input type="text" title="Service name" placeholder="e.g. Sea Freight — 20ft FCL" value={f.name} onChange={e => set('name', e.target.value)} style={inp} />
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
              <input type="text" title="Service code" placeholder="e.g. SF-FCL-20" value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 12 }} />
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
          <div style={{ background: 'var(--bg)', borderRadius: 9, padding: 16, marginBottom: 16 }}>
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
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', borderRadius: 9, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Status</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Inactive services don't appear in the invoice line-item picker</div>
            </div>
            <button type="button" title="Toggle status" onClick={() => set('status', f.status === 'active' ? 'inactive' : 'active')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: f.status === 'active' ? 'var(--green)' : 'var(--ink3)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.status === 'active' ? 'var(--green)' : 'var(--ink3)' }} />
              {f.status === 'active' ? 'Active' : 'Inactive'}
            </button>
          </div>

          <div style={row}>
            <label style={lbl}>Internal Notes</label>
            <textarea title="Notes" placeholder="Any internal notes about this service…" value={f.notes} onChange={e => set('notes', e.target.value)} rows={2}
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {/* Customer-specific (contract) prices */}
          <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 9, padding: 16, background: 'var(--bg)' }}>
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
          <div style={{ background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 9, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{f.name || 'Service Name'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{f.code || '—'} · {CAT_CFG[f.category]?.label}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--teal)' }}>{f.sale_price > 0 ? fmt(f.sale_price, f.currency) : '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>per {f.unit}{f.tax_rate > 0 ? ` · ${f.tax_rate}% tax` : ' · no tax'}</div>
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
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)', fontWeight: 700, marginBottom: 4 }}>{product.code}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{product.name}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4, flexShrink: 0 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {/* Pricing hero */}
          <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '18px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ background: 'var(--gold-l)', borderRadius: 9, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{product.notes}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" title="Edit service" onClick={onEdit}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 16px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="edit" size={14} /> Edit Service
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" title="Toggle active/inactive" onClick={onToggleStatus}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)' }}>
              <Icon name="eye" size={13} /> {product.status === 'active' ? 'Set Inactive' : 'Set Active'}
            </button>
            <button type="button" title="Delete service" onClick={onDelete}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--red)' }}>
              <Icon name="trash" size={13} /> Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// -- Main Page -----------------------------------------------------------------

export const ProductsServices: React.FC = () => {
  const isMobile = useIsMobile();
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
  const priced    = products.filter(p => p.sale_price > 0);
  const avgPrice  = priced.length ? priced.reduce((s, p) => s + p.sale_price, 0) / priced.length : 0;
  const topCat    = CATEGORIES.reduce((best, c) => products.filter(p => p.category === c).length > products.filter(p => p.category === best).length ? c : best, 'FREIGHT');

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

      <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', flex: 1, overflowY: 'auto' }}>
        <PageHeader
          crumbs={['Finance', 'Products & Services']}
          titlePlain="Products &"
          titleEm="services"
          subtitle="Set pricing for clearing and freight services here — catalog for invoices."
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
              {!loading && products.length === 0 && (
                <button type="button" title="Add starter catalog" disabled={loadingStarter} onClick={handleLoadStarterCatalog} className="btn btn-secondary btn-sm">
                  <Icon name="refresh" size={13} /> {loadingStarter ? 'Adding…' : 'Load Starter Catalog'}
                </button>
              )}
              <button type="button" title="Import from TPA/TASAC tariff reference" onClick={() => setTariffSheetOpen(true)} className="btn btn-secondary btn-sm">
                <Icon name="layers" size={13} /> Import from Tariff
              </button>
              <button type="button" title="Add new service" onClick={() => setEditing('new')} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} color="#fff" /> New Service
              </button>
            </div>
          }
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
              style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, marginBottom: 10 }}
            />
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              {tariffLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Searching…</div>}
              {!tariffLoading && tariffResults.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No tariff items match.</div>}
              {!tariffLoading && tariffResults.map(r => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tariffSelected.has(r.id)} onChange={() => toggleTariffSelected(r.id)} style={{ marginTop: 3 }} />
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
                style={{ padding: 'var(--ds-btn-py) 16px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', cursor: tariffSelected.size === 0 ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, opacity: tariffSelected.size === 0 || tariffImporting ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                {tariffImporting ? 'Adding…' : `Add ${tariffSelected.size || ''} Service${tariffSelected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Metrics */}
        <MetricsRow cards={[
          { title: 'Total Services', value: String(products.length), sub1Label: 'ACTIVE', sub1Value: String(active), sub2Label: 'INACTIVE', sub2Value: String(inactive), barHighlight: 'var(--blue)' },
          { title: 'Active Services', value: String(active), sub1Label: 'WITH PRICE', sub1Value: String(priced.length), sub2Label: 'FREE/DUTY', sub2Value: String(products.filter(p => p.sale_price === 0).length), barHighlight: 'var(--green)' },
          { title: 'Avg Unit Price', value: avgPrice > 0 ? `$${Math.round(avgPrice)}` : '—', sub1Label: 'CATEGORIES', sub1Value: String(new Set(products.map(p => p.category)).size), sub2Label: 'TOP CAT', sub2Value: products.length ? (CAT_CFG[topCat]?.label ?? '—') : '—', barHighlight: 'var(--gold)' },
        ]} />

        {/* Filters Toolbar Card */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
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
          <div style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
            <input type="text" title="Search services" placeholder="Search services…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{
                width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)',
                borderRadius: 'var(--r, 6px)', fontSize: 13, fontFamily: 'var(--font)',
                background: 'var(--white)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box'
              }} />
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
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
              {!search && <button type="button" title="Add service" onClick={() => setEditing('new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 20px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}><Icon name="plus" size={13} /> New Service</button>}
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
                      <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--teal)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.code}</td>
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
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Showing {paginated.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + paginated.length} of {displayed.length} services</span>
                <span>{active} active · {inactive} inactive</span>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <PagBtn label="Prev" disabled={safePage === 1} onClick={() => setPage(p => p - 1)} />
                    {getPageNums(safePage, totalPages).map((p, i) =>
                      p === '…' ? <span key={`e-${i}`} style={{ padding: '0 4px', color: 'var(--ink3)', fontSize: 13 }}>···</span>
                        : <PagBtn key={p} label={String(p)} active={p === safePage} onClick={() => setPage(p as number)} />
                    )}
                    <PagBtn label="Next" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink3)' }}>
                    <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>PAGE</span>
                    <input type="number" title="Go to page" value={safePage} min={1} max={totalPages} onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) setPage(v); }} style={{ width: 42, padding: '4px 6px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' }} />
                    <span>OF {totalPages}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
