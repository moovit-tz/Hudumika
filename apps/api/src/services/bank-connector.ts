// Bank/card-rail adapter seam — same shape as carrier-adapter.ts's
// CarrierAdapter and seal-customs-adapter.ts's CustomsAdapter: one interface,
// one class per real institution, a stub that fails loudly instead of
// pretending to work, and a factory that resolves by provider id.
//
// Built from real, partner-supplied API documentation (not guessed):
//   - CRDB Bank PLC — Partner Initiated Payments (PIP) API v9.4. Legacy
//     partner integration: partnerID + password → 24h session token, VPN
//     tunnel to CRDB's own network, SHA1/SHA256 checksum per request. Covers
//     LUKU/GePG/TRA bill pay, Visa card issuing, CRDB CASHIN (credit any
//     CRDB account by account number), CRDB CASHOUT, and — the capability
//     that matters most here — Batch Posting (CRDBBTDIS/CRDBBTCOL), which
//     disburses to many beneficiaries at once, CRDB accounts AND non-CRDB
//     banks via TISS/EFT rails. This is the "pay suppliers/vendors" and
//     "Petti disbursement command sent to a gateway" capability.
//   - CRDB Bank PLC — Internal Fund Transfer API (API-568-1) v2.4.0. A
//     newer, separate integration via CRDB's WSO2 API gateway
//     (pre-prod-esb-wso2am-gw.crdbbank.co.tz): plain HTTPS, OAuth2 Bearer
//     token, JSON. Transfers *within* CRDB accounts only (transaction codes
//     R03/R04/G01/G04/G07/G08/H08), with CRDB's own SAS fraud screening
//     run server-side before it reaches core banking.
//
// Neither CRDB document supplied balance-inquiry or statement/transaction-
// history endpoints — CRDB Account Status (PIP) returns only a name and
// status, not a balance, and the Fund Transfer doc references a separate
// "Customer Profile/Account Basic Details API" it doesn't itself describe.
// Nothing here claims a getBalance()/getStatement() capability for CRDB —
// that needs the actual Account Basic Details doc before it can be built,
// not a guess at its shape.
//
// IMPORTANT — both CRDB integrations require things this platform does not
// have yet and cannot self-provision: PIP needs a partnerID/password CRDB
// issues after partner onboarding, plus a VPN tunnel into CRDB's network
// (the sample endpoints are an internal 192.168.x.x address, reachable only
// over that tunnel — there is no public base URL to hardcode here). The Fund
// Transfer API needs an OAuth2 client registration and token endpoint that
// the supplied doc references (`Authorization: Bearer <access token>`) but
// does not itself document how to obtain. Registering as a partner with
// either bank is a business/compliance step for the platform's operator,
// not something buildable from inside this codebase — same category as
// carrier-adapter.ts's MaerskAdapter. Card rails (Cybersource et al.) need a
// real merchant account and signing keys, same story.
//
// So every adapter below is real in its request-shaping (field names,
// transaction codes, checksum recipes all come straight from the partner
// docs) but fails loudly rather than calling an endpoint this platform has
// no credentials or network path to reach. The moment real partner
// credentials exist, the fetch() calls get filled in against this same
// interface — nothing about the shape changes.

export interface BankTransferInput {
  fromAccount: string;
  toAccount: string;
  amount: number;
  currency: string;
  reference: string;
  narration?: string;
}

export interface BankTransferResult {
  providerRef: string;
  status: 'ACCEPTED' | 'COMPLETED' | 'PENDING';
}

export interface DisbursementBeneficiary {
  /** Partner-side unique id for this line — echoed back in CRDB's
   *  completed/failed callback (recID in the PIP doc) so a batch's
   *  individual results can be matched back to Hudumika's own records. */
  recId: string;
  account: string;
  bic?: string;
  name: string;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
}

export interface DisbursementBatchInput {
  batchId: string;
  sourceAccount: string;
  senderName: string;
  description: string;
  currency: string;
  beneficiaries: DisbursementBeneficiary[];
}

export interface DisbursementBatchResult {
  providerBatchRef: string;
  status: 'PENDING_APPROVAL' | 'POSTED';
}

export interface TransactionStatusResult {
  providerRef: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';
  amount?: number;
  raw?: unknown;
}

export interface CardChargeInput {
  amount: number;
  currency: string;
  reference: string;
  cardToken: string;
}

export interface CardChargeResult {
  providerRef: string;
  status: 'AUTHORIZED' | 'DECLINED';
}

