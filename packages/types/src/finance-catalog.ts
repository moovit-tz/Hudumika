import { FINANCE_INDUSTRIES, type FinanceIndustryKey } from './finance-capabilities.js';

export interface FinanceCatalogField { key: string; label: string; hint?: string }
export interface FinanceCatalogProfile {
  categories: string[];
  units: string[];
  expenses: string[];
  fields: FinanceCatalogField[];
  defaultType: 'product' | 'service';
  billingHint: string;
}
const profile = (defaultType: 'product' | 'service', categories: string, units: string, expenses: string, fields: string, billingHint: string): FinanceCatalogProfile => ({
  defaultType, categories: categories.split('|'), units: units.split('|'), expenses: expenses.split('|'),
  fields: fields.split('|').filter(Boolean).map(label => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/, ''), label })), billingHint,
});

export const FINANCE_CATALOG_PROFILES: Record<FinanceIndustryKey, FinanceCatalogProfile> = {
  retail: profile('product', 'Merchandise|Accessories|Delivery|After-sales services', 'unit|pack|box|kg|litre|set', 'Stock purchases|Packaging|Shop rent|Merchant fees|Delivery costs', 'Brand|Model / variant|Pack size|Barcode', 'Price each sellable unit; show variants and pack size. Stock movements belong in Inventory.'),
  wholesale: profile('product', 'General merchandise|Bulk goods|Distribution|Delivery', 'unit|carton|case|pallet|kg|ton', 'Stock purchases|Inbound freight|Warehouse costs|Distribution costs', 'Brand|Pack size|Minimum order|Trade specification', 'Distinguish pack and base-unit prices; use customer agreed prices for trade contracts.'),
  ecommerce: profile('product', 'Online merchandise|Digital goods|Shipping|Subscriptions', 'unit|pack|download|month|order', 'Marketplace fees|Payment processing|Fulfilment|Returns handling|Advertising', 'Brand|Variant|Channel SKU|Fulfilment class', 'Separate products, delivery and discounts; capture order references on the document.'),
  manufacturing: profile('product', 'Finished goods|Raw materials|Components|Processing services|By-products', 'unit|kg|ton|litre|batch|hour', 'Raw materials|Factory labour|Factory overhead|Quality testing|Waste disposal', 'Material / grade|Specification|Pack size|Quality standard', 'Use production orders for material consumption and WIP; invoice finished outputs or processing services.'),
  food_beverage: profile('product', 'Food products|Beverages|Ingredients|Packaging|Processing services', 'unit|pack|kg|litre|case|batch', 'Ingredients|Food packaging|Cold storage|Quality testing|Waste disposal', 'Ingredients / allergens|Pack size|Shelf life|Storage conditions', 'Keep lot, expiry and recalls in the inventory/production workflow; these catalogue details describe the item.'),
  printing: profile('service', 'Print jobs|Design|Paper and stock|Finishing|Installation', 'copy|sheet|m2|job|hour|set', 'Paper and ink|Finishing supplies|Outsourced printing|Design fees|Machine maintenance', 'Paper / substrate|Finished size|Colours|Finishing|Artwork requirements', 'Specify dimensions, stock, colours and finishing so the quote and invoice describe the same output.'),
  warehousing: profile('service', 'Storage|Handling|Picking|Packing|Fulfilment', 'pallet-day|m3-day|unit|order|hour|month', 'Warehouse rent|Handling labour|Packing supplies|Equipment hire|Utilities', 'Storage class|Charging basis|Handling requirements|Minimum charge', 'Bill storage quantity and period explicitly; separate handling and fulfilment charges.'),
  professional_services: profile('service', 'Agency services|Influencer campaigns|Creative production|Retainers|Professional fees|Licensing', 'hour|day|project|deliverable|post|video|campaign|month', 'Talent fees|Media spend|Content production|Software subscriptions|Client travel|Subcontractors', 'Deliverables|Platform / channel|Usage rights|Revision allowance|Billing basis', 'Scope deliverables, usage rights and retainer periods. Record campaign/client references on each document; separate pass-through media spend.'),
  consulting: profile('service', 'Advisory|Implementation|Research|Training|Retainers', 'hour|day|project|milestone|month', 'Subcontractors|Research costs|Client travel|Professional subscriptions|Training materials', 'Scope / deliverables|Billing basis|Acceptance criteria|Revision allowance', 'Bill time, milestones or retainers explicitly; attach acceptance and supporting records to the engagement.'),
  construction: profile('service', 'BOQ work items|Materials|Labour|Plant hire|Subcontract works|Professional fees', 'm|m2|m3|ton|unit|hour|day|milestone', 'Site materials|Site labour|Plant hire|Subcontractors|Site overhead|Safety equipment', 'BOQ item / trade|Material specification|Measurement basis|Acceptance criteria', 'Bill measured work or certified milestones. Keep retention, variations and progress certification on the contract/project, not in a catalogue price.'),
  property: profile('service', 'Rent|Service charges|Maintenance|Property management', 'month|day|unit|m2|job', 'Property maintenance|Property utilities|Agent commission|Building insurance|Cleaning', 'Property class|Billing period|Service scope|Deposit terms', 'Separate rent, service charges and deposits; use the lease/unit reference on the document.'),
  automotive: profile('service', 'Workshop labour|Parts|Diagnostics|Consumables|Vehicle sales', 'hour|job|unit|litre|set', 'Parts purchases|Workshop consumables|Outsourced repairs|Tools|Waste disposal', 'Part number|Vehicle compatibility|Warranty terms|Service scope', 'Separate labour and parts; record the vehicle/job reference on the invoice, not personal vehicle data in the catalogue.'),
  hospitality: profile('service', 'Accommodation|Food and beverage|Events|Guest services', 'night|room-night|person|event|day|unit', 'Housekeeping|Laundry|Food supplies|Guest amenities|Booking commission', 'Room / service class|Occupancy basis|Meal plan|Rate conditions', 'State room nights, occupancy and period; use guest folio/reservation references on billing.'),
  restaurant: profile('product', 'Menu items|Beverages|Catering|Delivery|Service charges', 'portion|unit|person|tray|event|order', 'Food ingredients|Kitchen supplies|Delivery costs|Kitchen utilities|Waste disposal', 'Portion size|Allergens|Menu options|Preparation notes', 'Keep recipe consumption in inventory; bill menu portions and explicit service/delivery charges.'),
  agriculture: profile('product', 'Crops|Livestock|Farm inputs|Farm services', 'kg|ton|head|bag|hectare|hour', 'Seeds and seedlings|Fertiliser|Animal feed|Veterinary costs|Farm labour|Irrigation', 'Variety / breed|Grade|Pack size|Growing / handling specification', 'State weight, grade and pack basis; identify harvest/lot on operational records.'),
  education: profile('service', 'Tuition|Enrolment|Learning materials|Examinations|Student services', 'term|semester|course|session|unit|month', 'Teaching materials|Teaching fees|Campus utilities|Accreditation costs|Student activities', 'Programme / course|Fee period|Service scope|Eligibility notes', 'Use the student/enrolment reference on billing; separate fee schedules, discounts and deposits.'),
  healthcare: profile('service', 'Consultations|Procedures|Laboratory services|Medical supplies|Care packages', 'consultation|procedure|test|day|unit|package', 'Medical supplies|Laboratory costs|Clinical subcontractors|Equipment servicing|Waste disposal', 'Service / procedure code|Service scope|Package inclusions|Billing basis', 'Keep patient identity, diagnosis and clinical records out of the catalogue; capture protected encounter references in the clinical workflow.'),
  pharmaceutical: profile('product', 'Medicines|Medical devices|Active ingredients|Excipients|Contract manufacturing', 'unit|tablet|capsule|vial|pack|box|kg|batch', 'Active ingredients|Excipients|Quality testing|Cold chain|Regulatory costs|Expired stock disposal', 'Generic name|Strength|Dosage form|Pack size|Manufacturer|Storage conditions|Registration reference', 'Specify strength, dosage form and pack unit. Lot release, expiry, controlled stock and regulatory approval remain operational controls, not catalogue checkboxes.'),
  mining: profile('product', 'Minerals|Ore|Processing|Extraction services|Equipment hire', 'ton|kg|m3|hour|day', 'Extraction costs|Assay testing|Explosives and consumables|Haulage|Site rehabilitation', 'Mineral / grade|Assay basis|Moisture basis|Delivery specification', 'State grade, assay and weight basis; royalties and contract adjustments require explicit reviewed charges.'),
  energy: profile('service', 'Electricity|Fuel|Water|Connection services|Maintenance', 'kWh|kW|litre|m3|month|job', 'Energy purchases|Fuel purchases|Meter servicing|Network maintenance|Utilities', 'Tariff reference|Charging basis|Service class|Minimum charge', 'Use verified meter periods/readings and tariff calculations before billing; the catalogue stores the rate description.'),
  telecom: profile('service', 'Subscriptions|Data packages|Voice|Installation|Equipment', 'month|GB|minute|unit|connection', 'Network costs|Bandwidth|Equipment purchases|Interconnect charges|Support costs', 'Plan / package|Billing cycle|Included allowance|Overage basis', 'Separate recurring plan fees and measured usage; define proration and overage calculations in the subscription workflow.'),
  insurance: profile('service', 'Premiums|Brokerage|Policy fees|Risk assessment', 'policy|month|year|assessment', 'Claims costs|Reinsurance|Broker commissions|Risk assessment|Administration', 'Product class|Coverage basis|Policy period|Fee basis', 'Use policy records and approved calculations for premiums, claims and commissions; catalogue entries do not underwrite coverage.'),
  lending: profile('service', 'Loan fees|Interest charges|Servicing fees|Advisory', 'loan|month|instalment|service', 'Funding costs|Credit assessment|Collection costs|Legal fees|Administration', 'Loan product|Fee basis|Charging period|Disclosure reference', 'Principal, interest and fees require separate ledger treatment and an approved repayment schedule; catalogue rates do not calculate a loan.'),
  logistics: profile('service', 'FREIGHT|CLEARANCE|HANDLING|TRANSPORT|WAREHOUSING|FULFILLMENT|PACKAGING|PROCUREMENT|DUTY|INSURANCE|LABOR|OTHER', 'shipment|container|kg|CBM|trip|day|hour|set|certificate|declaration|pallet|unit|ton|BL|AWB', 'PORT_CHARGES|CUSTOMS_DUTY|FREIGHT|HANDLING|TRANSPORT|INSPECTION_FEE|AGENT_FEE', 'Service scope|Route / zone|Charging basis|Trade terms', 'Keep shipment and BL/AWB references on documents; separate freight, clearance and disbursements.'),
};

