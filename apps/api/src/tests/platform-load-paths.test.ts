/**
 * Load-path regressions (perf audit 2026-11-16).
 *
 * The platform settings row stores every app's logo as a base64 data URI —
 * ~9 MB in the dev database. GET /v1/platform/branding used to return all of
 * it on every page load, and the per-request maintenance gate re-read and
 * parsed the whole row on every authenticated API call. These tests pin the
 * slimmer contract without losing anything the client relies on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

const GLOBAL = '00000000-0000-0000-0000-000000000000';
const APP = 'zz-perf-test';
// A 1x1 PNG, plus enough padding to resemble a real upload.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const LOGO = `data:image/png;base64,${PNG}`;

describe('platform load paths', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let tenant: TestTenant;
  let superAdmin: TestTenant;

  beforeAll(async () => {
    app = await getApp();
    tenant = await createTestTenant('TENANT_ADMIN');
    superAdmin = await createTestTenant('SUPER_ADMIN');
    // Only this test's own app entry is touched; the rest of the platform
    // branding is left exactly as it is.
    await sql`UPDATE tenant_settings
      SET settings = jsonb_set(jsonb_set(settings, '{branding}', coalesce(settings->'branding', '{}'::jsonb)),
                               '{branding,apps}', coalesce(settings->'branding'->'apps', '{}'::jsonb))
      WHERE tenant_id = ${GLOBAL}`.execute(dbPlatform);
    await sql`UPDATE tenant_settings
      SET settings = jsonb_set(settings, ${`{branding,apps,${APP}}`}::text[], ${JSON.stringify({ name: 'Perf test', color: '#123456', logo: LOGO })}::jsonb)
      WHERE tenant_id = ${GLOBAL}`.execute(dbPlatform);
  }, 120_000);

  afterAll(async () => {
    await sql`UPDATE tenant_settings SET settings = settings #- ${`{branding,apps,${APP}}`}::text[] WHERE tenant_id = ${GLOBAL}`.execute(dbPlatform);
    await tenant?.cleanup();
    await superAdmin?.cleanup();
  }, 120_000);

  it('serves branding without logo bytes, with a stable icon URL and version', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/branding' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const entry = body.apps[APP];
    expect(entry).toMatchObject({ name: 'Perf test', color: '#123456', logo: `/v1/platform/branding/app-icon/${APP}` });
    expect(entry.logoVersion).toMatch(/^[0-9a-f]{12}$/);
    // No app entry carries image bytes any more.
    expect(JSON.stringify(body.apps)).not.toContain('data:image');
    // Same logo, same version: the client's icon URL stays cacheable.
    const again = (await app.inject({ method: 'GET', url: '/v1/platform/branding' })).json();
    expect(again.apps[APP].logoVersion).toBe(entry.logoVersion);
  });

  it('still serves the icon bytes from the app-icon endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/platform/branding/app-icon/${APP}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.equals(Buffer.from(PNG, 'base64'))).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/v1/platform/branding/app-icon/zz-no-such-app' })).statusCode).toBe(404);
  });

  it('a logo saved through the API gets a new version immediately', async () => {
    // Reads are served from a 30 s snapshot; a save through the platform routes
    // must clear it, so the saving admin (and App Configurator) see the change
    // on their very next read.
    const before = (await app.inject({ method: 'GET', url: '/v1/platform/branding' })).json().apps[APP].logoVersion;
    const save = await app.inject({
      method: 'PUT', url: '/v1/platform/branding', headers: authHeaders(superAdmin.token),
      payload: { apps: { [APP]: { logo: LOGO + 'AA' } } },
    });
    expect(save.statusCode, save.body).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/v1/platform/branding' })).json().apps[APP];
    expect(after.logoVersion).not.toBe(before);
    expect(after.name).toBe('Perf test'); // the save merged, it didn't replace the entry
  });

  it('single-key platform endpoints return just their key', async () => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select(sql<any>`settings->'design-system-version'`.as('v'))
      .where('tenant_id', '=', GLOBAL).executeTakeFirst();
    const res = await app.inject({ method: 'GET', url: '/v1/platform/design-system-version' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(row?.v ?? { version: 'v1', v2Color: '#141e33' });
  });

  it('authenticated requests still pass the per-request gates', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/identity/me', headers: authHeaders(tenant.token) });
    expect(res.statusCode).toBe(200);
  });
});
