import fp from 'fastify-plugin';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { createAccessReviewCampaign } from '../lib/access-review.js';

/**
 * BullMQ-backed job infra — the shared app.redis connection (plugins/redis.ts)
 * is configured maxRetriesPerRequest: 3 for the ephemeral session/challenge
 * stores it backs; BullMQ workers require maxRetriesPerRequest: null, so this
 * plugin opens its own dedicated Redis connection rather than reusing app.redis.
 *
 * Two queues:
 *  - access-review-scheduler: a daily tick job that scans AccessReviewSchedule
 *    rows and starts a campaign for any that are due (lib/access-review.ts —
 *    the same function the on-demand HTTP route uses).
 *  - webhook-delivery: fire-and-forget SIEM push for org-scoped audit events
 *    (enqueued from plugins/audit.ts's write()), HMAC-signed, retried by
 *    BullMQ on failure so a slow/unreachable SIEM endpoint never blocks the
 *    audit write path itself.
 */
export const queuePlugin = fp(async (app: FastifyInstance) => {
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  connection.on('error', (err: Error) => app.log.error(err, 'BullMQ Redis connection error'));

  const accessReviewSchedulerQueue = new Queue('access-review-scheduler', { connection });
  const webhookDeliveryQueue = new Queue('webhook-delivery', { connection });

  app.decorate('queues', {
    accessReviewScheduler: accessReviewSchedulerQueue,
    webhookDelivery: webhookDeliveryQueue,
  });

  // Idempotent — BullMQ upserts a repeatable job by its key, so re-registering
  // on every boot doesn't create duplicate ticks.
  await accessReviewSchedulerQueue.add('tick', {}, {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: 'daily-tick',
  });

  const schedulerWorker = new Worker('access-review-scheduler', async () => {
    const due = await app.prisma.accessReviewSchedule.findMany({
      where: { isEnabled: true, nextRunAt: { lte: new Date() } },
    });
    for (const schedule of due) {
      try {
        await createAccessReviewCampaign(app, schedule.organizationId, schedule.name, 'system:scheduler');
      } catch (err) {
        app.log.error(err, `Scheduled access review failed for org ${schedule.organizationId}`);
      }
      await app.prisma.accessReviewSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + schedule.intervalDays * 24 * 60 * 60 * 1000),
        },
      });
    }
  }, { connection });
  schedulerWorker.on('failed', (job, err) => app.log.error(err, `access-review-scheduler job ${job?.id} failed`));

  const webhookWorker = new Worker('webhook-delivery', async (job) => {
    const { configId, url, secret, payload } = job.data as {
      configId: string; url: string; secret: string; payload: Record<string, unknown>;
    };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ondi-Signature': signature },
        body,
        signal: controller.signal,
      });
      await app.prisma.orgWebhookConfig.update({
        where: { id: configId },
        data: { lastDeliveryAt: new Date(), lastDeliveryStatus: res.ok ? 'success' : `failed: HTTP ${res.status}` },
      });
      if (!res.ok) throw new Error(`webhook delivery failed: HTTP ${res.status}`);
    } catch (err: any) {
      await app.prisma.orgWebhookConfig.update({
        where: { id: configId },
        data: { lastDeliveryAt: new Date(), lastDeliveryStatus: `failed: ${err.message}` },
      }).catch(() => {});
      throw err; // BullMQ retries per the queue's default backoff
    } finally {
      clearTimeout(timeout);
    }
  }, { connection });
  webhookWorker.on('failed', (job, err) => app.log.error(err, `webhook-delivery job ${job?.id} failed`));

  app.addHook('onClose', async () => {
    await schedulerWorker.close();
    await webhookWorker.close();
    await accessReviewSchedulerQueue.close();
    await webhookDeliveryQueue.close();
    await connection.quit();
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    queues: {
      accessReviewScheduler: Queue;
      webhookDelivery: Queue;
    };
  }
}
