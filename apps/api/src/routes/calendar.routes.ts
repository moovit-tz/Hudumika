/**
 * The tenant's working calendar, for every app rather than for NexusHR alone.
 *
 * Holidays were an HR list. But the question "is the country open that day?"
 * belongs to almost every app here: ClearOS should not promise a clearance on
 * Eid, demurrage runs on calendar days while free time is counted in working
 * ones, SEAL cannot schedule a collection when the yard is shut, and Tasks
 * should not fall due on Christmas.
 *
 * Each of those apps computing it separately is how they end up disagreeing —
 * and the one that hardcodes a weekend as Saturday-Sunday gets the Gulf wrong
 * the first time a tenant operates there. So it is answered once here.
 */
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { HolidaysService } from '../services/holidays.service.js';
import { workingDaysBetween } from '../services/holiday-calendar.service.js';

function isoDate(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v ?? '').slice(0, 10);
}

const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function calendarRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * Every day in a range that the business is closed, and why.
   *
   * Deliberately returns the reason alongside the date. An app that only
   * receives a list of dates cannot tell a user *why* their delivery slipped,
   * and "the 27th is not available" is a worse answer than "the 27th is Eid".
   */
  fastify.get('/non-working-days', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const from = isoDate(q.from), to = isoDate(q.to);
    if (!isISO(from) || !isISO(to)) {
      return reply.status(400).send({ error: 'from and to are required, as YYYY-MM-DD' });
    }
    if (to < from) return reply.status(400).send({ error: 'to cannot be before from' });

    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_holidays')
        .select(['date', 'name', 'local_name', 'country', 'category', 'is_provisional'])
        .where('tenant_id', '=', user.tenant_id)
        .where('is_working_day', '=', false)
        .where('date', '>=', from as any).where('date', '<=', to as any)
        .orderBy('date').execute();

      return {
        from, to,
        holidays: rows.map(r => ({
          date: isoDate(r.date), name: r.name, local_name: r.local_name ?? undefined,
          country: r.country ?? undefined, category: r.category,
          // Carried through so a consuming app can show that a date might move
          // rather than presenting a moon-dependent holiday as settled.
          is_provisional: r.is_provisional,
        })),
        weekend: [0, 6],
      };
    });
  });

  /**
   * How many working days a range actually contains.
   *
   * The one call an app needs to answer "when is this due?" without
   * reimplementing the calendar. Leave already uses the same helper, so an SLA
   * and a leave request cannot disagree about whether Friday was a holiday.
   */
  fastify.get('/working-days', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const from = isoDate(q.from), to = isoDate(q.to);
    if (!isISO(from) || !isISO(to)) {
      return reply.status(400).send({ error: 'from and to are required, as YYYY-MM-DD' });
    }
    if (to < from) return reply.status(400).send({ error: 'to cannot be before from' });

    const closed = await HolidaysService.nonWorkingDates(user.tenant_id, from, to);
    const { days, excluded } = workingDaysBetween(from, to, closed);
    const calendarDays = Math.round(
      (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000,
    ) + 1;

    return {
      from, to,
      working_days: days,
      calendar_days: calendarDays,
      // Both, because demurrage counts calendar days while free time is counted
      // in working ones, and an app that receives only one of them will use the
      // wrong one.
      excluded,
    };
  });
}
