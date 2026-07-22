/**
 * Seed real, hand-researched step-level detail for a flagship set of trade
 * procedures. This is a deliberate scope choice: trade.tanzania.go.tz's
 * procedure detail (steps, offices, documents, fees, timelines) only loads
 * via client-side JS the import script can't execute, and only a partial
 * subset of procedures were recoverable from the portal's own static HTML
 * (see import-tantrade-procedures.ts's header). Rather than fabricate
 * placeholder guidance for the rest, this seed adds real, verified content
 * for the procedures that matter most first — coal/mineral export (the
 * flagship example), Tanzania's other major export commodities, and the
 * two general procedures the user pointed at directly (business licence,
 * port clearance) — sourced from each activity's own responsible
 * government body's public information, cross-checked against multiple
 * sources. Every step carries a source_url. More procedures get real
 * content the same way over time; trade_procedures.has_detail marks which
 * ones already do.
 *
 * Usage:  npx tsx src/scripts/seed-trade-wizard-flagship-content.ts
 * Re-runnable: upserts institutions by name, replaces steps/prechecks for
 * the procedures listed here (delete+reinsert per procedure, since step
 * ordering/content is curated as a whole unit, not merged field-by-field).
 */
import { db } from '../db/client.js';

interface StepInput {
  name: string;
  description: string;
  institution: string;        // must match an INSTITUTIONS key below
  duration_estimate: string;
  cost_estimate: string;
  required_documents: string[];
  is_online: boolean;
  source_url: string;
}

interface PrecheckInput {
  question: string;
  help_text?: string;
  options: { value: string; label: string }[];
}

interface ProcedureInput {
  source_id: number | null;   // real portal ID if one exists, else null (not covered by the general trade portal)
  name: string;
  kind: 'IMPORT' | 'EXPORT' | 'TRANSIT' | 'REGISTRATION';
  product_keywords: string;
  summary: string;
  source_url: string;
  steps: StepInput[];
  prechecks: PrecheckInput[];
}

const INSTITUTIONS: Record<string, { acronym?: string; category: string; address?: string; phone?: string; email?: string; website: string; source_url: string }> = {
  'Mining Commission': { acronym: 'Tume ya Madini', category: 'Mining', website: 'https://www.tumemadini.go.tz/', source_url: 'https://www.tumemadini.go.tz/pages/procedures-for-exportation-of-minerals/' },
  'Tanzania Minerals Audit Agency': { acronym: 'TMAA', category: 'Mining', website: 'https://www.tmaa.go.tz/', source_url: 'https://www.tmaa.go.tz/' },
  'Tanzania Revenue Authority': { acronym: 'TRA', category: 'Customs', website: 'https://www.tra.go.tz/', source_url: 'https://www.tra.go.tz/' },
  'Cashewnut Board of Tanzania': { acronym: 'CBT', category: 'Agriculture', website: 'https://cashewnutboard.go.tz/', source_url: 'https://www.wikiprocedure.com/index.php/Tanzania_-_Export_of_Cashew_Nuts' },
  'Tanzania Coffee Board': { acronym: 'TCB', category: 'Agriculture', address: 'Godown No.13B, Pamba Godowns (Off Bandari Road), P.O. Box 3437, Kurasini, Dar es Salaam', phone: '+255 222 129 847', email: 'tcb.dsm@coffeeboard.or.tz', website: 'https://www.coffeeboard.or.tz/', source_url: 'https://www.coffeeboard.or.tz/' },
  'Ministry of Livestock and Fisheries': { acronym: 'MLF', category: 'Agriculture', website: 'https://www.mifugouvuvi.go.tz/', source_url: 'https://fircis.mlf.go.tz/' },
  'Tanzania Bureau of Standards': { acronym: 'TBS', category: 'Standards', website: 'https://tbs.go.tz/', source_url: 'https://tbs.go.tz/' },
  'Tanzania Chamber of Commerce, Industry and Agriculture': { acronym: 'TCCIA', category: 'Trade', website: 'https://tccia.or.tz/', source_url: 'https://tccia.or.tz/e-certificate-of-origin/' },
  'Business Registrations and Licensing Agency': { acronym: 'BRELA', category: 'Registration', website: 'https://www.brela.go.tz/', source_url: 'https://www.brela.go.tz/' },
  'Local Government Authority': { acronym: 'LGA', category: 'Registration', website: 'https://tamisemi.go.tz/', source_url: 'https://tamisemi.go.tz/' },
  'Tanzania Ports Authority': { acronym: 'TPA', category: 'Port', website: 'https://www.tanzaniaports.go.tz/', source_url: 'https://www.tanzaniaports.go.tz/' },
};

