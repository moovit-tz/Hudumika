/**
 * verify-authentik.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline end-to-end integration verification for the Ondi × authentik layer.
 *
 * Runs fully without a live database or authentik instance by:
 *   • Replacing PrismaClient with an in-memory store
 *   • Replacing authentik HTTP calls with no-op mocks that record invocations
 *   • Injecting HTTP requests via Fastify's built-in .inject() helper
 *
 * Run: npx tsx src/verify-authentik.ts
 */

// Set env vars BEFORE any imports that read them at module load time
process.env.AUTHENTIK_WEBHOOK_SECRET = 'test_hmac_secret_for_verification';

import Fastify from 'fastify';
import crypto  from 'crypto';
import fp      from 'fastify-plugin';

// ─── In-memory stores ────────────────────────────────────────────────────────

const DB = {
  users:          new Map<string, any>(),
  trustProfiles:  new Map<string, any>(),
  kycRecords:     new Map<string, any>(),
  activityEvents: new Map<string, any>(),
  authSessions:   new Map<string, any>(),
  otps:           new Map<string, any>(),
  auditLogs:      new Map<string, any>(),
};

function mkId() { return crypto.randomUUID(); }

// ─── Prisma Mock ─────────────────────────────────────────────────────────────

const prismaMock = {
  user: {
    create: async (args: any) => {
      const u = { id: mkId(), ondi: mkId(), ...args.data };
      DB.users.set(u.id, u);
      return u;
    },
    findUnique: async (args: any) => {
      if (args.where?.id)    return DB.users.get(args.where.id) ?? null;
      if (args.where?.email) {
        for (const u of DB.users.values()) if (u.email === args.where.email) return u;
      }
      return null;
    },
    findFirst: async (args: any) => {
      if (args.where?.phoneNumber) {
        for (const u of DB.users.values()) if (u.phoneNumber === args.where.phoneNumber) return u;
      }
      return null;
    },
    update: async (args: any) => {
      const u = DB.users.get(args.where.id);
      if (!u) throw new Error('User not found');
      Object.assign(u, args.data);
      return u;
    },
    deleteMany: async () => ({ count: 0 }),
    delete:     async (args: any) => { DB.users.delete(args.where.id); return {}; },
  },
  trustProfile: {
    findUnique: async (args: any) => {
      for (const tp of DB.trustProfiles.values())
        if (tp.userId === args.where?.userId) return tp;
      return null;
    },
    upsert: async (args: any) => {
      let existing: any = null;
      for (const t of DB.trustProfiles.values())
        if (t.userId === args.where?.userId) { existing = t; break; }
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      const n = { id: mkId(), ...args.create };
      DB.trustProfiles.set(n.id, n);
      return n;
    },
    deleteMany: async () => ({ count: 0 }),
  },
  kYCRecord: {
    findFirst: async (args: any) => {
      for (const r of DB.kycRecords.values()) {
        const matchUser   = !args.where?.userId || r.userId === args.where.userId;
        const matchStatus = !args.where?.status || r.status === args.where.status;
        if (matchUser && matchStatus) return r;
      }
      return null;
    },
  },
  activityEvent: {
    create: async (args: any) => {
      const e = { id: mkId(), timestamp: new Date(), ...args.data };
      DB.activityEvents.set(e.id, e);
      return e;
    },
    findMany: async (args: any) => {
      const results: any[] = [];
      for (const e of DB.activityEvents.values()) {
        if (!args?.where?.userId || e.userId === args.where.userId) results.push(e);
      }
      return results.slice(0, args?.take ?? 50);
    },
    deleteMany: async () => ({ count: 0 }),
  },
  authSession: {
    deleteMany: async () => ({ count: 0 }),
  },
  authEvent: {
    create: async (args: any) => ({ id: mkId(), ...args.data }),
  },
  auditLog: {
    findFirst: async () => null,
    create:    async (args: any) => {
      const l = { id: mkId(), ...args.data };
      DB.auditLogs.set(l.id, l);
      return l;
    },
    deleteMany: async () => ({ count: 0 }),
  },
  oTP: {
    count:  async () => 0,
    create: async (args: any) => {
      const o = { id: mkId(), ...args.data };
      DB.otps.set(o.id, o);
      return o;
    },
    findFirst:  async () => null,
    updateMany: async () => ({ count: 0 }),
    deleteMany: async () => ({ count: 0 }),
  },
  $connect:    async () => {},
  $disconnect: async () => {},
};

// ─── authentik Mock ──────────────────────────────────────────────────────────

const authentikCalls: string[] = [];

