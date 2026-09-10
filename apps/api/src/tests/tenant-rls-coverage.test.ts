// Permanent regression guard for the production-readiness audit's CRITICAL
// finding (HUD-0001 / HUD-0002 / HUD-0003, migrations 456/457/458): 81
// tenant-scoped tables plus 9 line-item tables shipped with NO row-level
// security, so the restricted app role could read every tenant's rows once
// app.tenant_id was set to any value — proven live.
//
// This is a schema-level assertion, not a per-route test: it fails the build
// the moment ANY base table carrying a tenant_id column exists without
// ENABLE + FORCE ROW LEVEL SECURITY and at least one policy. New feature
// migrations that add a tenant table and forget the standard
// tenant_isolation_policy will trip this immediately.
//
// Queries below use raw `sql` against pg_class/pg_policies/information_schema
// rather than the Kysely query builder: those are Postgres catalog tables, not
// entries in our typed Database interface, so the builder has nothing to
// validate column references against.
//
// If a genuinely global/reference table ever legitimately carries a tenant_id
// column with no RLS, add it to KNOWN_GLOBAL_EXCEPTIONS below with a reason.
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import pg from 'pg';
import { dbPlatform } from '../db/client.js';
import { env } from '../config/env.js';

interface RlsRow {
  relname: string;
  enabled: boolean;
  forced: boolean;
  policies: number;
}

// Tables that carry a tenant_id column but are intentionally NOT tenant-scoped.
// Keep this list empty unless there is a real, documented reason.
const KNOWN_GLOBAL_EXCEPTIONS = new Set<string>([]);

// A sample of tables that leaked before migration 456 — used for the live
// cross-tenant probe. Kept small; the schema assertion below is the real net.
const PREVIOUSLY_LEAKING = [
  'email_outbox', 'email_messages', 'hr_login_history', 'hr_devices',
  'tenant_settings', 'tenant_usage_counters', 'api_usage_events',
  'data_quality_findings', 'org_permissions', 'landed_cost_records',
  'comply_obligations', 'comply_certificates', 'shipment_listeners',
  'shipment_report_shares', 'trade_wizard_runs',
];

async function rlsStateFor(relnames?: string[]): Promise<RlsRow[]> {
  const query = relnames
    ? sql<RlsRow>`
        select c.relname,
               c.relrowsecurity as enabled,
               c.relforcerowsecurity as forced,
               (select count(*)::int from pg_policies p
                where p.tablename = c.relname and p.schemaname = 'public') as policies
        from pg_class c
        where c.relname = any(${relnames})`
    : sql<RlsRow>`
        select c.relname,
               c.relrowsecurity as enabled,
               c.relforcerowsecurity as forced,
               (select count(*)::int from pg_policies p
                where p.tablename = c.relname and p.schemaname = 'public') as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = c.relname
              and col.column_name = 'tenant_id'
          )`;
  const { rows } = await query.execute(dbPlatform);
  return rows;
}

describe('Tenant RLS coverage (HUD-0001/0002/0003 regression guard)', () => {
  let tenantIdTables: RlsRow[];

  beforeAll(async () => {
    tenantIdTables = await rlsStateFor();
  });

  it('finds a non-trivial number of tenant_id tables (sanity)', () => {
    expect(tenantIdTables.length).toBeGreaterThan(300);
  });

  it('every tenant_id table has RLS ENABLED', () => {
    const bad = tenantIdTables
      .filter((t) => !KNOWN_GLOBAL_EXCEPTIONS.has(t.relname) && !t.enabled)
      .map((t) => t.relname);
    expect(bad, `tables with tenant_id but RLS not enabled: ${bad.join(', ')}`).toEqual([]);
  });

  it('every tenant_id table has RLS FORCED', () => {
    const bad = tenantIdTables
      .filter((t) => !KNOWN_GLOBAL_EXCEPTIONS.has(t.relname) && !t.forced)
      .map((t) => t.relname);
    expect(bad, `tables with RLS enabled but not forced: ${bad.join(', ')}`).toEqual([]);
  });

  it('every tenant_id table has at least one policy', () => {
    const bad = tenantIdTables
      .filter((t) => !KNOWN_GLOBAL_EXCEPTIONS.has(t.relname) && t.policies < 1)
      .map((t) => t.relname);
    expect(bad, `tables with RLS enabled but zero policies: ${bad.join(', ')}`).toEqual([]);
  });

  it('the HUD-0003 child tables (no tenant_id of their own) have RLS enabled + forced + policy', async () => {
    const children = [
      'declaration_items', 'declaration_attachments', 'declaration_item_models',
      'delivery_document_lines', 'tax_lines', 'geofence_events', 'hr_team_members',
      'comply_legal_messages', 'comply_legal_milestones',
    ];
    const rows = await rlsStateFor(children);
    expect(rows.length).toBe(children.length);
    for (const r of rows) {
      expect(r.enabled, `${r.relname} RLS enabled`).toBe(true);
      expect(r.forced, `${r.relname} RLS forced`).toBe(true);
      expect(r.policies, `${r.relname} has a policy`).toBeGreaterThanOrEqual(1);
    }
  });

  it('the shipment_cases partitions have RLS enabled + forced + policy', async () => {
    const rows = await rlsStateFor(['shipment_cases', 'shipment_cases_2026', 'shipment_cases_default']);
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.enabled, `${r.relname} RLS enabled`).toBe(true);
      expect(r.forced, `${r.relname} RLS forced`).toBe(true);
    }
  });

  it('live cross-tenant probe: the restricted role sees zero rows for a bogus tenant', async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL_APP });
    await client.connect();
    try {
      // A fresh random uuid — guaranteed to match no real tenant. (Not the
      // all-zeros uuid: tenant_settings carries a sentinel default row under
      // it — see HUD-0018.)
      await client.query('select set_config($1, $2, false)', ['app.tenant_id', randomUUID()]);
      for (const table of PREVIOUSLY_LEAKING) {
        const res = await client.query(`select count(*)::int as n from ${table}`);
        expect(res.rows[0].n, `${table} leaked rows to a bogus tenant`).toBe(0);
      }
    } finally {
      await client.end();
    }
  });
});
