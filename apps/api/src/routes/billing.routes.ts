import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { PaymentsIntegration } from '../integrations/payments.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

function luhnValid(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

function cardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  return 'Card';
}

// Backs Workspace ▸ Subscription ▸ Payments/Billing — previously PAYMENT_HISTORY
// and payment-method rows were hardcoded fixtures with no backend at all.
// Real card numbers/CVCs are validated then immediately discarded (only brand/
// last4/expiry — the non-sensitive descriptor fields — are ever persisted),
// same convention as onboarding.service.ts's use of PaymentsIntegration.
export default async function billingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Payment methods ──────────────────────────────────────────────

  fastify.get('/payment-methods', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('payment_methods').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('is_default', 'desc').orderBy('created_at', 'desc')
        .execute()
    );
  });

  fastify.post<{
    Body: { type?: 'card' | 'mobile_money' | 'bank'; card_number?: string; card_expiry?: string; card_cvc?: string; label?: string; phone?: string; provider?: string }
  }>('/payment-methods', { preHandler: requireRole(...MGMT) }, async (request, reply) => {
    const user = request.user;
    const b = request.body;
    const type = b.type ?? 'card';

    let brand: string | null = null, last4: string | null = null, expMonth: number | null = null, expYear: number | null = null, label = b.label ?? '';

    if (type === 'card') {
      const digits = (b.card_number || '').replace(/\s/g, '');
      if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) {
        reply.status(400);
        return { error: 'Invalid card number' };
      }
      const match = /^(\d{2})\/(\d{2})$/.exec(b.card_expiry || '');
      if (!match) {
        reply.status(400);
        return { error: 'Expiry must be in MM/YY format' };
      }
      if (!b.card_cvc || !/^\d{3,4}$/.test(b.card_cvc)) {
        reply.status(400);
        return { error: 'Invalid CVC' };
      }
      brand = cardBrand(digits);
      last4 = digits.slice(-4);
      expMonth = parseInt(match[1], 10);
      expYear = 2000 + parseInt(match[2], 10);
      label = label || `${brand} •••• ${last4}`;
      // Raw card_number/card_cvc are never stored — only the descriptor above.
    } else if (type === 'mobile_money') {
      const phone = (b.phone || '').replace(/\D/g, '');
      if (phone.length < 9) {
        reply.status(400);
        return { error: 'Invalid mobile money number' };
      }
      last4 = phone.slice(-4);
      brand = b.provider || 'Mobile Money';
      label = label || `${brand} •••• ${last4}`;
    } else {
      if (!label) {
        reply.status(400);
        return { error: 'Label is required for a bank payment method' };
      }
    }

    return withTenant(user.tenant_id, async (trx) => {
      const existingCount = await trx.selectFrom('payment_methods').select(({ fn }) => fn.countAll<number>().as('c'))
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const method = await trx.insertInto('payment_methods').values({
        tenant_id: user.tenant_id, created_by: user.sub, type, label, brand, last4,
        exp_month: expMonth, exp_year: expYear, is_default: Number(existingCount?.c ?? 0) === 0,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return method;
    });
  });

  fastify.patch<{ Params: { id: string } }>('/payment-methods/:id/default', { preHandler: requireRole(...MGMT) }, async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('payment_methods').set({ is_default: false }).where('tenant_id', '=', user.tenant_id).execute();
      return trx.updateTable('payment_methods').set({ is_default: true })
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete<{ Params: { id: string } }>('/payment-methods/:id', { preHandler: requireRole(...MGMT) }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('payment_methods').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).execute();
      reply.status(204);
      return null;
    });
  });

  // ── Subscription invoices ────────────────────────────────────────

  fastify.get('/invoices', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('subscription_invoices').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('period_start', 'desc')
        .execute()
    );
  });

  // Ensures the current billing period has a real invoice row, generated from
  // the tenant's actual plan + active seat count (packages.price_per_seat) —
  // idempotent, so calling it on every Billing tab load is safe.
  fastify.post('/invoices/generate', { preHandler: requireRole(...MGMT) }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', user.tenant_id).executeTakeFirst();
      if (!tenant) {
        reply.status(404);
        return { error: 'Tenant not found' };
      }
      const pkg = await trx.selectFrom('packages').selectAll().where('code', '=', tenant.plan).executeTakeFirst();
      if (!pkg) {
        reply.status(400);
        return { error: 'Current plan has no pricing configured' };
      }
      const seatRow = await trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
        .where('tenant_id', '=', user.tenant_id).where('active', '=', true).executeTakeFirst();
      const seats = Number(seatRow?.c ?? 1);
      const amount = pkg.price_per_seat != null ? pkg.price_per_seat * seats : pkg.monthly_price;

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const dueDate = new Date(now.getFullYear(), now.getMonth(), 5);
      const periodKey = `${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}`;

      const existing = await trx.selectFrom('subscription_invoices').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('period_start', '=', periodStart.toISOString().slice(0, 10))
        .executeTakeFirst();
      if (existing) return existing;

      const seq = 1 + Number((await trx.selectFrom('subscription_invoices').select(({ fn }) => fn.countAll<number>().as('c'))
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst())?.c ?? 0);

      const invoice = await trx.insertInto('subscription_invoices').values({
        tenant_id: user.tenant_id,
        invoice_number: `SUB-${periodKey}-${String(seq).padStart(3, '0')}`,
        plan_code: tenant.plan,
        seats,
        currency: 'USD',
        amount,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        status: dueDate < now ? 'overdue' : 'due',
      }).returningAll().executeTakeFirstOrThrow();

      reply.status(201);
      return invoice;
    });
  });

  fastify.post<{ Params: { id: string }; Body: { payment_method_id: string } }>(
    '/invoices/:id/pay',
    { preHandler: requireRole(...MGMT) },
    async (request, reply) => {
      const user = request.user;
      return withTenant(user.tenant_id, async (trx) => {
        const invoice = await trx.selectFrom('subscription_invoices').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!invoice) {
          reply.status(404);
          return { error: 'Invoice not found' };
        }
        if (invoice.status === 'paid') {
          reply.status(400);
          return { error: 'Invoice is already paid' };
        }
        const method = await trx.selectFrom('payment_methods').selectAll()
          .where('id', '=', request.body.payment_method_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!method) {
          reply.status(404);
          return { error: 'Payment method not found' };
        }

        // Simulated charge, same house convention as onboarding — no live
        // gateway is wired up, but the result genuinely reflects the stored
        // method (a mobile_money method routes through the mpesa branch).
        const result = PaymentsIntegration.simulateCharge(invoice.amount, {
          method: method.type === 'mobile_money' ? 'mpesa' : 'card',
          card_number: method.type === 'card' ? `0000000000000${method.last4}` : undefined,
          card_expiry: method.type === 'card' && method.exp_month && method.exp_year ? `${String(method.exp_month).padStart(2, '0')}/${String(method.exp_year).slice(-2)}` : undefined,
          card_cvc: method.type === 'card' ? '123' : undefined,
          mobile_number: method.type === 'mobile_money' ? `255700000${method.last4}` : undefined,
        } as any);

        if (!result.success) {
          reply.status(402);
          return { error: result.error || 'Payment failed' };
        }

        const updated = await trx.updateTable('subscription_invoices')
          .set({ status: 'paid', paid_at: new Date(), payment_method_id: method.id, tx_ref: result.tx_ref })
          .where('id', '=', invoice.id)
          .returningAll().executeTakeFirstOrThrow();
        return updated;
      });
    }
  );

  fastify.get<{ Params: { id: string } }>('/invoices/:id/download', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const invoice = await trx.selectFrom('subscription_invoices').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!invoice) {
        reply.status(404);
        return { error: 'Invoice not found' };
      }
      const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', user.tenant_id).executeTakeFirst();
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.invoice_number}</title>
        <style>body{font-family:system-ui,sans-serif;padding:40px;color:#1f2937}h1{font-size:20px}table{width:100%;margin-top:20px;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #e5e7eb}</style>
        </head><body>
        <h1>Hudumika Subscription Invoice</h1>
        <p><strong>${tenant?.name ?? ''}</strong></p>
        <table>
          <tr><td>Invoice #</td><td>${invoice.invoice_number}</td></tr>
          <tr><td>Plan</td><td>${invoice.plan_code} (${invoice.seats} seat${invoice.seats === 1 ? '' : 's'})</td></tr>
          <tr><td>Period</td><td>${invoice.period_start} – ${invoice.period_end}</td></tr>
          <tr><td>Due date</td><td>${invoice.due_date}</td></tr>
          <tr><td>Status</td><td>${invoice.status.toUpperCase()}${invoice.paid_at ? ` on ${new Date(invoice.paid_at).toLocaleDateString()}` : ''}</td></tr>
          <tr><td>Amount</td><td>${invoice.currency} ${Number(invoice.amount).toFixed(2)}</td></tr>
          ${invoice.tx_ref ? `<tr><td>Transaction Ref</td><td>${invoice.tx_ref}</td></tr>` : ''}
        </table>
        </body></html>`;
      reply.header('Content-Type', 'text/html');
      reply.header('Content-Disposition', `attachment; filename="${invoice.invoice_number}.html"`);
      return html;
    });
  });
}
