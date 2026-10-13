/**
 * Domain registrar adapter.
 *
 * Same pattern as onsite-ci.service.ts: a RegistrarProvider interface,
 * real implementations per provider, and a resolveRegistrar() function
 * that decrypts credentials and returns the right adapter for a tenant's
 * connected registrar — or null when none is connected, and callers
 * must handle that by refusing the operation.
 */
import { withTenant } from '../db/client.js';
import { decryptSecret } from './onsite-secrets.service.js';

export interface DomainAvailability {
  domain: string;
  available: boolean;
  premium: boolean;
  price: { registration: number; renewal: number; currency: string } | null;
}

export interface DomainRegistration {
  domain: string;
  expiresAt: Date;
  registrarId: string;
  nameservers: string[];
}

export interface DomainTransferResult {
  domain: string;
  transferId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string | null;
}

export interface DomainRenewalResult {
  domain: string;
  expiresAt: Date;
  transactionId: string;
}

export interface DomainInfo {
  domain: string;
  status: string;
  expiresAt: Date | null;
  autoRenew: boolean;
  locked: boolean;
  nameservers: string[];
  registrarId: string | null;
}

export interface RegistrarProvider {
  key: string;
  label: string;
  checkAvailability(domains: string[]): Promise<DomainAvailability[]>;
  register(domain: string, years?: number, nameservers?: string[]): Promise<DomainRegistration>;
  transfer(domain: string, eppCode: string): Promise<DomainTransferResult>;
  renew(domain: string, years?: number): Promise<DomainRenewalResult>;
  getInfo(domain: string): Promise<DomainInfo>;
  unlock(domain: string): Promise<void>;
  setNameservers(domain: string, nameservers: string[]): Promise<void>;
}

const SUPPORTED_REGISTRARS = ['namecheap', 'cloudflare', 'godaddy', 'gandi'] as const;

// ── Namecheap ────────────────────────────────────────────────────────

class NamecheapProvider implements RegistrarProvider {
  key = 'namecheap';
  label = 'Namecheap';

  constructor(
    private apiUser: string,
    private apiKey: string,
    private clientIp: string,
    private sandbox: boolean,
  ) {}

  private get baseUrl() {
    return this.sandbox
      ? 'https://api.sandbox.namecheap.com/xml.response'
      : 'https://api.namecheap.com/xml.response';
  }

  private async api(command: string, params: Record<string, string> = {}): Promise<string> {
    const qs = new URLSearchParams({
      ApiUser: this.apiUser,
      ApiKey: this.apiKey,
      UserName: this.apiUser,
      ClientIp: this.clientIp,
      Command: command,
      ...params,
    });
    const res = await fetch(`${this.baseUrl}?${qs}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Namecheap HTTP ${res.status}`);
    return res.text();
  }

  private parseXml(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
    return match?.[1] ?? '';
  }

  private parseXmlAttr(xml: string, tag: string, attr: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'));
    return match?.[1] ?? '';
  }

