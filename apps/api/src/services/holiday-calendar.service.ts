/**
 * The holidays a public-holiday API does not give you.
 *
 * The provider used for the sync returns no Islamic holidays for Tanzania —
 * verified against it directly: 13 entries for 2026, none of them Eid al-Fitr,
 * Eid al-Adha or Maulid, all three gazetted. Those are days the country is
 * closed, so without them people are marked absent and have leave deducted for
 * not attending work nobody was doing.
 *
 * They are computed here instead, from the tabular Islamic calendar. The
 * algorithm reproduced nine known observed dates exactly (Eid al-Fitr, Eid
 * al-Adha and Maulid across 1445–1448 AH), which is good enough to plan a year
 * against. It is not good enough to state as fact: observance follows the
 * sighting of the moon and is announced locally, so a date can still move by a
 * day. Everything computed here is therefore marked provisional, and the UI
 * says so. A date that admits it might move gets corrected; one that claims
 * certainty gets trusted and quietly ruins somebody's month.
 */

export type HolidayCategory = 'PUBLIC' | 'RELIGIOUS' | 'INTERNATIONAL' | 'COMPANY';

export interface CalendarHoliday {
  date: string;            // YYYY-MM-DD
  name: string;
  localName?: string;
  category: HolidayCategory;
  /** The date may shift by a day when it is actually observed. */
  isProvisional: boolean;
  /** False means a day off. True means "worth noting, still a working day". */
  isWorkingDay: boolean;
}

// ── Calendar conversion ────────────────────────────────────────────────────

/** Tabular ("Kuwaiti") Islamic calendar to Julian Day Number. */
function islamicToJD(year: number, month: number, day: number): number {
  return Math.floor((11 * year + 3) / 30) + 354 * year + 30 * month
    - Math.floor((month - 1) / 2) + day + 1948440 - 385;
}

function jdToISO(jd: number): string {
  let l = jd + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  const p = (v: number) => String(v).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
}

/** Which Islamic years can overlap a given Gregorian year. */
function islamicYearsTouching(gregorianYear: number): number[] {
  const approx = Math.floor((gregorianYear - 622) * (33 / 32));
  return [approx - 1, approx, approx + 1];
}

/**
 * Gregorian dates of the Islamic public holidays observed in East Africa.
 *
 * Eid al-Fitr runs to a second day in Tanzania and Kenya, which is why it is
 * emitted twice — a single day would leave people short exactly one day.
 */
