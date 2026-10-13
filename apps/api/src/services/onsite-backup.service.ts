import type { ExpressionBuilder, Selectable, Transaction } from 'kysely';
import { withTenant } from '../db/client.js';
import type {
  Database,
  OnsiteDomainsTable, OnsiteApplicationsTable, OnsiteProviderConnectionsTable,
  OnsiteDnsZonesTable, OnsiteEnvironmentsTable, OnsiteWebsitesTable,
  OnsiteHealthChecksTable, OnsiteDnsRecordsTable, OnsiteSecretsTable,
  OnsiteEmailDomainsTable, OnsiteEmailMailboxesTable,
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
  email_domains: Selectable<OnsiteEmailDomainsTable>[];
  email_mailboxes: Selectable<OnsiteEmailMailboxesTable>[];
}

export const snapshotSections = ['domains', 'applications', 'provider_connections', 'dns_zones', 'environments', 'websites', 'health_checks', 'dns_records', 'secrets', 'email_domains', 'email_mailboxes'] as const;

export function validateSnapshot(tenantId: string, value: unknown): OnsiteConfigSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid configuration snapshot');
  for (const section of snapshotSections) {
    const rows = (value as Record<string, unknown>)[section];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || row.tenant_id !== tenantId) || new Set(rows.map(row => row.id)).size !== rows.length) {
      throw new Error(`Invalid snapshot section: ${section}`);
    }
  }
  const snapshot = value as OnsiteConfigSnapshot;
  const providerIds = new Set(snapshot.provider_connections.map(row => row.id));
  const websites = snapshot.websites.map(row => {
    const connectionId = row.provider_connection_id ?? null;
    if (connectionId !== null && !providerIds.has(connectionId)) throw new Error('Website references a provider connection missing from the snapshot');
    return { ...row, provider_connection_id: connectionId };
  });
  const applications = snapshot.applications.map(row => {
    const connectionId = row.provider_connection_id ?? null;
    if (connectionId !== null && !providerIds.has(connectionId)) throw new Error('Application references a provider connection missing from the snapshot');
    return { ...row, provider_connection_id: connectionId };
  });
  return { ...snapshot, websites, applications };
}

export function summarizeRestore(current: OnsiteConfigSnapshot, target: OnsiteConfigSnapshot) {
  return snapshotSections.map(section => {
    const currentIds = new Set(current[section].map(row => row.id));
    const targetIds = new Set(target[section].map(row => row.id));
    return { section, current: currentIds.size, snapshot: targetIds.size,
      added: [...targetIds].filter(id => !currentIds.has(id)).length,
      replaced: [...targetIds].filter(id => currentIds.has(id)).length,
      removed: [...currentIds].filter(id => !targetIds.has(id)).length };
  });
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

export async function snapshotTenant(tenantId: string, transaction?: Transaction<Database>): Promise<{ snapshot: OnsiteConfigSnapshot; sizeBytes: number }> {
  const readSnapshot = async (trx: Transaction<Database>) => {
    const [domains, applications, provider_connections, dns_zones, environments, websites, health_checks, dns_records, secrets, email_domains, email_mailboxes] =
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
        trx.selectFrom('onsite_email_domains').selectAll().where('tenant_id', '=', tenantId).execute(),
        trx.selectFrom('onsite_email_mailboxes').selectAll().where('tenant_id', '=', tenantId).execute(),
      ]);
    return { domains, applications, provider_connections, dns_zones, environments, websites, health_checks, dns_records, secrets, email_domains, email_mailboxes } as unknown as OnsiteConfigSnapshot;
  };
  const snapshot = transaction ? await readSnapshot(transaction) : await withTenant(tenantId, readSnapshot);
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
  snapshot = validateSnapshot(tenantId, snapshot);
  await withTenant(tenantId, async (trx) => {
    const pruneStale = async (table: string, ids: string[]) => {
      let q = trx.deleteFrom(table as any).where('tenant_id', '=', tenantId);
      if (ids.length > 0) q = q.where('id', 'not in', ids);
      await q.execute();
    };

    // ── Pass 1: delete stale rows, leaves before roots ──
    await pruneStale('onsite_email_mailboxes', snapshot.email_mailboxes.map(r => r.id));
    await pruneStale('onsite_email_domains', snapshot.email_domains.map(r => r.id));
    await pruneStale('onsite_secrets', snapshot.secrets.map(r => r.id));
    await pruneStale('onsite_dns_records', snapshot.dns_records.map(r => r.id));
    await pruneStale('onsite_health_checks', snapshot.health_checks.map(r => r.id));
    await pruneStale('onsite_websites', snapshot.websites.map(r => r.id));
    await pruneStale('onsite_environments', snapshot.environments.map(r => r.id));
    await pruneStale('onsite_dns_zones', snapshot.dns_zones.map(r => r.id));
    // Surviving websites may currently point to connections absent from the target snapshot.
    // Their target links are restored after the target connections have been inserted.
    await trx.updateTable('onsite_websites').set({ provider_connection_id: null })
      .where('tenant_id', '=', tenantId).execute();
    await trx.updateTable('onsite_applications').set({ provider_connection_id: null })
      .where('tenant_id', '=', tenantId).execute();
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
          'current_version', 'last_deployed_at', 'provider_connection_id', 'created_by', 'updated_at',
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
          'project_id', 'domain_id', 'name', 'type', 'status', 'hosting_provider', 'hosting_id', 'provider_connection_id', 'url',
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
    if (snapshot.email_domains.length > 0) {
      await trx.insertInto('onsite_email_domains').values(snapshot.email_domains as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'domain_id', 'provider', 'mx_verified', 'spf_verified', 'dkim_verified', 'dmarc_verified',
          'last_verified_at', 'catch_all_action', 'catch_all_address', 'status', 'created_by', 'updated_at',
        ]))).execute();
    }
    if (snapshot.email_mailboxes.length > 0) {
      await trx.insertInto('onsite_email_mailboxes').values(snapshot.email_mailboxes as any)
        .onConflict(oc => oc.column('id').doUpdateSet(fromExcluded([
          'email_domain_id', 'local_part', 'full_address', 'display_name', 'type',
          'linked_user_id', 'target_mailbox_id', 'forward_to', 'quota_mb', 'usage_mb',
          'message_count', 'status', 'created_by', 'updated_at',
        ]))).execute();
    }
  });
}
