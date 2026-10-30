import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Exercise the compiled application without starting queues or a listener.
process.env.NODE_ENV = 'test';
const { server, registerApp } = await import('../apps/api/dist/index.js');
const { db, dbPlatform } = await import('../apps/api/dist/db/client.js');
await registerApp();
let tenant;
try {
  tenant = await dbPlatform.insertInto('tenants').values({ slug: `built-hr-test-${randomUUID()}`, name: 'Disposable built API check', plan: 'enterprise' }).returningAll().executeTakeFirstOrThrow();
  const employee = await dbPlatform.insertInto('users').values({ tenant_id: tenant.id, email: `${randomUUID()}@built-test.invalid`, name: 'Built API test', role: 'TENANT_ADMIN', password_hash: 'not-a-login' }).returningAll().executeTakeFirstOrThrow();
  const token = server.jwt.sign({ sub: employee.id, tenant_id: tenant.id, role: employee.role, email: employee.email, name: employee.name, exp: Math.floor(Date.now() / 1000) + 300 });
  const headers = { authorization: `Bearer ${token}` };
  for (const [method, url, payload] of [
    ['GET', '/v1/hr/tools-overview'],
    ['POST', '/v1/hr/clock-in/start', {}],
    ['POST', '/v1/hr/clock-in/stop', {}],
  ]) {
    const response = await server.inject({ method, url, headers, ...(payload ? { payload } : {}) });
    assert.equal(response.statusCode, 200, `${method} ${url}: ${response.body}`);
  }
  console.log('Compiled NexusHR API: KPI, clock-in and clock-out checks passed.');
} finally {
  if (tenant) await dbPlatform.deleteFrom('tenants').where('id', '=', tenant.id).execute();
  await server.close();
  await db.destroy();
  await dbPlatform.destroy();
}
