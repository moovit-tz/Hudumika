import { Writable } from 'stream';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

/** Captures every pino log line written by a test app instance, in memory. */
export class LogCollector extends Writable {
  lines: string[] = [];
  override _write(chunk: any, _enc: string, cb: (err?: Error | null) => void) {
    this.lines.push(chunk.toString());
    cb();
  }
}

export interface TestApp {
  app: FastifyInstance;
  logs: LogCollector;
}

/** Boots a real app instance (real Postgres, real Redis) with no network listener. */
export async function buildTestApp(): Promise<TestApp> {
  const logs = new LogCollector();
  const app = await buildApp({ logger: { level: 'info', stream: logs } });
  return { app, logs };
}

export async function closeTestApp(t: TestApp) {
  await t.app.close();
}

let phoneCounter = 0;
/** Unique real-shaped Tanzanian MSISDN per call — avoids User.phoneNumber collisions across tests. */
export function randomPhone(): string {
  phoneCounter += 1;
  const suffix = String(Date.now()).slice(-6) + String(phoneCounter).padStart(3, '0');
  return `2557${suffix}`.slice(0, 12);
}

export function randomRegNumber(): string {
  return `REG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Reads the plaintext OTP code the server generated for `phoneNumber` back
 * out of captured dev-mode log output. This is the real, only-in-dev
 * delivery channel: the OTP table (see packages/ondi-db/prisma/schema.prisma
 * `model OTP`) stores only `codeHash` (SHA-256), never the plaintext code —
 * so unlike most other flows in this suite, the plaintext can't be read back
 * via Prisma directly. In a real deployment this same line goes out over
 * SMS/WhatsApp (see routes/auth.ts `sendSMS`); in dev it's logged instead.
 * Matches whichever of the OTP-issuing log messages fired most recently for
 * this phone number (request-otp, initiate, otp/resend, step-up/challenge,
 * phone/link/initiate all log the same "<label> for <phone>: <code>" shape).
 */
export function extractOtpCode(logs: LogCollector, phoneNumber: string): string {
  const re = new RegExp(`for ${phoneNumber}: (\\d{6})`);
  for (let i = logs.lines.length - 1; i >= 0; i--) {
    const line = logs.lines[i];
    let msg: string | undefined;
    try {
      msg = JSON.parse(line).msg;
    } catch {
      continue;
    }
    if (!msg) continue;
    const m = msg.match(re);
    if (m) return m[1];
  }
  throw new Error(`No OTP code found in captured logs for phone ${phoneNumber}. Log lines: ${logs.lines.length}`);
}

export interface AuthedUser {
  token: string;
  refreshToken: string;
  userId: string;
  ondi: string;
  phoneNumber: string;
}

/**
 * Full real OTP login: request-otp -> read the plaintext code back from the
 * dev-mode log line -> otp/verify -> real signed JWT + real AuthSession row.
 */
export async function registerAndLogin(t: TestApp, phoneNumber = randomPhone()): Promise<AuthedUser> {
  const otpReq = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/request-otp',
    payload: { phoneNumber },
  });
  if (otpReq.statusCode !== 200) {
    throw new Error(`request-otp failed (${otpReq.statusCode}): ${otpReq.body}`);
  }

  const code = extractOtpCode(t.logs, phoneNumber);

  const verifyRes = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    payload: { phone: phoneNumber, otp: code },
  });
  if (verifyRes.statusCode !== 200) {
    throw new Error(`otp/verify failed (${verifyRes.statusCode}): ${verifyRes.body}`);
  }
  const body = verifyRes.json();
  return {
    token: body.access_token,
    refreshToken: body.refresh_token,
    userId: body.user.id,
    ondi: body.user.ondi,
    phoneNumber,
  };
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}

const OCR_FIXTURES_DIR = '/Users/mac/Desktop/ibrA/Solutions/moovit-beta/ocr/ondi';

/** Reads one of the real sample ID-document images used across this suite for KYC uploads. */
export function readSampleImage(filename: string): Buffer {
  const full = path.join(OCR_FIXTURES_DIR, filename);
  if (!fs.existsSync(full)) throw new Error(`Sample fixture not found: ${full}`);
  return fs.readFileSync(full);
}

/**
 * Builds a real multipart/form-data body (single file field) using the
 * platform FormData/Response APIs so the boundary in the body and the
 * boundary in the Content-Type header are guaranteed to match — Fastify's
 * @fastify/multipart plugin parses this exactly like a real browser upload.
 */
export async function buildMultipartUpload(
  fieldName: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  form.append(fieldName, new Blob([buffer], { type: mimeType }), filename);
  const res = new Response(form);
  const body = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type')!;
  return { body, contentType };
}

/**
 * Real end-to-end org setup used by several flows below: registers an Owner
 * and a Member (real OTP login for both), creates a real Organization, sends
 * a real invite, and accepts it — leaving two real UserRole rows in place.
 */
export async function setupOrgWithMember(t: TestApp, businessName: string) {
  const owner = await registerAndLogin(t);
  const member = await registerAndLogin(t);

  const createRes = await t.app.inject({
    method: 'POST',
    url: '/v1/organizations',
    headers: authHeader(owner.token),
    payload: { businessName, registrationNumber: randomRegNumber() },
  });
  if (createRes.statusCode !== 201) throw new Error(`org create failed: ${createRes.body}`);
  const org = createRes.json();

  const inviteRes = await t.app.inject({
    method: 'POST',
    url: `/v1/organizations/${org.id}/invite`,
    headers: authHeader(owner.token),
    payload: { ondi: member.ondi, roleName: 'Member' },
  });
  if (inviteRes.statusCode !== 201) throw new Error(`invite failed: ${inviteRes.body}`);
  const { inviteId } = inviteRes.json();

  const acceptRes = await t.app.inject({
    method: 'POST',
    url: `/v1/organizations/invites/${inviteId}/accept`,
    headers: authHeader(member.token),
  });
  if (acceptRes.statusCode !== 200) throw new Error(`accept failed: ${acceptRes.body}`);

  return { owner, member, orgId: org.id as string };
}

/** Polls `check()` until it returns a truthy value or `timeoutMs` elapses. Real retry, no arbitrary sleeps. */
export async function pollUntil<T>(
  check: () => Promise<T | null | undefined | false>,
  { timeoutMs = 45_000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
