import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

/** Flexible column names — real bank exports vary (Date/Transaction Date,
 *  Description/Narrative/Details, Amount or separate Debit/Credit). */
function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
  for (const k of keys) {
    const v = lower[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

function parseStatementCsv(buf: Buffer): { date: string; description: string; amount: number }[] {
  const records = parse(buf, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
  return records.map((row, i) => {
    const dateStr = pick(row, ['date', 'transaction date', 'txn date', 'value date']);
    const description = pick(row, ['description', 'narrative', 'details', 'particulars']) ?? '';
    const debit = pick(row, ['debit', 'withdrawal', 'money out']);
    const credit = pick(row, ['credit', 'deposit', 'money in']);
    const plainAmount = pick(row, ['amount']);
    if (!dateStr) throw new Error(`Row ${i + 2}: no date column found`);
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) throw new Error(`Row ${i + 2}: could not parse date "${dateStr}"`);
    let amount: number;
    if (plainAmount !== undefined) amount = Number(plainAmount.replace(/,/g, ''));
    else amount = Number((credit ?? '0').replace(/,/g, '')) - Number((debit ?? '0').replace(/,/g, ''));
    if (isNaN(amount)) throw new Error(`Row ${i + 2}: could not parse an amount`);
    return { date: date.toISOString().slice(0, 10), description, amount };
  });
}

export async function bankReconciliationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/statements', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const statements = await trx.selectFrom('bank_statements').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('statement_date_to', 'desc').execute();
      const ids = statements.map(s => s.id);
      const lineCounts = ids.length
        ? await trx.selectFrom('bank_statement_lines').select(['bank_statement_id', ({ fn }) => fn.count<number>('id').as('total'), ({ fn }) => fn.count<number>('matched_journal_line_id').as('matched')])
            .where('bank_statement_id', 'in', ids).groupBy('bank_statement_id').execute()
        : [];
      const countsById = new Map(lineCounts.map(c => [c.bank_statement_id, { total: Number(c.total), matched: Number(c.matched) }]));
      return statements.map(s => ({ ...s, ...(countsById.get(s.id) ?? { total: 0, matched: 0 }) }));
    });
  });

  // POST /statements/import — multipart CSV upload. account_code/bank_name
  // as query params, same "keep the multipart body to just the file" shape
  // customers.routes.ts's own bulk-import already established.
  fastify.post('/statements/import', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { account_code, bank_name } = request.query as { account_code?: string; bank_name?: string };
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    let rows: { date: string; description: string; amount: number }[];
    try {
      rows = parseStatementCsv(await file.toBuffer());
    } catch (e: any) {
      return reply.status(400).send({ error: 'Could not parse file: ' + (e.message || 'invalid format') });
    }
    if (rows.length === 0) return reply.status(400).send({ error: 'No transaction rows found in this file.' });

    return withTenant(user.tenant_id, async (trx) => {
      const dates = rows.map(r => r.date).sort();
      const statement = await trx.insertInto('bank_statements').values({
        tenant_id: user.tenant_id,
        account_code: account_code || '1010',
        bank_name: bank_name || null,
        statement_date_from: dates[0],
        statement_date_to: dates[dates.length - 1],
        opening_balance: 0,
        closing_balance: rows.reduce((s, r) => s + r.amount, 0),
        imported_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('bank_statement_lines').values(rows.map(r => ({
        bank_statement_id: statement.id, txn_date: r.date, description: r.description, amount: r.amount,
      }))).execute();

      return reply.status(201).send({ ...statement, imported: rows.length });
    });
  });

  fastify.get('/statements/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const statement = await trx.selectFrom('bank_statements').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!statement) return reply.status(404).send({ error: 'Bank statement not found' });
      const lines = await trx.selectFrom('bank_statement_lines').selectAll().where('bank_statement_id', '=', id).orderBy('txn_date', 'asc').execute();

      // Candidate matches — real, unmatched journal_lines against the cash
      // account in range, so the UI can suggest by amount+date proximity
      // rather than the user hunting through the whole ledger.
      const candidates = await trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .leftJoin('bank_statement_lines as bsl', 'bsl.matched_journal_line_id', 'jl.id')
        .select(['jl.id', 'je.entry_date', 'je.description', 'je.entry_number', 'jl.debit', 'jl.credit'])
        .where('je.tenant_id', '=', user.tenant_id)
        .where('je.status', '!=', 'VOIDED')
        .where('coa.code', '=', statement.account_code)
        .where('je.entry_date', '>=', statement.statement_date_from)
        .where('je.entry_date', '<=', statement.statement_date_to)
        .where('bsl.id', 'is', null)
        .execute();

      return {
        ...statement, lines,
        candidates: candidates.map(c => ({ id: c.id, date: c.entry_date, description: c.description, entryNumber: c.entry_number, amount: Number(c.debit) - Number(c.credit) })),
      };
    });
  });

  fastify.post('/statements/:id/lines/:lineId/match', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id, lineId } = request.params as { id: string; lineId: string };
    const { journal_line_id } = z.object({ journal_line_id: z.string().uuid() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const statement = await trx.selectFrom('bank_statements').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!statement) return reply.status(404).send({ error: 'Bank statement not found' });
      const line = await trx.selectFrom('bank_statement_lines').select('id').where('id', '=', lineId).where('bank_statement_id', '=', id).executeTakeFirst();
      if (!line) return reply.status(404).send({ error: 'Statement line not found' });
      // A journal line can only back one statement line — confirmed by
      // checking no other statement line already claims it.
      const alreadyUsed = await trx.selectFrom('bank_statement_lines').select('id').where('matched_journal_line_id', '=', journal_line_id).executeTakeFirst();
      if (alreadyUsed) return reply.status(409).send({ error: 'That ledger entry is already matched to another statement line.' });

      await trx.updateTable('bank_statement_lines').set({ matched_journal_line_id: journal_line_id, matched_at: new Date(), matched_by: user.sub }).where('id', '=', lineId).execute();
      return { success: true };
    });
  });

  fastify.post('/statements/:id/lines/:lineId/unmatch', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id, lineId } = request.params as { id: string; lineId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const statement = await trx.selectFrom('bank_statements').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!statement) return reply.status(404).send({ error: 'Bank statement not found' });
      await trx.updateTable('bank_statement_lines').set({ matched_journal_line_id: null, matched_at: null, matched_by: null }).where('id', '=', lineId).where('bank_statement_id', '=', id).execute();
      return { success: true };
    });
  });

  fastify.delete('/statements/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('bank_statements').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Bank statement not found' });
      await trx.deleteFrom('bank_statements').where('id', '=', id).execute();
      return { success: true };
    });
  });
}
