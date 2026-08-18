/**
 * Filling a tenant's holiday calendar for the country it operates in.
 *
 * The previous version reported success whenever it finished. An unmapped
 * country, a non-200 from the provider and a thrown network error were all
 * `continue`, so a sync that fetched nothing at all returned 0 and the UI said
 * "synchronized successfully". A calendar that is silently empty is worse than
 * one that is obviously empty, because nobody goes looking.
 *
 * This one reports what it actually did, per country and per year, and says so
 * when it could not reach the provider. It also never touches a row a person
 * entered by hand — see the note on MANUAL below.
 */
import { withTenant } from '../db/client.js';
import { computedHolidays } from './holiday-calendar.service.js';

/** Free-text country names seen in tenant location records. */
const COUNTRY_CODE_MAP: Record<string, string> = {
  'tanzania': 'TZ', 'kenya': 'KE', 'uganda': 'UG', 'rwanda': 'RW', 'burundi': 'BI',
  'zambia': 'ZM', 'malawi': 'MW', 'mozambique': 'MZ', 'ethiopia': 'ET',
  'south africa': 'ZA', 'ghana': 'GH', 'nigeria': 'NG', 'democratic republic of the congo': 'CD',
  'united states': 'US', 'united kingdom': 'GB', 'united arab emirates': 'AE', 'india': 'IN', 'china': 'CN',
};

function toCountryCode(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_CODE_MAP[s.toLowerCase()] ?? null;
}

export interface SyncReport {
  countries: string[];
  years: number[];
  added: number;
  updated: number;
  /** Rows left alone because a person entered them. */
  preservedManual: number;
  /** Islamic holidays the provider does not return, computed instead. */
  computed: number;
  /** Anything that did not work, in words. Empty means nothing went wrong. */
  problems: string[];
  /** True only if at least one holiday actually landed. */
  ok: boolean;
}

/** Which countries this tenant operates in, and how we know. */
async function resolveCountries(tenantId: string): Promise<{ codes: string[]; problems: string[] }> {
  const problems: string[] = [];

  return withTenant(tenantId, async (trx) => {
    const tenant = await trx.selectFrom('tenants').select(['country', 'name'])
      .where('id', '=', tenantId).executeTakeFirst();
    const declared = toCountryCode(tenant?.country);
    if (declared) return { codes: [declared], problems };

    // Fall back to wherever the tenant has locations.
    const rows = await trx.selectFrom('locations').select('country').distinct()
      .where('tenant_id', '=', tenantId).execute();

    const codes: string[] = [];
    for (const r of rows) {
      const code = toCountryCode(r.country);
      // Named rather than skipped: an unrecognised country is the single most
      // likely reason a calendar comes back empty, and the tenant can fix it.
      if (code) { if (!codes.includes(code)) codes.push(code); }
      else if (r.country) problems.push(`Location country "${r.country}" is not a country this sync recognises.`);
    }
    return { codes, problems };
  });
}

export const HolidaysService = {
  /**
   * @param years defaults to this year and next. Next year matters: leave is
   *        planned across a year boundary, and a calendar that stops on 31
   *        December is useless every December.
   */
  async syncTenantHolidays(
    tenantId: string,
    opts: { years?: number[]; includeInternational?: boolean } = {},
  ): Promise<SyncReport> {
    const thisYear = new Date().getFullYear();
    const years = opts.years ?? [thisYear, thisYear + 1];
    const { codes, problems } = await resolveCountries(tenantId);

    const report: SyncReport = {
      countries: codes, years, added: 0, updated: 0,
      preservedManual: 0, computed: 0, problems, ok: false,
    };

    if (codes.length === 0) {
      report.problems.push(
        'No country is set for this tenant and none could be read from its locations. '
        + 'Set the country on the tenant before syncing — guessing would fill the calendar with the wrong country\'s holidays.',
      );
      return report;
    }

    for (const code of codes) {
      for (const year of years) {
        const incoming: {
          date: string; name: string; localName?: string;
          category: string; isProvisional: boolean; isWorkingDay: boolean; source: string;
        }[] = [];

        // 1. The provider: fixed-date and Easter-derived holidays.
        try {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`, {
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const rows: any[] = await res.json();
            for (const h of rows) {
              incoming.push({
                date: String(h.date), name: String(h.name), localName: h.localName ?? undefined,
                category: 'PUBLIC', isProvisional: false, isWorkingDay: false, source: 'SYNCED',
              });
            }
          } else if (res.status === 404) {
            report.problems.push(`The holiday provider has no calendar for ${code} in ${year}.`);
          } else {
            report.problems.push(`The holiday provider returned ${res.status} for ${code} ${year}.`);
          }
        } catch (err: any) {
          const why = err?.name === 'TimeoutError' ? 'timed out' : (err?.message ?? 'failed');
          report.problems.push(`Could not reach the holiday provider for ${code} ${year} (${why}).`);
        }

        // 2. What the provider omits. Verified: it returns no Islamic holidays
        //    for Tanzania, though Eid and Maulid are gazetted public holidays.
        for (const h of computedHolidays(code, year, { includeInternational: opts.includeInternational })) {
          incoming.push({ ...h, source: 'COMPUTED' });
          report.computed++;
        }

        await withTenant(tenantId, async (trx) => {
          for (const h of incoming) {
            const existing = await trx.selectFrom('hr_holidays').select(['id', 'source'])
              .where('tenant_id', '=', tenantId).where('date', '=', h.date as any)
              .where('name', '=', h.name).executeTakeFirst();

            if (existing) {
              // A day the tenant entered itself is theirs. Overwriting it — which
              // the previous upsert did, name and type both — destroys data the
              // sync did not create and cannot recreate.
              if (existing.source === 'MANUAL') { report.preservedManual++; continue; }
              await trx.updateTable('hr_holidays').set({
                local_name: h.localName ?? null, type: h.isWorkingDay ? 'Observance' : 'Public',
                country: code, category: h.category, is_provisional: h.isProvisional,
                is_working_day: h.isWorkingDay, source: h.source, synced_at: new Date(),
              } as any).where('id', '=', existing.id).execute();
              report.updated++;
            } else {
              await trx.insertInto('hr_holidays').values({
                tenant_id: tenantId, date: h.date, name: h.name, local_name: h.localName ?? null,
                type: h.isWorkingDay ? 'Observance' : 'Public', country: code, category: h.category,
                is_provisional: h.isProvisional, is_working_day: h.isWorkingDay,
                source: h.source, synced_at: new Date(),
              } as any).execute();
              report.added++;
            }
          }
        });
      }
    }

    // Success means holidays exist afterwards, not that the loop finished.
    report.ok = report.added + report.updated > 0;
    if (!report.ok && report.problems.length === 0) {
      report.problems.push('The sync completed but no holidays were returned for any country or year.');
    }
    return report;
  },

  /** The dates a tenant is actually closed, for leave and attendance maths. */
  async nonWorkingDates(tenantId: string, fromISO: string, toISO: string): Promise<Set<string>> {
    const rows = await withTenant(tenantId, trx => trx.selectFrom('hr_holidays').select('date')
      .where('tenant_id', '=', tenantId)
      .where('is_working_day', '=', false)
      .where('date', '>=', fromISO as any).where('date', '<=', toISO as any)
      .execute());
    return new Set(rows.map(r => {
      const d = r.date as any;
      if (d instanceof Date) {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      }
      return String(d).slice(0, 10);
    }));
  },
};
