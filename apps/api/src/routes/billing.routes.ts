import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import type { PackagesTable } from '../db/client.js';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';
import { PaymentsIntegration } from '../integrations/payments.js';
import { PettiService } from '../services/petti.service.js';
import { generatePeriodInvoice, settleInvoiceFromGateway } from '../services/subscription-billing.service.js';
import { PaymentGateway } from '../integrations/payment-gateway.js';
import { env } from '../config/env.js';

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

  // HUD-0097 (addendum): a wrong/stale id crashed instead of 404ing — a
  // multi-line-chain miss from the original sweep — and worse, since every
  // other method's is_default was already cleared first, a crash here left
  // the tenant with no default payment method at all. Fixed by checking
  // existence before touching any row.
  fastify.patch<{ Params: { id: string } }>('/payment-methods/:id/default', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('payment_methods').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Payment method not found' });
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
      try {
        const { invoice, created } = await generatePeriodInvoice(trx, user.tenant_id);
        if (created) reply.status(201);
        return invoice;
      } catch (err: any) {
        reply.status(err.message === 'Tenant not found' ? 404 : 400);
        return { error: err.message };
      }
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
        } else if (PaymentGateway.isConfigured()) {
          // A live gateway exists, so a card/mobile-money invoice must be paid
          // through its hosted checkout — the simulated charge below would mark
          // it paid without any money moving.
          reply.status(409);
          return { error: 'USE_CHECKOUT', message: 'Pay this invoice through the secure checkout.' };
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

  // Hosted checkout: returns a gateway payment link for this invoice. The
  // customer pays on the gateway's page (no card data touches this app); the
  // signed webhook and GET /invoices/:id/verify then mark the invoice paid.
  fastify.post<{ Params: { id: string } }>(
    '/invoices/:id/checkout',
    { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.BILLING_MANAGE, ...MGMT) },
    async (request, reply) => {
      const user = request.user;
      if (!PaymentGateway.isConfigured()) {
        return reply.status(501).send({ error: 'GATEWAY_NOT_CONFIGURED', message: 'Online payment is not configured for this platform yet.' });
      }
      const found = await withTenant(user.tenant_id, async (trx) => {
        const invoice = await trx.selectFrom('subscription_invoices').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!invoice) return null;
        const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', user.tenant_id).executeTakeFirst();
        return { invoice, tenantName: tenant?.name ?? '' };
      });
      if (!found) return reply.status(404).send({ error: 'Invoice not found' });
      const { invoice } = found;
      if (invoice.status === 'paid') return reply.status(400).send({ error: 'Invoice is already paid' });
      if (invoice.status === 'cancelled') return reply.status(400).send({ error: 'Invoice is cancelled' });

      // A fresh reference per attempt: the gateway rejects a reused tx_ref, and a
      // retry after an abandoned checkout must not collide with the first.
      const txRef = `HUD-${invoice.invoice_number}-${Date.now().toString(36)}`;
      const appBase = (env.PUBLIC_APP_URL ?? env.OPS_BOARD_URL).replace(/\/$/, '');
      try {
        const { url } = await PaymentGateway.createCheckout({
          txRef, amount: Number(invoice.amount), currency: invoice.currency, email: user.email ?? '', name: user.name ?? found.tenantName,
          redirectUrl: `${appBase}/workspace/billing?invoice=${invoice.id}`, title: `Hudumika ${invoice.invoice_number}`,
          meta: { invoice_id: invoice.id, tenant_id: user.tenant_id },
        });
        await withTenant(user.tenant_id, (trx) => trx.updateTable('subscription_invoices')
          .set({ gateway: PaymentGateway.name, gateway_ref: txRef, checkout_url: url, updated_at: new Date() })
          .where('id', '=', invoice.id).where('tenant_id', '=', user.tenant_id).execute());
        return { checkout_url: url };
      } catch (err: any) {
        return reply.status(502).send({ error: 'GATEWAY_ERROR', message: err.message || 'Could not start checkout' });
      }
    },
  );

  // Called when the customer returns from the gateway: asks the gateway for the
  // real result rather than trusting the redirect's query string.
  fastify.get<{ Params: { id: string } }>('/invoices/:id/verify', async (request, reply) => {
    const user = request.user;
    const invoice = await withTenant(user.tenant_id, (trx) => trx.selectFrom('subscription_invoices').selectAll()
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (invoice.status !== 'paid' && invoice.gateway_ref && PaymentGateway.isConfigured()) {
      try {
        const verification = await PaymentGateway.verifyByReference(invoice.gateway_ref);
        await settleInvoiceFromGateway(user.tenant_id, invoice.id, PaymentGateway.name, verification);
      } catch (err: any) {
        request.log.warn({ err: err.message }, 'invoice verify against gateway failed');
      }
    }
    return withTenant(user.tenant_id, (trx) => trx.selectFrom('subscription_invoices').selectAll()
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow());
  });

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