  private parseErrors(xml: string): string | null {
    const status = this.parseXmlAttr(xml, 'ApiResponse', 'Status');
    if (status === 'OK') return null;
    const errMatch = xml.match(/<Error[^>]*>([^<]*)<\/Error>/i);
    return errMatch?.[1] || `Namecheap returned status: ${status}`;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const xml = await this.api('namecheap.domains.check', {
      DomainList: domains.join(','),
    });
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
    const results: DomainAvailability[] = [];
    const re = /<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"(?:\s+IsPremiumName="([^"]+)")?/gi;
    let m;
    while ((m = re.exec(xml))) {
      results.push({
        domain: m[1],
        available: m[2].toLowerCase() === 'true',
        premium: m[3]?.toLowerCase() === 'true',
        price: null,
      });
    }
    return results;
  }

  async register(domain: string, years = 1, nameservers?: string[]): Promise<DomainRegistration> {
    const [sld, tld] = splitDomain(domain);
    const params: Record<string, string> = {
      DomainName: domain,
      Years: String(years),
      SLD: sld,
      TLD: tld,
    };
    if (nameservers?.length) {
      params.Nameservers = nameservers.join(',');
    }
    const xml = await this.api('namecheap.domains.create', params);
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
    const registered = this.parseXmlAttr(xml, 'DomainCreateResult', 'Registered');
    if (registered !== 'true') throw new Error('Namecheap did not confirm registration');
    const domainId = this.parseXmlAttr(xml, 'DomainCreateResult', 'DomainID');
    return {
      domain,
      expiresAt: new Date(Date.now() + years * 365.25 * 86400000),
      registrarId: domainId,
      nameservers: nameservers ?? ['dns1.registrar-servers.com', 'dns2.registrar-servers.com'],
    };
  }

  async transfer(domain: string, eppCode: string): Promise<DomainTransferResult> {
    const [sld, tld] = splitDomain(domain);
    const xml = await this.api('namecheap.domains.transfer.create', {
      DomainName: domain,
      Years: '1',
      EPPCode: eppCode,
      SLD: sld,
      TLD: tld,
    });
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
    const transferId = this.parseXmlAttr(xml, 'DomainTransferCreateResult', 'TransferID');
    const orderStatus = this.parseXmlAttr(xml, 'DomainTransferCreateResult', 'StatusID') === '1';
    return {
      domain,
      transferId: transferId || 'pending',
      status: orderStatus ? 'processing' : 'pending',
      message: null,
    };
  }

  async renew(domain: string, years = 1): Promise<DomainRenewalResult> {
    const [sld, tld] = splitDomain(domain);
    const xml = await this.api('namecheap.domains.renew', {
      DomainName: domain,
      Years: String(years),
      SLD: sld,
      TLD: tld,
    });
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
    const txId = this.parseXmlAttr(xml, 'DomainRenewResult', 'OrderID');
    return {
      domain,
      expiresAt: new Date(Date.now() + years * 365.25 * 86400000),
      transactionId: txId || 'unknown',
    };
  }

  async getInfo(domain: string): Promise<DomainInfo> {
    const xml = await this.api('namecheap.domains.getInfo', { DomainName: domain });
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
    const status = this.parseXmlAttr(xml, 'DomainGetInfoResult', 'Status');
    const ns: string[] = [];
    const nsRe = /<Nameserver>([^<]+)<\/Nameserver>/gi;
    let m;
    while ((m = nsRe.exec(xml))) ns.push(m[1]);
    const expDate = this.parseXml(xml, 'ExpiredDate');
    return {
      domain,
      status: status || 'unknown',
      expiresAt: expDate ? new Date(expDate) : null,
      autoRenew: this.parseXmlAttr(xml, 'DomainGetInfoResult', 'IsOwner') === 'true',
      locked: xml.includes('<Status>clientTransferProhibited</Status>'),
      nameservers: ns,
      registrarId: this.parseXmlAttr(xml, 'DomainGetInfoResult', 'ID'),
    };
  }

  async unlock(domain: string): Promise<void> {
    const xml = await this.api('namecheap.domains.setRegistrarLock', {
      DomainName: domain,
      LockAction: 'UNLOCK',
    });
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
  }

  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    const [sld, tld] = splitDomain(domain);
    const params: Record<string, string> = {
      SLD: sld,
      TLD: tld,
    };
    nameservers.forEach((ns, i) => { params[`Nameserver${i + 1}`] = ns; });
    const xml = await this.api('namecheap.domains.dns.setCustom', params);
    const err = this.parseErrors(xml);
    if (err) throw new Error(err);
  }
}

// ── Cloudflare Registrar ─────────────────────────────────────────────

class CloudflareRegistrarProvider implements RegistrarProvider {
  key = 'cloudflare';
  label = 'Cloudflare Registrar';

