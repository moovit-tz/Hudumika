export interface ContainerColorPalette {
  id: string;
  carrier: string;
  name: string;
  primary: string;       // Front/side wall base
  dark: string;          // Shadow/corner castings
  light: string;         // Top roof highlight
  roofGradStart: string;
  roofGradEnd: string;
  textColor: string;     // Door and side decal text
  accentBadge: string;
}

export const CARRIER_CONTAINER_COLORS: Record<string, ContainerColorPalette> = {
  MSC: {
    id: 'msc',
    carrier: 'MSC (Mediterranean Shipping Company)',
    name: 'MSC Marine Navy',
    primary: '#1d4ed8',
    dark: '#0f2c69',
    light: '#3b82f6',
    roofGradStart: '#2563eb',
    roofGradEnd: '#173f8a',
    textColor: '#ffffff',
    accentBadge: '#fdb913',
  },
  MAERSK: {
    id: 'maersk',
    carrier: 'Maersk Line',
    name: 'Maersk Sky Cyan',
    primary: '#0284c7',
    dark: '#034a6e',
    light: '#38bdf8',
    roofGradStart: '#0ea5e9',
    roofGradEnd: '#025985',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
  },
  CMA_CGM: {
    id: 'cma_cgm',
    carrier: 'CMA CGM',
    name: 'CMA CGM Royal Navy',
    primary: '#1e3a8a',
    dark: '#0f1f4b',
    light: '#3b82f6',
    roofGradStart: '#2563eb',
    roofGradEnd: '#172554',
    textColor: '#ffffff',
    accentBadge: '#dc2626',
  },
  COSCO: {
    id: 'cosco',
    carrier: 'COSCO SHIPPING Lines',
    name: 'COSCO Pacific Ultramarine',
    primary: '#1e40af',
    dark: '#172554',
    light: '#60a5fa',
    roofGradStart: '#3b82f6',
    roofGradEnd: '#1e3a8a',
    textColor: '#ffffff',
    accentBadge: '#facc15',
  },
  HAPAG_LLOYD: {
    id: 'hapag_lloyd',
    carrier: 'Hapag-Lloyd',
    name: 'Hapag High-Vis Orange',
    primary: '#ea580c',
    dark: '#7c2d12',
    light: '#fb923c',
    roofGradStart: '#f97316',
    roofGradEnd: '#9a3412',
    textColor: '#ffffff',
    accentBadge: '#fef08a',
  },
  ONE: {
    id: 'one',
    carrier: 'Ocean Network Express (ONE)',
    name: 'ONE Cherry Magenta',
    primary: '#db2777',
    dark: '#831843',
    light: '#f472b6',
    roofGradStart: '#ec4899',
    roofGradEnd: '#9d174d',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
  },
  EVERGREEN: {
    id: 'evergreen',
    carrier: 'Evergreen Marine',
    name: 'Evergreen Forest Jade',
    primary: '#15803d',
    dark: '#14532d',
    light: '#4ade80',
    roofGradStart: '#22c55e',
    roofGradEnd: '#166534',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
  },
  HMM: {
    id: 'hmm',
    carrier: 'HMM (Hyundai Merchant Marine)',
    name: 'HMM Crimson Amber',
    primary: '#b45309',
    dark: '#78350f',
    light: '#fbbf24',
    roofGradStart: '#d97706',
    roofGradEnd: '#92400e',
    textColor: '#ffffff',
    accentBadge: '#dc2626',
  },
  YANG_MING: {
    id: 'yang_ming',
    carrier: 'Yang Ming Marine',
    name: 'Yang Ming Industrial Silver',
    primary: '#64748b',
    dark: '#334155',
    light: '#94a3b8',
    roofGradStart: '#cbd5e1',
    roofGradEnd: '#475569',
    textColor: '#0f172a',
    accentBadge: '#2563eb',
  },
  ZIM: {
    id: 'zim',
    carrier: 'ZIM Integrated Shipping',
    name: 'ZIM Deep Teal',
    primary: '#0f766e',
    dark: '#134e4a',
    light: '#2dd4bf',
    roofGradStart: '#14b8a6',
    roofGradEnd: '#115e59',
    textColor: '#ffffff',
    accentBadge: '#facc15',
  },
  WAN_HAI: {
    id: 'wan_hai',
    carrier: 'Wan Hai Lines',
    name: 'Wan Hai Ocean Cobalt',
    primary: '#0369a1',
    dark: '#0c4a6e',
    light: '#38bdf8',
    roofGradStart: '#0284c7',
    roofGradEnd: '#075985',
    textColor: '#ffffff',
    accentBadge: '#fbbf24',
  },
  PIL: {
    id: 'pil',
    carrier: 'Pacific International Lines (PIL)',
    name: 'PIL Ruby Crimson',
    primary: '#b91c1c',
    dark: '#7f1d1d',
    light: '#f87171',
    roofGradStart: '#dc2626',
    roofGradEnd: '#991b1b',
    textColor: '#ffffff',
    accentBadge: '#fef08a',
  },
  OOCL: {
    id: 'oocl',
    carrier: 'Orient Overseas Container Line (OOCL)',
    name: 'OOCL Cardinal Red',
    primary: '#b91c1c',
    dark: '#7f1d1d',
    light: '#f87171',
    roofGradStart: '#dc2626',
    roofGradEnd: '#881337',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
  },
  KMTC: {
    id: 'kmtc',
    carrier: 'Korea Marine Transport (KMTC)',
    name: 'KMTC Royal Indigo',
    primary: '#1e3a8a',
    dark: '#172554',
    light: '#60a5fa',
    roofGradStart: '#2563eb',
    roofGradEnd: '#1e293b',
    textColor: '#ffffff',
    accentBadge: '#dc2626',
  },
  SITC: {
    id: 'sitc',
    carrier: 'SITC International',
    name: 'SITC Marine Cobalt',
    primary: '#1d4ed8',
    dark: '#1e293b',
    light: '#60a5fa',
    roofGradStart: '#3b82f6',
    roofGradEnd: '#1e3a8a',
    textColor: '#ffffff',
    accentBadge: '#f97316',
  },
  MATSON: {
    id: 'matson',
    carrier: 'Matson Navigation',
    name: 'Matson Midnight Navy',
    primary: '#0f172a',
    dark: '#020617',
    light: '#334155',
    roofGradStart: '#1e293b',
    roofGradEnd: '#0f172a',
    textColor: '#ffffff',
    accentBadge: '#f59e0b',
  },
  MESSINA: {
    id: 'messina',
    carrier: 'Messina Line',
    name: 'Messina Mediterranean Burgundy',
    primary: '#991b1b',
    dark: '#450a0a',
    light: '#ef4444',
    roofGradStart: '#b91c1c',
    roofGradEnd: '#7f1d1d',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
  },
  REEFER_WHITE: {
    id: 'reefer_white',
    carrier: 'Refrigerated Cargo (Reefer Cold Chain)',
    name: 'Thermal Arctic White',
    primary: '#f1f5f9',
    dark: '#94a3b8',
    light: '#ffffff',
    roofGradStart: '#ffffff',
    roofGradEnd: '#cbd5e1',
    textColor: '#0f172a',
    accentBadge: '#0284c7',
  },
  CORTEN_RUST: {
    id: 'corten_generic',
    carrier: 'Shipper Owned (SOC) / Corten Steel',
    name: 'Corten Oxide Rust',
    primary: '#c2410c',
    dark: '#7c2d12',
    light: '#fb923c',
    roofGradStart: '#ea580c',
    roofGradEnd: '#9a3412',
    textColor: '#ffffff',
    accentBadge: '#ffffff',
  },
  UNBRANDED: {
    id: 'unbranded',
    carrier: 'Unbranded Container',
    name: 'Standard Industrial Steel',
    primary: '#64748b',
    dark: '#334155',
    light: '#94a3b8',
    roofGradStart: '#475569',
    roofGradEnd: '#1e293b',
    textColor: '#ffffff',
    accentBadge: '#94a3b8',
  },
};

