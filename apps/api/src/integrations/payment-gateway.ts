import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Real payment gateway adapter (Flutterwave v3). Hosted checkout: we create a
 * payment link for an invoice, the customer pays on the gateway's page, and
 * the result comes back two ways — a signed webhook (routes/billing-
 * webhooks.routes.ts) and a verify-on-return call. In both, the amount and
 * currency are re-checked against our own invoice by asking the gateway
 * directly; a webhook body alone is never trusted as proof of payment.
 *
 * Nothing here stores card data — the customer never enters it on our pages.
 */
export interface GatewayVerification {
  ok: boolean;
  status: string;
  transactionId?: number;
  txRef?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

async function call<T = any>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${env.FLW_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body: body as T };
  } finally {
    clearTimeout(timer);
  }
}

function toVerification(body: any): GatewayVerification {
  const d = body?.data;
  if (body?.status !== 'success' || !d) return { ok: false, status: 'not_found', error: body?.message || 'Transaction not found' };
  return {
    ok: d.status === 'successful', status: String(d.status), transactionId: d.id, txRef: d.tx_ref,
    amount: Number(d.amount), currency: d.currency,
  };
}

export const PaymentGateway = {
  name: 'flutterwave' as const,

  isConfigured(): boolean {
    return !!env.FLW_SECRET_KEY;
  },

  async createCheckout(input: {
    txRef: string; amount: number; currency: string; email: string; name: string; redirectUrl: string; title: string;
    meta?: Record<string, string>;
  }): Promise<{ url: string }> {
    const { status, body } = await call<any>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: input.txRef, amount: input.amount, currency: input.currency, redirect_url: input.redirectUrl,
        customer: { email: input.email, name: input.name },
        customizations: { title: input.title },
        meta: input.meta ?? {},
      }),
    });
    const link = body?.data?.link;
    if (status >= 400 || body?.status !== 'success' || !link) throw new Error(body?.message || `Gateway refused to create a checkout (HTTP ${status})`);
    return { url: link };
  },

  /** The gateway's own record of a transaction, by our reference. */
  async verifyByReference(txRef: string): Promise<GatewayVerification> {
    const { body } = await call(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    return toVerification(body);
  },

  async verifyById(transactionId: number | string): Promise<GatewayVerification> {
    const { body } = await call(`/transactions/${encodeURIComponent(String(transactionId))}/verify`);
    return toVerification(body);
  },

  /** Constant-time check of the `verif-hash` header against the configured secret hash. */
  verifyWebhookSignature(headerValue: string | string[] | undefined): boolean {
    const expected = env.FLW_WEBHOOK_HASH;
    if (!expected || typeof headerValue !== 'string') return false;
    const a = Buffer.from(headerValue);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },
};