function islamicHolidaysFor(gregorianYear: number): CalendarHoliday[] {
  const out: CalendarHoliday[] = [];
  const add = (date: string, name: string, localName?: string) => {
    if (date.startsWith(String(gregorianYear))) {
      out.push({ date, name, localName, category: 'RELIGIOUS', isProvisional: true, isWorkingDay: false });
    }
  };

  for (const ah of islamicYearsTouching(gregorianYear)) {
    // 1 Shawwal, and the day after.
    const fitr = islamicToJD(ah, 10, 1);
    add(jdToISO(fitr), 'Eid al-Fitr', 'Idd El Fitri');
    add(jdToISO(fitr + 1), 'Eid al-Fitr (second day)', 'Idd El Fitri');
    // 10 Dhu al-Hijjah.
    add(jdToISO(islamicToJD(ah, 12, 10)), 'Eid al-Adha', 'Idd El Hajj');
    // 12 Rabi' al-Awwal.
    add(jdToISO(islamicToJD(ah, 3, 12)), 'Maulid', 'Maulid Day');
  }

  // Two Islamic years can both project a date into one Gregorian year; keep one.
  const seen = new Set<string>();
  return out.filter(h => {
    const key = `${h.date}|${h.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** Countries whose gazetted public holidays include the Islamic ones above. */
const ISLAMIC_PUBLIC_HOLIDAY_COUNTRIES = new Set([
  'TZ', 'KE', 'UG', 'ET', 'NG', 'GH', 'SN', 'ML', 'NE', 'BF', 'GM', 'SL', 'KM', 'DJ', 'SO',
  'EG', 'MA', 'DZ', 'TN', 'LY', 'SD', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'JO', 'MY', 'ID', 'PK', 'BD',
]);

// ── International observances ──────────────────────────────────────────────

/**
 * Days worth showing on a company calendar that are *not* days off.
 *
 * Kept separate and flagged as working days on purpose. Marking them as
 * holidays would credit everyone a day's leave for International Women's Day,
 * which no employer intends and no ministry gazetted.
 */
const INTERNATIONAL_OBSERVANCES: { md: string; name: string }[] = [
  { md: '02-04', name: 'World Cancer Day' },
  { md: '03-08', name: "International Women's Day" },
  { md: '03-21', name: 'International Day for the Elimination of Racial Discrimination' },
  { md: '03-22', name: 'World Water Day' },
  { md: '04-07', name: 'World Health Day' },
  { md: '04-22', name: 'Earth Day' },
  { md: '05-03', name: 'World Press Freedom Day' },
  { md: '05-25', name: 'Africa Day' },
  { md: '06-01', name: 'International Day for Protection of Children' },
  { md: '06-05', name: 'World Environment Day' },
  { md: '06-16', name: 'Day of the African Child' },
  { md: '06-20', name: 'World Refugee Day' },
  { md: '08-12', name: 'International Youth Day' },
  { md: '09-21', name: 'International Day of Peace' },
  { md: '10-01', name: 'International Day of Older Persons' },
  { md: '10-10', name: 'World Mental Health Day' },
  { md: '10-24', name: 'United Nations Day' },
  { md: '11-25', name: 'International Day for the Elimination of Violence against Women' },
  { md: '12-01', name: 'World AIDS Day' },
  { md: '12-10', name: 'Human Rights Day' },
];

function internationalFor(year: number): CalendarHoliday[] {
  return INTERNATIONAL_OBSERVANCES.map(o => ({
    date: `${year}-${o.md}`,
    name: o.name,
    category: 'INTERNATIONAL' as const,
    isProvisional: false,
    // Observed, not taken off.
    isWorkingDay: true,
  }));
}

/**
 * Everything this service can contribute for a country and year, over and above
 * what the public-holiday provider returns.
 */
export function computedHolidays(
  countryCode: string,
  year: number,
  opts: { includeInternational?: boolean } = {},
): CalendarHoliday[] {
  const cc = countryCode.toUpperCase();
  const out: CalendarHoliday[] = [];
  if (ISLAMIC_PUBLIC_HOLIDAY_COUNTRIES.has(cc)) out.push(...islamicHolidaysFor(year));
  if (opts.includeInternational) out.push(...internationalFor(year));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Working days ───────────────────────────────────────────────────────────

/**
 * Working days between two dates, inclusive, excluding weekends and days off.
 *
 * This is the link that makes a holiday calendar worth having. Leave days were
 * whatever the client sent, so a request spanning Easter consumed five days of
 * someone's annual entitlement when two of them were public holidays and one
 * was a Sunday. The employee pays for that error, which is why it is computed
 * on the server and not trusted from the request.
 *
 * `holidayDates` should contain only genuine days off — an international
 * observance is a working day and must not be in it.
 */
export function workingDaysBetween(
  fromISO: string,
  toISO: string,
  holidayDates: Set<string>,
  weekend: number[] = [0, 6],
): { days: number; excluded: { date: string; reason: string }[] } {
  const from = new Date(fromISO + 'T00:00:00Z');
  const to = new Date(toISO + 'T00:00:00Z');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return { days: 0, excluded: [] };
  }
  let days = 0;
  const excluded: { date: string; reason: string }[] = [];
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (weekend.includes(d.getUTCDay())) { excluded.push({ date: iso, reason: 'weekend' }); continue; }
    if (holidayDates.has(iso)) { excluded.push({ date: iso, reason: 'public holiday' }); continue; }
    days++;
  }
  return { days, excluded };
}
