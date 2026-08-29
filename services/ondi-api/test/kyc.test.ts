import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildTestApp, closeTestApp, registerAndLogin, authHeader, readSampleImage,
  buildMultipartUpload, pollUntil, type TestApp,
} from './helpers.js';

describe('KYC: submit -> upload real document -> complete-upload -> real OCR/MRZ verification', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  it('runs the full flow against a real sample driver-license photo and reaches a real terminal-ish status', async () => {
    const user = await registerAndLogin(t);

    const submitRes = await t.app.inject({
      method: 'POST',
      url: '/v1/kyc/submit',
      headers: authHeader(user.token),
      payload: { firstName: 'Amina', lastName: 'Juma', nin: '19900101123456789012', documentType: 'DRIVER_LICENSE' },
    });
    expect(submitRes.statusCode).toBe(200);
    const { submissionId, uploadUrl } = submitRes.json();
    expect(submissionId).toBeTruthy();
    expect(uploadUrl).toBe(`/v1/kyc/submissions/${submissionId}/document`);

    const recordAfterSubmit = await t.app.prisma.kYCRecord.findUnique({ where: { id: submissionId } });
    expect(recordAfterSubmit).not.toBeNull();
    expect(recordAfterSubmit!.status).toBe('PENDING');
    expect(recordAfterSubmit!.userId).toBe(user.userId);

    // Real sample ID photo — not a synthetic fixture.
    const imageBuffer = readSampleImage('sample_driving_front.jpeg');
    const { body, contentType } = await buildMultipartUpload('file', 'sample_driving_front.jpeg', imageBuffer, 'image/jpeg');

    const uploadRes = await t.app.inject({
      method: 'POST',
      url: `/v1/kyc/submissions/${submissionId}/document`,
      headers: { ...authHeader(user.token), 'content-type': contentType },
      payload: body,
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.json()).toEqual({ uploaded: true });

    const recordAfterUpload = await t.app.prisma.kYCRecord.findUnique({ where: { id: submissionId } });
    expect(recordAfterUpload!.documentImageUrl).toBe(`${submissionId}.jpeg`);

    const completeRes = await t.app.inject({
      method: 'POST',
      url: '/v1/kyc/complete-upload',
      headers: authHeader(user.token),
      payload: { submissionId },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json()).toEqual({ status: 'REVIEW_STARTED' });

    // The real OCR + MRZ/structural verification pipeline (src/lib/document-verification.ts)
    // runs in the background — poll GET /v1/kyc/status for real genuine
    // completion instead of an arbitrary sleep. It's "done" once
    // verificationDetails is populated (the synchronous complete-upload call
    // already flips status to REVIEW immediately, so status alone can't tell
    // us the background job has actually finished analyzing the image).
    const finalRecord = await pollUntil(async () => {
      const rec = await t.app.prisma.kYCRecord.findUnique({ where: { id: submissionId } });
      return rec?.verificationDetails ? rec : null;
    }, { timeoutMs: 60_000, intervalMs: 1000 });

    // Deliberately not asserting a specific outcome — the real pipeline's
    // decision (VERIFIED / REVIEW / REJECTED) genuinely depends on whether
    // the claimed name/NIN happen to match text actually present in the
    // sample image, which we don't control here. What must be real: the
    // record left PENDING, and verificationDetails carries genuine analysis
    // output (a non-null ocrTextLength from actually running tesseract on
    // the uploaded image).
    expect(finalRecord.status).not.toBe('PENDING');
    expect(['VERIFIED', 'REVIEW', 'REJECTED']).toContain(finalRecord.status);

    const details = finalRecord.verificationDetails as any;
    expect(details).toBeTruthy();
    expect(typeof details.ocrTextLength).toBe('number');
    expect(details.ocrTextLength).toBeGreaterThanOrEqual(0);
    expect(details.imageQuality).toBeTruthy();
    expect(typeof details.imageQuality.width).toBe('number');
    expect(Array.isArray(details.reasons)).toBe(true);

    // GET /v1/kyc/status (the endpoint the mobile client actually polls)
    // returns the same real record.
    const statusRes = await t.app.inject({ method: 'GET', url: '/v1/kyc/status', headers: authHeader(user.token) });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().id).toBe(submissionId);
    expect(statusRes.json().status).toBe(finalRecord.status);

    if (finalRecord.status === 'VERIFIED') {
      const dbUser = await t.app.prisma.user.findUnique({ where: { id: user.userId } });
      expect(dbUser!.verificationLevel).toBe('L2_GOV_VERIFIED');
    }
  });
});
