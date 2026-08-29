import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  buildTestApp, closeTestApp, randomPhone, extractOtpCode, authHeader,
  type TestApp,
} from './helpers.js';

describe('Auth: OTP request + verify', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  it('POST /v1/auth/request-otp creates a real PENDING OTP row (hashed, not plaintext)', async () => {
    const phoneNumber = randomPhone();

    const res = await t.app.inject({ method: 'POST', url: '/v1/auth/request-otp', payload: { phoneNumber } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sent: true, expiresIn: 300 });

    const otpRow = await t.app.prisma.oTP.findFirst({ where: { phoneNumber }, orderBy: { createdAt: 'desc' } });
    expect(otpRow).not.toBeNull();
    expect(otpRow!.status).toBe('PENDING');
    expect(otpRow!.codeHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex — never the plaintext code
    expect(otpRow!.attempts).toBe(0);
  });

  it('POST /v1/auth/otp/verify with the real code returns a real signed access token and creates a real AuthSession', async () => {
    const phoneNumber = randomPhone();

    const otpReq = await t.app.inject({ method: 'POST', url: '/v1/auth/request-otp', payload: { phoneNumber } });
    expect(otpReq.statusCode).toBe(200);
    const code = extractOtpCode(t.logs, phoneNumber);
    expect(code).toMatch(/^\d{6}$/);

    const verifyRes = await t.app.inject({
      method: 'POST', url: '/v1/auth/otp/verify', payload: { phone: phoneNumber, otp: code },
    });
    expect(verifyRes.statusCode).toBe(200);
    const body = verifyRes.json();
    expect(body.success).toBe(true);
    expect(typeof body.access_token).toBe('string');
    expect(typeof body.refresh_token).toBe('string');
    expect(body.user.phoneNumber).toBe(phoneNumber);

    // The access token is a real JWT signed with the server's real secret —
    // decode it and confirm the claims match the real user record, not a stub.
    const decoded = jwt.decode(body.access_token) as any;
    expect(decoded.sub).toBe(body.user.id);
    expect(decoded.one_id).toBe(body.user.ondi);

    const dbUser = await t.app.prisma.user.findUnique({ where: { phoneNumber } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.id).toBe(body.user.id);

    const session = await t.app.prisma.authSession.findFirst({ where: { userId: dbUser!.id } });
    expect(session).not.toBeNull();
    expect(session!.refreshTokenHash).toBe(
      crypto.createHash('sha256').update(body.refresh_token).digest('hex'),
    );

    const otpRow = await t.app.prisma.oTP.findFirst({ where: { phoneNumber }, orderBy: { createdAt: 'desc' } });
    expect(otpRow!.status).toBe('USED');

    // GET /v1/auth/me with the real bearer token round-trips the same user.
    const meRes = await t.app.inject({ method: 'GET', url: '/v1/auth/me', headers: authHeader(body.access_token) });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().id).toBe(dbUser!.id);
  });

  it('rejects a wrong OTP code with 401 and increments real attempts on the OTP row', async () => {
    const phoneNumber = randomPhone();
    await t.app.inject({ method: 'POST', url: '/v1/auth/request-otp', payload: { phoneNumber } });

    const res = await t.app.inject({
      method: 'POST', url: '/v1/auth/otp/verify', payload: { phone: phoneNumber, otp: '000000' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_otp');

    const otpRow = await t.app.prisma.oTP.findFirst({ where: { phoneNumber }, orderBy: { createdAt: 'desc' } });
    expect(otpRow!.attempts).toBe(1);
    expect(otpRow!.status).toBe('PENDING'); // still usable — a wrong guess doesn't burn the real code
  });
});
