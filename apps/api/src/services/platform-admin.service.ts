import dns from 'node:dns/promises';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { dbPlatform } from '../db/client.js';

/**
 * Platform-level audit trail and custom domains.
 *
 * Both back SuperAdmin screens that used to render hardcoded arrays. The rule
 * throughout is that nothing here asserts a state it did not observe: an
 * activity row is written by the action that happened, and a domain's DNS and
 * SSL flags are set only by a probe that actually succeeded.
 */

export type ActivityCategory = 'company' | 'user' | 'billing' | 'system';

export interface ActivityInput {
  actorUserId: string | null;
  actorName: string;
  action: string;
  category: ActivityCategory;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  /** The company the action was about, not the actor's own tenant. */
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}

export class PlatformAdminService {
  /**
   * Records a superadmin action.
   *
   * Never throws into the caller: an audit write failing must not roll back
   * the action it describes, or a logging problem becomes an outage. It is
   * logged loudly instead, because a silently missing audit row is worse than
   * a noisy one.
   */
  static async recordActivity(input: ActivityInput): Promise<void> {
    try {
      await dbPlatform.insertInto('platform_activity_log').values({
        actor_user_id: input.actorUserId,
        actor_name: input.actorName,
        action: input.action,
        category: input.category,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        target_name: input.targetName ?? null,
        tenant_id: input.tenantId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}) as any,
      }).execute();
    } catch (err) {
      console.error('[platform-audit] failed to record activity:', input.action, err);
    }
  }

  static async listActivity(opts: { category?: string; tenantId?: string; limit?: number } = {}) {
    let q = dbPlatform.selectFrom('platform_activity_log as a')
      .leftJoin('tenants as t', 't.id', 'a.tenant_id')
      .select([
        'a.id', 'a.actor_name', 'a.actor_user_id', 'a.action', 'a.category', 'a.target_type',
        'a.target_id', 'a.target_name', 'a.tenant_id', 'a.metadata', 'a.created_at',
        't.name as tenant_name',
      ])
      .orderBy('a.created_at', 'desc')
      .limit(Math.min(opts.limit ?? 200, 1000));
    if (opts.category) q = q.where('a.category', '=', opts.category as ActivityCategory);
    if (opts.tenantId) q = q.where('a.tenant_id', '=', opts.tenantId);
    return q.execute();
  }

  // ─── Domains ───────────────────────────────────────────────────────────────

  static async listDomains() {
    const rows = await dbPlatform.selectFrom('platform_domains as d')
      .leftJoin('tenants as t', 't.id', 'd.tenant_id')
      .select([
        'd.id', 'd.tenant_id', 'd.domain', 'd.verification_token', 'd.status',
        'd.dns_verified_at', 'd.ssl_verified_at', 'd.ssl_expires_at',
        'd.last_checked_at', 'd.last_error', 'd.created_at',
        't.name as tenant_name',
      ])
      .orderBy('d.created_at', 'desc')
      .execute();
    return rows.map(r => ({
      ...r,
      // Derived from the probe timestamps rather than stored separately, so
      // there is no way for the flag and the evidence to disagree.
      dns_ok: r.dns_verified_at != null,
      ssl_ok: r.ssl_verified_at != null,
      never_checked: r.last_checked_at == null,
    }));
  }

  static async addDomain(tenantId: string, domain: string) {
    const host = String(domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!host) throw new Error('domain is required');
    // Deliberately permissive on TLD but strict on shape — the DNS probe is
    // what actually decides whether it exists.
    if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) {
      throw new Error(`"${host}" is not a valid hostname.`);
    }
    const tenant = await dbPlatform.selectFrom('tenants').select(['id', 'name']).where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) throw new Error('Company not found');

    const existing = await dbPlatform.selectFrom('platform_domains as d')
      .leftJoin('tenants as t', 't.id', 'd.tenant_id')
      .select(['d.id', 't.name as tenant_name'])
      .where('d.domain', '=', host).executeTakeFirst();
    if (existing) {
      throw new Error(`${host} is already registered to ${existing.tenant_name ?? 'another company'}.`);
    }

    // Created unverified. The token is what the tenant puts in DNS.
    return dbPlatform.insertInto('platform_domains').values({
      tenant_id: tenantId,
      domain: host,
      verification_token: 'hudumika-verify=' + crypto.randomBytes(16).toString('hex'),
      status: 'pending',
    }).returningAll().executeTakeFirstOrThrow();
  }

  static async deleteDomain(id: string) {
    const row = await dbPlatform.selectFrom('platform_domains').select(['id', 'domain', 'tenant_id'])
      .where('id', '=', id).executeTakeFirst();
    if (!row) throw new Error('Domain not found');
    await dbPlatform.deleteFrom('platform_domains').where('id', '=', id).execute();
    return row;
  }

  /**
   * Actually probes a domain: resolves its TXT records looking for the
   * verification token, then opens a TLS connection to see whether a
   * certificate valid for this host is being served.
   *
   * Every outcome here is observed. A domain that does not resolve is recorded
   * as failed with the resolver's own error, not left showing a stale 'active'
   * from a check that passed months ago.
   */
  static async checkDomain(id: string) {
    const row = await dbPlatform.selectFrom('platform_domains').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw new Error('Domain not found');

    let dnsVerifiedAt: Date | null = null;
    let sslVerifiedAt: Date | null = null;
    let sslExpiresAt: Date | null = null;
    const errors: string[] = [];

    // 1. TXT lookup for the verification token.
    try {
      const records = await dns.resolveTxt(row.domain);
      const flat = records.map(chunks => chunks.join(''));
      if (flat.some(v => v.trim() === row.verification_token)) {
        dnsVerifiedAt = new Date();
      } else {
        errors.push(flat.length
          ? `No TXT record matching the verification token (found ${flat.length}).`
          : 'No TXT records on this domain.');
      }
    } catch (err: any) {
      errors.push(`DNS lookup failed: ${err?.code ?? err?.message ?? 'unknown error'}`);
    }

    // 2. TLS handshake. Independent of the TXT result — a domain can serve a
    //    valid certificate before its ownership record is in place.
    try {
      const cert = await PlatformAdminService.probeCertificate(row.domain);
      if (cert.validTo) {
        sslVerifiedAt = new Date();
        sslExpiresAt = cert.validTo;
      }
    } catch (err: any) {
      errors.push(`TLS check failed: ${err?.code ?? err?.message ?? 'unknown error'}`);
    }

    const status: 'pending' | 'active' | 'failed' =
      dnsVerifiedAt && sslVerifiedAt ? 'active'
      : errors.length === 2 ? 'failed'
      : 'pending';

    await dbPlatform.updateTable('platform_domains').set({
      status,
      dns_verified_at: dnsVerifiedAt,
      ssl_verified_at: sslVerifiedAt,
      ssl_expires_at: sslExpiresAt,
      last_checked_at: new Date(),
      last_error: errors.length ? errors.join(' ') : null,
      updated_at: new Date(),
    }).where('id', '=', id).execute();

    return { id, domain: row.domain, status, dns_ok: !!dnsVerifiedAt, ssl_ok: !!sslVerifiedAt,
             ssl_expires_at: sslExpiresAt, errors };
  }

  /** Opens a TLS socket and returns the peer certificate's validity window. */
  private static probeCertificate(host: string, timeoutMs = 5000): Promise<{ validTo: Date | null }> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        socket.destroy();
        // An unauthorized chain is not a certificate this platform should call
        // "SSL Active" — report why instead.
        if (!authorized) return reject(new Error(socket.authorizationError?.toString() ?? 'certificate not trusted'));
        resolve({ validTo });
      });
      socket.on('timeout', () => { socket.destroy(); reject(new Error('timed out')); });
      socket.on('error', err => { socket.destroy(); reject(err); });
    });
  }
}
