// Fintech & Financial Services (backlog item 29) — real partners named by
// the business: Selcom and AzamPay. Their actual charge/disburse HTTP
// contracts could NOT be verified against official documentation this
// session (Selcom has no public developer portal found; AzamPay's docs at
// developerdocs.azampay.co.tz render client-side and returned empty on
// fetch). Per the backlog's own explicit instruction — "do not fabricate
// money movement" — these adapters are structurally complete (so wiring in
// verified calls later is a small, contained change) but their network
// methods deliberately REFUSE to run until a human has verified them
// against the provider's real sandbox and flipped `verified: true` on the
// gateway's own config (Settings ▸ Finance ▸ Payment Gateways). This is not
// a placeholder that pretends to succeed — it is a hard stop.
import { getGatewayConfig } from './payment-gateway.js';

export class ProviderNotVerifiedError extends Error {
  constructor(provider: string) {
    super(`The ${provider} integration has not been verified against a real sandbox yet. Verify it against ${provider}'s official API docs (and tick "Verified" in Settings ▸ Finance ▸ Payment Gateways) before it can move real money.`);
  }
}

export interface ChargeRequest {
  amount: number;
  currency: string;
  msisdn: string;
  reference: string;
  narrative?: string;
}
export interface ChargeResult {
  status: 'pending' | 'success' | 'failed';
  providerReference: string;
  raw?: unknown;
}
export interface DisburseRequest {
  amount: number;
  currency: string;
  msisdn: string;
  reference: string;
  narrative?: string;
}
export interface DisburseResult {
  status: 'pending' | 'success' | 'failed';
  providerReference: string;
  raw?: unknown;
}

export interface PaymentProviderAdapter {
  readonly id: 'selcom' | 'azampay';
  charge(req: ChargeRequest): Promise<ChargeResult>;
  disburse(req: DisburseRequest): Promise<DisburseResult>;
}

async function requireVerifiedConfig(tenantId: string, provider: 'selcom' | 'azampay') {
  const config = await getGatewayConfig(tenantId, provider);
  if (!config || config.config.verified !== 'true') throw new ProviderNotVerifiedError(provider);
  return config;
}

// Third-party integration guides (not Selcom's own docs — see the file-level
// note) consistently describe a REST host at apigw.selcommobile.com with an
// HMAC-SHA256-signed payload and a non-card "create-order" call for
// mobile-wallet push payments. That shape informs the structure below, but
// every field name here is UNVERIFIED and must be checked against Selcom's
// own API reference before `verified` is ever set to `'true'` for a tenant.
export class SelcomAdapter implements PaymentProviderAdapter {
  readonly id = 'selcom' as const;

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    await requireVerifiedConfig(this.tenantId, 'selcom');
    throw new Error('SelcomAdapter.charge: reached past the verification gate with no real HTTP call wired in yet. Implement the verified request shape here before removing this guard.');
  }

  async disburse(req: DisburseRequest): Promise<DisburseResult> {
    await requireVerifiedConfig(this.tenantId, 'selcom');
    throw new Error('SelcomAdapter.disburse: reached past the verification gate with no real HTTP call wired in yet. Implement the verified request shape here before removing this guard.');
  }

  constructor(private readonly tenantId: string) {}
}

// AzamPay's own developer docs (developerdocs.azampay.co.tz) describe
// separate Collection (checkout/transactionStatus/accountLookup) and
// Disbursement (nameLookup/checkBalance/disburse/disbursementStatus) API
// groups, per third-party SDK listings — but the docs page itself renders
// client-side and could not be read this session, so no field name below
// is verified. Same hard gate as SelcomAdapter.
export class AzamPayAdapter implements PaymentProviderAdapter {
  readonly id = 'azampay' as const;

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    await requireVerifiedConfig(this.tenantId, 'azampay');
    throw new Error('AzamPayAdapter.charge: reached past the verification gate with no real HTTP call wired in yet. Implement the verified request shape here before removing this guard.');
  }

  async disburse(req: DisburseRequest): Promise<DisburseResult> {
    await requireVerifiedConfig(this.tenantId, 'azampay');
    throw new Error('AzamPayAdapter.disburse: reached past the verification gate with no real HTTP call wired in yet. Implement the verified request shape here before removing this guard.');
  }

  constructor(private readonly tenantId: string) {}
}

export function getProviderAdapter(tenantId: string, provider: 'selcom' | 'azampay'): PaymentProviderAdapter {
  return provider === 'selcom' ? new SelcomAdapter(tenantId) : new AzamPayAdapter(tenantId);
}