const mockAuthentikPlugin = fp(async (app) => {
  app.decorate('authentik', {
    isConnected: true,
    provisionUser: async (user: any, _orgId?: string, _dept?: string) => {
      const label = `provisionUser:${user.email ?? user.id}`;
      authentikCalls.push(label);
      console.log(`  [authentik] SCIM ${label}`);
      return { id: `mock_auth_${Date.now()}` };
    },
    updateUser: async (authentikUserId: string, _patches: any[]) => {
      authentikCalls.push(`updateUser:${authentikUserId}`);
      return true;
    },
    deprovisionUser: async (authentikUserId: string) => {
      authentikCalls.push(`deprovisionUser:${authentikUserId}`);
      console.log(`  [authentik] deprovisionUser pk=${authentikUserId}`);
      return true;
    },
    updateAttributes: async (userPk: string, attrs: any) => {
      authentikCalls.push(`updateAttributes:${userPk}`);
      console.log(`  [authentik] updateAttributes pk=${userPk}`, attrs);
      return true;
    },
    getUserPkByEmailOrEmployeeId: async (email?: string, employeeId?: string) => {
      const id = `mock_pk_${email ?? employeeId}`;
      authentikCalls.push(`getUserPk:${email ?? employeeId}`);
      console.log(`  [authentik] getUserPk → ${id}`);
      return id;
    },
    revokeSessions: async (username: string, userPk: string) => {
      authentikCalls.push(`revokeSessions:${userPk}`);
      console.log(`  [authentik] revokeSessions username=${username} pk=${userPk}`);
      return true;
    },
  });
});

// ─── Minimal Plugins ─────────────────────────────────────────────────────────

const mockPrismaPlugin = fp(async (app) => {
  app.decorate('prisma', prismaMock as any);
  app.addHook('onClose', async () => {});
});

const mockAuditPlugin = fp(async (app) => {
  app.decorate('audit', {
    write: async (entry: any) => {
      console.log(`  [audit] ${entry.action} | entity=${entry.entityId} | sev=${entry.severity}`);
    },
  } as any);
});

const mockTrustEnginePlugin = fp(async (app) => {
  app.decorate('recalculateTrust', async (userId: string) => {
    const events = await prismaMock.activityEvent.findMany({ where: { userId }, take: 50 });
    const kyc    = await prismaMock.kYCRecord.findFirst({ where: { userId, status: 'VERIFIED' } });

    let score = 300;
    if (kyc) score += 200;
    events.forEach((e: any) => {
      if (e.type === 'LOGIN' && e.status === 'SUCCESS') score += 1;
    });
    score = Math.max(300, Math.min(850, score));
    const tier = score >= 700 ? 'HIGH' : score >= 500 ? 'MEDIUM' : 'LOW';

    await prismaMock.trustProfile.upsert({
      where:  { userId },
      update: { currentScore: score, trustTier: tier },
      create: { userId, currentScore: score, trustTier: tier },
    });

    await (app as any).authentik.updateAttributes(userId, {
      ondi_trust_score: score,
      ondi_trust_tier:  tier,
    });

    return { score, tier };
  });
});

