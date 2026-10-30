import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp } from './helpers.js';

it('keeps dashboard totals correct with 1000 staff, 200 customers and concurrent readers', async () => {
  const tenant = await createTestTenant();
  try {
    const app = await getApp();
    const staffIds = Array.from({ length: 1000 }, () => randomUUID());
    await withTenant(tenant.tenantId, async trx => {
      const staff = staffIds.map(id => ({ id, tenant_id: tenant.tenantId, name: 'Load fixture employee', email: `${id}@load.invalid`, password_hash: 'not-a-login', role: 'JUNIOR' as const }));
      const customers = Array.from({ length: 200 }, () => ({ tenant_id: tenant.tenantId, name: 'Load fixture customer', email: `${randomUUID()}@load.invalid`, password_hash: 'not-a-login', role: 'CUSTOMER' as const }));
      await trx.insertInto('users').values([...staff, ...customers]).execute();
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await trx.insertInto('hr_attendance').values(staffIds.map((id, index) => ({ tenant_id: tenant.tenantId, user_id: id, date, status: index % 2 ? 'LATE' : 'PRESENT', clock_in: '09:00', clock_out: null, notes: null, recorded_by: tenant.userId }))).execute();
    });
    const before = process.memoryUsage();
    const latencies = await Promise.all(Array.from({ length: 20 }, async () => {
      const started = performance.now();
      const r = await app.inject({ method: 'GET', url: '/v1/hr/tools-overview', headers: authHeaders(tenant.token) });
      expect(r.statusCode).toBe(200);
      expect(r.json().hr.total_staff).toBe(1001);
      expect(r.json().hr.active_staff).toBe(1001);
      expect(r.json().hr.today_present).toBe(1000);
      return performance.now() - started;
    }));
    latencies.sort((a, b) => a - b);
    const after = process.memoryUsage();
    const report = { scope: 'Local Fastify injection + real database; not a production capacity or soak certification', staff: 1000, customers: 200, concurrent_reads: 20, p50_ms: Math.round(latencies[9]), p95_ms: Math.round(latencies[18]), max_ms: Math.round(latencies[19]), heap_delta_bytes: after.heapUsed - before.heapUsed, rss_delta_bytes: after.rss - before.rss };
    const directory = resolve(process.cwd(), '../../docs/audits'); mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'nexushr-load-smoke.json'), JSON.stringify(report, null, 2));
    expect(report.max_ms).toBeLessThan(15000);
  } finally { await tenant.cleanup(); }
}, 120000);