/** Every capability is optional — no institution's real API covers all of
 *  these (CRDB's two integrations alone split single-transfer, batch
 *  disbursement and status-fetch across two *different* auth models), so a
 *  caller checks `if (connector.initiateDisbursementBatch)` rather than
 *  every adapter carrying no-op stubs for capabilities its provider doesn't
 *  have at all. */
export interface BankConnector {
  providerId: string;
  providerName: string;
  initiateTransfer?(input: BankTransferInput): Promise<BankTransferResult>;
  initiateDisbursementBatch?(input: DisbursementBatchInput): Promise<DisbursementBatchResult>;
  fetchTransactionStatus?(providerRef: string): Promise<TransactionStatusResult>;
  chargeCard?(input: CardChargeInput): Promise<CardChargeResult>;
}

export interface BankConnectorConfig {
  [key: string]: string | undefined;
}

/**
 * CRDB PIP — Partner Initiated Payments. Covers CRDB CASHIN (single credit
 * to any CRDB account, code CRDB01) and Batch Posting (CRDBBTDIS, multi-
 * beneficiary disbursement to CRDB and non-CRDB accounts via TISS/EFT).
 *
 * Config expected once a real CRDB partnership exists: partnerId, password,
 * baseUrl (CRDB assigns this — it lives on their internal network, reached
 * only via the VPN tunnel set up during partner onboarding; there is no
 * public sandbox host to default to).
 */
class CrdbPipConnector implements BankConnector {
  providerId = 'crdb-pip';
  providerName = 'CRDB Bank (Partner Initiated Payments)';
  constructor(private config: BankConnectorConfig) {}

  private requireConfig(): { partnerId: string; password: string; baseUrl: string } {
    const { partnerId, password, baseUrl } = this.config;
    if (!partnerId || !password || !baseUrl) {
      throw new Error(
        'CRDB PIP is not connected — this needs a partnerID and password CRDB issues after partner onboarding, plus a VPN tunnel to CRDB\'s network for the base URL. That is a partnership CRDB grants directly, not something this platform can self-provision.'
      );
    }
    return { partnerId, password, baseUrl };
  }

  /** Session establishment (PIP doc, message 1/2): partnerID + password →
   *  sessionToken, valid ~24h. Real request shape, not reachable without a
   *  configured baseUrl behind CRDB's VPN tunnel. */
  private async getSessionToken(): Promise<string> {
    const { partnerId, password, baseUrl } = this.requireConfig();
    const res = await fetch(`${baseUrl}/service/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SESSION', partnerID: partnerId, password }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.status !== 200 || !body?.data?.sessionToken) {
      throw new Error(`CRDB PIP refused to open a session${body?.statusDesc ? `: ${body.statusDesc}` : '.'}`);
    }
    return body.data.sessionToken;
  }

  async initiateDisbursementBatch(input: DisbursementBatchInput): Promise<DisbursementBatchResult> {
    const { partnerId, baseUrl } = this.requireConfig();
    const sessionToken = await this.getSessionToken();
    const totalAmount = input.beneficiaries.reduce((sum, b) => sum + b.amount, 0);
    const res = await fetch(`${baseUrl}/service/batch/crdb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch: {
          batchCode: 'CRDBBTDIS',
          batchPostType: 'M',
          batchApproval: 'Y',
          batchID: input.batchId,
          batchAccount: input.sourceAccount,
          batchSender: input.senderName,
          batchDesc: input.description,
          batchCurrency: input.currency,
          batchTotalAmount: totalAmount,
        },
        records: input.beneficiaries.map((b) => ({
          recID: b.recId,
          recAccount: b.account,
          recBic: b.bic ?? '',
          recName: b.name,
          recRef: b.reference,
          recAmount: b.amount,
          recCurrency: b.currency,
          recDesc: b.description ?? input.description,
        })),
        sessionToken,
        partnerID: partnerId,
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.status !== 200) {
      throw new Error(`CRDB PIP declined the disbursement batch${body?.statusDesc ? `: ${body.statusDesc}` : '.'}`);
    }
    return { providerBatchRef: body.data.batchID, status: 'PENDING_APPROVAL' };
  }

  async fetchTransactionStatus(providerRef: string): Promise<TransactionStatusResult> {
    // CRDB02 (Push CRDB TXN FETCH) is scoped by customerAccount, checksum
    // SHA1(customerAccount + md5(requestID)) — not a bare txnReference
    // lookup. This interface takes only a providerRef, so wiring this needs
    // either a signature change (pass the account too) or confirmation from
    // CRDB that a reference-only lookup exists elsewhere in their API.
    throw new Error(
      `CRDB PIP transaction-status lookup by provider reference alone isn't in the documented message set — CRDB02 (TXN FETCH) is scoped by customerAccount, not txnReference. Confirm the right lookup with CRDB before wiring this. (Requested ref: ${providerRef})`
    );
  }
}