  constructor(private token: string, private accountId: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success === false) {
      throw new Error(`Cloudflare: ${body?.errors?.[0]?.message || `HTTP ${res.status}`}`);
    }
    return body?.result;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const results: DomainAvailability[] = [];
    for (const domain of domains) {
      try {
        const result = await this.api(`/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}`);
        results.push({
          domain,
          available: result?.available ?? false,
          premium: false,
          price: result?.fees ? {
            registration: result.fees.registration_fee ?? 0,
            renewal: result.fees.renewal_fee ?? 0,
            currency: 'USD',
          } : null,
        });
      } catch {
        results.push({ domain, available: false, premium: false, price: null });
      }
    }
    return results;
  }

  async register(domain: string): Promise<DomainRegistration> {
    const result = await this.api(`/accounts/${this.accountId}/registrar/domains`, {
      method: 'POST',
      body: JSON.stringify({ name: domain, auto_renew: true }),
    });
    return {
      domain,
      expiresAt: result?.expires_at ? new Date(result.expires_at) : new Date(Date.now() + 365.25 * 86400000),
      registrarId: result?.id || domain,
      nameservers: result?.name_servers ?? [],
    };
  }

  async transfer(domain: string, eppCode: string): Promise<DomainTransferResult> {
    const result = await this.api(`/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ auth_code: eppCode, auto_renew: true }),
    });
    return {
      domain,
      transferId: result?.id || 'pending',
      status: 'processing',
      message: null,
    };
  }

  async renew(domain: string): Promise<DomainRenewalResult> {
    const result = await this.api(`/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}`, {
      method: 'PUT',
      body: JSON.stringify({ auto_renew: true }),
    });
    return {
      domain,
      expiresAt: result?.expires_at ? new Date(result.expires_at) : new Date(Date.now() + 365.25 * 86400000),
      transactionId: result?.id || domain,
    };
  }

  async getInfo(domain: string): Promise<DomainInfo> {
    const result = await this.api(`/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}`);
    return {
      domain,
      status: result?.status || 'unknown',
      expiresAt: result?.expires_at ? new Date(result.expires_at) : null,
      autoRenew: result?.auto_renew ?? false,
      locked: result?.locked ?? false,
      nameservers: result?.name_servers ?? [],
      registrarId: result?.id ?? null,
    };
  }

  async unlock(domain: string): Promise<void> {
    await this.api(`/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}`, {
      method: 'PUT',
      body: JSON.stringify({ locked: false }),
    });
  }

  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    await this.api(`/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}`, {
      method: 'PUT',
      body: JSON.stringify({ name_servers: nameservers }),
    });
  }
}

// ── GoDaddy ──────────────────────────────────────────────────────────

class GoDaddyProvider implements RegistrarProvider {
  key = 'godaddy';
  label = 'GoDaddy';

  constructor(private apiKey: string, private apiSecret: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://api.godaddy.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `sso-key ${this.apiKey}:${this.apiSecret}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try { detail = JSON.parse(text)?.message ?? text; } catch { /* keep raw */ }
      throw new Error(`GoDaddy: ${detail?.slice(0, 300) || `HTTP ${res.status}`}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const results: DomainAvailability[] = [];
    for (const domain of domains) {
      try {
        const result = await this.api(`/domains/available?domain=${encodeURIComponent(domain)}`);
        results.push({
          domain,
          available: result?.available ?? false,
          premium: result?.definitive === false,
          price: result?.price != null ? {
            registration: result.price / 1e6,
            renewal: result.price / 1e6,
            currency: result.currency ?? 'USD',
          } : null,
        });
      } catch {
        results.push({ domain, available: false, premium: false, price: null });
      }
    }
    return results;
  }

  async register(domain: string, years = 1, nameservers?: string[]): Promise<DomainRegistration> {
    const body: Record<string, unknown> = { domain, period: years, renewAuto: true };
    if (nameservers?.length) body.nameServers = nameservers;
    await this.api('/domains/purchase', {
      method: 'POST',
      body: JSON.stringify([body]),
    });
    return {
      domain,
      expiresAt: new Date(Date.now() + years * 365.25 * 86400000),
      registrarId: domain,
      nameservers: nameservers ?? [],
    };
  }

  async transfer(domain: string, eppCode: string): Promise<DomainTransferResult> {
    await this.api(`/domains/${encodeURIComponent(domain)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ authCode: eppCode, period: 1, renewAuto: true }),
    });
    return {
      domain,
      transferId: domain,
      status: 'processing',
      message: null,
    };
  }

  async renew(domain: string, years = 1): Promise<DomainRenewalResult> {
    await this.api(`/domains/${encodeURIComponent(domain)}/renew`, {
      method: 'POST',
      body: JSON.stringify({ period: years }),
    });
    return {
      domain,
      expiresAt: new Date(Date.now() + years * 365.25 * 86400000),
      transactionId: domain,
    };
  }

  async getInfo(domain: string): Promise<DomainInfo> {
    const result = await this.api(`/domains/${encodeURIComponent(domain)}`);
    return {
      domain,
      status: result?.status ?? 'unknown',
      expiresAt: result?.expires ? new Date(result.expires) : null,
      autoRenew: result?.renewAuto ?? false,
      locked: result?.locked ?? false,
      nameservers: result?.nameServers ?? [],
      registrarId: String(result?.domainId ?? ''),
    };
  }

  async unlock(domain: string): Promise<void> {
    await this.api(`/domains/${encodeURIComponent(domain)}`, {
      method: 'PATCH',
      body: JSON.stringify({ locked: false }),
    });
  }

  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    await this.api(`/domains/${encodeURIComponent(domain)}`, {
      method: 'PATCH',
      body: JSON.stringify({ nameServers: nameservers }),
    });
  }
}

// ── Gandi ────────────────────────────────────────────────────────────

class GandiProvider implements RegistrarProvider {
  key = 'gandi';
  label = 'Gandi';

