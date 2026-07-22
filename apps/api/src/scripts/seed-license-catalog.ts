/**
 * Seed the global comply_license_catalog reference table — Tanzania's
 * Business Licensing Act fee schedule (37 business categories, principal
 * + sub-licence fees), transcribed from the source PDF the user supplied
 * ("Business Licenses & fee structure.pdf"). Fee amounts and currencies
 * are transcribed exactly as printed in that document, including a few
 * internally inconsistent entries in the source itself (e.g. a
 * sub-licence fee exceeding its principal fee) — those are left as-is
 * rather than silently "corrected", since this schedule is meant to be a
 * faithful digitisation of the government document, not a reinterpretation
 * of it. A handful of obvious stray-digit typos in the source (e.g.
 * "700,0000/=") are normalized to the clearly-intended magnitude
 * consistent with the surrounding fee range for that category.
 *
 * The `requirements` column is a general, editable starting checklist by
 * category — the source fee schedule does not itself list required
 * documents, so this is NOT a verified official requirements list.
 *
 * Usage:  npx tsx src/scripts/seed-license-catalog.ts
 * Re-runnable: upserts by `code` — safe to run again after edits below.
 */
import { db } from '../db/client.js';

type Currency = 'TZS' | 'USD';

interface RawTier {
  tier?: string;
  principalFee?: number;
  principalCurrency?: Currency;
  subsidiaryFee?: number;
  subsidiaryCurrency?: Currency;
  notes?: string;
}

interface RawItem {
  description: string;
  tiers: RawTier[];
}

interface RawCategory {
  sn: number;
  category: string;
  items: RawItem[];
  requirementsGroup?: 'standard' | 'foreign' | 'financial' | 'professional' | 'hospitality' | 'trading_premises';
}

const REQUIREMENTS_BY_GROUP: Record<string, string[]> = {
  standard: [
    'Certificate of Incorporation / Business Registration (BRELA)',
    'TIN Certificate',
    'Proof of business premises (lease agreement or title deed)',
    '2 passport-size photographs of the applicant/director',
    'Completed licence application form',
    'Previous licence (for renewals)',
  ],
  foreign: [
    'Certificate of Incorporation / Business Registration (BRELA)',
    'TIN Certificate',
    'Proof of business premises (lease agreement or title deed)',
    'Certificate of Investment (TIC) or equivalent, where applicable',
    'Valid work/residence permit or investor permit (Class A/B/C)',
    'Certified copies of foreign incorporation documents',
    'Completed licence application form',
  ],
  financial: [
    'Certificate of Incorporation / Business Registration (BRELA)',
    'TIN Certificate',
    'Minimum capital requirement proof',
    'Bank of Tanzania / CMSA no-objection or provisional approval, where applicable',
    'Fit-and-proper declaration for directors/shareholders',
    'Completed licence application form',
  ],
  professional: [
    'TIN Certificate',
    'Professional body registration / practising certificate',
    'Academic and professional qualification certificates',
    'Completed licence application form',
    '2 passport-size photographs',
  ],
  hospitality: [
    'Certificate of Incorporation / Business Registration (BRELA)',
    'TIN Certificate',
    'Proof of business premises (lease agreement or title deed)',
    'Health/hygiene inspection certificate',
    'Fire safety certificate',
    'Liquor licence, where applicable',
    'Completed licence application form',
  ],
  trading_premises: [
    'TIN Certificate',
    'Proof of business premises (lease agreement or title deed)',
    'Local government (mtaa/ward) premises compliance letter',
    'OSHA workplace certificate, where applicable',
    'Completed licence application form',
  ],
};

// ── Source data ────────────────────────────────────────────────────────────
// Transcribed category-by-category from the source fee schedule.