export const COMMON_EXPENSE_CATEGORIES = ['Office costs', 'Rent', 'Utilities', 'Travel', 'Software subscriptions', 'Professional fees', 'MISCELLANEOUS'];
export function financeCatalogProfile(industry?: FinanceIndustryKey | null): FinanceCatalogProfile {
  return industry ? FINANCE_CATALOG_PROFILES[industry] : profile('service', 'Products|Services|Other', 'unit|hour|day|month|project|kg|litre|pack', COMMON_EXPENSE_CATEGORIES.join('|'), '', 'Select the company industries in Finance settings for tailored catalogue and expense options.');
}
export function financeCatalogOptions(industries: readonly FinanceIndustryKey[]) {
  const profiles = industries.map(key => financeCatalogProfile(key));
  if (!profiles.length) profiles.push(financeCatalogProfile());
  return { categories: [...new Set(profiles.flatMap(p => p.categories))], units: [...new Set(profiles.flatMap(p => p.units))], expenses: [...new Set([...profiles.flatMap(p => p.expenses), ...COMMON_EXPENSE_CATEGORIES])] };
}
export function financeIndustryName(industry: FinanceIndustryKey): string {
  return FINANCE_INDUSTRIES.find(item => item.key === industry)?.name ?? industry;
}
export interface IndustryCatalogData { industry_key?: FinanceIndustryKey | null; industry_attributes?: Record<string, string> }
export function catalogBillingDescription(item: IndustryCatalogData & { description?: string | null; brand?:string|null }): string {
  const fields = financeCatalogProfile(item.industry_key).fields;
  return [item.description?.trim(), ...fields.map(field => {
    const value = item.industry_attributes?.[field.key]?.trim() || (field.key === 'brand' ? item.brand?.trim() : '');
    return value ? `${field.label}: ${value}` : '';
  })].filter(Boolean).join('\n');
}
