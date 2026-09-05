import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import type { PackagesTable } from '../db/client.js';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';
import { PaymentsIntegration } from '../integrations/payments.js';
import { PettiService } from '../services/petti.service.js';

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

/** The real per-period plan charge for a tenant's seat count. Seats beyond
 *  extra_seat_threshold bill at the cheaper extra_seat_price (393_free_tier_
 *  and_seat_tiering.sql) — both NULL on every package until a SuperAdmin sets
 *  them, so this returns exactly `price_per_seat * seats` for every package
 *  that hasn't opted in, unchanged from before that migration. */
function computePlanAmount(pkg: Pick<PackagesTable, 'price_per_seat' | 'monthly_price' | 'extra_seat_price' | 'extra_seat_threshold'>, seats: number): number {
  if (pkg.price_per_seat == null) return pkg.monthly_price;
  if (pkg.extra_seat_price != null && pkg.extra_seat_threshold != null && seats > pkg.extra_seat_threshold) {
    const baseSeats = pkg.extra_seat_threshold;
    const extraSeats = seats - pkg.extra_seat_threshold;
    return baseSeats * pkg.price_per_seat + extraSeats * pkg.extra_seat_price;
  }
  return pkg.price_per_seat * seats;
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
    const methods = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('payment_methods').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('is_default', 'desc').orderBy('created_at', 'desc')
        .execute()
    );
    // A wallet's balance moves independently of this row (deposits,
    // disbursements elsewhere in Petti) — read live rather than cached, same
    // as Petti's own dashboard, so "can I actually pay with this" is never stale.
    return Promise.all(methods.map(async (m) => {
      if (m.type !== 'petti_wallet' || !m.petti_wallet_id) return m;
      const wallet = await withTenant(user.tenant_id, (trx) =>
        trx.selectFrom('petti_wallets').selectAll().where('id', '=', m.petti_wallet_id!).executeTakeFirst()
      );
      if (!wallet) return { ...m, wallet_balance: null, wallet_currency: null, wallet_status: 'missing' as const };
      const balance = await PettiService.getWalletBalance(user.tenant_id, wallet.gl_account_id);
      return { ...m, wallet_balance: balance, wallet_currency: wallet.currency, wallet_status: wallet.status };
    }));
  });

  fastify.post<{
    Body: { type?: 'card' | 'mobile_money' | 'bank' | 'petti_wallet'; card_number?: string; card_expiry?: string; card_cvc?: string; label?: string; phone?: string; provider?: string; petti_wallet_id?: string }
  }>('/payment-methods', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) }, async (request, reply) => {
    const user = request.user;
    const b = request.body;
    const type = b.type ?? 'card';

    let brand: string | null = null, last4: string | null = null, expMonth: number | null = null, expYear: number | null = null, label = b.label ?? '';
    let pettiWalletId: string | null = null;

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
    } else if (type === 'petti_wallet') {
      if (!b.petti_wallet_id) {
        reply.status(400);
        return { error: 'Choose which wallet this payment method draws from.' };
      }
      const wallet = await withTenant(user.tenant_id, (trx) =>
        trx.selectFrom('petti_wallets').selectAll().where('id', '=', b.petti_wallet_id!).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
      );
      if (!wallet) {
        reply.status(404);
        return { error: 'Wallet not found.' };
      }
      if (wallet.status !== 'active') {
        reply.status(400);
        return { error: `"${wallet.name}" is closed.` };
      }
      pettiWalletId = wallet.id;
      brand = 'Petti Wallet';
      label = label || `Petti — ${wallet.name}`;
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
        exp_month: expMonth, exp_year: expYear, petti_wallet_id: pettiWalletId,
        is_default: Number(existingCount?.c ?? 0) === 0,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return method;
    });
  });

  fastify.patch<{ Params: { id: string } }>('/payment-methods/:id/default', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) }, async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('payment_methods').set({ is_default: false }).where('tenant_id', '=', user.tenant_id).execute();
      return trx.updateTable('payment_methods').set({ is_default: true })
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete<{ Params: { id: string } }>('/payment-methods/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) }, async (request, reply) => {
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
  fastify.post('/invoices/generate', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) }, async (request, reply) => {
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
      const planAmount = computePlanAmount(pkg, seats);

      // Fold in real active add-ons (376_package_addons.sql) — a purchased
      // add-on (e.g. Onsite) is billed alongside the plan itself.
      const addonRows = await trx.selectFrom('tenant_addons')
        .innerJoin('package_addons', 'package_addons.code', 'tenant_addons.addon_code')
        .select('package_addons.monthly_price')
        .where('tenant_addons.tenant_id', '=', user.tenant_id)
        .where('tenant_addons.status', '=', 'active')
        .execute();
      const addonsAmount = addonRows.reduce((sum, r) => sum + Number(r.monthly_price), 0);
      const amount = planAmount + addonsAmount;

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
        addons_amount: addonsAmount,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        // A $0 invoice (e.g. a custom/enterprise package whose monthly_price
        // was briefly 0/unset before pricing was configured) has nothing
        // owed — "overdue" is never correct for zero money, regardless of
        // how far past the due date it is. Found via 2 real historical
        // invoices stuck showing "$0.00 · overdue" after packages.monthly_price
        // for 'enterprise' was corrected post-hoc without a backfill.
        status: amount <= 0 ? 'paid' : (dueDate < now ? 'overdue' : 'due'),
      }).returningAll().executeTakeFirstOrThrow();

      reply.status(201);
      return invoice;
    });
  });

  fastify.post<{ Params: { id: string }; Body: { payment_method_id: string } }>(
    '/invoices/:id/pay',
    { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) },
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

        let txRef: string;

        if (method.type === 'petti_wallet') {
          // A real internal deduction, not a simulated external charge — see
          // PettiService.payFromWalletDirect's own comment for why that's a
          // meaningful distinction here specifically (it's genuine money
          // this platform already tracks, unlike a card/mobile-money charge
          // Hudumika has no live merchant credentials to actually place).
          if (!method.petti_wallet_id) {
            reply.status(400);
            return { error: 'This payment method has no wallet attached.' };
          }
          try {
            const result = await PettiService.payFromWalletDirect(user.tenant_id, { id: user.sub, role: user.role }, {
              walletId: method.petti_wallet_id,
              amount: invoice.amount,
              category: 'SUBSCRIPTION',
              purpose: `Hudumika subscription ${invoice.invoice_number} — ${invoice.plan_code} plan, ${invoice.seats} seat${invoice.seats === 1 ? '' : 's'}`,
            });
            txRef = `PETTI-${result.withdrawalRequestId}`;
          } catch (err: any) {
            reply.status(402);
            return { error: err.message || 'Payment failed' };
          }
        } else {
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
          txRef = result.tx_ref;
        }

        const updated = await trx.updateTable('subscription_invoices')
          .set({ status: 'paid', paid_at: new Date(), payment_method_id: method.id, tx_ref: txRef })
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