/**
 * Automatically determine container color from container prefix, carrier name, or custom hex
 */
export function getContainerColor(
  containerNumber?: string,
  carrierName?: string,
  customColorHex?: string
): ContainerColorPalette {
  if (customColorHex) {
    return {
      id: 'custom',
      carrier: 'Custom Defined Carrier',
      name: 'Custom Container Paint',
      primary: customColorHex,
      dark: '#0f172a',
      light: '#ffffff',
      roofGradStart: customColorHex,
      roofGradEnd: '#1e293b',
      textColor: '#ffffff',
      accentBadge: '#facc15',
    };
  }

  const num = (containerNumber || '').toUpperCase().trim();
  const carrier = (carrierName || '').toUpperCase().trim();

  // If no container number and no carrier specified, return clean unbranded container
  if (!num && !carrier) {
    return CARRIER_CONTAINER_COLORS.UNBRANDED;
  }

  if (num.startsWith('MSC') || num.startsWith('MED') || num.startsWith('TGH') || carrier.includes('MSC')) {
    return CARRIER_CONTAINER_COLORS.MSC;
  }
  if (num.startsWith('MAE') || num.startsWith('MSK') || num.startsWith('SUD') || num.startsWith('MRK') || carrier.includes('MAERSK')) {
    return CARRIER_CONTAINER_COLORS.MAERSK;
  }
  if (num.startsWith('CMA') || num.startsWith('ANL') || num.startsWith('APL') || carrier.includes('CMA')) {
    return CARRIER_CONTAINER_COLORS.CMA_CGM;
  }
  if (num.startsWith('COS') || num.startsWith('CCL') || num.startsWith('CSN') || carrier.includes('COSCO')) {
    return CARRIER_CONTAINER_COLORS.COSCO;
  }
  if (num.startsWith('HLX') || num.startsWith('HLC') || num.startsWith('UAS') || carrier.includes('HAPAG')) {
    return CARRIER_CONTAINER_COLORS.HAPAG_LLOYD;
  }
  if (num.startsWith('ONE') || num.startsWith('KKF') || num.startsWith('NYK') || num.startsWith('MOL') || carrier.includes('ONE')) {
    return CARRIER_CONTAINER_COLORS.ONE;
  }
  if (num.startsWith('EGL') || num.startsWith('EMC') || num.startsWith('EIS') || carrier.includes('EVERGREEN')) {
    return CARRIER_CONTAINER_COLORS.EVERGREEN;
  }
  if (num.startsWith('HMM') || num.startsWith('HDM') || carrier.includes('HMM')) {
    return CARRIER_CONTAINER_COLORS.HMM;
  }
  if (num.startsWith('YML') || carrier.includes('YANG MING')) {
    return CARRIER_CONTAINER_COLORS.YANG_MING;
  }
  if (num.startsWith('ZIM') || num.startsWith('ZCS') || carrier.includes('ZIM')) {
    return CARRIER_CONTAINER_COLORS.ZIM;
  }
  if (num.startsWith('WHL') || num.startsWith('WHP') || carrier.includes('WAN HAI')) {
    return CARRIER_CONTAINER_COLORS.WAN_HAI;
  }
  if (num.startsWith('PIL') || num.startsWith('PCI') || carrier.includes('PIL')) {
    return CARRIER_CONTAINER_COLORS.PIL;
  }
  if (num.startsWith('OOL') || num.startsWith('OOC') || carrier.includes('OOCL')) {
    return CARRIER_CONTAINER_COLORS.OOCL;
  }
  if (num.startsWith('KMT') || carrier.includes('KMTC')) {
    return CARRIER_CONTAINER_COLORS.KMTC;
  }
  if (num.startsWith('SIT') || num.startsWith('SNT') || carrier.includes('SITC')) {
    return CARRIER_CONTAINER_COLORS.SITC;
  }
  if (num.startsWith('MAT') || num.startsWith('MLI') || carrier.includes('MATSON')) {
    return CARRIER_CONTAINER_COLORS.MATSON;
  }
  if (num.startsWith('MSF') || num.startsWith('LNX') || carrier.includes('MESSINA')) {
    return CARRIER_CONTAINER_COLORS.MESSINA;
  }
  if (num.includes('REEF') || num.startsWith('TRI') || num.startsWith('SEGU') || carrier.includes('REEFER')) {
    return CARRIER_CONTAINER_COLORS.REEFER_WHITE;
  }

  return CARRIER_CONTAINER_COLORS.UNBRANDED;
}