  constructor(private token: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://api.gandi.net/v5${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try { detail = JSON.parse(text)?.message ?? text; } catch { /* keep raw */ }
      throw new Error(`Gandi: ${detail?.slice(0, 300) || `HTTP ${res.status}`}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const results: DomainAvailability[] = [];
    for (const domain of domains) {
      try {
        const result = await this.api(`/domain/check?name=${encodeURIComponent(domain)}`);
        const product = result?.products?.[0];
        results.push({
          domain,
          available: product?.status === 'available',
          premium: product?.status === 'available_preorder',
          price: product?.prices?.[0]?.price_after_taxes != null ? {
            registration: product.prices[0].price_after_taxes,
            renewal: product.prices[1]?.price_after_taxes ?? product.prices[0].price_after_taxes,
            currency: product.prices[0].currency ?? 'USD',
          } : null,
        });
      } catch {
        results.push({ domain, available: false, premium: false, price: null });
      }
    }
    return results;
  }

  async register(domain: string, years = 1, nameservers?: string[]): Promise<DomainRegistration> {
    const body: Record<string, unknown> = { fqdn: domain, duration: years };
    if (nameservers?.length) body.nameservers = nameservers;
    const result = await this.api('/domain/domains', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      domain,
      expiresAt: new Date(Date.now() + years * 365.25 * 86400000),
      registrarId: result?.id ?? domain,
      nameservers: nameservers ?? [],
    };
  }

  async transfer(domain: string, eppCode: string): Promise<DomainTransferResult> {
    const result = await this.api('/domain/transferin', {
      method: 'POST',
      body: JSON.stringify({ fqdn: domain, authinfo: eppCode, duration: 1 }),
    });
    return {
      domain,
      transferId: result?.id ?? 'pending',
      status: 'processing',
      message: null,
    };
  }

  async renew(domain: string, years = 1): Promise<DomainRenewalResult> {
    const result = await this.api(`/domain/domains/${encodeURIComponent(domain)}/renew`, {
      method: 'POST',
      body: JSON.stringify({ duration: years }),
    });
    return {
      domain,
      expiresAt: new Date(Date.now() + years * 365.25 * 86400000),
      transactionId: result?.id ?? domain,
    };
  }

  async getInfo(domain: string): Promise<DomainInfo> {
    const result = await this.api(`/domain/domains/${encodeURIComponent(domain)}`);
    return {
      domain,
      status: result?.status ?? 'unknown',
      expiresAt: result?.dates?.registry_ends_at ? new Date(result.dates.registry_ends_at) : null,
      autoRenew: result?.autorenew?.enabled ?? false,
      locked: result?.status === 'clientTransferProhibited',
      nameservers: result?.nameservers ?? [],
      registrarId: result?.id ?? null,
    };
  }

  async unlock(domain: string): Promise<void> {
    await this.api(`/domain/domains/${encodeURIComponent(domain)}`, {
      method: 'PATCH',
      body: JSON.stringify({ transfer_lock: false }),
    });
  }

  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    await this.api(`/domain/domains/${encodeURIComponent(domain)}/nameservers`, {
      method: 'PUT',
      body: JSON.stringify({ nameservers }),
    });
  }
}

// ── Resolver ─────────────────────────────────────────────────────────

function splitDomain(domain: string): [string, string] {
  const parts = domain.split('.');
  if (parts.length < 2) return [domain, ''];
  const tld = parts.slice(1).join('.');
  return [parts[0], tld];
}

export async function resolveRegistrar(tenantId: string, provider?: string, connectionId?: string): Promise<RegistrarProvider | null> {
  if (provider && !SUPPORTED_REGISTRARS.some(r => r === provider)) return null;

  const rows = await withTenant(tenantId, trx =>
    trx.selectFrom('onsite_provider_connections')
      .select(['id', 'provider', 'access_token_cipher', 'config_cipher', 'external_id', 'status'])
      .where('tenant_id', '=', tenantId)
      .where('provider', 'in', [...SUPPORTED_REGISTRARS])
      .$if(Boolean(provider), q => q.where('provider', '=', provider!))
      .$if(Boolean(connectionId), q => q.where('id', '=', connectionId!))
      .where('status', '=', 'active')
      .execute());

  for (const key of SUPPORTED_REGISTRARS) {
    const row = rows.find(r => r.provider === key);
    if (!row?.access_token_cipher) continue;

    let token: string;
    try { token = decryptSecret(row.access_token_cipher); } catch { continue; }
    if (!token) continue;

    let config: Record<string, unknown> = {};
    if (row.config_cipher) {
      try { config = JSON.parse(decryptSecret(row.config_cipher)); } catch { /* proceed without */ }
    }

    switch (key) {
      case 'namecheap':
        return new NamecheapProvider(
          String(config.api_user ?? config.username ?? ''),
          token,
          String(config.client_ip ?? '127.0.0.1'),
          Boolean(config.sandbox),
        );
      case 'cloudflare': {
        const accountId = row.external_id ?? String(config.account_id ?? '');
        if (!accountId) continue;
        return new CloudflareRegistrarProvider(token, accountId);
      }
      case 'godaddy': {
        const secret = String(config.api_secret ?? '');
        return new GoDaddyProvider(token, secret);
      }
      case 'gandi':
        return new GandiProvider(token);
    }
  }

  return null;
}

export const NO_REGISTRAR_MESSAGE =
  'No domain registrar is connected. Add one under Onsite → Settings → Provider connections to register, transfer or renew domains.';
