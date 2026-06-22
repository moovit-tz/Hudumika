import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

export async function hrRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Departments ───────────────────────────────────────────────

  fastify.get('/departments', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx
        .selectFrom('hr_departments as d')
        .leftJoin('users as u', 'u.id', 'd.head_user_id')
        .select([
          'd.id', 'd.name', 'd.status', 'd.created_at',
          'u.name as head_name',
        ])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.name')
        .execute();
      return rows.map(r => ({ ...r, employee_count: 0 }));
    });
  });

  fastify.post('/departments', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_departments').values({
        tenant_id: user.tenant_id,
        name: body.name,
        head_user_id: body.head_user_id || null,
        status: body.status || 'ACTIVE',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/departments/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.name !== undefined)         allowed.name = body.name;
      if (body.head_user_id !== undefined) allowed.head_user_id = body.head_user_id;
      if (body.status !== undefined)       allowed.status = body.status;
      allowed.updated_at = new Date();
      return trx.updateTable('hr_departments').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/departments/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_departments')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Designations ──────────────────────────────────────────────

  fastify.get('/designations', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_designations as d')
        .leftJoin('hr_departments as dept', 'dept.id', 'd.department_id')
        .select(['d.id', 'd.title', 'd.created_at', 'dept.name as department_name'])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.title')
        .execute();
    });
  });

  fastify.post('/designations', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_designations').values({
        tenant_id: user.tenant_id,
        title: body.title,
        department_id: body.department_id || null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/designations/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_designations')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Shifts ────────────────────────────────────────────────────

  fastify.get('/shifts', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_shifts')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('start_time')
        .execute();
    });
  });

  fastify.post('/shifts', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_shifts').values({
        tenant_id: user.tenant_id,
        name: body.name,
        start_time: body.start_time,
        end_time: body.end_time,
        break_minutes: Number(body.break_minutes) || 0,
        color: body.color || '#0891b2',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/shifts/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_shifts')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Shift Assignments ─────────────────────────────────────────

  fastify.get('/shift-assignments', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_shift_assignments as sa')
        .innerJoin('users as u', 'u.id', 'sa.user_id')
        .innerJoin('hr_shifts as s', 's.id', 'sa.shift_id')
        .select([
          'sa.id', 'sa.user_id', 'sa.shift_id', 'sa.date',
          'u.name as user_name',
          's.name as shift_name', 's.start_time', 's.end_time', 's.color',
        ])
        .where('sa.tenant_id', '=', user.tenant_id);
      if (q.from) query = query.where('sa.date', '>=', q.from);
      if (q.to)   query = query.where('sa.date', '<=', q.to);
      return query.orderBy('sa.date').execute();
    });
  });

  fastify.post('/shift-assignments', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_shift_assignments')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('date', '=', body.date)
        .execute();
      if (body.shift_id) {
        return trx.insertInto('hr_shift_assignments').values({
          tenant_id: user.tenant_id,
          user_id: body.user_id,
          shift_id: body.shift_id,
          date: body.date,
        }).returningAll().executeTakeFirstOrThrow();
      }
      return { ok: true };
    });
  });

  // ── Attendance ────────────────────────────────────────────────

  fastify.get('/attendance', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_attendance as a')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .select([
          'a.id', 'a.user_id', 'a.date', 'a.status',
          'a.clock_in', 'a.clock_out', 'a.notes', 'a.updated_at',
          'u.name as user_name',
        ])
        .where('a.tenant_id', '=', user.tenant_id);
      if (q.user_id) query = query.where('a.user_id', '=', q.user_id);
      if (q.from)    query = query.where('a.date', '>=', q.from);
      if (q.to)      query = query.where('a.date', '<=', q.to);
      return query.orderBy('a.date', 'desc').execute();
    });
  });

  fastify.post('/attendance', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    const dateStr: string = body.date;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_attendance')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('date', '=', dateStr)
        .executeTakeFirst();
      if (existing) {
        return trx.updateTable('hr_attendance').set({
          status: body.status || existing.status,
          clock_in: body.clock_in ?? existing.clock_in,
          clock_out: body.clock_out ?? existing.clock_out,
          notes: body.notes ?? existing.notes,
          recorded_by: user.sub,
          updated_at: new Date(),
        }).where('id', '=', existing.id)
          .returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('hr_attendance').values({
        tenant_id: user.tenant_id,
        user_id: body.user_id,
        date: dateStr,
        status: body.status || 'PRESENT',
        clock_in: body.clock_in || null,
        clock_out: body.clock_out || null,
        notes: body.notes || null,
        recorded_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.post('/attendance/bulk', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const userIds: string[] = body.user_ids;
      const from = new Date(body.from_date);
      const to   = new Date(body.to_date);
      let count = 0;
      for (const uid of userIds) {
        const d = new Date(from);
        while (d <= to) {
          const dateStr = d.toISOString().split('T')[0];
          const existing = await trx.selectFrom('hr_attendance').select('id')
            .where('tenant_id', '=', user.tenant_id)
            .where('user_id', '=', uid).where('date', '=', dateStr)
            .executeTakeFirst();
          if (existing) {
            await trx.updateTable('hr_attendance').set({
              status: body.status, clock_in: body.clock_in || null,
              clock_out: body.clock_out || null, recorded_by: user.sub, updated_at: new Date(),
            }).where('id', '=', existing.id).execute();
          } else {
            await trx.insertInto('hr_attendance').values({
              tenant_id: user.tenant_id, user_id: uid, date: dateStr,
              status: body.status, clock_in: body.clock_in || null,
              clock_out: body.clock_out || null, recorded_by: user.sub,
            }).execute();
          }
          count++;
          d.setDate(d.getDate() + 1);
        }
      }
      return { ok: true, count };
    });
  });

  // ── Leaves ────────────────────────────────────────────────────

  fastify.get('/leaves', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_leaves as l')
        .innerJoin('users as u', 'u.id', 'l.user_id')
        .leftJoin('users as a', 'a.id', 'l.approved_by')
        .select([
          'l.id', 'l.user_id', 'l.type', 'l.from_date', 'l.to_date',
          'l.days', 'l.reason', 'l.status', 'l.approved_at', 'l.created_at',
          'u.name as employee_name',
          'a.name as approved_by_name',
        ])
        .where('l.tenant_id', '=', user.tenant_id);
      if (q.status)  query = query.where('l.status', '=', q.status);
      if (q.user_id) query = query.where('l.user_id', '=', q.user_id);
      return query.orderBy('l.created_at', 'desc').execute();
    });
  });

  fastify.post('/leaves', async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_leaves').values({
        tenant_id: user.tenant_id,
        user_id: body.user_id || user.sub,
        type: body.type,
        from_date: body.from_date,
        to_date: body.to_date,
        days: Number(body.days),
        reason: body.reason || null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/leaves/:id/status', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_leaves').set({
        status: body.status,
        approved_by: body.status === 'APPROVED' ? user.sub : null,
        approved_at: body.status === 'APPROVED' ? new Date() : null,
        updated_at: new Date(),
      }).where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Payroll ───────────────────────────────────────────────────

  fastify.get('/payroll', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_payroll as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select([
          'p.id', 'p.user_id', 'p.period_month', 'p.period_year',
          'p.basic_pay', 'p.allowances', 'p.deductions', 'p.status',
          'p.paid_at', 'p.notes', 'p.created_at',
          'u.name as employee_name',
        ])
        .where('p.tenant_id', '=', user.tenant_id);
      if (q.month) query = query.where('p.period_month', '=', Number(q.month));
      if (q.year)  query = query.where('p.period_year',  '=', Number(q.year));
      return query.orderBy('u.name').execute();
    });
  });

  fastify.post('/payroll', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_payroll').select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('period_month', '=', Number(body.period_month))
        .where('period_year',  '=', Number(body.period_year))
        .executeTakeFirst();
      if (existing) {
        return trx.updateTable('hr_payroll').set({
          basic_pay: Number(body.basic_pay),
          allowances: Number(body.allowances) || 0,
          deductions: Number(body.deductions) || 0,
          status: body.status || 'PENDING',
          updated_at: new Date(),
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('hr_payroll').values({
        tenant_id: user.tenant_id,
        user_id: body.user_id,
        period_month: Number(body.period_month),
        period_year:  Number(body.period_year),
        basic_pay:    Number(body.basic_pay),
        allowances:   Number(body.allowances) || 0,
        deductions:   Number(body.deductions) || 0,
        status: body.status || 'PENDING',
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/payroll/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const upd: Record<string, any> = { updated_at: new Date() };
      if (body.status !== undefined) {
        upd.status = body.status;
        if (body.status === 'PAID') upd.paid_at = new Date();
      }
      if (body.basic_pay  !== undefined) upd.basic_pay  = Number(body.basic_pay);
      if (body.allowances !== undefined) upd.allowances = Number(body.allowances);
      if (body.deductions !== undefined) upd.deductions = Number(body.deductions);
      return trx.updateTable('hr_payroll').set(upd)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Announcements ─────────────────────────────────────────────

  fastify.get('/announcements', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_announcements as a')
        .leftJoin('users as u', 'u.id', 'a.author_id')
        .select([
          'a.id', 'a.title', 'a.body', 'a.category', 'a.audience',
          'a.created_at', 'a.updated_at',
          'u.name as author_name',
        ])
        .where('a.tenant_id', '=', user.tenant_id)
        .orderBy('a.created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/announcements', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_announcements').values({
        tenant_id: user.tenant_id,
        title: body.title,
        body: body.body,
        category: body.category || 'General',
        audience: body.audience || 'All Staff',
        author_id: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/announcements/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const upd: Record<string, any> = { updated_at: new Date() };
      if (body.title    !== undefined) upd.title    = body.title;
      if (body.body     !== undefined) upd.body     = body.body;
      if (body.category !== undefined) upd.category = body.category;
      if (body.audience !== undefined) upd.audience = body.audience;
      return trx.updateTable('hr_announcements').set(upd)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/announcements/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_announcements')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Holidays ──────────────────────────────────────────────────

  fastify.get('/holidays', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_holidays')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('date')
        .execute();
    });
  });

  fastify.post('/holidays', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_holidays').values({
        tenant_id: user.tenant_id,
        date: body.date,
        name: body.name,
        type: body.type || 'Public',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/holidays/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_holidays')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Task Types ───────────────────────────────────────────────

  fastify.get('/tasks', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_tasks')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('active', '=', true)
        .orderBy('name')
        .execute();
      // Seed defaults if empty
      if (rows.length === 0) {
        const defaults = [
          { name: 'Customs Filing',        category: 'Operations',     is_billable: true,  color: '#0891b2' },
          { name: 'Documentation Review',  category: 'Operations',     is_billable: true,  color: '#7c3aed' },
          { name: 'Port Operations',       category: 'Operations',     is_billable: true,  color: '#16a34a' },
          { name: 'Client Meeting',        category: 'Client',         is_billable: true,  color: '#d97706' },
          { name: 'Internal Meeting',      category: 'Admin',          is_billable: false, color: '#6b7280' },
          { name: 'Administrative Work',   category: 'Admin',          is_billable: false, color: '#6b7280' },
          { name: 'Training',              category: 'Learning',       is_billable: false, color: '#8b5cf6' },
          { name: 'Break',                 category: 'Other',          is_billable: false, color: '#9ca3af' },
        ];
        const seeded = await trx.insertInto('hr_tasks')
          .values(defaults.map(d => ({ ...d, tenant_id: user.tenant_id })))
          .returningAll().execute();
        return seeded;
      }
      return rows;
    });
  });

  fastify.post('/tasks', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_tasks').values({
        tenant_id: user.tenant_id,
        name: body.name,
        category: body.category || 'General',
        is_billable: body.is_billable ?? false,
        color: body.color || '#0891b2',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/tasks/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.name        !== undefined) allowed.name        = body.name;
      if (body.category    !== undefined) allowed.category    = body.category;
      if (body.is_billable !== undefined) allowed.is_billable = body.is_billable;
      if (body.color       !== undefined) allowed.color       = body.color;
      if (body.active      !== undefined) allowed.active      = body.active;
      allowed.updated_at = new Date();
      return trx.updateTable('hr_tasks').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Time Entries / Check-in ───────────────────────────────────

  fastify.get('/time/today', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      return trx.selectFrom('hr_time_entries')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('date', '=', today)
        .orderBy('started_at')
        .execute();
    });
  });

  fastify.get('/time/summary', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      const date = q.date || new Date().toISOString().split('T')[0];
      const entries = await trx.selectFrom('hr_time_entries')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('date', '=', date)
        .execute();

      const billable = entries.filter(e => e.is_billable);
      const unbillable = entries.filter(e => !e.is_billable);
      const totalMin = entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
      const billableMin = billable.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);

      return {
        date,
        total_entries: entries.length,
        total_minutes: totalMin,
        billable_minutes: billableMin,
        unbillable_minutes: totalMin - billableMin,
        entries,
      };
    });
  });

  fastify.post('/time/start', async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      // Close any open entries first
      await trx.updateTable('hr_time_entries')
        .set({
          ended_at: new Date(),
          updated_at: new Date(),
        })
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('date', '=', today)
        .where('ended_at', 'is', null)
        .execute();

      return trx.insertInto('hr_time_entries').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        task_id: body.task_id || null,
        task_name: body.task_name || null,
        is_billable: body.is_billable ?? false,
        entry_type: body.entry_type || 'TASK',
        date: today,
        is_full_day: body.is_full_day ?? false,
        started_at: new Date(),
        last_ack_at: new Date(),
        project_id: body.project_id || null,
        project_ref: body.project_ref || null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/time/:id/stop', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const entry = await trx.selectFrom('hr_time_entries')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!entry) throw Object.assign(new Error('Entry not found'), { statusCode: 404 });

      const endedAt = new Date();
      const durationMin = entry.started_at
        ? Math.round((endedAt.getTime() - new Date(entry.started_at).getTime()) / 60000)
        : 0;

      return trx.updateTable('hr_time_entries')
        .set({ ended_at: endedAt, duration_minutes: durationMin, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/time/:id/ack', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_time_entries')
        .set({ last_ack_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/time/:id/extend', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_time_entries')
        .set({ is_full_day: true, is_extended: true, last_ack_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Profile Avatar ───────────────────────────────────────────

  fastify.patch('/profile/avatar', async (req) => {
    const user = req.user;
    const body = req.body as { avatar_url: string };
    if (!body.avatar_url) throw { statusCode: 400, message: 'avatar_url required' };
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('users')
        .set({ avatar_url: body.avatar_url, updated_at: new Date() })
        .where('id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      const { password_hash: _, ...safe } = updated as any;
      return safe;
    });
  });

  // Patch another staff member's avatar (admin only)
  fastify.patch('/staff/:id/avatar', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { avatar_url: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('users')
        .set({ avatar_url: body.avatar_url, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Staff Management ─────────────────────────────────────────

  fastify.get('/staff', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      const [users, onLeaveRows] = await Promise.all([
        trx.selectFrom('users')
          .select(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at', 'last_login_at'])
          .where('tenant_id', '=', user.tenant_id)
          .orderBy('name')
          .execute(),
        trx.selectFrom('hr_leaves')
          .select('user_id')
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'APPROVED')
          .where('from_date', '<=', today)
          .where('to_date', '>=', today)
          .execute(),
      ]);
      const onLeaveIds = new Set(onLeaveRows.map(r => r.user_id));
      return users.map(u => ({
        ...u,
        status: !u.active ? 'INACTIVE' : onLeaveIds.has(u.id) ? 'ON_LEAVE' : 'ACTIVE',
        hireDate: u.created_at instanceof Date
          ? u.created_at.toISOString().split('T')[0]
          : String(u.created_at).split('T')[0],
        dept: '',
        designation: '',
      }));
    });
  });

  fastify.get('/staff/:id', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const staff = await trx.selectFrom('users')
        .select(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at', 'last_login_at'])
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!staff) throw Object.assign(new Error('Staff not found'), { statusCode: 404 });

      const today = new Date().toISOString().split('T')[0];
      const [leaveSummary, attendanceSummary, recentLeaves, onLeaveNow] = await Promise.all([
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .where('status', '=', 'APPROVED').executeTakeFirst(),
        trx.selectFrom('hr_attendance').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .where('status', '=', 'PRESENT').executeTakeFirst(),
        trx.selectFrom('hr_leaves')
          .select(['id', 'type', 'from_date', 'to_date', 'status', 'reason'])
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .orderBy('from_date', 'desc').limit(10).execute(),
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .where('status', '=', 'APPROVED')
          .where('from_date', '<=', today).where('to_date', '>=', today)
          .executeTakeFirst(),
      ]);

      return {
        ...staff,
        status: !staff.active ? 'INACTIVE' : Number(onLeaveNow?.c ?? 0) > 0 ? 'ON_LEAVE' : 'ACTIVE',
        hireDate: staff.created_at instanceof Date
          ? staff.created_at.toISOString().split('T')[0]
          : String(staff.created_at).split('T')[0],
        stats: {
          approved_leaves: Number(leaveSummary?.c ?? 0),
          present_days: Number(attendanceSummary?.c ?? 0),
        },
        recent_leaves: recentLeaves,
      };
    });
  });

  fastify.patch('/staff/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.name  !== undefined) allowed.name  = body.name;
      if (body.phone !== undefined) allowed.phone = body.phone;
      allowed.updated_at = new Date();
      return trx.updateTable('users').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'phone', 'role', 'active'])
        .executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/staff/:id/role', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { role } = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('users').set({ role, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'role'])
        .executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/staff/:id/status', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { active } = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('users').set({ active, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'active'])
        .executeTakeFirstOrThrow();
    });
  });

  // ── My Active Shipments (for check-in widget) ────────────────

  fastify.get('/my-shipments', async (req) => {
    const user = req.user as any;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('shipment_cases')
        .leftJoin('customers', 'customers.id', 'shipment_cases.customer_id')
        .select([
          'shipment_cases.id', 'shipment_cases.ref_number', 'shipment_cases.goods_desc',
          'shipment_cases.stage', 'shipment_cases.type',
          'customers.name as customer_name',
        ])
        .where('shipment_cases.tenant_id', '=', user.tenant_id)
        .where('shipment_cases.assigned_to', '=', user.sub)
        .where('shipment_cases.stage', '!=', 'completed' as any)
        .orderBy('shipment_cases.created_at', 'desc')
        .limit(20)
        .execute();
      return rows;
    });
  });

  // ── Ops Summary (CommandCenter dashboard) ─────────────────────

  fastify.get('/ops-summary', async (req) => {
    const user = req.user as any;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      const [checkedIn, activeShipments, pendingTasks] = await Promise.all([
        trx.selectFrom('hr_time_entries')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('tenant_id', '=', user.tenant_id)
          .where('date', '=', today)
          .where('ended_at', 'is', null)
          .executeTakeFirst(),
        trx.selectFrom('shipment_cases')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('tenant_id', '=', user.tenant_id)
          .where('stage', '!=', 'completed' as any)
          .where('stage', '!=', 'cancelled' as any)
          .executeTakeFirst(),
        trx.selectFrom('shipment_tasks')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'open')
          .executeTakeFirst(),
      ]);
      return {
        checked_in: Number(checkedIn?.count ?? 0),
        active_shipments: Number(activeShipments?.count ?? 0),
        pending_tasks: Number(pendingTasks?.count ?? 0),
      };
    });
  });

  // ── Tools Overview (aggregated real-time metrics) ─────────────

  fastify.get('/tools-overview', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [totalStaff, activeStaff, onLeave, pendingLeaves, todayPresent, todayAbsent] = await Promise.all([
        trx.selectFrom('users').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('users').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).executeTakeFirst(),
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'APPROVED')
          .where('from_date', '<=', today).where('to_date', '>=', today).executeTakeFirst(),
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING').executeTakeFirst(),
        trx.selectFrom('hr_attendance').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('date', '=', today).where('status', '=', 'PRESENT').executeTakeFirst(),
        trx.selectFrom('hr_attendance').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('date', '=', today).where('status', '=', 'ABSENT').executeTakeFirst(),
      ]);

      const [totalDocs, docsThisMonth] = await Promise.all([
        trx.selectFrom('case_documents').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('case_documents').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart).executeTakeFirst(),
      ]);

      const [totalMessages, messagesThisMonth] = await Promise.all([
        trx.selectFrom('case_messages').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('case_messages').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart).executeTakeFirst(),
      ]);

      const [totalNotifs, unreadNotifs] = await Promise.all([
        trx.selectFrom('notifications').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('notifications').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('read', '=', false).executeTakeFirst(),
      ]);

      return {
        hr: {
          total_staff:    Number(totalStaff?.c ?? 0),
          active_staff:   Number(activeStaff?.c ?? 0),
          on_leave:       Number(onLeave?.c ?? 0),
          pending_leaves: Number(pendingLeaves?.c ?? 0),
          today_present:  Number(todayPresent?.c ?? 0),
          today_absent:   Number(todayAbsent?.c ?? 0),
        },
        files: {
          total:      Number(totalDocs?.c ?? 0),
          this_month: Number(docsThisMonth?.c ?? 0),
        },
        chat: {
          total_messages: Number(totalMessages?.c ?? 0),
          this_month:     Number(messagesThisMonth?.c ?? 0),
        },
        support: {
          total_notifications: Number(totalNotifs?.c ?? 0),
          unread:              Number(unreadNotifs?.c ?? 0),
        },
        fetched_at: new Date().toISOString(),
      };
    });
  });
}
