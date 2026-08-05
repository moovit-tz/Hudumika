/**
 * ISO 3166-1 alpha-2 codes used across the platform.
 *
 * workflow-resolver.service.ts matches these against the first two characters
 * of a shipment's origin/dest port (the UN/LOCODE country prefix), and the
 * declaration prefill resolves them out of free-text port names — so these
 * must stay real country codes, never free-text names.
 *
 * Lives here rather than in either app because both now read it: the clearance
 * workflow builder's targeting pickers and the API's declaration prefill. One
 * list, so a country added for one is available to the other.
 */
export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'TZ', name: 'Tanzania' }, { code: 'KE', name: 'Kenya' }, { code: 'UG', name: 'Uganda' },
  { code: 'RW', name: 'Rwanda' }, { code: 'BI', name: 'Burundi' }, { code: 'CD', name: 'DR Congo' },
  { code: 'ZM', name: 'Zambia' }, { code: 'MW', name: 'Malawi' }, { code: 'MZ', name: 'Mozambique' },
  { code: 'ZA', name: 'South Africa' }, { code: 'CN', name: 'China' }, { code: 'IN', name: 'India' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'TR', name: 'Turkey' },
  { code: 'SG', name: 'Singapore' }, { code: 'MY', name: 'Malaysia' }, { code: 'ID', name: 'Indonesia' },
  { code: 'JP', name: 'Japan' }, { code: 'KR', name: 'South Korea' }, { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'DE', name: 'Germany' }, { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' }, { code: 'IT', name: 'Italy' }, { code: 'FR', name: 'France' },
  { code: 'EG', name: 'Egypt' }, { code: 'BR', name: 'Brazil' }, { code: 'AU', name: 'Australia' },
  { code: 'ET', name: 'Ethiopia' }, { code: 'QA', name: 'Qatar' }, { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' }, { code: 'TH', name: 'Thailand' }, { code: 'VN', name: 'Vietnam' },
  { code: 'ES', name: 'Spain' }, { code: 'PT', name: 'Portugal' }, { code: 'PL', name: 'Poland' },
];

/** Alternates people actually type, mapped to the canonical name above. */
const ALIASES: Record<string, string> = {
  uae: 'AE', emirates: 'AE', usa: 'US', 'u.s.a': 'US', america: 'US',
  uk: 'GB', england: 'GB', britain: 'GB', holland: 'NL',
  drc: 'CD', congo: 'CD', korea: 'KR', 'rsa': 'ZA',
};

/**
 * Resolves a country code from a free-text port string like
 * "Shanghai, China" or "Dar es Salaam Port".
 *
 * Returns null when it cannot tell — deliberately. A declaration's
 * country_of_export is a legal statement on a customs entry, and a plausible
 * guess that happens to be wrong is worse than an empty field the filer has to
 * complete. Callers surface the nulls as "needs your input" rather than
 * defaulting them.
 */
export function countryCodeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;

  const bare = t.toUpperCase();

  // An explicit 2-letter code.
  if (/^[A-Z]{2}$/.test(bare) && COUNTRIES.some((c) => c.code === bare)) return bare;

  // A UN/LOCODE — "TZDAR", "AEJEA", "SGSIN". The first two characters are the
  // country by definition of the standard, which is the same assumption
  // workflow-resolver.service.ts already makes when it slices(0, 2) a port to
  // match a workflow's origin/destination targeting. This is how ports are
  // actually stored on shipment_cases, so without it the common case resolves
  // to nothing.
  if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(bare)) {
    const prefix = bare.slice(0, 2);
    const known = COUNTRIES.find((c) => c.code === prefix);
    // Unknown prefix means the list is missing that country, not that the code
    // is wrong — still safer to hand it to the filer than to invent one.
    if (known) return known.code;
    return null;
  }

  const lower = t.toLowerCase();

  // Full country name appearing anywhere ("Shanghai, China"). Longest name
  // first so "South Africa" is not shadowed by a shorter substring match.
  const byName = [...COUNTRIES]
    .sort((a, b) => b.name.length - a.name.length)
    .find((c) => new RegExp(`\\b${c.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower));
  if (byName) return byName.code;

  for (const [alias, code] of Object.entries(ALIASES)) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) return code;
  }

  return null;
}
