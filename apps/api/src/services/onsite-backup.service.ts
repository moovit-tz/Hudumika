import type { ExpressionBuilder, Selectable } from 'kysely';
import { withTenant } from '../db/client.js';
import type {
  OnsiteDomainsTable, OnsiteApplicationsTable, OnsiteProviderConnectionsTable,
  OnsiteDnsZonesTable, OnsiteEnvironmentsTable, OnsiteWebsitesTable,
  OnsiteHealthChecksTable, OnsiteDnsRecordsTable, OnsiteSecretsTable,
} from '../db/client.js';

/**
 * AgencyHost M6 — a snapshot of a tenant's own Onsite CONFIGURATION.
 *
 * Deliberately not a backup of a website's actual files or database: this
 * platform has never stored either (onsite-ci.service.ts only ever
 * exchanges a pipeline id and a status with the CI provider, never the
 * built artifact back). What's genuinely first-party and worth protecting
 * is the configuration a person set up by hand — domains, DNS, application
 * settings, environments, secrets, websites, health checks, provider
 * connections. Deployment/server/SSL-check history is deliberately excluded
 * — it's a historical record, not configuration someone would want restored.
 */
export interface OnsiteConfigSnapshot {
  domains: Selectable<OnsiteDomainsTable>[];
  applications: Selectable<OnsiteApplicationsTable>[];
  provider_connections: Selectable<OnsiteProviderConnectionsTable>[];
  dns_zones: Selectable<OnsiteDnsZonesTable>[];
  environments: Selectable<OnsiteEnvironmentsTable>[];
  websites: Selectable<OnsiteWebsitesTable>[];
  health_checks: Selectable<OnsiteHealthChecksTable>[];
  dns_records: Selectable<OnsiteDnsRecordsTable>[];
  secrets: Selectable<OnsiteSecretsTable>[];
}

/** Builds an ON CONFLICT UPDATE SET clause that takes each column's value
 *  from the row actually being inserted (`excluded.*`) — the standard
 *  Postgres upsert idiom, needed because a bulk insert can't apply one
 *  shared literal update to every conflicting row; each must take its own
 *  values. */
function fromExcluded(columns: string[]) {
  return (eb: ExpressionBuilder<any, any>) =>
    Object.fromEntries(columns.map((c) => [c, eb.ref(`excluded.${c}`)]));
}

export async function snapshotTenant(tenantId: string): Promise<{ snapshot: OnsiteConfigSnapshot; sizeBytes: number }> {
  const snapshot = await withTenant(tenantId, async (trx) => {
    const [domains, applications, provider_connections, dns_zones, environments, websites, health_checks, dns_records, secrets] =
      await Promise.all([
        trx.selectFrom('onsite_domains').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_applications').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_provider_connections').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_dns_zones').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_environments').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_websites').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_health_checks').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_dns_records').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_secrets').selectAll().where('tenant_id', '=', tenantId).execute(),
      ]);
    return { domains, applications, provider_connections, dns_zones, environments, websites, health_checks, dns_records, secrets } as unknown as OnsiteConfigSnapshot;
  });
  const sizeBytes = Buffer.byteLength(JSON.stringify(snapshot));
  return { snapshot, sizeBytes };
}

/**
 * Restores a tenant's Onsite configuration to exactly the state a snapshot
 * captured: any row present at snapshot time is upserted back (by its
 * original id); any row that exists now but wasn't in the snapshot (created
 * or changed after the snapshot) is deleted — a genuine point-in-time
 * restore, not a merge that leaves stray post-snapshot rows behind.
 *
 * Two passes to respect foreign keys: delete stale rows leaf-first (a child
 * row is gone before its stale parent is), then upsert root-first (a
 * parent exists before a child that references it is written).
 */