/**
 * CRDB Fund Transfer API (API-568-1) — internal-CRDB-account transfers via
 * CRDB's WSO2 API gateway. Modern OAuth2 Bearer + HTTPS, separate from PIP.
 *
 * Config expected: clientId, clientSecret, baseUrl (the doc's own sample
 * targets pre-prod-esb-wso2am-gw.crdbbank.co.tz — real, internet-reachable,
 * but the token endpoint that exchanges clientId/clientSecret for a Bearer
 * token isn't in the pasted doc, only the fact that one is required).
 */
class CrdbFundTransferConnector implements BankConnector {
  providerId = 'crdb-fund-transfer';
  providerName = 'CRDB Bank (Fund Transfer API)';
  constructor(private config: BankConnectorConfig) {}

  private async getAccessToken(): Promise<never> {
    throw new Error(
      'CRDB Fund Transfer API needs an OAuth2 Bearer token, but the token/authorization endpoint isn\'t in the documentation shared so far — only that requests carry "Authorization: Bearer <access token>". Get the token endpoint from CRDB (usually part of their WSO2 API Manager client registration) before this can run.'
    );
  }

  async initiateTransfer(input: BankTransferInput): Promise<BankTransferResult> {
    const { baseUrl } = this.config;
    if (!baseUrl) throw new Error('CRDB Fund Transfer is not connected — no base URL / client credentials configured.');
    await this.getAccessToken();
    // Real shape once a token exists — RequestData/TransactionCode "G01"
    // (internal, not customer-initiated) or "R03" (fund transfer CRDB),
    // header RequestId as the idempotency/trace key, response carries
    // TransactionId + TransactionReference — both real bank references,
    // not something Hudumika has to invent.
    throw new Error('unreachable — getAccessToken() always throws until CRDB\'s OAuth2 token endpoint is known');
  }
}

/**
 * Card rails (Cybersource, and by the same shape Stripe/Flutterwave/
 * Paystack) — a merchant-level API key/secret relationship, tokenized card
 * data, REST payments resource. Genuinely different auth shape from either
 * CRDB integration: one Hudumika-side merchant account per gateway, not a
 * partner acting on arbitrary customer accounts.
 *
 * Config expected: merchantId, keyId, secretKey. Cybersource's exact
 * request signing (JWT or HTTP-signature over merchantId/keyId/secretKey)
 * wasn't reachable from their docs site without deeper access than a page
 * fetch gives — needs their SDK or a signed-in developer-portal read before
 * this can place a real request.
 */
class CardGatewayConnector implements BankConnector {
  providerId: string;
  providerName: string;
  constructor(providerId: string, providerName: string, private config: BankConnectorConfig) {
    this.providerId = providerId;
    this.providerName = providerName;
  }

  async chargeCard(): Promise<never> {
    const { merchantId, keyId, secretKey } = this.config;
    if (!merchantId || !keyId || !secretKey) {
      throw new Error(`${this.providerName} is not connected — needs a real merchant account (merchantId/keyId/secretKey), a business relationship this platform does not have yet.`);
    }
    throw new Error(`${this.providerName}'s exact request-signing recipe needs their SDK/developer-portal docs, not yet pulled in — the Payments resource shape (amount/currency/card token/merchant reference) is known, the signing headers are not.`);
  }
}

class StubBankConnector implements BankConnector {
  providerId: string;
  providerName: string;
  constructor(providerId: string) {
    this.providerId = providerId;
    this.providerName = providerId;
  }
}

/** Resolves a connector by provider id. Every branch here is real in its
 *  request-shaping and will throw a specific, actionable error until the
 *  matching partnership/credentials exist — same "fail loudly, don't fake
 *  it" rule as getCarrierAdapter() and getPaymentGatewayAdapter(). */
export function getBankConnector(providerId: string, config: BankConnectorConfig = {}): BankConnector {
  switch (providerId) {
    case 'crdb-pip': return new CrdbPipConnector(config);
    case 'crdb-fund-transfer': return new CrdbFundTransferConnector(config);
    case 'cybersource': return new CardGatewayConnector('cybersource', 'Cybersource', config);
    default: return new StubBankConnector(providerId);
  }
}
