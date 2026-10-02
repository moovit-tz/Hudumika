export interface ShippingLine {
  id: string;
  rank?: number;
  code: string;
  name: string;
  shortName: string;
  bicPrefixes: string[];
  colorHex: string;
  darkHex: string;
  lightHex: string;
  textColor: string;
  accentBadge: string;
  country: string;
  headquarters?: string;
  alliance?: string;
  trackingUrl?: string;
  website?: string;
}

/**
 * Top Global Container Shipping Lines
 * Sourced from Wikipedia "List of largest container shipping companies" (Alphaliner) & MarineTraffic
 */
export const SHIPPING_LINES: ShippingLine[] = [
  {
    id: 'msc',
    rank: 1,
    code: 'MSCU',
    name: 'Mediterranean Shipping Company S.A. (MSC)',
    shortName: 'MSC',
    bicPrefixes: ['MSCU', 'MEDU', 'MSMU', 'TGHU', 'TCKU', 'INBU', 'GLDU'],
    colorHex: '#1d4ed8', // MSC Marine Navy
    darkHex: '#0f2c69',
    lightHex: '#3b82f6',
    textColor: '#ffffff',
    accentBadge: '#fdb913',
    country: 'Switzerland',
    headquarters: 'Geneva, Switzerland',
    alliance: 'Standalone',
    trackingUrl: 'https://www.msc.com/track-a-shipment',
    website: 'https://www.msc.com',
  },
  {
    id: 'maersk',
    rank: 2,
    code: 'MAEU',
    name: 'A.P. Møller – Mærsk A/S',
    shortName: 'Maersk',
    bicPrefixes: ['MAEU', 'MSKU', 'MRKU', 'SUDU', 'PONU', 'APMU', 'SEGU'],
    colorHex: '#0284c7', // Maersk Sky Cyan
    darkHex: '#034a6e',
    lightHex: '#38bdf8',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Denmark',
    headquarters: 'Copenhagen, Denmark',
    alliance: 'Gemini Cooperation',
    trackingUrl: 'https://www.maersk.com/tracking',
    website: 'https://www.maersk.com',
  },
  {
    id: 'cma_cgm',
    rank: 3,
    code: 'CMAU',
    name: 'CMA CGM S.A.',
    shortName: 'CMA CGM',
    bicPrefixes: ['CMAU', 'ANLU', 'APLU', 'CGMU', 'ECMU', 'FSCU'],
    colorHex: '#1e3a8a', // CMA CGM Royal Navy
    darkHex: '#0f1f4b',
    lightHex: '#3b82f6',
    textColor: '#ffffff',
    accentBadge: '#dc2626',
    country: 'France',
    headquarters: 'Marseille, France',
    alliance: 'Ocean Alliance',
    trackingUrl: 'https://www.cma-cgm.com/ebusiness/tracking',
    website: 'https://www.cma-cgm.com',
  },
  {
    id: 'cosco',
    rank: 4,
    code: 'COSU',
    name: 'COSCO SHIPPING Lines Co., Ltd.',
    shortName: 'COSCO SHIPPING',
    bicPrefixes: ['COSU', 'CCLU', 'CSNU', 'CBHU', 'CHIU'],
    colorHex: '#1e40af', // COSCO Pacific Ultramarine
    darkHex: '#172554',
    lightHex: '#60a5fa',
    textColor: '#ffffff',
    accentBadge: '#facc15',
    country: 'China',
    headquarters: 'Shanghai, China',
    alliance: 'Ocean Alliance',
    trackingUrl: 'https://lines.coscoshipping.com/home/cargotracking',
    website: 'https://lines.coscoshipping.com',
  },
  {
    id: 'hapag_lloyd',
    rank: 5,
    code: 'HLXU',
    name: 'Hapag-Lloyd AG',
    shortName: 'Hapag-Lloyd',
    bicPrefixes: ['HLXU', 'HLCU', 'UASC', 'CPSU', 'HASU'],
    colorHex: '#ea580c', // High-Vis Orange
    darkHex: '#7c2d12',
    lightHex: '#fb923c',
    textColor: '#ffffff',
    accentBadge: '#fef08a',
    country: 'Germany',
    headquarters: 'Hamburg, Germany',
    alliance: 'Gemini Cooperation',
    trackingUrl: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
    website: 'https://www.hapag-lloyd.com',
  },
  {
    id: 'one',
    rank: 6,
    code: 'ONEY',
    name: 'Ocean Network Express (ONE)',
    shortName: 'ONE',
    bicPrefixes: ['ONEY', 'KKFU', 'NYKU', 'MOLU', 'KLFU', 'TGHU'],
    colorHex: '#db2777', // ONE Cherry Magenta
    darkHex: '#831843',
    lightHex: '#f472b6',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Japan / Singapore',
    headquarters: 'Tokyo, Japan & Singapore',
    alliance: 'Premier Alliance',
    trackingUrl: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking',
    website: 'https://www.one-line.com',
  },
  {
    id: 'evergreen',
    rank: 7,
    code: 'EGLU',
    name: 'Evergreen Marine Corporation',
    shortName: 'Evergreen',
    bicPrefixes: ['EGLU', 'EMCU', 'EISU', 'UGMU', 'EGSU'],
    colorHex: '#15803d', // Evergreen Forest Jade
    darkHex: '#14532d',
    lightHex: '#4ade80',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Taiwan',
    headquarters: 'Taoyuan, Taiwan',
    alliance: 'Ocean Alliance',
    trackingUrl: 'https://www.evergreen-line.com/',
    website: 'https://www.evergreen-marine.com',
  },
  {
    id: 'hmm',
    rank: 8,
    code: 'HMMU',
    name: 'HMM Co., Ltd. (Hyundai Merchant Marine)',
    shortName: 'HMM',
    bicPrefixes: ['HMMU', 'HDMU', 'HNMU'],
    colorHex: '#b45309', // Crimson Amber
    darkHex: '#78350f',
    lightHex: '#fbbf24',
    textColor: '#ffffff',
    accentBadge: '#dc2626',
    country: 'South Korea',
    headquarters: 'Seoul, South Korea',
    alliance: 'Premier Alliance',
    trackingUrl: 'https://www.hmm21.com/',
    website: 'https://www.hmm21.com',
  },
  {
    id: 'yang_ming',
    rank: 9,
    code: 'YMLU',
    name: 'Yang Ming Marine Transport Corp.',
    shortName: 'Yang Ming',
    bicPrefixes: ['YMLU', 'YMMU'],
    colorHex: '#64748b', // Industrial Silver
    darkHex: '#334155',
    lightHex: '#94a3b8',
    textColor: '#0f172a',
    accentBadge: '#2563eb',
    country: 'Taiwan',
    headquarters: 'Keelung, Taiwan',
    alliance: 'Premier Alliance',
    trackingUrl: 'https://www.yangming.com/',
    website: 'https://www.yangming.com',
  },
  {
    id: 'zim',
    rank: 10,
    code: 'ZIMU',
    name: 'ZIM Integrated Shipping Services Ltd.',
    shortName: 'ZIM',
    bicPrefixes: ['ZIMU', 'ZCSU', 'ZCLU', 'ZGPU'],
    colorHex: '#0f766e', // Deep Teal
    darkHex: '#134e4a',
    lightHex: '#2dd4bf',
    textColor: '#ffffff',
    accentBadge: '#facc15',
    country: 'Israel',
    headquarters: 'Haifa, Israel',
    alliance: 'Standalone',
    trackingUrl: 'https://www.zim.com/tools/track-a-shipment',
    website: 'https://www.zim.com',
  },
  {
    id: 'wan_hai',
    rank: 11,
    code: 'WHLU',
    name: 'Wan Hai Lines Ltd.',
    shortName: 'Wan Hai',
    bicPrefixes: ['WHLU', 'WHPU', 'WACU'],
    colorHex: '#0369a1', // Ocean Cobalt Blue
    darkHex: '#0c4a6e',
    lightHex: '#38bdf8',
    textColor: '#ffffff',
    accentBadge: '#fbbf24',
    country: 'Taiwan',
    headquarters: 'Taipei, Taiwan',
    alliance: 'Independent',
    trackingUrl: 'https://www.wanhai.com/',
    website: 'https://www.wanhai.com',
  },
  {
    id: 'pil',
    rank: 12,
    code: 'PILU',
    name: 'Pacific International Lines (Pte) Ltd',
    shortName: 'PIL',
    bicPrefixes: ['PILU', 'PCIU', 'PABU', 'PDLU'],
    colorHex: '#b91c1c', // Ruby Crimson
    darkHex: '#7f1d1d',
    lightHex: '#f87171',
    textColor: '#ffffff',
    accentBadge: '#fef08a',
    country: 'Singapore',
    headquarters: 'Singapore',
    alliance: 'Independent',
    trackingUrl: 'https://www.pilship.com/',
    website: 'https://www.pilship.com',
  },
  {
    id: 'oocl',
    rank: 13,
    code: 'OOLU',
    name: 'Orient Overseas Container Line (OOCL)',
    shortName: 'OOCL',
    bicPrefixes: ['OOLU', 'OOCU'],
    colorHex: '#b91c1c', // OOCL Cardinal Red
    darkHex: '#7f1d1d',
    lightHex: '#f87171',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Hong Kong',
    headquarters: 'Hong Kong',
    alliance: 'Ocean Alliance',
    trackingUrl: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/',
    website: 'https://www.oocl.com',
  },
  {
    id: 'kmtc',
    rank: 14,
    code: 'KMTU',
    name: 'Korea Marine Transport Co., Ltd. (KMTC)',
    shortName: 'KMTC',
    bicPrefixes: ['KMTU', 'KMTC'],
    colorHex: '#1e3a8a', // Royal Indigo
    darkHex: '#172554',
    lightHex: '#60a5fa',
    textColor: '#ffffff',
    accentBadge: '#dc2626',
    country: 'South Korea',
    headquarters: 'Seoul, South Korea',
    alliance: 'Independent',
    trackingUrl: 'https://www.ekmtc.com/',
    website: 'https://www.ekmtc.com',
  },
  {
    id: 'sitc',
    rank: 15,
    code: 'SITU',
    name: 'SITC International Holdings Co., Ltd.',
    shortName: 'SITC',
    bicPrefixes: ['SITU', 'SNTU'],
    colorHex: '#1d4ed8', // Marine Blue
    darkHex: '#1e293b',
    lightHex: '#60a5fa',
    textColor: '#ffffff',
    accentBadge: '#f97316',
    country: 'Hong Kong / China',
    headquarters: 'Hong Kong / Qingdao, China',
    alliance: 'Independent',
    trackingUrl: 'https://www.sitc.com/',
    website: 'https://www.sitc.com',
  },
  {
    id: 'matson',
    rank: 16,
    code: 'MATU',
    name: 'Matson Navigation Company',
    shortName: 'Matson',
    bicPrefixes: ['MATU', 'MLIU', 'MNIU'],
    colorHex: '#0f172a', // Pacific Midnight Navy
    darkHex: '#020617',
    lightHex: '#334155',
    textColor: '#ffffff',
    accentBadge: '#f59e0b',
    country: 'United States',
    headquarters: 'Honolulu & Oakland, USA',
    alliance: 'Independent',
    trackingUrl: 'https://www.matson.com/track-shipment.html',
    website: 'https://www.matson.com',
  },
  {
    id: 'messina',
    rank: 17,
    code: 'MSFU',
    name: 'Ignazio Messina & C. S.p.A.',
    shortName: 'Messina Line',
    bicPrefixes: ['MSFU', 'LNXU', 'IGNU'],
    colorHex: '#991b1b', // Mediterranean Burgundy
    darkHex: '#450a0a',
    lightHex: '#ef4444',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Italy',
    headquarters: 'Genoa, Italy',
    alliance: 'Independent',
    trackingUrl: 'https://www.messinaline.it/',
    website: 'https://www.messinaline.it',
  },
  {
    id: 'grimaldi',
    rank: 18,
    code: 'GMNU',
    name: 'Grimaldi Group / Atlantic Container Line (ACL)',
    shortName: 'Grimaldi Lines',
    bicPrefixes: ['GMNU', 'ACLI', 'ACLU'],
    colorHex: '#ca8a04', // Grimaldi Gold
    darkHex: '#713f12',
    lightHex: '#fde047',
    textColor: '#0f172a',
    accentBadge: '#0f172a',
    country: 'Italy',
    headquarters: 'Naples, Italy',
    alliance: 'Independent',
    trackingUrl: 'https://www.grimaldi.napoli.it/',
    website: 'https://www.grimaldi-lines.com',
  },
  {
    id: 'arkas',
    rank: 19,
    code: 'ARKU',
    name: 'Arkas Container Transport S.A. (Arkas Line)',
    shortName: 'Arkas Line',
    bicPrefixes: ['ARKU', 'ARKX'],
    colorHex: '#0284c7', // Aegean Azure
    darkHex: '#075985',
    lightHex: '#38bdf8',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Turkey',
    headquarters: 'Izmir & Istanbul, Turkey',
    alliance: 'Independent',
    trackingUrl: 'https://www.arkasline.com.tr/',
    website: 'https://www.arkasline.com.tr',
  },
  {
    id: 'swire',
    rank: 20,
    code: 'SWIU',
    name: 'Swire Shipping Pte. Ltd. (The China Navigation Co.)',
    shortName: 'Swire Shipping',
    bicPrefixes: ['SWIU', 'CHNU', 'CNCO'],
    colorHex: '#dc2626', // Swire Red
    darkHex: '#7f1d1d',
    lightHex: '#f87171',
    textColor: '#ffffff',
    accentBadge: '#1e3a8a',
    country: 'Singapore / UK',
    headquarters: 'Singapore',
    alliance: 'Independent',
    trackingUrl: 'https://www.swireshipping.com/',
    website: 'https://www.swireshipping.com',
  },
  {
    id: 'sinokor',
    rank: 21,
    code: 'SKLU',
    name: 'Sinokor Merchant Marine Co., Ltd.',
    shortName: 'Sinokor',
    bicPrefixes: ['SKLU', 'SNKU'],
    colorHex: '#1e3a8a', // Sinokor Navy
    darkHex: '#172554',
    lightHex: '#60a5fa',
    textColor: '#ffffff',
    accentBadge: '#ef4444',
    country: 'South Korea',
    headquarters: 'Seoul, South Korea',
    alliance: 'Independent',
    trackingUrl: 'http://www.sinokor.co.kr/',
    website: 'http://www.sinokor.co.kr',
  },
  {
    id: 'ts_lines',
    rank: 22,
    code: 'TSLU',
    name: 'T.S. Lines Ltd.',
    shortName: 'TS Lines',
    bicPrefixes: ['TSLU', 'TSXU'],
    colorHex: '#1e40af', // Cobalt Blue
    darkHex: '#1e293b',
    lightHex: '#60a5fa',
    textColor: '#ffffff',
    accentBadge: '#f59e0b',
    country: 'Taiwan / Hong Kong',
    headquarters: 'Taipei & Hong Kong',
    alliance: 'Independent',
    trackingUrl: 'https://www.tslines.com/',
    website: 'https://www.tslines.com',
  },
  {
    id: 'unifeeder',
    rank: 23,
    code: 'UNIU',
    name: 'Unifeeder Group (DP World)',
    shortName: 'Unifeeder',
    bicPrefixes: ['UNIU', 'UFDU'],
    colorHex: '#0284c7', // Nordic Blue
    darkHex: '#0c4a6e',
    lightHex: '#38bdf8',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Denmark',
    headquarters: 'Aarhus, Denmark',
    alliance: 'Feeder Operator',
    trackingUrl: 'https://www.unifeeder.com/',
    website: 'https://www.unifeeder.com',
  },
  {
    id: 'sea_lead',
    rank: 24,
    code: 'SLSU',
    name: 'Sea Lead Shipping Pte Ltd',
    shortName: 'Sea Lead',
    bicPrefixes: ['SLSU', 'SEAU'],
    colorHex: '#0284c7', // Marine Azure
    darkHex: '#0369a1',
    lightHex: '#38bdf8',
    textColor: '#ffffff',
    accentBadge: '#f43f5e',
    country: 'Singapore / UAE',
    headquarters: 'Singapore & Dubai',
    alliance: 'Independent',
    trackingUrl: 'https://sea-lead.com/',
    website: 'https://sea-lead.com',
  },
  {
    id: 'corten_generic',
    code: 'CORTEN',
    name: 'Shipper Owned Container (SOC) / Corten Steel',
    shortName: 'SOC Corten',
    bicPrefixes: ['SOC', 'PRIV', 'XYZU', 'TOLU', 'TEXT'],
    colorHex: '#c2410c', // Corten Oxide Rust
    darkHex: '#7c2d12',
    lightHex: '#fb923c',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
    country: 'Global Fleet',
    headquarters: 'Global Fleet',
    alliance: 'Shipper Owned',
  },
];

