/**
 * Hosting provider adapter for WordPress, database, SSH and analytics
 * operations.
 *
 * Hostinger is the first (and currently only) implementation. The adapter
 * pattern is the same as onsite-ci.service.ts and onsite-registrar.service.ts:
 * a real API call behind every method, not a mock. When the provider doesn't
 * support an operation, the method throws with a clear message.
 */
import { withTenant } from '../db/client.js';
import { decryptSecret } from './onsite-secrets.service.js';

// ── Interfaces ───────────────────────────────────────────────────────

export interface WordPressInfo {
  installed: boolean;
  version: string | null;
  adminUrl: string | null;
  siteUrl: string | null;
  autoUpdate: boolean;
}

export interface WordPressPlugin {
  name: string;
  slug: string;
  version: string;
  active: boolean;
  updateAvailable: boolean;
}

export interface DatabaseInfo {
  name: string;
  user: string;
  type: string;
  sizeBytes: number;
  host: string;
  port: number;
}

export interface SSHInfo {
  host: string;
  port: number;
  username: string;
  status: string;
}

export interface SSHKey {
  id: string;
  name: string;
  fingerprint: string;
  addedAt: Date;
}

export interface TrafficStats {
  period: string;
  visitors: number;
  pageViews: number;
  bandwidth: number;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ source: string; visits: number }>;
}

export interface HostingProvider {
  key: string;
  label: string;
  getWordPress(siteId: string): Promise<WordPressInfo | null>;
  installWordPress(siteId: string, title: string, adminUser: string, adminEmail: string, adminPassword: string): Promise<WordPressInfo>;
  updateWordPress(siteId: string): Promise<WordPressInfo>;
  getWordPressPlugins(siteId: string): Promise<WordPressPlugin[]>;
  installWordPressPlugin(siteId: string, slug: string): Promise<WordPressPlugin>;
  removeWordPressPlugin(siteId: string, slug: string): Promise<void>;
  listDatabases(siteId: string): Promise<DatabaseInfo[]>;
  createDatabase(siteId: string, name: string, password: string): Promise<DatabaseInfo>;
  deleteDatabase(siteId: string, name: string): Promise<void>;
  getSSH(siteId: string): Promise<SSHInfo | null>;
  listSSHKeys(siteId: string): Promise<SSHKey[]>;
  addSSHKey(siteId: string, name: string, publicKey: string): Promise<SSHKey>;
  removeSSHKey(siteId: string, keyId: string): Promise<void>;
  resetSSHPassword(siteId: string, password: string): Promise<void>;
  getTrafficStats(siteId: string, period?: string): Promise<TrafficStats | null>;
}

// ── Hostinger ────────────────────────────────────────────────────────

const HOSTINGER_BASE = 'https://developers.hostinger.com/api';

class HostingerHostingProvider implements HostingProvider {
  key = 'hostinger';
  label = 'Hostinger';

