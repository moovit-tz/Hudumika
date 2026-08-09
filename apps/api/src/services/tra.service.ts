/**
 * TRA VFD Service
 * Handles integration with Tanzania Revenue Authority's
 * Virtual Fiscal Device (VFD) API (EFDMS).
 *
 * Documentation: https://tra-docs.netlify.app/
 * Verification:  https://verify.tra.go.tz/Home/Index
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { sql } from 'kysely';
import { db } from '../db/client.js';
import QRCode from 'qrcode';
import { guardPlaceholders } from './placeholder-identifiers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TRARegistrationResult {
  success: boolean;
  regId?: string;
  serial?: string;
  uin?: string;
  tin?: string;
  vrn?: string;
  mobile?: string;
  street?: string;
  city?: string;
  address?: string;
  country?: string;
  name?: string;
  receiptCode?: string;
  region?: string;
  gc?: number;
  taxOffice?: string;
  username?: string;
  password?: string;
  tokenPath?: string;
  taxCode?: string;
  ackCode?: number;
  ackMsg?: string;
  error?: string;
}

export interface TRATokenResult {
  success: boolean;
  accessToken?: string;
  expiresAt?: Date;
  error?: string;
}

export interface TRAInvoiceResult {
  success: boolean;
  rctNum?: number;
  rctvNum?: string;
  qrUrl?: string;
  ackCode?: number;
  ackMsg?: string;
  error?: string;
}

export interface TRAVerifyResult {
  success: boolean;
  verified?: boolean;
  data?: Record<string, any>;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment URLs
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINTS = {
  test: {
    hostname: 'virtual.tra.go.tz',
    registration: '/efdmsRctApi/api/vfdRegReq',
    token: '/efdmsRctApi/vfdtoken',
    receipt: '/efdmsRctApi/api/efdmsRctInfo',
    zreport: '/efdmsRctApi/api/efdmszreport',
    verify: 'https://virtual.tra.go.tz/efdmsRctVerify',
  },
  production: {
    hostname: 'vfd.tra.go.tz',
    registration: '/efdmsRctApi/api/vfdRegReq',
    token: '/efdmsRctApi/vfdtoken',
    receipt: '/efdmsRctApi/api/efdmsRctInfo',
    zreport: '/efdmsRctApi/api/efdmszreport',
    verify: 'https://verify.tra.go.tz/efdmsRctVerify',
  },
};

const PUBLIC_VERIFY_URL = 'https://verify.tra.go.tz/efdmsRctVerify';

/**
 * EFDMS <VATRATE> letter for each <TAXCODE>, per the TRA VFD API documentation
 * cited at the top of this file:
 *
 *   1 Standard Rate (18%)  -> A      4 Special Relief (0%) -> D
 *   2 Special Rate (0%)    -> B      5 Exempt (0%)         -> E
 *   3 Zero rated (0%)      -> C
 */
const VATRATE_BY_TAXCODE: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };

// ─────────────────────────────────────────────────────────────────────────────
// XML helpers
// ─────────────────────────────────────────────────────────────────────────────

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: false,
  suppressEmptyNode: false,
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
});

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─────────────────────────────────────────────────────────────────────────────
// PKI / Digital Signature
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load private key from a PFX/PKCS12 file using node-forge.
 * Returns the private key object for signing, or null on error.
 */
async function loadPrivateKeyFromPfx(
  pfxPath: string,
  pfxPassword: string,
): Promise<crypto.KeyObject | null> {
  try {
    // Dynamically import node-forge to avoid ESM/CJS issues
    const forge = await import('node-forge');
    const pfxDer = fs.readFileSync(pfxPath);
    const pfxAsn1 = forge.asn1.fromDer(pfxDer.toString('binary'));
    const pfxObj = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pfxPassword);

    const bags = pfxObj.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBags = bags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (!keyBags || keyBags.length === 0) {
      // try keyBag as well
      const bags2 = pfxObj.getBags({ bagType: forge.pki.oids.keyBag });
      const keyBags2 = bags2[forge.pki.oids.keyBag];
      if (!keyBags2 || keyBags2.length === 0) return null;
      const forgePkey2 = keyBags2[0].key;
      if (!forgePkey2) return null;
      const pem2 = forge.pki.privateKeyToPem(forgePkey2);
      return crypto.createPrivateKey(pem2);
    }
    const forgePkey = keyBags[0].key;
    if (!forgePkey) return null;
    const pem = forge.pki.privateKeyToPem(forgePkey);
    return crypto.createPrivateKey(pem);
  } catch (err) {
    console.error('[TRA] Failed to load PFX:', err);
    return null;
  }
}

/**
 * Sign XML content using SHA1withRSA and return base64-encoded signature.
 * This follows TRA's requirement: PKCS12 standard, SHA1 with RSA, result base64 encoded.
 */