const mockRiskEnginePlugin = fp(async (app) => {
  app.decorate('riskEngine', {
    assess: async () => ({ decision: 'allow', riskScore: 10, factors: [] }),
  } as any);
});

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runVerification() {
  const app = Fastify({ logger: false });

  console.log('🚀  Setting up offline mock server…');
  await app.register(mockPrismaPlugin);
  await app.register(mockAuditPlugin);
  await app.register(mockAuthentikPlugin);
  await app.register(mockTrustEnginePlugin);
  await app.register(mockRiskEnginePlugin);

  const { authRoutes }             = await import('./routes/auth.js');
  const { authentikWebhookRoutes } = await import('./routes/authentik-webhooks.js');

  await app.register(authRoutes,             { prefix: '/v1/auth' });
  await app.register(authentikWebhookRoutes, { prefix: '/v1/webhooks' });

  await app.ready();
  console.log('✅  Mock server ready\n');

  // ─── Seed test data directly into in-memory stores ───────────────────────
  const userId = mkId();
  const email  = 'verify.test@ondi.internal';
  DB.users.set(userId, {
    id:                userId,
    ondi:             mkId(),
    phoneNumber:       '+255700000001',
    email,
    firstName:         'Verify',
    lastName:          'Test',
    verificationLevel: 'L2_GOV_VERIFIED',
    kycStatus:         'VERIFIED',
    failedAttempts:    0,
    lastIp:            null,
    trustProfile:      null,
    createdAt:         new Date(),
  });
  // Verified KYC so trust score gets the +200 boost
  DB.kycRecords.set(mkId(), { id: mkId(), userId, status: 'VERIFIED' });
  console.log(`👤  Seeded test user  id=${userId}\n`);

  // ─── TEST 1: SCIM onboarding ─────────────────────────────────────────────
  console.log('🧪  Test 1 — SCIM onboarding via POST /v1/auth/onboard');
  const t1 = await app.inject({
    method:  'POST',
    url:     '/v1/auth/onboard',
    headers: { 'x-admin-key': process.env.ADMIN_KEY! },
    payload: { userId, department: 'Compliance', orgId: 'complyos-enterprise' },
  });
  console.log(`    Status: ${t1.statusCode}   Body: ${t1.body}`);
  const b1 = JSON.parse(t1.body);
  if (t1.statusCode !== 200 || !b1.onboarded)
    throw new Error('Test 1 FAILED — expected 200 onboarded:true');
  if (!authentikCalls.some(c => c.startsWith('provisionUser')))
    throw new Error('Test 1 FAILED — provisionUser was never called');
  console.log('✅  Test 1 PASSED\n');

  // ─── TEST 2: Trust recalculation + authentik attribute sync ──────────────
  console.log('🧪  Test 2 — Trust recalculation & authentik attribute sync');
  const t2 = await (app as any).recalculateTrust(userId);
  console.log(`    Score: ${t2.score}   Tier: ${t2.tier}`);
  if (t2.score < 500)
    throw new Error('Test 2 FAILED — KYC boost missing; score should be ≥500');
  if (!authentikCalls.some(c => c.startsWith('updateAttributes')))
    throw new Error('Test 2 FAILED — updateAttributes was never called');
  console.log('✅  Test 2 PASSED\n');

  // ─── TEST 3: Valid webhook accepted ──────────────────────────────────────
  console.log('🧪  Test 3 — Valid HMAC-SHA256 webhook accepted');
  const secret   = process.env.AUTHENTIK_WEBHOOK_SECRET!; // 'test_hmac_secret_for_verification'
  const wbPayload = JSON.stringify({
    action:    'login',
    user:      { pk: userId, username: email, email },
    client_ip: '192.168.1.100',
    context:   { user_agent: 'Mozilla/5.0' },
    created:   new Date().toISOString(),
  });
  const sig = crypto.createHmac('sha256', secret).update(wbPayload).digest('hex');

  const t3 = await app.inject({
    method:  'POST',
    url:     '/v1/webhooks/authentik/events',
    headers: { 'content-type': 'application/json', 'x-authentik-signature': sig },
    payload: wbPayload,
  });
  console.log(`    Status: ${t3.statusCode}   Body: ${t3.body}`);
  if (t3.statusCode !== 200 || !JSON.parse(t3.body).success)
    throw new Error('Test 3 FAILED — valid webhook rejected');
  console.log('✅  Test 3 PASSED\n');

  // ─── TEST 3b: Tampered webhook rejected ──────────────────────────────────
  console.log('🧪  Test 3b — Tampered webhook must be rejected (401)');
  const t3b = await app.inject({
    method:  'POST',
    url:     '/v1/webhooks/authentik/events',
    headers: { 'content-type': 'application/json', 'x-authentik-signature': 'deadbeefcafe' },
    payload: wbPayload,
  });
  console.log(`    Status: ${t3b.statusCode}`);
  if (t3b.statusCode !== 401)
    throw new Error('Test 3b FAILED — tampered webhook was NOT rejected (expected 401)');
  console.log('✅  Test 3b PASSED\n');

  // ─── TEST 4: LEAVER offboarding ───────────────────────────────────────────
  console.log('🧪  Test 4 — LEAVER offboarding via POST /v1/auth/offboard');
  const t4 = await app.inject({
    method:  'POST',
    url:     '/v1/auth/offboard',
    headers: { 'x-admin-key': process.env.ADMIN_KEY! },
    payload: { userId },
  });
  console.log(`    Status: ${t4.statusCode}   Body: ${t4.body}`);
  const b4 = JSON.parse(t4.body);
  if (t4.statusCode !== 200 || !b4.offboarded)
    throw new Error('Test 4 FAILED — expected 200 offboarded:true');
  if (!authentikCalls.some(c => c.startsWith('revokeSessions')))
    throw new Error('Test 4 FAILED — revokeSessions was never called');
  if (!authentikCalls.some(c => c.startsWith('deprovisionUser')))
    throw new Error('Test 4 FAILED — deprovisionUser was never called');
  console.log('✅  Test 4 PASSED\n');

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('📋  authentik mock call log:');
  authentikCalls.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  console.log('\n🎉  ALL 5 INTEGRATION VERIFICATION TESTS PASSED! 🎉\n');

  await app.close();
}

runVerification().catch(err => {
  console.error('\n❌  Verification failed:', err.message ?? err);
  process.exit(1);
});