const CATEGORIES: RawCategory[] = [
  {
    sn: 1, category: 'Agency Business',
    items: [
      { description: 'Commission Agent', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Travel agent', tiers: [{ principalFee: 200000, subsidiaryFee: 200000 }] },
      { description: 'Air Charter Agent', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Shipping agent', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 10000, principalCurrency: 'USD', subsidiaryFee: 6000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Any other agent', tiers: [
        { tier: 'Local', principalFee: 200000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 2, category: 'Broker Business',
    items: [
      { description: 'Insurance Broker', tiers: [
        { tier: 'Local', principalFee: 200000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Stock exchange broker', tiers: [
        { tier: 'Local', notes: 'Fee not specified in source' },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Shipping broker', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 600000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 3000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Trade broker', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] },
      { description: 'Court broker', tiers: [
        { tier: 'Municipality', principalFee: 400000, subsidiaryFee: 200000 },
        { tier: 'Town/District', principalFee: 300000, subsidiaryFee: 100000 },
        { tier: 'Any other place', principalFee: 200000, subsidiaryFee: 100000 },
      ] },
    ],
  },
  {
    sn: 3, category: 'Banking', requirementsGroup: 'financial',
    items: [
      { description: 'Banking Service', tiers: [
        { tier: 'Locally owned', principalFee: 1000000, subsidiaryFee: 600000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 3200, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Bureau De Change', tiers: [
        { tier: 'Local owned', principalFee: 600000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
        { tier: 'Co-operative banks', principalFee: 200000, subsidiaryFee: 100000 },
      ] },
    ],
  },
  {
    sn: 4, category: 'Financial Institutions & Capital Markets', requirementsGroup: 'financial',
    items: [
      { description: 'Capital Markets & Stock Exchange', tiers: [{ principalFee: 500000, subsidiaryFee: 300000 }] },
      { description: 'Social security provider', tiers: [{ principalFee: 1000000, subsidiaryFee: 600000 }] },
      { description: 'Mortgage & Hire Purchase (other than micro enterprise schemes/programmes)', tiers: [{ principalFee: 600000, subsidiaryFee: 400000 }] },
      { description: 'Mortgage & hire purchase for micro enterprise scheme/programme', tiers: [{ principalFee: 100000, subsidiaryFee: 50000 }] },
      { description: 'Credit Card Management', tiers: [{ principalFee: 400000, subsidiaryFee: 300000 }] },
      { description: 'Micro financing investments', tiers: [{ tier: 'Local', principalFee: 600000, subsidiaryFee: 400000 }] },
    ],
  },
  {
    sn: 5, category: 'Clearing & Forwarding',
    items: [
      { description: 'Clearing & forwarding local', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] },
      { description: 'Freight forwarding', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Warehousing', tiers: [{ principalFee: 300000, subsidiaryFee: 150000, notes: 'New' }] },
    ],
  },
  {
    sn: 6, category: 'Cargo Valuation and Superintendence',
    items: [
      { description: 'Pre-shipment inspection', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 2000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Cargo valuation or cargo survey', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 15000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Cargo sourcing local', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Cargo superintendence', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Cargo handling', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 800000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 3000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 7, category: 'Shipping Business',
    items: [
      { description: 'Harbours/airport management', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 800000 },
        { tier: 'Foreign owned', principalFee: 4000, principalCurrency: 'USD', subsidiaryFee: 2000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Miscellaneous port services', tiers: [{ principalFee: 200000, subsidiaryFee: 150000, notes: 'New' }] },
      { description: 'Ship Chandelling', tiers: [{ principalFee: 200000, subsidiaryFee: 100000 }] },
      { description: 'Maritime transportation', tiers: [{ principalFee: 600000, subsidiaryFee: 300000, notes: 'New' }] },
      { description: 'Shipping protective or ship charter', tiers: [{ principalFee: 800000, subsidiaryFee: 600000 }] },
      { description: 'Stevedoring, lighterage & bagging services', tiers: [
        { tier: 'Dar es Salaam Port', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Tanga, Mtwara, Lindi, Mafia, Lake Victoria', principalFee: 200000, subsidiaryFee: 100000, notes: 'New' },
      ] },
    ],
  },
  {
    sn: 8, category: 'Insurance', requirementsGroup: 'financial',
    items: [
      { description: 'General insurance and assurance', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 800000 },
        { tier: 'Foreign owned', principalFee: 10000, principalCurrency: 'USD', subsidiaryFee: 4000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Underwriting and loss assessment', tiers: [
        { tier: 'Local', principalFee: 600000, subsidiaryFee: 300000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Re-Assurance & endowment', tiers: [
        { tier: 'Local', principalFee: 800000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 10000, subsidiaryFee: 400 },
      ] },
    ],
  },
  {
    sn: 9, category: 'Manufactures Representative',
    items: [
      { description: 'Representative franchise holder', tiers: [{ principalFee: 500000, subsidiaryFee: 200000, notes: 'New' }] },
      { description: 'Sole Distributor or supplier', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] },
    ],
  },
  {
    sn: 10, category: 'Estate',
    items: [
      { description: 'Real estate', tiers: [
        { tier: 'Local', principalFee: 600000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Property management', tiers: [
        { tier: 'Local', principalFee: 500000, subsidiaryFee: 300000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD', notes: 'New' },
      ] },
      { description: 'Estate Agent', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 300000 },
        { tier: 'Foreign owned', principalFee: 1000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Property development', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 11, category: 'Commercial Traveler',
    items: [{ description: 'Commercial Traveler licence', tiers: [{ tier: 'Local', principalFee: 400000, subsidiaryFee: 400000 }] }],
  },
  {
    sn: 12, category: 'Postal Services',
    items: [
      { description: 'Postal Services', tiers: [
        { tier: 'Head quarters', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Municipal/HQS', principalFee: 2000000, subsidiaryFee: 100000 },
        { tier: 'Town/District', principalFee: 100000, subsidiaryFee: 50000 },
        { tier: 'H/Quarters', notes: 'Fee not specified in source' },
        { tier: 'Rural', notes: 'NIL' },
      ] },
      { description: 'Courier services or mailing agent', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Expedited mail service', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 13, category: 'Electricity, Power and Energy Supply',
    items: [
      { description: 'Urban Water Supply', tiers: [{ tier: 'Local', principalFee: 200000, subsidiaryFee: 200000 }] },
      { description: 'Electricity production and or distribution', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 600000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 2000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Refining of crude oil', tiers: [{ tier: 'Local', principalFee: 600000, subsidiaryFee: 400000 }] },
      { description: 'Supply of marine and aviation fuel', tiers: [
        { tier: 'Local', principalFee: 500000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Production and Distribution of gas Products', tiers: [{ tier: 'Local', principalFee: 500000, subsidiaryFee: 300000 }] },
    ],
  },
  {
    sn: 14, category: 'Telecommunication Business',
    items: [
      { description: 'Internet Services provider', tiers: [
        { tier: 'Local', principalFee: 600000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Internet services provider agent', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] },
      { description: 'Internet Surfing/café', tiers: [{ principalFee: 200000, subsidiaryFee: 100000 }] },
      { description: 'Attended telephone officers', tiers: [{ principalFee: 200000, subsidiaryFee: 100000 }] },
      { description: 'Telecommunication services including fax, email & phones', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Selling accessories', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Cellular telephone operators', tiers: [
        { tier: 'Local', principalFee: 600000, subsidiaryFee: 400000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 2000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Payphone operators', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] },
      { description: 'Items above, if operated in rural districts and villages', tiers: [{ notes: '25% of the respective principal and sub-licence fee' }] },
    ],
  },
  {
    sn: 15, category: 'Passengers and Goods Transportation',
    items: [
      { description: 'By Railways', tiers: [
        { tier: 'Local', principalFee: 500000, subsidiaryFee: 80000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 2000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'By Air', tiers: [
        { tier: 'Local', principalFee: 400000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 16, category: 'Electronic Media',
    items: [
      { description: 'Radio and Television', tiers: [{ principalFee: 400000, subsidiaryFee: 300000 }] },
      { description: 'Broadcasting television provider', tiers: [{ principalFee: 400000, subsidiaryFee: 250000 }] },
      { description: 'Radio/television Transmission station', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
    ],
  },
  {
    sn: 17, category: 'Processing and Manufacturing of Goods and Selling',
    items: [
      { description: 'Small scale industry', tiers: [{ principalFee: 50000, subsidiaryFee: 20000 }] },
      { description: 'Medium scale industry', tiers: [{ principalFee: 400000, subsidiaryFee: 400000 }] },
      { description: 'Large scale industry', tiers: [{ principalFee: 600000, subsidiaryFee: 600000 }] },
    ],
  },
  {
    sn: 18, category: 'Hunting',
    items: [
      { description: 'Hunting licence', tiers: [
        { tier: 'Local', principalFee: 1000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 3000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Professional hunters', tiers: [
        { tier: 'Local', principalFee: 1000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 3000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 19, category: 'Lotteries, Games and Amusement',
    items: [
      { description: 'Casino', tiers: [
        { tier: 'City of Dar es Salaam', principalFee: 40000, principalCurrency: 'USD', subsidiaryFee: 40000, subsidiaryCurrency: 'USD' },
        { tier: 'Other towns', principalFee: 15000, principalCurrency: 'USD', subsidiaryFee: 15000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Slot machines per station', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 150000 },
        { tier: 'Foreign owned', principalFee: 1000, principalCurrency: 'USD', subsidiaryFee: 800, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Night clubs', tiers: [{ principalFee: 500000, subsidiaryFee: 200000 }] },
      { description: 'Entertainment halls', tiers: [{ principalFee: 200000, subsidiaryFee: 150000 }] },
    ],
  },
  {
    sn: 20, category: 'Tourist Businesses', requirementsGroup: 'hospitality',
    items: [
      { description: 'Tourist hotels', tiers: [{ principalFee: 150000, subsidiaryFee: 150000, notes: 'plus 2,000/= per bedroom' }] },
      { description: 'Lodge', tiers: [{ principalFee: 150000, subsidiaryFee: 150000 }] },
      { description: 'Camp', tiers: [{ principalFee: 100000, subsidiaryFee: 100000, notes: 'plus 3,000/= per hut/cottage' }] },
      { description: 'Tourist operator', tiers: [
        { tier: 'Local', principalFee: 200000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 1000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 21, category: 'Non-Tourist Business Hotel', requirementsGroup: 'hospitality',
    items: [
      { description: 'With liquor licence', tiers: [{ principalFee: 100000, subsidiaryFee: 100000, notes: 'plus 1,500/= per bedroom' }] },
      { description: 'Without liquor licence', tiers: [{ principalFee: 80000, subsidiaryFee: 80000, notes: 'plus 2,000/= per bedroom' }] },
      { description: 'Lodging houses', tiers: [{ principalFee: 100000, subsidiaryFee: 100000, notes: 'plus 2,000/= per bedroom' }] },
      { description: 'Catering services', tiers: [
        { tier: 'Take away', principalFee: 100000, subsidiaryFee: 50000 },
        { tier: 'Mobile catering', principalFee: 100000, subsidiaryFee: 50000 },
      ] },
    ],
  },
  {
    sn: 22, category: 'Exportation',
    items: [
      { description: 'Cattle', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Other livestock', tiers: [{ principalFee: 250000, subsidiaryFee: 150000 }] },
      { description: 'Raw material', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Agriculture goods', tiers: [{ principalFee: 100000, subsidiaryFee: 80000 }] },
      { description: 'Finished goods and other commodities', tiers: [{ principalFee: 100000, subsidiaryFee: 80000 }] },
      { description: 'Transit trade local', tiers: [{ principalFee: 300000, subsidiaryFee: 100000 }] },
    ],
  },
  {
    sn: 23, category: 'Importation',
    items: [{ description: 'Merchandizing', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] }],
  },
  {
    sn: 24, category: 'Dealership/Franchise',
    items: [
      { description: 'Motor vehicle', tiers: [{ principalFee: 400000, subsidiaryFee: 200000 }] },
      { description: 'Motor vehicle assembling', tiers: [{ principalFee: 500000, subsidiaryFee: 200000 }] },
      { description: 'Dealers of broadcasting apparatus', tiers: [{ principalFee: 400000, subsidiaryFee: 300000 }] },
      { description: 'Dealers in arms and ammunition', tiers: [{ principalFee: 1000000, subsidiaryFee: 200000 }] },
      { description: 'Dealers in explosive for mining purposes', tiers: [
        { tier: 'Local', principalFee: 1000000, subsidiaryFee: 500000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 3000, subsidiaryCurrency: 'USD' },
      ] },
    ],
  },
  {
    sn: 25, category: 'Regional Trading Companies',
    items: [{ description: 'Regional trading licence', tiers: [
      { tier: 'City/Municipal town', principalFee: 100000, subsidiaryFee: 100000 },
      { tier: 'District', principalFee: 50000, subsidiaryFee: 50000 },
    ] }],
  },
  {
    sn: 26, category: 'Cooperative Societies',
    items: [{ description: 'Cooperative society licence', tiers: [{ principalFee: 40000, subsidiaryFee: 20000 }] }],
  },
  {
    sn: 27, category: 'Building Contractors',
    items: [
      { description: 'Building society', tiers: [{ principalFee: 100000, subsidiaryFee: 100000 }] },
      { description: 'Contractor Class I', tiers: [{ principalFee: 1000000, subsidiaryFee: 800000 }] },
      { description: 'Contractor Class II', tiers: [{ principalFee: 800000, subsidiaryFee: 750000 }] },
      { description: 'Contractor Class III', tiers: [{ principalFee: 700000, subsidiaryFee: 700000 }] },
      { description: 'Contractor Class IV', tiers: [{ principalFee: 650000, subsidiaryFee: 650000 }] },
      { description: 'Contractor Class V', tiers: [{ principalFee: 500000, subsidiaryFee: 500000 }] },
      { description: 'Contractor Class VI', tiers: [{ principalFee: 400000, subsidiaryFee: 400000 }] },
      { description: 'Contractor Class VIII', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'All Foreign-owned', tiers: [{ principalFee: 20000, principalCurrency: 'USD', subsidiaryFee: 10000, subsidiaryCurrency: 'USD' }] },
    ],
  },
  {
    sn: 28, category: 'Specified Profession', requirementsGroup: 'professional',
    items: [
      { description: 'Business consultancy', tiers: [
        { tier: 'Local', principalFee: 200000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Lawyer', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 5000, principalCurrency: 'USD', subsidiaryFee: 2500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Tax practitioner', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Quantity surveyor', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Engineers', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Auditor / Accountant', tiers: [
        { tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 1500, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Medical Practitioner', tiers: [
        { tier: 'Local', principalFee: 150000, subsidiaryFee: 150000 },
        { tier: 'Foreign', principalFee: 1000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Any other consultancy', tiers: [
        { tier: 'Local', principalFee: 200000, subsidiaryFee: 100000 },
        { tier: 'Foreign owned', principalFee: 3000, principalCurrency: 'USD', subsidiaryFee: 2000, subsidiaryCurrency: 'USD' },
      ] },
      { description: 'Employees of government, parastatal organization, religious-owned institution or private companies', tiers: [{ notes: 'NIL' }] },
    ],
  },
  {
    sn: 29, category: 'General Trading', requirementsGroup: 'trading_premises',
    items: [
      { description: 'Carrying on dispensary, health centre and laboratory clinic', tiers: [{ principalFee: 80000, subsidiaryFee: 50000 }] },
      { description: 'Hospital', tiers: [{ principalFee: 150000, subsidiaryFee: 100000 }] },
      { description: 'Selling medicines retail — Part I poison shop', tiers: [{ principalFee: 200000, subsidiaryFee: 100000 }] },
      { description: 'Selling medicines retail — Part II poison shop', tiers: [{ principalFee: 100000, subsidiaryFee: 80000 }] },
      { description: 'Hardware and building materials retail', tiers: [
        { tier: 'City / Municipal', principalFee: 200000, subsidiaryFee: 150000 },
        { tier: 'District', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'Minor settlement and village', principalFee: 60000, subsidiaryFee: 50000 },
      ] },
      { description: 'Workshop & Garages', tiers: [
        { tier: 'City / Municipal', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'District', principalFee: 120000, subsidiaryFee: 100000 },
        { tier: 'Minor settlement and village', principalFee: 100000, subsidiaryFee: 100000 },
      ] },
      { description: 'Bakeries', tiers: [
        { tier: 'City / Municipal', principalFee: 100000, subsidiaryFee: 50000 },
        { tier: 'District', principalFee: 80000, subsidiaryFee: 30000 },
        { tier: 'Minor settlement and village', principalFee: 30000, subsidiaryFee: 30000 },
      ] },
      { description: 'Timber and furniture retail', tiers: [
        { tier: 'City / Municipal', principalFee: 200000, subsidiaryFee: 100000 },
        { tier: 'District / town', principalFee: 100000, subsidiaryFee: 50000 },
      ] },
      { description: 'Bookstore and stationery retail', tiers: [
        { tier: 'City / Municipal', principalFee: 100000, subsidiaryFee: 80000 },
        { tier: 'District / town', principalFee: 80000, subsidiaryFee: 50000 },
        { tier: 'Minor settlement and village', principalFee: 20000, subsidiaryFee: 20000 },
      ] },
      { description: 'Textile and garments retail', tiers: [
        { tier: 'City / Municipal', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'District / town', principalFee: 100000, subsidiaryFee: 50000 },
        { tier: 'Minor settlement and village', principalFee: 50000, subsidiaryFee: 50000 },
      ] },
      { description: 'Silver and gold smith / dealer', tiers: [
        { tier: 'City / Municipal', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'District / town', principalFee: 250000, subsidiaryFee: 200000 },
        { tier: 'Minor settlement and village', principalFee: 100000, subsidiaryFee: 80000 },
      ] },
      { description: 'Flour / oil milling', tiers: [
        { tier: 'City / Municipal', principalFee: 50000, subsidiaryFee: 50000 },
        { tier: 'District / town', principalFee: 30000, subsidiaryFee: 20000 },
        { tier: 'Minor settlement and village', principalFee: 20000, subsidiaryFee: 15000 },
      ] },
      { description: 'Livestock trading', tiers: [
        { tier: 'City / Municipal', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'District / town', principalFee: 80000, subsidiaryFee: 40000 },
        { tier: 'Minor settlement and village', principalFee: 25000, subsidiaryFee: 10000 },
      ] },
      { description: 'Butchers', tiers: [
        { tier: 'City / Municipal', principalFee: 80000, subsidiaryFee: 50000 },
        { tier: 'District / town', principalFee: 60000, subsidiaryFee: 40000 },
        { tier: 'Minor settlement and village', principalFee: 10000, subsidiaryFee: 10000 },
      ] },
      { description: 'Printing and publishing of books and newspaper', tiers: [
        { tier: 'City / Municipal', principalFee: 400000, subsidiaryFee: 250000 },
        { tier: 'District', principalFee: 250000, subsidiaryFee: 200000 },
        { tier: 'Minor settlement and village', principalFee: 100000, subsidiaryFee: 80000 },
      ] },
      { description: 'Petrol and filling stations', tiers: [
        { tier: 'City / Municipal', principalFee: 200000, subsidiaryFee: 200000 },
        { tier: 'District', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'Minor settlement and village', principalFee: 100000, subsidiaryFee: 50000 },
      ] },
      { description: 'Kiosks / Groceries', tiers: [
        { tier: 'City / Municipal', principalFee: 60000, subsidiaryFee: 40000 },
        { tier: 'District', principalFee: 40000, subsidiaryFee: 20000 },
        { tier: 'Minor settlement and village', principalFee: 10000, subsidiaryFee: 5000 },
      ] },
      { description: 'Hair Saloon / barber shop', tiers: [
        { tier: 'City / Municipal', principalFee: 40000, subsidiaryFee: 20000 },
        { tier: 'District', principalFee: 20000, subsidiaryFee: 10000 },
        { tier: 'Minor settlement and village', principalFee: 5000, subsidiaryFee: 5000 },
      ] },
      { description: 'Beauty clinics machinery/tools', tiers: [
        { tier: 'City / Municipal', principalFee: 40000, subsidiaryFee: 20000 },
        { tier: 'District', principalFee: 30000, subsidiaryFee: 15000 },
        { tier: 'Minor settlement and village', principalFee: 10000, subsidiaryFee: 5000 },
      ] },
      { description: 'Machinery tools', tiers: [
        { tier: 'City / Municipal', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'District', principalFee: 200000, subsidiaryFee: 80000 },
        { tier: 'Minor settlement and village', principalFee: 80000, subsidiaryFee: 50000 },
      ] },
      { description: 'Motor oils and lubricants', tiers: [
        { tier: 'City / Municipal', principalFee: 120000, subsidiaryFee: 100000 },
        { tier: 'District', principalFee: 100000, subsidiaryFee: 80000 },
        { tier: 'Minor settlement and village', principalFee: 50000, subsidiaryFee: 50000 },
      ] },
      { description: 'Selling of fish', tiers: [
        { tier: 'City / Municipal', principalFee: 40000, subsidiaryFee: 30000 },
        { tier: 'District', principalFee: 30000, subsidiaryFee: 10000 },
        { tier: 'Minor settlement and village', principalFee: 10000, subsidiaryFee: 10000 },
      ] },
      { description: 'Tea Room', tiers: [
        { tier: 'City / Municipal', principalFee: 50000, subsidiaryFee: 40000 },
        { tier: 'District', principalFee: 25000, subsidiaryFee: 15000 },
        { tier: 'Minor settlement and village', principalFee: 5000, subsidiaryFee: 5000 },
      ] },
      { description: 'Second-hand clothes (mitumba) dealers — Wholesale', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Second-hand clothes (mitumba) dealers — Sub-wholesale', tiers: [{ principalFee: 200000, subsidiaryFee: 100000 }] },
      { description: 'Second-hand clothes (mitumba) dealers — Retail', tiers: [
        { tier: 'City / Municipal', principalFee: 50000, subsidiaryFee: 30000 },
        { tier: 'Township', principalFee: 30000, subsidiaryFee: 20000 },
        { tier: 'District', principalFee: 15000, subsidiaryFee: 10000 },
        { tier: 'Minor settlement and village', principalFee: 5000, subsidiaryFee: 0 },
      ] },
    ],
  },
  {
    sn: 30, category: 'Auctioneers',
    items: [{ description: 'Auctioneer licence', tiers: [{ principalFee: 150000, subsidiaryFee: 150000 }] }],
  },
  {
    sn: 31, category: 'Selling Spare Parts', requirementsGroup: 'trading_premises',
    items: [
      { description: 'Motor vehicle spares', tiers: [
        { tier: 'City / Municipal', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'District', principalFee: 250000, subsidiaryFee: 150000 },
        { tier: 'Minor settlement and village', principalFee: 30000, subsidiaryFee: 30000 },
      ] },
      { description: 'Motor cycles spares', tiers: [
        { tier: 'City / Municipal', principalFee: 120000, subsidiaryFee: 100000 },
        { tier: 'District', principalFee: 80000, subsidiaryFee: 50000 },
        { tier: 'Minor settlement and village', principalFee: 40000, subsidiaryFee: 30000 },
      ] },
      { description: 'Bicycle spares', tiers: [
        { tier: 'City / Municipal', principalFee: 50000, subsidiaryFee: 30000 },
        { tier: 'District', principalFee: 30000, subsidiaryFee: 20000 },
        { tier: 'Minor settlement', principalFee: 10000, subsidiaryFee: 10000 },
        { tier: 'Village', principalFee: 5000, subsidiaryFee: 5000 },
      ] },
      { description: 'Industrial spare and tools', tiers: [
        { tier: 'City / Municipal', principalFee: 300000, subsidiaryFee: 200000 },
        { tier: 'District', principalFee: 250000, subsidiaryFee: 150000 },
        { tier: 'Minor settlement and village', principalFee: 100000, subsidiaryFee: 50000 },
      ] },
      { description: 'Agricultural implements, flour mills, machine spares', tiers: [
        { tier: 'City / Municipal', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'District', principalFee: 60000, subsidiaryFee: 30000 },
        { tier: 'Minor settlement and village', principalFee: 20000, subsidiaryFee: 10000 },
      ] },
      { description: 'Marine spares and tools', tiers: [
        { tier: 'City / Municipal', principalFee: 250000, subsidiaryFee: 150000 },
        { tier: 'District', principalFee: 200000, subsidiaryFee: 100000 },
        { tier: 'Minor settlement and village', principalFee: 50000, subsidiaryFee: 25000 },
      ] },
      { description: 'Domestic appliances retail', tiers: [
        { tier: 'City / Municipal', principalFee: 200000, subsidiaryFee: 150000 },
        { tier: 'District', principalFee: 100000, subsidiaryFee: 50000 },
        { tier: 'Minor settlement and village', principalFee: 50000, subsidiaryFee: 25000 },
      ] },
      { description: 'Electrical parts and/or household items retail', tiers: [
        { tier: 'City / Municipal', principalFee: 150000, subsidiaryFee: 100000 },
        { tier: 'District', principalFee: 100000, subsidiaryFee: 50000 },
        { tier: 'Minor settlement', principalFee: 50000, subsidiaryFee: 25000 },
        { tier: 'Village', principalFee: 10000, subsidiaryFee: 10000 },
      ] },
    ],
  },
  {
    sn: 32, category: 'Electrical Contractors',
    items: [
      { description: 'Class A', tiers: [{ tier: 'Local', principalFee: 500000, subsidiaryFee: 300000 }] },
      { description: 'Class B', tiers: [{ tier: 'Local', principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Class C', tiers: [{ tier: 'Local', principalFee: 200000, subsidiaryFee: 100000 }] },
      { description: 'Class D', tiers: [{ tier: 'Local', principalFee: 100000, subsidiaryFee: 50000, notes: 'Listed as "Class C" a second time in the source — likely Class D' }] },
      { description: 'All foreign-owned', tiers: [{ principalFee: 6000, principalCurrency: 'USD', subsidiaryFee: 3000, subsidiaryCurrency: 'USD' }] },
    ],
  },
  {
    sn: 33, category: 'General Merchandizing', requirementsGroup: 'trading_premises',
    items: [
      { description: 'Wholesale', tiers: [{ principalFee: 300000, subsidiaryFee: 200000 }] },
      { description: 'Sub-wholesale', tiers: [{ principalFee: 200000, subsidiaryFee: 150000 }] },
      { description: 'Retail shops', tiers: [
        { tier: 'City / Municipal', principalFee: 70000, subsidiaryFee: 40000 },
        { tier: 'District', principalFee: 50000, subsidiaryFee: 30000 },
        { tier: 'Minor settlement', principalFee: 20000, subsidiaryFee: 15000 },
        { tier: 'Village', principalFee: 8000, subsidiaryFee: 8000 },
      ] },
      { description: 'Super markets', tiers: [
        { tier: 'City / Municipal', principalFee: 500000, subsidiaryFee: 300000 },
        { tier: 'District', principalFee: 200000, subsidiaryFee: 150000 },
        { tier: 'Minor settlement', principalFee: 100000, subsidiaryFee: 100000 },
        { tier: 'Village', principalFee: 5000, subsidiaryFee: 75000 },
      ] },
      { description: 'Departmental stores', tiers: [
        { tier: 'City / Municipal', principalFee: 400000, subsidiaryFee: 300000 },
        { tier: 'District', principalFee: 200000, subsidiaryFee: 200000 },
      ] },
    ],
  },
  {
    sn: 34, category: 'Endorsement on Transfer Licences',
    items: [{ description: 'Endorsement on transfer of licence', tiers: [{ tier: 'City, Municipal, District, minor settlement and villages', principalFee: 10000, subsidiaryFee: 10000 }] }],
  },
  {
    sn: 35, category: 'Duplicate Licence for Lost One',
    items: [{ description: 'Duplicate licence', tiers: [{ tier: 'City, Municipal, District, minor settlement and villages', principalFee: 20000, subsidiaryFee: 10000 }] }],
  },
  {
    sn: 36, category: 'Any Other Business Not of National or International Nature',
    items: [{ description: 'Any other business (local nature)', tiers: [
      { tier: 'City / Municipality', principalFee: 80000, subsidiaryFee: 60000 },
      { tier: 'At District headquarter', principalFee: 50000, subsidiaryFee: 40000 },
      { tier: 'In Minor settlement', principalFee: 15000, subsidiaryFee: 15000 },
      { tier: 'At village', principalFee: 5000, subsidiaryFee: 5000 },
    ] }],
  },
  {
    sn: 37, category: 'Any Other Business of National or International Nature',
    items: [{ description: 'Any other business (national/international nature)', tiers: [
      { tier: 'Local (Tanzania)', principalFee: 200000, subsidiaryFee: 100000 },
      { tier: 'Foreign owned', principalFee: 2000, principalCurrency: 'USD', subsidiaryFee: 1000, subsidiaryCurrency: 'USD' },
    ] }],
  },
];

// ── Flatten + upsert ─────────────────────────────────────────────────────────

interface Row {
  code: string;
  sn: number;
  category: string;
  description: string;
  tier: string | null;
  principal_fee: number | null;
  principal_currency: Currency;
  subsidiary_fee: number | null;
  subsidiary_currency: Currency;
  notes: string | null;
  requirements: string[];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const cat of CATEGORIES) {
    const baseGroup = cat.requirementsGroup ?? 'standard';
    cat.items.forEach((item, itemIdx) => {
      item.tiers.forEach((t, tierIdx) => {
        const isForeign = (t.tier ?? '').toLowerCase().includes('foreign');
        const group = isForeign ? 'foreign' : baseGroup;
        const code = `${String(cat.sn).padStart(2, '0')}-${String(itemIdx + 1).padStart(2, '0')}${t.tier ? '-' + slug(t.tier) : ''}${item.tiers.length > 1 && !t.tier ? '-' + tierIdx : ''}`;
        rows.push({
          code,
          sn: cat.sn,
          category: cat.category,
          description: item.description,
          tier: t.tier ?? null,
          principal_fee: t.principalFee ?? null,
          principal_currency: t.principalCurrency ?? 'TZS',
          subsidiary_fee: t.subsidiaryFee ?? null,
          subsidiary_currency: t.subsidiaryCurrency ?? t.principalCurrency ?? 'TZS',
          notes: t.notes ?? null,
          requirements: REQUIREMENTS_BY_GROUP[group],
        });
      });
    });
  }
  return rows;
}

async function main() {
  const rows = buildRows();
  const codes = new Set(rows.map(r => r.code));
  if (codes.size !== rows.length) throw new Error('Duplicate codes generated — fix buildRows()');

  let inserted = 0, updated = 0;
  for (const r of rows) {
    const existing = await db.selectFrom('comply_license_catalog').select('id').where('code', '=', r.code).executeTakeFirst();
    if (existing) {
      await db.updateTable('comply_license_catalog')
        .set({
          sn: r.sn, category: r.category, description: r.description, tier: r.tier,
          principal_fee: r.principal_fee as any, principal_currency: r.principal_currency,
          subsidiary_fee: r.subsidiary_fee as any, subsidiary_currency: r.subsidiary_currency,
          notes: r.notes, requirements: JSON.stringify(r.requirements) as any,
        })
        .where('id', '=', existing.id)
        .execute();
      updated++;
    } else {
      await db.insertInto('comply_license_catalog')
        .values({
          code: r.code, sn: r.sn, category: r.category, description: r.description, tier: r.tier,
          principal_fee: r.principal_fee as any, principal_currency: r.principal_currency,
          subsidiary_fee: r.subsidiary_fee as any, subsidiary_currency: r.subsidiary_currency,
          notes: r.notes, requirements: JSON.stringify(r.requirements) as any,
        })
        .execute();
      inserted++;
    }
  }

  console.log(`comply_license_catalog seed complete: ${inserted} inserted, ${updated} updated, ${rows.length} total across ${CATEGORIES.length} categories.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