const PROCEDURES: ProcedureInput[] = [
  // ── Coal / Mineral export — the flagship example ──
  {
    source_id: null,
    name: 'Coal and mineral export',
    kind: 'EXPORT',
    product_keywords: 'coal mineral minerals mining export tanzanite gold gemstones ore',
    summary: 'Minerals (including coal) may not be exported from Tanzania except by a mineral right holder or a licensed mineral dealer, under the Mining Act 2010. Export requires valuation/identification, royalty payment, and an export permit before the consignment can leave the country.',
    source_url: 'https://www.tumemadini.go.tz/pages/procedures-for-exportation-of-minerals/',
    steps: [
      { name: 'Hold a mineral right or dealer licence', description: 'Section 18(3) of the Mining Act 2010 prohibits exporting any mineral (including coal) unless you are a mineral right holder or a licensed mineral dealer. This must be in place before any export can proceed.', institution: 'Mining Commission', duration_estimate: 'Varies — apply well ahead of any planned export', cost_estimate: 'Varies by licence class', required_documents: ['Mining licence or Mineral Dealer Licence (MDL)', 'TIN certificate', 'Business registration'], is_online: false, source_url: 'https://www.tumemadini.go.tz/pages/applicationprocedure/' },
      { name: 'Valuation and identification of the consignment', description: 'The Mining Commission values the minerals to be exported and issues an identification/valuation certificate confirming type, grade and quantity.', institution: 'Mining Commission', duration_estimate: 'A few days per consignment', cost_estimate: 'Valuation fee per assessment', required_documents: ['Mineral right/dealer licence', 'Consignment manifest'], is_online: false, source_url: 'https://www.tumemadini.go.tz/pages/procedures-for-exportation-of-minerals/' },
      { name: 'Audit and origin verification', description: 'TMAA monitors and audits mineral production and sales, and verifies the origin of the consignment being exported — including desk checks maintained at international airports and major export points.', institution: 'Tanzania Minerals Audit Agency', duration_estimate: 'Runs alongside valuation', cost_estimate: 'No separate fee beyond royalty/inspection', required_documents: ['Production and sales records'], is_online: false, source_url: 'https://www.tmaa.go.tz/' },
      { name: 'Pay royalty and inspection fees', description: 'Royalty (6% of gross value plus a 1% additional contribution for most minerals) and inspection fees must be paid before an export permit is issued.', institution: 'Mining Commission', duration_estimate: 'Same day once valuation is confirmed', cost_estimate: '6% royalty + 1% additional contribution of gross mineral value (rates vary by mineral)', required_documents: ['Valuation certificate'], is_online: false, source_url: 'https://www.tumemadini.go.tz/pages/procedures-for-exportation-of-minerals/' },
      { name: 'Obtain the export permit', description: 'The Commissioner for Minerals issues the export permit, stating the licence holder’s name and number, mineral type, net weight, value, royalty certification, and validity — required to move the consignment out of the country.', institution: 'Mining Commission', duration_estimate: '1-3 working days after royalty payment', cost_estimate: 'Export permit application fee ~USD 100', required_documents: ['Royalty payment receipt', 'Valuation certificate', 'Mineral right/dealer licence'], is_online: false, source_url: 'https://www.tumemadini.go.tz/pages/procedures-for-exportation-of-minerals/' },
      { name: 'Customs declaration and port clearance', description: 'Standard TRA customs export declaration (TANCIS) and port clearance apply on top of the mineral-specific permit, same as any other export cargo.', institution: 'Tanzania Revenue Authority', duration_estimate: '1-2 working days', cost_estimate: 'Standard customs processing fees', required_documents: ['Export permit', 'Commercial invoice', 'Packing list'], is_online: true, source_url: 'https://www.tra.go.tz/' },
    ],
    prechecks: [
      { question: 'Do you hold a mining licence or a Mineral Dealer Licence (MDL)?', help_text: 'Required before any mineral export can proceed — this is the entry gate under the Mining Act 2010.', options: [{ value: 'yes', label: 'Yes, I already hold one' }, { value: 'no', label: 'No, I need to apply first' }] },
      { question: 'Which mineral are you exporting?', options: [{ value: 'coal', label: 'Coal' }, { value: 'gemstone', label: 'Gemstone / Tanzanite' }, { value: 'gold', label: 'Gold' }, { value: 'other', label: 'Other mineral' }] },
      { question: 'Has this consignment already been valued by the Mining Commission?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }] },
    ],
  },
  // ── Cashewnut export ──
  {
    source_id: null,
    name: 'Cashewnut export (raw or processed)',
    kind: 'EXPORT',
    product_keywords: 'cashew cashewnut cashew nuts agriculture export mtwara',
    summary: 'Raw or processed cashewnut export is licensed by the Cashewnut Board of Tanzania. Moving cargo from warehouse to port and out of the country each need their own permit, plus a phytosanitary certificate for the shipment.',
    source_url: 'https://cashewnutboard.go.tz/',
    steps: [
      { name: 'Obtain a CBT buying/processing licence', description: 'A trader must hold a Raw Cashewnut Buying Licence (for export-only buying) or a processing licence (for processed cashewnut), issued by the Cashewnut Board of Tanzania.', institution: 'Cashewnut Board of Tanzania', duration_estimate: 'Apply ahead of the buying season', cost_estimate: 'Licence fee per category', required_documents: ['Business registration', 'TIN certificate'], is_online: false, source_url: 'https://cashewnutboard.go.tz/' },
      { name: 'Register for phytosanitary certification (ATMIS)', description: 'Register and apply online through the Agriculture Trade Management Information System for the phytosanitary certificate required on export.', institution: 'Cashewnut Board of Tanzania', duration_estimate: '2-5 working days', cost_estimate: 'ATMIS phytosanitary certificate fee', required_documents: ['Consignment details', 'Warehouse registration'], is_online: true, source_url: 'https://cashewnutboard.go.tz/' },
      { name: 'Produce Despatch Note (PDN)', description: 'A PDN clears the consignment from the warehouse to the export port (Mtwara or Dar es Salaam).', institution: 'Cashewnut Board of Tanzania', duration_estimate: '1-2 working days', cost_estimate: 'PDN processing fee', required_documents: ['Buying/processing licence', 'Warehouse stock records'], is_online: false, source_url: 'https://cashewnutboard.go.tz/' },
      { name: 'Cashewnut export permit', description: 'A separate export permit (raw or processed) is required to let the consignment exit the country once at the port.', institution: 'Cashewnut Board of Tanzania', duration_estimate: 'Combined processing time for the full procedure: roughly 8-20 days', cost_estimate: 'Export permit fee', required_documents: ['PDN', 'Phytosanitary certificate', 'Commercial invoice'], is_online: false, source_url: 'https://cashewnutboard.go.tz/' },
    ],
    prechecks: [
      { question: 'Are you exporting raw or processed cashewnut?', options: [{ value: 'raw', label: 'Raw' }, { value: 'processed', label: 'Processed' }] },
      { question: 'Do you already hold a CBT buying or processing licence?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, need to apply' }] },
      { question: 'Which port will you export through?', options: [{ value: 'mtwara', label: 'Mtwara' }, { value: 'dar', label: 'Dar es Salaam' }] },
    ],
  },
  // ── Coffee export ──
  {
    source_id: null,
    name: 'Green coffee export',
    kind: 'EXPORT',
    product_keywords: 'coffee green coffee beans agriculture export tcb',
    summary: 'No person may buy, process, warehouse or export coffee commercially without a licence from the Tanzania Coffee Board — including a specific Green Coffee Export Licence, valid for one licensing year (1 July - 30 June).',
    source_url: 'https://www.coffeeboard.or.tz/',
    steps: [
      { name: 'Register as a coffee exporter with TCB', description: 'Apply to the Tanzania Coffee Board to be registered as an exporter before any export licence can be issued.', institution: 'Tanzania Coffee Board', duration_estimate: 'Varies — apply ahead of the coffee season', cost_estimate: 'Registration fee', required_documents: ['Business registration', 'TIN certificate'], is_online: false, source_url: 'https://www.coffeeboard.or.tz/' },
      { name: 'Apply for the Green Coffee Export Licence', description: 'TCB issues the Green Coffee Export Licence to registered exporters; it runs for one licensing year, 1 July to 30 June, and must be renewed annually.', institution: 'Tanzania Coffee Board', duration_estimate: 'Annual licence — processing typically a few days', cost_estimate: 'Annual licence fee', required_documents: ['Exporter registration', 'Previous season’s export records, if any'], is_online: false, source_url: 'https://www.coffeeboard.or.tz/' },
      { name: 'Purchase/consignment declaration to TCB', description: 'Each export consignment is declared to TCB (quantity, grade, buyer) before shipment.', institution: 'Tanzania Coffee Board', duration_estimate: '1-3 working days per consignment', cost_estimate: 'Cess/levy per the Coffee Industry Regulations', required_documents: ['Green Coffee Export Licence', 'Sale contract'], is_online: false, source_url: 'https://www.coffeeboard.or.tz/' },
      { name: 'Customs declaration and port clearance', description: 'Standard TRA export customs declaration and port clearance apply on top of the coffee-specific licence.', institution: 'Tanzania Revenue Authority', duration_estimate: '1-2 working days', cost_estimate: 'Standard customs processing fees', required_documents: ['Green Coffee Export Licence', 'Commercial invoice', 'Packing list'], is_online: true, source_url: 'https://www.tra.go.tz/' },
    ],
    prechecks: [
      { question: 'Are you already registered as an exporter with the Tanzania Coffee Board?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, need to register first' }] },
      { question: 'Do you hold a current Green Coffee Export Licence (valid 1 Jul-30 Jun)?', options: [{ value: 'yes', label: 'Yes, current season' }, { value: 'expired', label: 'Expired, needs renewal' }, { value: 'no', label: 'Never held one' }] },
    ],
  },
  // ── Fish & fishery products export ──
  {
    source_id: null,
    name: 'Fish and fishery products export',
    kind: 'EXPORT',
    product_keywords: 'fish fishery seafood marine export health certificate',
    summary: 'Fish and fishery product exports require a health/quality compliance certificate per consignment, confirming the product meets processing, storage and hygiene standards, issued after inspection by the fisheries authority.',
    source_url: 'https://fircis.mlf.go.tz/',
    steps: [
      { name: 'Register as a fish/fishery products exporter', description: 'Register your processing or export operation with the fisheries authority before exporting.', institution: 'Ministry of Livestock and Fisheries', duration_estimate: 'Varies', cost_estimate: 'Registration fee', required_documents: ['Business registration', 'Processing facility details'], is_online: false, source_url: 'https://fircis.mlf.go.tz/' },
      { name: 'Facility and product inspection', description: 'Inspections verify the conditions of production, storage and dispatch meet the Fish (Quality Control and Standards) Regulations before certification is granted.', institution: 'Ministry of Livestock and Fisheries', duration_estimate: 'Scheduled per shipment/season', cost_estimate: 'Inspection fee', required_documents: ['Facility registration'], is_online: false, source_url: 'https://fircis.mlf.go.tz/' },
      { name: 'Obtain the health/compliance certificate', description: 'A certificate of compliance (health certificate) is issued per consignment, required to accompany the shipment on export.', institution: 'Ministry of Livestock and Fisheries', duration_estimate: '2-5 working days per consignment', cost_estimate: 'Certificate fee', required_documents: ['Inspection clearance', 'Consignment manifest'], is_online: false, source_url: 'https://fircis.mlf.go.tz/' },
      { name: 'Customs declaration and port clearance', description: 'Standard TRA export customs declaration and port clearance apply alongside the health certificate.', institution: 'Tanzania Revenue Authority', duration_estimate: '1-2 working days', cost_estimate: 'Standard customs processing fees', required_documents: ['Health certificate', 'Commercial invoice', 'Packing list'], is_online: true, source_url: 'https://www.tra.go.tz/' },
    ],
    prechecks: [
      { question: 'Is your processing facility already registered with the fisheries authority?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, need to register' }] },
      { question: 'Which port will you export through?', options: [{ value: 'dar', label: 'Dar es Salaam' }, { value: 'zanzibar', label: 'Zanzibar' }, { value: 'other', label: 'Other' }] },
    ],
  },
  // ── Real portal procedure #714 — enriched ──
  {
    source_id: 714,
    name: 'Register as an exporter',
    kind: 'EXPORT',
    product_keywords: 'exporter registration general TIN TCCIA',
    summary: 'Cross-cutting registration every exporter needs regardless of commodity: TIN, business registration/licence, and exporter registration with TCCIA — a prerequisite for obtaining a Certificate of Origin on any consignment.',
    source_url: 'https://trade.tanzania.go.tz/procedure/714?l=en',
    steps: [
      { name: 'Obtain a TIN certificate', description: 'A Taxpayer Identification Number certificate is required for every exporter — individual, company or partnership — before any export registration can proceed.', institution: 'Tanzania Revenue Authority', duration_estimate: '1-3 working days', cost_estimate: 'No fee', required_documents: ['National ID / company registration documents'], is_online: true, source_url: 'https://www.tra.go.tz/' },
      { name: 'Obtain a business licence', description: 'A valid business licence covering trading/export activity from the relevant licensing authority.', institution: 'Local Government Authority', duration_estimate: 'Varies by locality', cost_estimate: 'Licence fee per category', required_documents: ['TIN certificate', 'Business registration'], is_online: false, source_url: 'https://tamisemi.go.tz/' },
      { name: 'Register as an exporter with TCCIA', description: 'Register with the Tanzania Chamber of Commerce, Industry and Agriculture as an exporter — the registration that unlocks applying for Certificates of Origin per consignment.', institution: 'Tanzania Chamber of Commerce, Industry and Agriculture', duration_estimate: '2-5 working days', cost_estimate: 'Registration fee', required_documents: ['TIN certificate', 'Business licence'], is_online: true, source_url: 'https://tccia.or.tz/e-certificate-of-origin/' },
    ],
    prechecks: [
      { question: 'Do you already hold a TIN certificate?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
      { question: 'Do you hold a valid business licence covering export/trading activity?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    ],
  },
  // ── Real portal procedure #865 — one of the user's own example URLs ──
  {
    source_id: 865,
    name: 'Clearance of goods through Dar es Salaam port',
    kind: 'IMPORT',
    product_keywords: 'customs clearance dar es salaam port general TANCIS',
    summary: 'The general customs clearance flow for cargo passing through the port of Dar es Salaam — declaration, verification, duty payment and release — that most commodity-specific procedures build on top of.',
    source_url: 'https://trade.tanzania.go.tz/procedure/865?l=en',
    steps: [
      { name: 'Lodge the customs declaration (TANCIS)', description: 'File the customs declaration (form C17) through the Tanzania Customs Integrated System, backed by the commercial invoice, packing list and bill of lading.', institution: 'Tanzania Revenue Authority', duration_estimate: '1 working day', cost_estimate: 'Standard declaration processing fee', required_documents: ['Bill of lading', 'Commercial invoice', 'Packing list', 'TIN certificate'], is_online: true, source_url: 'https://www.tra.go.tz/' },
      { name: 'Verification and risk assessment', description: 'TANCIS risk-selects consignments for document review, physical inspection, or scanning based on the declared goods and importer history.', institution: 'Tanzania Revenue Authority', duration_estimate: '1-3 working days', cost_estimate: 'Included in customs processing', required_documents: ['Filed declaration'], is_online: true, source_url: 'https://www.tra.go.tz/' },
      { name: 'Pay duties, VAT and levies', description: 'Import duty, VAT, and any applicable levies (Railway Development Levy, excise, etc.) are assessed and paid before release.', institution: 'Tanzania Revenue Authority', duration_estimate: 'Same day once assessed', cost_estimate: 'Per assessed duty/VAT/levy rates for the HS code', required_documents: ['Assessment notice'], is_online: true, source_url: 'https://www.tra.go.tz/' },
      { name: 'Port release', description: 'Once duties are paid and any inspection cleared, the Tanzania Ports Authority releases the cargo for collection.', institution: 'Tanzania Ports Authority', duration_estimate: '1 working day', cost_estimate: 'Port handling charges', required_documents: ['Payment receipt', 'Release order'], is_online: false, source_url: 'https://www.tanzaniaports.go.tz/' },
    ],
    prechecks: [
      { question: 'Has the consignment already been declared in TANCIS?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }] },
      { question: 'Does the shipment require a product-specific permit (e.g. PVoC, health certificate) on top of standard clearance?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }] },
    ],
  },
  // ── Transit consignments — Dar es Salaam is a major regional transit corridor ──
  {
    source_id: null,
    name: 'Transit of goods through Tanzania (Central Corridor)',
    kind: 'TRANSIT',
    product_keywords: 'transit corridor central corridor zambia drc rwanda burundi uganda malawi rctg t1 bond',
    summary: 'Cargo moving through Tanzania to/from landlocked neighbours (Zambia, DRC, Burundi, Rwanda, Uganda, Malawi) via the port of Dar es Salaam is cleared under a customs transit regime rather than full import duty — a transit bond/guarantee secures the goods until they exit the country, instead of duties being paid locally.',
    source_url: 'https://www.tra.go.tz/',
    steps: [
      { name: 'Lodge the transit declaration (TANCIS, T1)', description: 'File a customs transit declaration in TANCIS naming the destination country and exit border post, backed by the bill of lading, commercial invoice and packing list.', institution: 'Tanzania Revenue Authority', duration_estimate: '1 working day', cost_estimate: 'Standard transit declaration processing fee', required_documents: ['Bill of lading', 'Commercial invoice', 'Packing list', 'TIN certificate'], is_online: true, source_url: 'https://www.tra.go.tz/' },
      { name: 'Provide a transit bond / guarantee', description: 'A bond or guarantee (e.g. under the Regional Customs Transit Guarantee scheme used across the EAC) is lodged to cover the duty that would apply if the goods didn’t actually leave the country — released once exit is confirmed.', institution: 'Tanzania Revenue Authority', duration_estimate: '1-2 working days', cost_estimate: 'Bond value based on the goods’ dutiable value', required_documents: ['Transit declaration', 'Bond/guarantee instrument from an approved bondsman or insurer'], is_online: false, source_url: 'https://www.tra.go.tz/' },
      { name: 'Port release under transit', description: 'Once bonded, the Tanzania Ports Authority releases the cargo for onward road or rail movement under customs escort/tracking where required.', institution: 'Tanzania Ports Authority', duration_estimate: '1 working day', cost_estimate: 'Port handling charges', required_documents: ['Transit bond confirmation'], is_online: false, source_url: 'https://www.tanzaniaports.go.tz/' },
      { name: 'Exit confirmation at the border', description: 'The consignment is checked against the transit declaration at the exit border post (e.g. Tunduma for Zambia/DRC, Kabanga for Burundi/Rwanda); confirmed exit discharges the bond.', institution: 'Tanzania Revenue Authority', duration_estimate: 'Same day at the border, once the consignment arrives', cost_estimate: 'No additional fee if the transit period isn’t exceeded', required_documents: ['Transit declaration', 'Bond confirmation'], is_online: true, source_url: 'https://www.tra.go.tz/' },
    ],
    prechecks: [
      { question: 'What is the destination country for this transit consignment?', options: [{ value: 'zambia', label: 'Zambia' }, { value: 'drc', label: 'DR Congo' }, { value: 'burundi', label: 'Burundi' }, { value: 'rwanda', label: 'Rwanda' }, { value: 'uganda', label: 'Uganda' }, { value: 'malawi', label: 'Malawi' }, { value: 'other', label: 'Other' }] },
      { question: 'Which border post will the consignment exit through?', options: [{ value: 'tunduma', label: 'Tunduma (Zambia/DRC)' }, { value: 'kabanga', label: 'Kabanga (Burundi/Rwanda)' }, { value: 'other', label: 'Other / not yet decided' }] },
      { question: 'Do you already have an approved bondsman or insurer for the transit bond?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, need to arrange one' }] },
    ],
  },
  // ── Business licence (portal ID confirmed via direct API check) ──
  {
    source_id: 184,
    name: 'Business licence',
    kind: 'REGISTRATION',
    product_keywords: 'business licence registration general trading',
    summary: 'A general trading business licence, required before conducting most commercial import/export activity, issued at the local government level.',
    source_url: 'https://trade.tanzania.go.tz/procedure/184?l=en',
    steps: [
      { name: 'Business registration', description: 'Register the business entity (company, partnership or sole trader) before applying for a trading licence.', institution: 'Business Registrations and Licensing Agency', duration_estimate: '2-5 working days', cost_estimate: 'Registration fee per entity type', required_documents: ['Identification documents', 'Memorandum/Articles for companies'], is_online: true, source_url: 'https://www.brela.go.tz/' },
      { name: 'Apply for the trading business licence', description: 'Apply to the local government authority for the specific class of business licence covering the intended trading activity.', institution: 'Local Government Authority', duration_estimate: 'Varies by locality', cost_estimate: 'Licence fee per category', required_documents: ['Business registration certificate', 'TIN certificate', 'Premises details'], is_online: false, source_url: 'https://tamisemi.go.tz/' },
    ],
    prechecks: [
      { question: 'Is your business already registered (BRELA)?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    ],
  },
];

async function upsertInstitution(name: string): Promise<string> {
  const cfg = INSTITUTIONS[name];
  if (!cfg) throw new Error(`Unknown institution "${name}" — add it to INSTITUTIONS first.`);
  const existing = await db.selectFrom('trade_institutions').select('id').where('name', '=', name).executeTakeFirst();
  if (existing) {
    await db.updateTable('trade_institutions').set({
      acronym: cfg.acronym ?? null, category: cfg.category, address: cfg.address ?? null,
      phone: cfg.phone ?? null, email: cfg.email ?? null, website: cfg.website,
      source_url: cfg.source_url, scraped_at: new Date(), updated_at: new Date(),
    }).where('id', '=', existing.id).execute();
    return existing.id;
  }
  const row = await db.insertInto('trade_institutions').values({
    name, acronym: cfg.acronym ?? null, category: cfg.category, address: cfg.address ?? null,
    phone: cfg.phone ?? null, email: cfg.email ?? null, website: cfg.website,
    source_url: cfg.source_url, scraped_at: new Date(),
  }).returning('id').executeTakeFirstOrThrow();
  return row.id;
}

async function main() {
  const institutionIds: Record<string, string> = {};
  for (const name of Object.keys(INSTITUTIONS)) {
    institutionIds[name] = await upsertInstitution(name);
  }
  console.log(`Upserted ${Object.keys(institutionIds).length} institutions.`);

  let proceduresDone = 0, stepsDone = 0, precheckDone = 0;
  for (const p of PROCEDURES) {
    let procId: string;
    const existing = p.source_id != null
      ? await db.selectFrom('trade_procedures').select('id').where('source_id', '=', p.source_id).executeTakeFirst()
      : await db.selectFrom('trade_procedures').select('id').where('name', '=', p.name).where('source_id', 'is', null).executeTakeFirst();

    if (existing) {
      await db.updateTable('trade_procedures').set({
        name: p.name, kind: p.kind, product_keywords: p.product_keywords, summary: p.summary,
        has_detail: true, source_url: p.source_url, scraped_at: new Date(), updated_at: new Date(),
      }).where('id', '=', existing.id).execute();
      procId = existing.id;
    } else {
      const row = await db.insertInto('trade_procedures').values({
        source_id: p.source_id, name: p.name, kind: p.kind, product_keywords: p.product_keywords,
        summary: p.summary, has_detail: true, source_url: p.source_url, scraped_at: new Date(),
      }).returning('id').executeTakeFirstOrThrow();
      procId = row.id;
    }

    // Steps and prechecks are curated as a whole unit per procedure — replace, not merge.
    await db.deleteFrom('trade_procedure_steps').where('procedure_id', '=', procId).execute();
    await db.deleteFrom('trade_procedure_prechecks').where('procedure_id', '=', procId).execute();

    for (let i = 0; i < p.steps.length; i++) {
      const s = p.steps[i];
      await db.insertInto('trade_procedure_steps').values({
        procedure_id: procId, step_no: i + 1, name: s.name, description: s.description,
        institution_id: institutionIds[s.institution] ?? null, duration_estimate: s.duration_estimate,
        cost_estimate: s.cost_estimate, required_documents: JSON.stringify(s.required_documents) as unknown as string[],
        is_online: s.is_online, source_url: s.source_url,
      }).execute();
      stepsDone++;
    }
    for (let i = 0; i < p.prechecks.length; i++) {
      const q = p.prechecks[i];
      await db.insertInto('trade_procedure_prechecks').values({
        procedure_id: procId, question: q.question, help_text: q.help_text ?? null,
        options: JSON.stringify(q.options) as unknown as { value: string; label: string }[], sort_order: i,
      }).execute();
      precheckDone++;
    }
    proceduresDone++;
  }

  console.log(`Flagship content seed complete: ${proceduresDone} procedures, ${stepsDone} steps, ${precheckDone} precheck questions.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