  constructor(private token: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`${HOSTINGER_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 404) return null;
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep raw text below */ }
    if (!res.ok) {
      const detail = body?.message || body?.error || text?.slice(0, 300) || `HTTP ${res.status}`;
      throw new Error(`Hostinger: ${detail}`);
    }
    return body;
  }

  private rows(body: any): any[] {
    return Array.isArray(body) ? body : body?.data ?? [];
  }

  private async findSite(siteId: string): Promise<any> {
    const sites = this.rows(await this.api('/hosting/v1/websites'));
    return sites.find((s: any) => String(s.id) === siteId || s.domain === siteId) ?? null;
  }

  async getWordPress(siteId: string): Promise<WordPressInfo | null> {
    const site = await this.findSite(siteId);
    if (!site) return null;
    if (site.cms_detected && site.cms_detected !== 'none') {
      return {
        installed: true,
        version: site.cms_version ?? null,
        adminUrl: site.domain ? `https://${site.domain}/wp-admin` : null,
        siteUrl: site.domain ? `https://${site.domain}` : null,
        autoUpdate: site.auto_update ?? false,
      };
    }
    const wp = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/wordpress`);
    if (!wp) return { installed: false, version: null, adminUrl: null, siteUrl: null, autoUpdate: false };
    return {
      installed: true,
      version: wp.version ?? wp.cms_version ?? null,
      adminUrl: wp.admin_url ?? (site.domain ? `https://${site.domain}/wp-admin` : null),
      siteUrl: wp.site_url ?? (site.domain ? `https://${site.domain}` : null),
      autoUpdate: wp.auto_update ?? false,
    };
  }

  async installWordPress(siteId: string, title: string, adminUser: string, adminEmail: string, adminPassword: string): Promise<WordPressInfo> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/wordpress`, {
      method: 'POST',
      body: JSON.stringify({
        site_title: title,
        admin_username: adminUser,
        admin_email: adminEmail,
        admin_password: adminPassword,
      }),
    });
    if (!result && result !== null) throw new Error('Hostinger did not confirm WordPress installation');
    const site = await this.findSite(siteId);
    return {
      installed: true,
      version: result?.version ?? null,
      adminUrl: site?.domain ? `https://${site.domain}/wp-admin` : null,
      siteUrl: site?.domain ? `https://${site.domain}` : null,
      autoUpdate: false,
    };
  }

  async updateWordPress(siteId: string): Promise<WordPressInfo> {
    await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/wordpress/update`, {
      method: 'POST',
    });
    const info = await this.getWordPress(siteId);
    if (!info) throw new Error('Could not read WordPress status after update');
    return info;
  }

  async getWordPressPlugins(siteId: string): Promise<WordPressPlugin[]> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/wordpress/plugins`);
    if (!result) return [];
    return this.rows(result).map((p: any) => ({
      name: p.name ?? p.title ?? p.slug ?? 'Unknown',
      slug: p.slug ?? '',
      version: p.version ?? '',
      active: p.active ?? p.status === 'active',
      updateAvailable: p.update_available ?? false,
    }));
  }

  async installWordPressPlugin(siteId: string, slug: string): Promise<WordPressPlugin> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/wordpress/plugins`, {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
    return {
      name: result?.name ?? slug,
      slug,
      version: result?.version ?? '',
      active: true,
      updateAvailable: false,
    };
  }

  async removeWordPressPlugin(siteId: string, slug: string): Promise<void> {
    await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/wordpress/plugins/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
  }

  async listDatabases(siteId: string): Promise<DatabaseInfo[]> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/databases`);
    if (!result) return [];
    return this.rows(result).map((db: any) => ({
      name: db.name ?? db.database_name ?? '',
      user: db.user ?? db.username ?? '',
      type: db.type ?? 'mysql',
      sizeBytes: db.size ?? db.size_bytes ?? 0,
      host: db.host ?? 'localhost',
      port: db.port ?? 3306,
    }));
  }

  async createDatabase(siteId: string, name: string, password: string): Promise<DatabaseInfo> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/databases`, {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    return {
      name: result?.name ?? name,
      user: result?.user ?? result?.username ?? name,
      type: 'mysql',
      sizeBytes: 0,
      host: result?.host ?? 'localhost',
      port: result?.port ?? 3306,
    };
  }

  async deleteDatabase(siteId: string, name: string): Promise<void> {
    await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/databases/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  async getSSH(siteId: string): Promise<SSHInfo | null> {
    const site = await this.findSite(siteId);
    if (!site?.ssh) return null;
    return {
      host: site.ssh.host ?? '',
      port: site.ssh.port ?? 22,
      username: site.ssh.username ?? '',
      status: 'active',
    };
  }

  async listSSHKeys(siteId: string): Promise<SSHKey[]> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/ssh/keys`);
    if (!result) return [];
    return this.rows(result).map((k: any) => ({
      id: String(k.id ?? k.key_id ?? ''),
      name: k.name ?? k.label ?? '',
      fingerprint: k.fingerprint ?? '',
      addedAt: k.created_at ? new Date(k.created_at) : new Date(),
    }));
  }

  async addSSHKey(siteId: string, name: string, publicKey: string): Promise<SSHKey> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/ssh/keys`, {
      method: 'POST',
      body: JSON.stringify({ name, key: publicKey }),
    });
    return {
      id: String(result?.id ?? result?.key_id ?? ''),
      name,
      fingerprint: result?.fingerprint ?? '',
      addedAt: new Date(),
    };
  }

  async removeSSHKey(siteId: string, keyId: string): Promise<void> {
    await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/ssh/keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
    });
  }

  async resetSSHPassword(siteId: string, password: string): Promise<void> {
    await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/ssh/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async getTrafficStats(siteId: string, period = '30d'): Promise<TrafficStats | null> {
    const result = await this.api(`/hosting/v1/websites/${encodeURIComponent(siteId)}/analytics?period=${encodeURIComponent(period)}`);
    if (!result) return null;
    return {
      period,
      visitors: result.visitors ?? result.unique_visitors ?? 0,
      pageViews: result.page_views ?? result.pageviews ?? 0,
      bandwidth: result.bandwidth ?? result.bandwidth_bytes ?? 0,
      topPages: this.rows(result.top_pages ?? result.pages ?? []).slice(0, 20).map((p: any) => ({
        path: p.path ?? p.url ?? '/',
        views: p.views ?? p.count ?? 0,
      })),
      topReferrers: this.rows(result.top_referrers ?? result.referrers ?? []).slice(0, 20).map((r: any) => ({
        source: r.source ?? r.referrer ?? r.domain ?? 'Direct',
        visits: r.visits ?? r.count ?? 0,
      })),
    };
  }
}

// ── Resolver ─────────────────────────────────────────────────────────

const SUPPORTED_HOSTING_PROVIDERS = ['hostinger'] as const;

export async function resolveHostingProvider(tenantId: string, connectionId: string): Promise<HostingProvider | null> {
  const row = await withTenant(tenantId, trx =>
    trx.selectFrom('onsite_provider_connections')
      .select(['provider', 'status', 'access_token_cipher'])
      .where('id', '=', connectionId)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'active')
      .executeTakeFirst());

  if (!row?.access_token_cipher) return null;
  if (!SUPPORTED_HOSTING_PROVIDERS.some(p => p === row.provider)) return null;

  let token: string;
  try { token = decryptSecret(row.access_token_cipher); } catch { return null; }
  if (!token) return null;

  switch (row.provider) {
    case 'hostinger':
      return new HostingerHostingProvider(token);
    default:
      return null;
  }
}

export async function resolveHostingProviderForWebsite(tenantId: string, websiteId: string): Promise<{ provider: HostingProvider; website: any; hostingId: string } | null> {
  const website = await withTenant(tenantId, trx =>
    trx.selectFrom('onsite_websites')
      .selectAll()
      .where('id', '=', websiteId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst());

  if (!website?.provider_connection_id) return null;

  const hostingId = website.hosting_id ?? website.name ?? website.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  if (!hostingId) return null;

  const provider = await resolveHostingProvider(tenantId, website.provider_connection_id);
  if (!provider) return null;

  return { provider, website, hostingId };
}