function signXml(content: string, privateKey: crypto.KeyObject): string {
  const sign = crypto.createSign('SHA1');
  sign.update(content, 'utf8');
  return sign.sign(privateKey, 'base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────────────────

function httpRequest(options: {
  hostname: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  useHttps?: boolean;
}): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: options.hostname,
      path: options.path,
      method: options.method,
      headers: {
        ...options.headers,
        'Content-Length': Buffer.byteLength(options.body),
      },
    };

    const lib = options.useHttps !== false ? https : http;
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('TRA API request timed out'));
    });

    req.write(options.body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter management
// ─────────────────────────────────────────────────────────────────────────────

async function getNextCounters(tenantId: string): Promise<{ gc: number; dc: number; znum: string }> {
  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const znum = todayDate.replace(/-/g, ''); // YYYYMMDD

  const config = await db
    .selectFrom('tra_vfd_config')
    .select(['gc', 'dc', 'dc_date'])
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!config) throw new Error('TRA VFD not configured for this tenant');

  const currentGc = Number(config.gc) || 0;
  const currentDcDate = config.dc_date ? new Date(config.dc_date).toISOString().slice(0, 10) : null;
  const needsDcReset = currentDcDate !== todayDate;

  const newGc = currentGc + 1;
  const newDc = needsDcReset ? 1 : (Number(config.dc) || 0) + 1;

  // Update counters atomically
  await db
    .updateTable('tra_vfd_config')
    .set({
      gc: newGc,
      dc: newDc,
      dc_date: today,
      updated_at: new Date(),
    })
    .where('tenant_id', '=', tenantId)
    .execute();

  return { gc: newGc, dc: newDc, znum };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRA Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The workspace's own VAT registration number, for the placeholder guard.
 * Read separately from tra_vfd_config because that table holds the TIN, while
 * the VRN — the one actually seeded as TEST-VRN-NOT-REAL — lives in
 * tax_registrations.
 */
async function vatRegistrationNumber(tenantId: string): Promise<string | null> {
  const row = await db.selectFrom('tax_registrations')
    .select('registration_number')
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return row?.registration_number ?? null;
}

export const TRAService = {

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Register or re-register VFD with TRA.
   * Call once to receive REGID, USERNAME, PASSWORD, RECEIPTCODE.
   */
  async register(
    tenantId: string,
    tin: string,
    certKey: string,
    certSerial: string,
    pfxPath: string,
    pfxPassword: string,
    environment: 'test' | 'production' = 'test',
  ): Promise<TRARegistrationResult> {
    try {
      const env = ENDPOINTS[environment];

      // Load private key
      const privateKey = await loadPrivateKeyFromPfx(pfxPath, pfxPassword);
      if (!privateKey) {
        return { success: false, error: 'Failed to load certificate. Check PFX path and password.' };
      }

      // Build REGDATA XML
      const regDataXml = `<REGDATA><TIN>${escapeXml(tin)}</TIN><CERTKEY>${escapeXml(certKey)}</CERTKEY></REGDATA>`;

      // Sign REGDATA
      const signature = signXml(regDataXml, privateKey);

      // Build full request XML
      const requestXml = `<?xml version="1.0" encoding="UTF-8"?><EFDMS>${regDataXml}<EFDMSSIGNATURE>${signature}</EFDMSSIGNATURE></EFDMS>`;

      const response = await httpRequest({
        hostname: env.hostname,
        path: env.registration,
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Cert-Serial': Buffer.from(certSerial).toString('base64'),
          'Client': 'webapi',
        },
        body: requestXml,
      });

      if (response.statusCode !== 200) {
        return { success: false, error: `TRA returned HTTP ${response.statusCode}` };
      }

      const parsed = xmlParser.parse(response.body);
      const resp = parsed?.EFDMSRESP || parsed?.efdmsresp || {};

      const ackCode = Number(resp.ACKCODE ?? resp.ackcode ?? -1);
      const ackMsg = String(resp.ACKMSG ?? resp.ackmsg ?? '');

      if (ackCode !== 0) {
        return { success: false, ackCode, ackMsg, error: ackMsg };
      }

      const regData: TRARegistrationResult = {
        success: true,
        regId: String(resp.REGID || ''),
        serial: String(resp.SERIAL || ''),
        uin: String(resp.UIN || ''),
        tin: String(resp.TIN || tin),
        vrn: String(resp.VRN || ''),
        mobile: String(resp.MOBILE || ''),
        street: String(resp.STREET || ''),
        city: String(resp.CITY || ''),
        address: String(resp.ADDRESS || ''),
        country: String(resp.COUNTRY || ''),
        name: String(resp.NAME || ''),
        receiptCode: String(resp.RECEIPTCODE || ''),
        region: String(resp.REGION || ''),
        gc: Number(resp.GC || 0),
        taxOffice: String(resp.TAXOFFICE || ''),
        username: String(resp.USERNAME || ''),
        password: String(resp.PASSWORD || ''),
        tokenPath: String(resp.TOKENPATH || env.token),
        taxCode: String(resp.TAXCODE || 'A'),
        ackCode,
        ackMsg,
      };

      // Save / upsert config to DB
      const existing = await db
        .selectFrom('tra_vfd_config')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (existing) {
        await db.updateTable('tra_vfd_config').set({
          tin,
          cert_key: certKey,
          cert_serial: certSerial,
          pfx_path: pfxPath,
          pfx_password: pfxPassword,
          reg_id: regData.regId ?? null,
          serial: regData.serial ?? null,
          uin: regData.uin ?? null,
          vrn: regData.vrn ?? null,
          receipt_code: regData.receiptCode ?? null,
          username: regData.username ?? null,
          password: regData.password ?? null,
          token_path: regData.tokenPath ?? null,
          tax_office: regData.taxOffice ?? null,
          tax_code: regData.taxCode ?? 'A',
          environment,
          registered_at: new Date(),
          updated_at: new Date(),
        }).where('tenant_id', '=', tenantId).execute();
      } else {
        await db.insertInto('tra_vfd_config').values({
          tenant_id: tenantId,
          tin,
          cert_key: certKey,
          cert_serial: certSerial,
          pfx_path: pfxPath,
          pfx_password: pfxPassword,
          reg_id: regData.regId ?? null,
          serial: regData.serial ?? null,
          uin: regData.uin ?? null,
          vrn: regData.vrn ?? null,
          receipt_code: regData.receiptCode ?? null,
          username: regData.username ?? null,
          password: regData.password ?? null,
          token_path: regData.tokenPath ?? null,
          tax_office: regData.taxOffice ?? null,
          tax_code: regData.taxCode ?? 'A',
          environment,
          gc: 0,
          dc: 0,
          registered_at: new Date(),
        }).execute();
      }

      return regData;
    } catch (err: any) {
      console.error('[TRA] Registration error:', err);
      return { success: false, error: err.message };
    }
  },

  // ── Token ────────────────────────────────────────────────────────────────────

  /**
   * Fetch a new token from TRA, or return cached one if still valid.
   */
  async getToken(tenantId: string): Promise<TRATokenResult> {
    try {
      const config = await db
        .selectFrom('tra_vfd_config')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!config) return { success: false, error: 'TRA VFD not configured' };
      if (!config.username || !config.password) return { success: false, error: 'TRA credentials not set (register first)' };

      // Check if existing token is still valid (with 5-min buffer)
      if (config.access_token && config.token_expires_at) {
        const expiresAt = new Date(config.token_expires_at);
        const now = new Date();
        if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
          return { success: true, accessToken: config.access_token, expiresAt };
        }
      }

      const environment = (config.environment || 'test') as 'test' | 'production';
      const env = ENDPOINTS[environment];
      const tokenPath = config.token_path || env.token;

      // Parse token path to get hostname + path
      let tokenHostname = env.hostname;
      let tokenPathStr = tokenPath;
      if (tokenPath.startsWith('https://') || tokenPath.startsWith('http://')) {
        const url = new URL(tokenPath);
        tokenHostname = url.hostname;
        tokenPathStr = url.pathname;
      }

      const body = new URLSearchParams({
        Username: config.username,
        Password: config.password,
        grant_type: 'password',
      }).toString();

      const response = await httpRequest({
        hostname: tokenHostname,
        path: tokenPathStr,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (response.statusCode !== 200) {
        return { success: false, error: `Token request failed: HTTP ${response.statusCode}` };
      }

      const tokenData = JSON.parse(response.body);
      const accessToken = tokenData.access_token;
      const expiresInSeconds = Number(tokenData.expires_in) || 86399;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      // Save token to DB
      await db.updateTable('tra_vfd_config').set({
        access_token: accessToken,
        token_expires_at: expiresAt,
        updated_at: new Date(),
      }).where('tenant_id', '=', tenantId).execute();

      return { success: true, accessToken, expiresAt };
    } catch (err: any) {
      console.error('[TRA] Token error:', err);
      return { success: false, error: err.message };
    }
  },

  // ── Invoice/Receipt Posting ──────────────────────────────────────────────────

  /**
   * Submit an invoice to TRA EFDMS and store the RCTVNUM and QR code URL.
   */
  async submitInvoice(tenantId: string, invoiceId: string): Promise<TRAInvoiceResult> {
    try {
      // 1. Load TRA config
      const config = await db
        .selectFrom('tra_vfd_config')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!config) return { success: false, error: 'TRA VFD not configured for this tenant' };
      if (!config.reg_id || !config.receipt_code) {
        return { success: false, error: 'TRA registration incomplete. Please complete VFD registration first.' };
      }

      // Nothing filed under a number that was seeded for testing. The tenants
      // carrying TEST-VRN-NOT-REAL exist so the VAT-registered path could be
      // exercised before go-live; the note saying so lives in the database,
      // which is not consulted at the moment an invoice is fiscalised.
      // Only bites in production — a placeholder in the TRA test environment is
      // what the test environment is for.
      const placeholder = guardPlaceholders(config.environment, {
        TIN: config.tin,
        'VAT registration number': await vatRegistrationNumber(tenantId),
      });
      if (placeholder) return { success: false, error: placeholder };

      // 2. Load invoice with lines
      const invoice = await db
        .selectFrom('sales_invoices')
        .selectAll()
        .where('id', '=', invoiceId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!invoice) return { success: false, error: 'Invoice not found' };

      // Don't re-submit if already successfully submitted
      if (invoice.tra_status === 'submitted' && invoice.tra_ack_code === 0) {
        return {
          success: true,
          rctNum: invoice.tra_rctnum ?? undefined,
          rctvNum: invoice.tra_rctvnum ?? undefined,
          qrUrl: invoice.tra_qr_url ?? undefined,
          ackCode: 0,
          ackMsg: 'Already submitted',
        };
      }

      // Lines come with their tax treatment attached, not just a percentage —
      // see the TAXCODE derivation below for why that mattered.
      const lines = await db
        .selectFrom('sales_invoice_lines as l')
        .leftJoin('tax_codes as tc', 'tc.id', 'l.tax_code_id')
        .selectAll('l')
        .select(['tc.code as tc_code', 'tc.kind as tc_kind', 'tc.tra_tax_code as tc_tra',
                 'tc.tra_vat_rate as tc_vat_rate'])
        .where('l.invoice_id', '=', invoiceId)
        .execute();

      // Fail on what is knowable before spending a token request, a counter
      // increment and a certificate load on an invoice that cannot be filed.
      // Reverse charge and out-of-scope have no EFDMS equivalent; refusing is
      // the point, since the alternative is filing under the nearest wrong
      // code — which is exactly what this whole mechanism replaces.
      const unfilable = lines.find(l => l.tc_kind && (l.tc_tra === null || l.tc_tra === undefined));
      if (unfilable) {
        return {
          success: false,
          error: `Line "${unfilable.name}" uses tax code ${unfilable.tc_code} ` +
                 `(${unfilable.tc_kind}), which has no TRA equivalent. Set its TRA tax code ` +
                 `under Finance › Tax codes, or use a treatment TRA recognises.`,
        };
      }

      /**
       * A line with no tax code at all is not filable either, and used to slip
       * past the check above — `l.tc_kind &&` skips a line whose join found
       * nothing, which is exactly the unclassified case.
       *
       * It then fell through to the rate guess below: `taxPct >= 18 ? 1 : taxPct
       * > 0 ? 2 : 3`. That is the misstatement the comment on that line says was
       * fixed for coded lines, reintroduced for uncoded ones — zero-rated,
       * exempt, reverse-charge and out-of-scope are indistinguishable once all
       * you have is a percentage, and they are not the same on a return.
       * Zero-rated supplies allow input tax recovery; exempt ones do not.
       *
       * Refusing is the point. The alternative is filing a guess under a real
       * signature.
       */
      const unclassified = lines.filter(l => !l.tax_code_id);
      if (unclassified.length) {
        const names = unclassified.slice(0, 3).map(l => `"${l.name}"`).join(', ');
        return {
          success: false,
          error: `${unclassified.length} line${unclassified.length === 1 ? '' : 's'} on this invoice ` +
                 `(${names}${unclassified.length > 3 ? ', …' : ''}) ${unclassified.length === 1 ? 'has' : 'have'} ` +
                 `no tax treatment recorded. A rate alone cannot say whether a supply is zero-rated, exempt, ` +
                 `reverse-charge or out of scope, and TRA needs to be told which. Classify them under ` +
                 `Finance › Tax codes › Unclassified before filing.`,
        };
      }

      // 3. Get/refresh token
      const tokenResult = await this.getToken(tenantId);
      if (!tokenResult.success || !tokenResult.accessToken) {
        return { success: false, error: tokenResult.error || 'Could not obtain TRA token' };
      }

      // 4. Get/increment counters
      const { gc, dc, znum } = await getNextCounters(tenantId);

      // 5. Load private key for signing
      if (!config.pfx_path || !config.pfx_password) {
        return { success: false, error: 'PFX certificate not configured' };
      }
      const privateKey = await loadPrivateKeyFromPfx(config.pfx_path, config.pfx_password);
      if (!privateKey) return { success: false, error: 'Failed to load signing certificate' };

      // 6. Compute invoice totals
      const exRate = Number(invoice.exchange_rate) || 1;
      let totalTaxExcl = 0;
      let totalTaxIncl = 0;
      const itemsXml: string[] = [];
      // TRA expects one <VATTOTALS> block per VAT rate present on the invoice.
      // Collapsing every rate into a single bucket under-reports mixed invoices
      // (e.g. a standard-rated handling fee alongside a zero-rated freight line).
      const vatBuckets: Record<string, { net: number; tax: number }> = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const qty = Number(line.qty) || 1;
        const rate = Number(line.rate) || 0;
        const taxPct = Number(line.tax_pct) || 0;

        // Convert on the line's own currency against the invoice's, not on
        // `line_group`. The old test — "is it tagged shipping?" — held only
        // because a freight invoice happens to bill its ocean leg under that
        // label; a USD line in any other group was submitted to TRA at its face
        // value in shillings. Same fix as invoiceGrandTotal().
        const invCur = (invoice.currency || 'TZS').toUpperCase();
        const lineCur = (line.currency || invCur).toUpperCase();
        const lineRate = lineCur === invCur ? rate : rate * exRate;
        const amtExcl = qty * lineRate;
        const amtIncl = amtExcl * (1 + taxPct / 100);
        const taxAmt = amtIncl - amtExcl;

        // TAXCODE: 1=Standard(18%), 2=Special, 3=Zero, 4=Special Relief, 5=Exempt
        //
        // This used to be `taxPct >= 18 ? 1 : taxPct > 0 ? 2 : 3` — 4 and 5 were
        // unreachable, so every exempt and every special-relief line in the
        // system was filed as zero-rated. That understates nothing on the
        // invoice and misstates the return: zero-rated supplies allow input tax
        // recovery, exempt ones do not.
        //
        // The line's tax code now carries the treatment. The old rate guess
        // survives only as the fallback for lines written before tax codes
        // existed, where the treatment genuinely was never recorded.
        // Unfilable codes were already rejected above, before any network call.
        const taxCode = line.tc_tra != null
          ? Number(line.tc_tra)
          : (taxPct >= 18 ? 1 : taxPct > 0 ? 2 : 3);
        // VATRATE: the <VATTOTALS> grouping letter, which tracks TAXCODE one
        // for one per the TRA VFD API:
        //
        //   A = 18 (Standard Rate for VAT items)   B = 0 (Special Rate)
        //   C = 0  (Zero rated for Non-VAT items)  D = 0 (Special Relief)
        //   E = 0  (Exempt items)
        //
        // This was `taxCode === 1 ? 'A' : taxCode === 2 ? 'B' : 'C'`, which
        // collapsed 3, 4 and 5 onto C — so every exempt sale was reported
        // inside the zero-rated totals bucket. The per-item TAXCODE was right;
        // the block grouping it was not. See migration 185.
        //
        // The code's own letter wins where one is set, so a tenant can override
        // per treatment; this covers lines with no tax code at all.
        const vatRate = line.tc_vat_rate ?? VATRATE_BY_TAXCODE[taxCode] ?? 'C';

        totalTaxExcl += amtExcl;
        totalTaxIncl += amtIncl;
        const bucket = vatBuckets[vatRate] || (vatBuckets[vatRate] = { net: 0, tax: 0 });
        bucket.net += amtExcl;
        bucket.tax += taxAmt;

        itemsXml.push(
          `<ITEM>` +
          `<ID>${i + 1}</ID>` +
          `<DESC>${escapeXml(line.name)}</DESC>` +
          `<QTY>${qty.toFixed(2)}</QTY>` +
          `<TAXCODE>${taxCode}</TAXCODE>` +
          `<AMT>${amtIncl.toFixed(2)}</AMT>` +
          `</ITEM>`,
        );
      }
      if (Object.keys(vatBuckets).length === 0) vatBuckets.C = { net: 0, tax: 0 };

      const rctNum = gc;
      const rctvNum = `${config.receipt_code}${gc}`;

      // 7. Determine date/time fields (use original invoice date if available)
      const now = new Date();
      const rctDate = invoice.bill_date ? new Date(invoice.bill_date) : now;
      const dateStr = rctDate.toISOString().slice(0, 10); // YYYY-MM-DD
      const timeStr = now.toTimeString().slice(0, 8);     // HH:MM:SS

      // Load customer info — link the real TIN when the invoice has a known
      // customer, so the receipt is issued to their account (CUSTIDTYPE=1)
      // instead of always going out as an anonymous walk-in sale.
      const customer = invoice.customer_id
        ? await db.selectFrom('customers').select(['tax_id', 'phone']).where('id', '=', invoice.customer_id).executeTakeFirst()
        : undefined;
      const custIdType = customer?.tax_id ? 1 : 6;
      const custId = customer?.tax_id ? escapeXml(customer.tax_id) : '';
      const custName = escapeXml(invoice.client_name || 'Customer');
      const mobileNum = customer?.phone ? customer.phone.replace(/[+\s-]/g, '') : '';

      const vatTotalsXml = Object.entries(vatBuckets)
        .map(([rate, b]) =>
          `<VATTOTALS>` +
          `<VATRATE>${rate}</VATRATE>` +
          `<NETTAMOUNT>${b.net.toFixed(2)}</NETTAMOUNT>` +
          `<TAXAMOUNT>${b.tax.toFixed(2)}</TAXAMOUNT>` +
          `</VATTOTALS>`,
        )
        .join('');

      // 8. Build the RCT (receipt/invoice) XML body
      const rctDataXml =
        `<RCT>` +
        `<DATE>${dateStr}</DATE>` +
        `<TIME>${timeStr}</TIME>` +
        `<TIN>${escapeXml(config.tin || '')}</TIN>` +
        `<REGID>${escapeXml(config.reg_id)}</REGID>` +
        `<EFDSERIAL>${escapeXml(config.serial || config.cert_key || '')}</EFDSERIAL>` +
        `<CUSTIDTYPE>${custIdType}</CUSTIDTYPE>` +
        `<CUSTID>${custId}</CUSTID>` +
        `<CUSTNAME>${custName}</CUSTNAME>` +
        `<MOBILENUM>${mobileNum}</MOBILENUM>` +
        `<RCTNUM>${rctNum}</RCTNUM>` +
        `<DC>${dc}</DC>` +
        `<GC>${gc}</GC>` +
        `<ZNUM>${znum}</ZNUM>` +
        `<RCTVNUM>${rctvNum}</RCTVNUM>` +
        `<ITEMS>${itemsXml.join('')}</ITEMS>` +
        `<TOTALS>` +
        `<TOTALTAXEXCL>${totalTaxExcl.toFixed(2)}</TOTALTAXEXCL>` +
        `<TOTALTAXINCL>${totalTaxIncl.toFixed(2)}</TOTALTAXINCL>` +
        `<DISCOUNT>0.00</DISCOUNT>` +
        `</TOTALS>` +
        `<PAYMENTS>` +
        `<PMTTYPE>INVOICE</PMTTYPE>` +
        `<PMTAMOUNT>${totalTaxIncl.toFixed(2)}</PMTAMOUNT>` +
        `</PAYMENTS>` +
        vatTotalsXml +
        `</RCT>`;

      // 9. Sign the RCT data
      const signature = signXml(rctDataXml, privateKey);

      const requestXml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<EFDMS>` +
        rctDataXml +
        `<EFDMSSIGNATURE>${signature}</EFDMSSIGNATURE>` +
        `</EFDMS>`;

      // 10. POST to TRA
      const environment = (config.environment || 'test') as 'test' | 'production';
      const env = ENDPOINTS[environment];

      const response = await httpRequest({
        hostname: env.hostname,
        path: env.receipt,
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Routing-Key': 'vfdrct',
          'Cert-Serial': Buffer.from(config.cert_serial || '').toString('base64'),
          'Authorization': `bearer ${tokenResult.accessToken}`,
        },
        body: requestXml,
      });

      // 11. Parse response
      const parsed = xmlParser.parse(response.body);
      const ack = parsed?.RCTACK || parsed?.rctack || {};
      const ackCode = Number(ack.ACKCODE ?? ack.ackcode ?? -1);
      const ackMsg = String(ack.ACKMSG ?? ack.ackmsg ?? response.body);

      // 12. Generate QR code URL (self-generated as per TRA rules)
      const verifyBase = environment === 'production' ? PUBLIC_VERIFY_URL : env.verify;
      const qrUrl = `${verifyBase}/${rctvNum}`;

      // 13. Save result to invoice
      const traStatus = ackCode === 0 ? 'submitted' : 'failed';
      await db.updateTable('sales_invoices').set({
        tra_status: traStatus,
        tra_rctnum: rctNum,
        tra_dc: dc,
        tra_znum: znum,
        tra_rctvnum: rctvNum,
        tra_submitted_at: new Date(),
        tra_ack_code: ackCode,
        tra_ack_msg: ackMsg,
        tra_qr_url: qrUrl,
        tra_total_incl: ackCode === 0 ? totalTaxIncl : null,
        updated_at: new Date(),
      }).where('id', '=', invoiceId).execute();

      // Accumulate the tenant's running fiscal total so the nightly Z-report's
      // GROSSTOTAL reflects cumulative sales, not the receipt count.
      if (ackCode === 0) {
        await db.updateTable('tra_vfd_config').set({
          gross_total: sql<number>`gross_total + ${totalTaxIncl}`,
          updated_at: new Date(),
        }).where('tenant_id', '=', tenantId).execute();
      }

      if (ackCode !== 0) {
        return { success: false, ackCode, ackMsg, error: ackMsg };
      }

      return { success: true, rctNum, rctvNum, qrUrl, ackCode, ackMsg };
    } catch (err: any) {
      console.error('[TRA] Invoice submission error:', err);
      // Mark as failed in DB
      await db.updateTable('sales_invoices').set({
        tra_status: 'failed',
        tra_ack_msg: err.message,
        updated_at: new Date(),
      }).where('id', '=', invoiceId).where('tenant_id', '=', tenantId).execute().catch(() => {});
      return { success: false, error: err.message };
    }
  },

  // ── QR Code Generation ───────────────────────────────────────────────────────

  /**
   * Generate a QR code Data URL (base64 PNG) for a given RCTVNUM.
   */
  async generateQRCodeDataUrl(rctvNum: string, environment: 'test' | 'production' = 'production'): Promise<string> {
    const verifyBase = environment === 'production' ? PUBLIC_VERIFY_URL : ENDPOINTS.test.verify;
    const url = `${verifyBase}/${rctvNum}`;
    return await QRCode.toDataURL(url, { width: 200, margin: 1 });
  },

  // ── EFD/VFD Receipt Verification (Expenses) ──────────────────────────────────

  /**
   * Verify a supplier EFD/VFD receipt against TRA portal.
   * Returns verification details if receipt is genuine.
   */
  async verifyEFDReceipt(rctvNum: string): Promise<TRAVerifyResult> {
    try {
      const verifyUrl = `${PUBLIC_VERIFY_URL}/${encodeURIComponent(rctvNum)}`;

      return new Promise((resolve) => {
        https.get(verifyUrl, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              // TRA verify returns HTML — check for "not found" / "valid" indicators
              const isValid = !body.toLowerCase().includes('not found') &&
                              !body.toLowerCase().includes('invalid') &&
                              body.length > 200;
              resolve({
                success: true,
                verified: isValid,
                data: { url: verifyUrl, statusCode: res.statusCode, snippet: body.slice(0, 500) },
              });
            } else {
              resolve({ success: false, verified: false, error: `HTTP ${res.statusCode}` });
            }
          });
        }).on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ── Z-Report ─────────────────────────────────────────────────────────────────

  /**
   * Submit Z-report to TRA for a given date (defaults to today).
   * Must be called at or after end of business for that date.
   */
  async submitZReport(tenantId: string, date?: Date): Promise<{ success: boolean; ackCode?: number; ackMsg?: string; error?: string }> {
    try {
      const reportDate = date || new Date();
      const dateStr = reportDate.toISOString().slice(0, 10);
      const timeStr = reportDate.toTimeString().slice(0, 8);
      const znumber = dateStr.replace(/-/g, '');

      const config = await db
        .selectFrom('tra_vfd_config')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!config) return { success: false, error: 'TRA VFD not configured' };
      if (!config.reg_id) return { success: false, error: 'TRA registration incomplete' };

      // A Z report files a day's takings, so the same rule applies as for a
      // single invoice — arguably more so, since nobody reviews it line by line.
      const zPlaceholder = guardPlaceholders(config.environment, {
        TIN: config.tin,
        'VAT registration number': await vatRegistrationNumber(tenantId),
      });
      if (zPlaceholder) return { success: false, error: zPlaceholder };

      // Get token
      const tokenResult = await this.getToken(tenantId);
      if (!tokenResult.success || !tokenResult.accessToken) {
        return { success: false, error: tokenResult.error || 'Could not obtain TRA token' };
      }

      // Load private key
      if (!config.pfx_path || !config.pfx_password) {
        return { success: false, error: 'PFX certificate not configured' };
      }
      const privateKey = await loadPrivateKeyFromPfx(config.pfx_path, config.pfx_password);
      if (!privateKey) return { success: false, error: 'Failed to load signing certificate' };

      // Get daily totals from invoices
      const startOfDay = new Date(dateStr + 'T00:00:00Z');
      const endOfDay = new Date(dateStr + 'T23:59:59Z');

      const dayInvoices = await db
        .selectFrom('sales_invoices')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('tra_status', '=', 'submitted')
        .where('tra_submitted_at', '>=', startOfDay)
        .where('tra_submitted_at', '<=', endOfDay)
        .execute();

      const dailyTotal = dayInvoices.reduce((sum, inv) => sum + (Number(inv.tra_total_incl) || 0), 0);

      // Cumulative total ever fiscalized for this tenant — maintained incrementally
      // in submitInvoice(). `gc` is the receipt *count*, not a currency amount.
      const grossTotal = Number(config.gross_total) || 0;

      // Build Z-Report XML
      const zreportDataXml =
        `<ZREPORT>` +
        `<DATE>${dateStr}</DATE>` +
        `<TIME>${timeStr}</TIME>` +
        `<HEADER>` +
        `<LINE>${escapeXml(config.tin || '')}</LINE>` +
        `<LINE>${escapeXml(config.vrn || 'NOT REGISTERED')}</LINE>` +
        `<LINE>${escapeXml(config.tax_office || '')}</LINE>` +
        `<LINE>WEBAPI</LINE>` +
        `</HEADER>` +
        `<VRN>${escapeXml(config.vrn || 'NOT REGISTERED')}</VRN>` +
        `<TIN>${escapeXml(config.tin || '')}</TIN>` +
        `<TAXOFFICE>${escapeXml(config.tax_office || '')}</TAXOFFICE>` +
        `<REGID>${escapeXml(config.reg_id)}</REGID>` +
        `<ZNUMBER>${znumber}</ZNUMBER>` +
        `<EFDSERIAL>${escapeXml(config.serial || config.cert_key || '')}</EFDSERIAL>` +
        `<REGISTRATIONDATE>${config.registered_at ? new Date(config.registered_at).toISOString().slice(0, 10) : dateStr}</REGISTRATIONDATE>` +
        `<USER>${escapeXml(config.uin || '')}</USER>` +
        `<SIMIMSI>WEBAPI</SIMIMSI>` +
        `<TOTALS>` +
        `<DAILYTOTALAMOUNT>${dailyTotal.toFixed(2)}</DAILYTOTALAMOUNT>` +
        `<GROSSTOTAL>${grossTotal.toFixed(2)}</GROSSTOTAL>` +
        `<TOTALCORRECTION>0.00</TOTALCORRECTION>` +
        `<TOTALDISCOUNTS>0.00</TOTALDISCOUNTS>` +
        `<TOTALSURCHARGE>0.00</TOTALSURCHARGE>` +
        `<TICKETSVOID>0</TICKETSVOID>` +
        `<TOTALVOIDRECEIPTS>0.00</TOTALVOIDRECEIPTS>` +
        `<RECEIPTSFISCAL>${dayInvoices.length}</RECEIPTSFISCAL>` +
        `<RECEIPTSNONFISCAL>0</RECEIPTSNONFISCAL>` +
        `</TOTALS>` +
        `<VATTOTALS>` +
        `<VATRATE>A</VATRATE>` +
        `<NETTAMOUNT>0.00</NETTAMOUNT>` +
        `<TAXAMOUNT>0.00</TAXAMOUNT>` +
        `</VATTOTALS>` +
        `<PAYMENTS>` +
        `<PMTTYPE>INVOICE</PMTTYPE>` +
        `<PMTAMOUNT>${dailyTotal.toFixed(2)}</PMTAMOUNT>` +
        `</PAYMENTS>` +
        `<CHANGES><VATCHANGENUM>0</VATCHANGENUM><HEADCHANGENUM>0</HEADCHANGENUM><FMCHANGENUM>0</FMCHANGENUM></CHANGES>` +
        `<ERRORS/>` +
        `<FWVERSION>3.0</FWVERSION>` +
        `<FWCHECKSUM>WEBAPI</FWCHECKSUM>` +
        `</ZREPORT>`;

      const signature = signXml(zreportDataXml, privateKey);
      const requestXml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<EFDMS>${zreportDataXml}<EFDMSSIGNATURE>${signature}</EFDMSSIGNATURE></EFDMS>`;

      const environment = (config.environment || 'test') as 'test' | 'production';
      const env = ENDPOINTS[environment];

      const response = await httpRequest({
        hostname: env.hostname,
        path: env.zreport,
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Routing-Key': 'vfdzreport',
          'Cert-Serial': Buffer.from(config.cert_serial || '').toString('base64'),
          'Authorization': `bearer ${tokenResult.accessToken}`,
        },
        body: requestXml,
      });

      const parsed = xmlParser.parse(response.body);
      const ack = parsed?.ZREPORTACK || parsed?.zreportack || {};
      const ackCode = Number(ack.ACKCODE ?? ack.ackcode ?? -1);
      const ackMsg = String(ack.ACKMSG ?? ack.ackmsg ?? response.body);

      if (ackCode === 0) {
        // Update last_zreport_date
        await db.updateTable('tra_vfd_config').set({
          last_zreport_date: reportDate,
          updated_at: new Date(),
        }).where('tenant_id', '=', tenantId).execute();
      }

      return { success: ackCode === 0, ackCode, ackMsg };
    } catch (err: any) {
      console.error('[TRA] Z-Report error:', err);
      return { success: false, error: err.message };
    }
  },

  // ── Config Helper ────────────────────────────────────────────────────────────

  /**
   * Get sanitized TRA config status for a tenant (no passwords).
   */
  async getConfig(tenantId: string) {
    const config = await db
      .selectFrom('tra_vfd_config')
      .select([
        'id', 'tenant_id', 'tin', 'cert_key', 'reg_id', 'serial', 'uin',
        'vrn', 'receipt_code', 'tax_office', 'tax_code', 'environment',
        'gc', 'dc', 'dc_date', 'last_zreport_date', 'registered_at',
        'token_expires_at', 'created_at', 'updated_at',
      ])
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!config) return null;

    return {
      ...config,
      isRegistered: !!config.reg_id,
      hasValidToken: config.token_expires_at
        ? new Date(config.token_expires_at) > new Date()
        : false,
    };
  },
};
