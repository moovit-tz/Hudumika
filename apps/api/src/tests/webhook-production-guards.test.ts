import { describe, it, expect } from 'vitest';
import { env } from '../config/env.js';
import { getApp } from './helpers.js';

describe('Production callbacks fail closed without provider secrets', () => {
  it('rejects SMS, GPS and Meta callbacks before processing untrusted payloads', async () => {
    const app = await getApp();
    const original = { APP_ENV: env.APP_ENV, SMS_WEBHOOK_SECRET: env.SMS_WEBHOOK_SECRET,
      GPSWOX_WEBHOOK_SECRET: env.GPSWOX_WEBHOOK_SECRET, META_APP_SECRET: env.META_APP_SECRET };
    Object.assign(env, { APP_ENV: 'production', SMS_WEBHOOK_SECRET: '', GPSWOX_WEBHOOK_SECRET: '', META_APP_SECRET: '' });
    try {
      for (const [url, status] of [
        ['/v1/sms/webhook/africas-talking', 503],
        ['/v1/webhooks/gpswox', 503],
        ['/v1/webhooks/whatsapp', 401],
      ] as const) {
        const response = await app.inject({ method: 'POST', url, payload: {} });
        expect(response.statusCode, response.body).toBe(status);
      }
    } finally {
      Object.assign(env, original);
    }
  });
});
