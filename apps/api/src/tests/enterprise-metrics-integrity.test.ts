/**
 * Phase L: Enterprise metrics, scale and service operations integrity tests.
 * Covers platform/tenant metrics, resource limits, durable jobs,
 * bulk operations, tenant isolation, and route ACL.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { EnterpriseMetricsService } from '../services/enterprise-metrics.service.js';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';

let tenantA: TestTenant;
let tenantB: TestTenant;
let superAdmin: TestTenant;

beforeAll(async () => {
  tenantA = await createTestTenant('ADMIN');
  tenantB = await createTestTenant('ADMIN');
  superAdmin = await createTestTenant('SUPER_ADMIN');
}, 120000);

afterAll(async () => {
  if (tenantA) await tenantA.cleanup();
  if (tenantB) await tenantB.cleanup();
  if (superAdmin) await superAdmin.cleanup();
}, 120000);

// ── L01: Platform metrics ─────────────────────────────────────────

describe('L01: platform metrics', () => {
  it('computes a daily platform snapshot', async () => {
    const snap = await EnterpriseMetricsService.computePlatformSnapshot('daily');
    expect(snap.metric_type).toBe('daily');
    expect(snap.total_tenants).toBeGreaterThanOrEqual(3);
    expect(snap.active_tenants).toBeGreaterThanOrEqual(3);
    expect(snap.total_users).toBeGreaterThanOrEqual(3);
    expect(typeof snap.mrr_amount).toBe('number');
  });

  it('upserts on same date+type (idempotent)', async () => {
    const snap2 = await EnterpriseMetricsService.computePlatformSnapshot('daily');
    expect(snap2.metric_type).toBe('daily');
    const all = await EnterpriseMetricsService.listPlatformSnapshots({ metric_type: 'daily' });
    const todaySnaps = all.filter(s =>
      (s as any).snapshot_date === new Date().toISOString().slice(0, 10),
    );
    expect(todaySnaps).toHaveLength(1);
  });

  it('lists platform snapshots', async () => {
    const snaps = await EnterpriseMetricsService.listPlatformSnapshots({ limit: 10 });
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });
});

// ── L02: Tenant metrics ───────────────────────────────────────────

describe('L02: tenant metrics', () => {
  it('computes tenant snapshot with real user count', async () => {
    const snap = await EnterpriseMetricsService.computeTenantSnapshot(tenantA.tenantId);
    expect(snap.tenant_id).toBe(tenantA.tenantId);
    expect(snap.user_count).toBeGreaterThanOrEqual(1);
    expect(typeof snap.total_cost_ytd).toBe('number');
  });

  it('tenant B cannot see tenant A snapshots', async () => {
    const snaps = await EnterpriseMetricsService.listTenantSnapshots(tenantB.tenantId);
    const fromA = snaps.filter(s => s.tenant_id === tenantA.tenantId);
    expect(fromA).toHaveLength(0);
  });
});

// ── L03: Resource limits ──────────────────────────────────────────

describe('L03: resource limits', () => {
  it('sets a soft user limit', async () => {
    const limit = await EnterpriseMetricsService.setResourceLimit(tenantA.tenantId, {
      resource_type: 'users',
      max_allowed: 50,
      enforcement: 'soft',
      overage_action: 'warn',
    });
    expect(limit.resource_type).toBe('users');
    expect(limit.max_allowed).toBe(50);
  });

  it('sets a hard permit limit', async () => {
    const limit = await EnterpriseMetricsService.setResourceLimit(tenantA.tenantId, {
      resource_type: 'permits',
      max_allowed: 1000,
      enforcement: 'hard',
      overage_action: 'block',
    });
    expect(limit.enforcement).toBe('hard');
  });

  it('check passes when under soft limit', async () => {
    const result = await EnterpriseMetricsService.checkResourceLimit(
      tenantA.tenantId, 'users', 10,
    );
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(50);
    expect(result.usage).toBe(10);
  });

  it('soft limit still allows when exceeded', async () => {
    const result = await EnterpriseMetricsService.checkResourceLimit(
      tenantA.tenantId, 'users', 60,
    );
    expect(result.allowed).toBe(true);
  });

  it('hard limit blocks when exceeded', async () => {
    const result = await EnterpriseMetricsService.checkResourceLimit(
      tenantA.tenantId, 'permits', 1500,
    );
    expect(result.allowed).toBe(false);
    expect(result.enforcement).toBe('hard');
  });

  it('no limit means allowed', async () => {
    const result = await EnterpriseMetricsService.checkResourceLimit(
      tenantA.tenantId, 'storage_mb', 999999,
    );
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });

  it('upserts existing limit', async () => {
    await EnterpriseMetricsService.setResourceLimit(tenantA.tenantId, {
      resource_type: 'users',
      max_allowed: 100,
    });
    const result = await EnterpriseMetricsService.checkResourceLimit(
      tenantA.tenantId, 'users', 60,
    );
    expect(result.limit).toBe(100);
  });

  it('updates usage tracking', async () => {
    const updated = await EnterpriseMetricsService.updateResourceUsage(
      tenantA.tenantId, 'users', 25,
    );
    expect(updated.current_usage).toBe(25);
    expect(updated.last_checked_at).toBeTruthy();
  });

  it('lists all limits for tenant', async () => {
    const limits = await EnterpriseMetricsService.listResourceLimits(tenantA.tenantId);
    expect(limits.length).toBeGreaterThanOrEqual(2);
  });

  it('tenant B cannot see tenant A limits', async () => {
    const limits = await EnterpriseMetricsService.listResourceLimits(tenantB.tenantId);
    expect(limits).toHaveLength(0);
  });
});

// ── L04: Durable jobs ─────────────────────────────────────────────

describe('L04: durable job lifecycle', () => {
  let jobId: string;

  it('enqueues a job', async () => {
    const job = await EnterpriseMetricsService.enqueueJob(
      tenantA.tenantId, tenantA.userId, {
        job_type: 'permit_renewal_batch',
        job_key: 'batch-2027-q1',
        payload: { count: 50, jurisdiction: 'TZ' },
        priority: 5,
        max_retries: 3,
      },
    );
    expect(job).toBeTruthy();
    jobId = (job as any).id;
    expect((job as any).status).toBe('pending');
    expect((job as any).priority).toBe(5);
  });

  it('dedup: same key does not create second job', async () => {
    const dup = await EnterpriseMetricsService.enqueueJob(
      tenantA.tenantId, tenantA.userId, {
        job_type: 'permit_renewal_batch',
        job_key: 'batch-2027-q1',
      },
    );
    expect(dup).toBeUndefined();
  });

  it('claims the job', async () => {
    const claimed = await EnterpriseMetricsService.claimJob(jobId, tenantA.tenantId);
    expect(claimed.status).toBe('running');
    expect(claimed.started_at).toBeTruthy();
  });

  it('completes the job with result', async () => {
    const completed = await EnterpriseMetricsService.completeJob(
      jobId, tenantA.tenantId,
      { renewals_processed: 48, failures: 2 },
    );
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).toBeTruthy();
  });

  it('lists jobs filtered by type', async () => {
    const jobs = await EnterpriseMetricsService.listJobs(
      tenantA.tenantId, { job_type: 'permit_renewal_batch' },
    );
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('tenant B cannot see tenant A jobs', async () => {
    const jobs = await EnterpriseMetricsService.listJobs(tenantB.tenantId);
    expect(jobs).toHaveLength(0);
  });
});

// ── L05: Job retry logic ──────────────────────────────────────────

describe('L05: job retry logic', () => {
  let retryJobId: string;

  beforeAll(async () => {
    const job = await EnterpriseMetricsService.enqueueJob(
      tenantA.tenantId, tenantA.userId, {
        job_type: 'export_report',
        job_key: `retry-${Date.now()}`,
        max_retries: 2,
      },
    );
    retryJobId = (job as any).id;
    await EnterpriseMetricsService.claimJob(retryJobId, tenantA.tenantId);
  });

  it('first failure sets retrying status', async () => {
    const failed = await EnterpriseMetricsService.failJob(
      retryJobId, tenantA.tenantId, 'Connection timeout',
    );
    expect(failed.status).toBe('retrying');
    expect(failed.retry_count).toBe(1);
  });

  it('can be reclaimed and retried', async () => {
    const claimed = await EnterpriseMetricsService.claimJob(retryJobId, tenantA.tenantId);
    expect(claimed.status).toBe('running');
  });

  it('second failure exhausts retries → failed', async () => {
    const failed = await EnterpriseMetricsService.failJob(
      retryJobId, tenantA.tenantId, 'Server unavailable',
    );
    expect(failed.status).toBe('failed');
    expect(failed.retry_count).toBe(2);
    expect(failed.error_message).toBe('Server unavailable');
  });
});

// ── L06: Bulk operations ──────────────────────────────────────────

describe('L06: bulk operations', () => {
  let bulkId: string;

  it('creates a bulk import operation', async () => {
    const op = await EnterpriseMetricsService.createBulkOperation(
      tenantA.tenantId, tenantA.userId, {
        operation_type: 'import',
        source_type: 'csv',
        target_type: 'permits',
        total_records: 500,
        file_url: 'https://storage.test/permits-import.csv',
      },
    );
    bulkId = op.id as string;
    expect(op.status).toBe('pending');
    expect(op.total_records).toBe(500);
  });

  it('starts processing', async () => {
    const updated = await EnterpriseMetricsService.updateBulkProgress(
      tenantA.tenantId, bulkId, { status: 'processing' },
    );
    expect(updated.status).toBe('processing');
    expect(updated.started_at).toBeTruthy();
  });

  it('tracks progress incrementally', async () => {
    const updated = await EnterpriseMetricsService.updateBulkProgress(
      tenantA.tenantId, bulkId, {
        processed_records: 350,
        failed_records: 5,
      },
    );
    expect(updated.processed_records).toBe(350);
    expect(updated.failed_records).toBe(5);
  });

  it('completes with partial status and error summary', async () => {
    const updated = await EnterpriseMetricsService.updateBulkProgress(
      tenantA.tenantId, bulkId, {
        status: 'partial',
        processed_records: 495,
        failed_records: 5,
        error_summary: { missing_fields: 3, duplicate_codes: 2 },
        result_url: 'https://storage.test/permits-import-result.csv',
      },
    );
    expect(updated.status).toBe('partial');
    expect(updated.completed_at).toBeTruthy();
    expect(updated.result_url).toContain('result');
  });

  it('lists bulk ops by type', async () => {
    const ops = await EnterpriseMetricsService.listBulkOperations(
      tenantA.tenantId, { operation_type: 'import' },
    );
    expect(ops.length).toBeGreaterThanOrEqual(1);
  });

  it('tenant B cannot see tenant A bulk ops', async () => {
    const ops = await EnterpriseMetricsService.listBulkOperations(tenantB.tenantId);
    expect(ops).toHaveLength(0);
  });
});

// ── L07: Route access control ─────────────────────────────────────

describe('L07: route access control', () => {
  it('any user can list their tenant metrics', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/metrics/tenant',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('SUPER_ADMIN can access platform metrics', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/metrics/platform',
      headers: { authorization: `Bearer ${superAdmin.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('regular ADMIN cannot access platform metrics', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/metrics/platform',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR cannot create resource limits', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/resource-limits',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { resource_type: 'users', max_allowed: 100 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR can check resource limits', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/resource-limits/check',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { resource_type: 'users', current_usage: 10 },
    });
    expect(res.statusCode).toBe(200);
  });
});
