// Shared setup for the HR integration tests: a real Fastify app (every
// plugin and route actually registered, via registerApp()), a real
// throwaway tenant + user in the real dev database, and a real signed JWT
// — driven through server.inject() rather than mocks, matching how every
// P0 fix in this module was verified by hand during the audit that
// produced this suite.
import { randomUUID } from 'crypto';
import { server, registerApp } from '../index.js';
import { dbPlatform } from '../db/client.js';
import type { UserRole } from '@hudumika/types';

export async function getApp() {
  await registerApp();
  return server;
}

export interface TestTenant {
  tenantId: string;
  userId: string;
  token: string;
  /** Mints another user in the same tenant with a different role — for
   *  testing "this role should be refused" without standing up a whole
   *  second tenant. */
  addUser(role: UserRole): Promise<{ userId: string; token: string }>;
  cleanup(): Promise<void>;
}

/** A fresh tenant (plan 'starter', which already grants 'nexushr' — see
 *  migration 060/170) with one admin user, ready to call any HR route
 *  against. Tenant deletion cascades to every row this test created. */
export async function createTestTenant(role: UserRole = 'TENANT_ADMIN'): Promise<TestTenant> {
  await getApp();
  const suffix = randomUUID().slice(0, 8);
  const tenant = await dbPlatform.insertInto('tenants').values({
    slug: `hr-test-${suffix}`,
    name: `HR Test Tenant ${suffix}`,
    plan: 'starter',
  }).returningAll().executeTakeFirstOrThrow();

  async function addUser(userRole: UserRole) {
    const user = await dbPlatform.insertInto('users').values({
      tenant_id: tenant.id,
      email: `${userRole.toLowerCase()}-${randomUUID().slice(0, 8)}@hr-test.invalid`,
      password_hash: 'not-a-real-hash-tests-sign-jwts-directly',
      role: userRole,
      name: `Test ${userRole}`,
    }).returningAll().executeTakeFirstOrThrow();
    const now = Math.floor(Date.now() / 1000);
    const token = server.jwt.sign({
      sub: user.id, tenant_id: tenant.id, role: userRole, email: user.email, name: user.name,
      iat: now, exp: now + 3600,
    });
    return { userId: user.id, token };
  }

  const primary = await addUser(role);

  return {
    tenantId: tenant.id,
    userId: primary.userId,
    token: primary.token,
    addUser,
    async cleanup() {
      await dbPlatform.deleteFrom('tenants').where('id', '=', tenant.id).execute();
    },
  };
}

export function authHeaders(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}