export async function restoreSnapshot(tenantId: string, snapshot: OnsiteConfigSnapshot): Promise<void> {
  await withTenant(tenantId, async (trx) => {
    const pruneStale = async (table: string, ids: string[]) => {
      let q = trx.deleteFrom(table as any).where('tenant_id', '=', tenantId);
      if (ids.length > 0) q = q.where('id', 'not in', ids);
      await q.execute();
    };

    // ── Pass 1: delete stale rows, leaves before roots ──
    await pruneStale('onsite_secrets', snapshot.secrets.map(r => r.id));
    await pruneStale('onsite_dns_records', snapshot.dns_records.map(r => r.id));
    await pruneStale('onsite_health_checks', snapshot.health_checks.map(r => r.id));
    await pruneStale('onsite_websites', snapshot.websites.map(r => r.id));
    await pruneStale('onsite_environments', snapshot.environments.map(r => r.id));
    await pruneStale('onsite_dns_zones', snapshot.dns_zones.map(r => r.id));
    await pruneStale('onsite_provider_connections', snapshot.provider_connections.map(r => r.id));
    await pruneStale('onsite_applications', snapshot.applications.map(r => r.id));
    await pruneStale('onsite_domains', snapshot.domains.map(r => r.id));

    // ── Pass 2: upsert, roots before leaves ──
    if (snapshot.domains.length > 0) {
      await trx.insertInto('onsite_domains').values(snapshot.domains as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'project_id', 'domain', 'registrar', 'nameservers', 'registered_at', 'expires_at', 'auto_renew',
          'dns_status', 'dns_checked_at', 'ssl_status', 'ssl_checked_at', 'ssl_expires_at', 'status', 'notes',
          'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.applications.length > 0) {
      await trx.insertInto('onsite_applications').values(snapshot.applications as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'project_id', 'domain_id', 'name', 'runtime', 'repo_provider', 'repo_owner', 'repo_name', 'repo_url',
          'default_branch', 'build_command', 'start_command', 'output_dir', 'port', 'auto_deploy', 'status',
          'current_version', 'last_deployed_at', 'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.provider_connections.length > 0) {
      await trx.insertInto('onsite_provider_connections').values(snapshot.provider_connections as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'provider', 'name', 'config_cipher', 'access_token_cipher', 'refresh_token_cipher', 'token_expires_at',
          'external_id', 'external_name', 'status', 'last_verified_at', 'error_message', 'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.dns_zones.length > 0) {
      await trx.insertInto('onsite_dns_zones').values(snapshot.dns_zones as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'domain_id', 'provider', 'external_id', 'status', 'last_synced_at', 'updated_at',
        ]))).execute();
    }
    if (snapshot.environments.length > 0) {
      await trx.insertInto('onsite_environments').values(snapshot.environments as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'application_id', 'name', 'branch', 'domain_id', 'status', 'url', 'updated_at',
        ]))).execute();
    }
    if (snapshot.websites.length > 0) {
      await trx.insertInto('onsite_websites').values(snapshot.websites as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'project_id', 'domain_id', 'name', 'type', 'status', 'hosting_provider', 'hosting_id', 'url',
          'last_health_at', 'last_health_status', 'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.health_checks.length > 0) {
      await trx.insertInto('onsite_health_checks').values(snapshot.health_checks as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'name', 'url', 'method', 'expected_status', 'timeout_ms', 'interval_s', 'status', 'last_checked_at',
          'last_response_ms', 'last_status_code', 'last_error', 'uptime_30d', 'application_id', 'domain_id',
          'notify_on_fail', 'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.dns_records.length > 0) {
      await trx.insertInto('onsite_dns_records').values(snapshot.dns_records as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'zone_id', 'name', 'type', 'value', 'ttl', 'priority', 'external_id', 'synced_at', 'sync_status',
          'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.secrets.length > 0) {
      await trx.insertInto('onsite_secrets').values(snapshot.secrets as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'environment_id', 'key', 'value_cipher', 'is_secret', 'created_by', 'updated_by', 'updated_at',
        ]))).execute();
    }
  });
}