/**
 * Detect shipping line carrier from container number, BIC prefix, or carrier string
 */
export function detectShippingLine(input?: string): ShippingLine | null {
  if (!input) return null;
  const raw = input.toUpperCase().trim().replace(/\s/g, '');

  // 1. Direct BIC Prefix check on 4-letter container prefix
  const prefix4 = raw.slice(0, 4);
  const prefix3 = raw.slice(0, 3);

  for (const line of SHIPPING_LINES) {
    if (line.bicPrefixes.some((p) => prefix4 === p || prefix4.startsWith(p) || raw.startsWith(p))) {
      return line;
    }
  }

  // 2. Carrier Name / Code fuzzy substring check
  for (const line of SHIPPING_LINES) {
    const cleanShort = line.shortName.toUpperCase().replace(/[\s\-_.]/g, '');
    const cleanName = line.name.toUpperCase().replace(/[\s\-_.]/g, '');
    const cleanCode = line.code.replace(/[\s\-_.]/g, '');
    const cleanId = line.id.toUpperCase().replace(/[\s\-_.]/g, '');

    if (
      raw.includes(cleanShort) ||
      raw.includes(cleanCode) ||
      raw.includes(cleanId) ||
      raw.includes(cleanName)
    ) {
      return line;
    }
  }

  // 3. Fallback prefix rules
  if (prefix3 === 'MSC' || prefix3 === 'MED' || prefix3 === 'TGH') return SHIPPING_LINES[0]; // MSC
  if (prefix3 === 'MAE' || prefix3 === 'MSK' || prefix3 === 'MRK' || prefix3 === 'SUD') return SHIPPING_LINES[1]; // Maersk
  if (prefix3 === 'CMA' || prefix3 === 'ANL' || prefix3 === 'APL' || prefix3 === 'CGM') return SHIPPING_LINES[2]; // CMA CGM
  if (prefix3 === 'COS' || prefix3 === 'CCL' || prefix3 === 'CSN') return SHIPPING_LINES[3]; // COSCO
  if (prefix3 === 'HLX' || prefix3 === 'HLC' || prefix3 === 'UAS') return SHIPPING_LINES[4]; // Hapag-Lloyd
  if (prefix3 === 'ONE' || prefix3 === 'KKF' || prefix3 === 'NYK' || prefix3 === 'MOL') return SHIPPING_LINES[5]; // ONE
  if (prefix3 === 'EGL' || prefix3 === 'EMC' || prefix3 === 'EIS') return SHIPPING_LINES[6]; // Evergreen
  if (prefix3 === 'HMM' || prefix3 === 'HDM') return SHIPPING_LINES[7]; // HMM
  if (prefix3 === 'YML' || prefix3 === 'YMM') return SHIPPING_LINES[8]; // Yang Ming
  if (prefix3 === 'ZIM' || prefix3 === 'ZCS') return SHIPPING_LINES[9]; // ZIM
  if (prefix3 === 'WHL' || prefix3 === 'WHP') return SHIPPING_LINES[10]; // Wan Hai
  if (prefix3 === 'PIL' || prefix3 === 'PCI') return SHIPPING_LINES[11]; // PIL
  if (prefix3 === 'OOL' || prefix3 === 'OOC') return SHIPPING_LINES[12]; // OOCL
  if (prefix3 === 'KMT') return SHIPPING_LINES[13]; // KMTC
  if (prefix3 === 'SIT' || prefix3 === 'SNT') return SHIPPING_LINES[14]; // SITC
  if (prefix3 === 'MAT' || prefix3 === 'MLI') return SHIPPING_LINES[15]; // Matson
  if (prefix3 === 'MSF' || prefix3 === 'LNX') return SHIPPING_LINES[16]; // Messina
  if (prefix3 === 'GMN' || prefix3 === 'ACL') return SHIPPING_LINES[17]; // Grimaldi
  if (prefix3 === 'ARK') return SHIPPING_LINES[18]; // Arkas
  if (prefix3 === 'SWI' || prefix3 === 'CHN') return SHIPPING_LINES[19]; // Swire
  if (prefix3 === 'SKL' || prefix3 === 'SNK') return SHIPPING_LINES[20]; // Sinokor
  if (prefix3 === 'TSL' || prefix3 === 'TSX') return SHIPPING_LINES[21]; // TS Lines

  return null;
}

export function getAllShippingLines(): ShippingLine[] {
  return SHIPPING_LINES;
}
