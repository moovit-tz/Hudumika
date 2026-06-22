import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { runRiskScanJob } from './risk-scan.job.js';
import { runDailyStatusJob } from './daily-status.job.js';
import { runMissingDocReminderJob } from './reminder.job.js';

let redisConnection: Redis | null = null;
let riskQueue: Queue | null = null;
let reminderQueue: Queue | null = null;

/**
 * Initializes BullMQ or falls back to in-memory intervals if Redis is not running
 */
export async function bootstrapJobs(): Promise<void> {
  console.log('🔄 Bootstrapping background jobs...');

  try {
    // Attempt Redis connection
    redisConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
    });

    // Handle Redis errors gracefully — only log once, then fall back
    let redisErrorHandled = false;
    redisConnection.on('error', (err: any) => {
      if (!redisErrorHandled) {
        redisErrorHandled = true;
        console.warn('⚠️ Redis not available, using in-memory interval fallback (no Redis/BullMQ in dev).');
        redisConnection?.disconnect();
        redisConnection = null;
        startIntervalFallback();
      }
    });

    redisConnection.on('connect', () => {
      console.log('🔌 Connected to Redis. Initializing BullMQ queues...');
      startBullMQ();
    });
  } catch (error) {
    console.warn('⚠️ Could not connect to Redis. Falling back to standard interval timers.');
    startIntervalFallback();
  }
}

function startBullMQ(): void {
  if (!redisConnection) return;

  try {
    riskQueue = new Queue('risk-scans', { connection: redisConnection as any });
    reminderQueue = new Queue('reminders', { connection: redisConnection as any });

    // Worker for risk scans
    new Worker(
      'risk-scans',
      async (job) => {
        if (job.name === 'scan') {
          await runRiskScanJob();
        }
      },
      { connection: redisConnection as any }
    );

    // Worker for reminders & daily statuses
    new Worker(
      'reminders',
      async (job) => {
        if (job.name === 'doc-reminder') {
          await runMissingDocReminderJob();
        } else if (job.name === 'daily-status') {
          await runDailyStatusJob();
        }
      },
      { connection: redisConnection as any }
    );

    // Schedule repeatable jobs
    riskQueue.add('scan', {}, {
      repeat: { every: 15 * 60 * 1000 } // Every 15 minutes
    }).catch(console.error);

    reminderQueue.add('doc-reminder', {}, {
      repeat: { every: 24 * 60 * 60 * 1000 } // Every 24 hours
    }).catch(console.error);

    reminderQueue.add('daily-status', {}, {
      repeat: { pattern: '0 8 * * *' } // Every day at 8:00 AM
    }).catch(console.error);

    console.log('🚀 BullMQ Workers and repeat schedules initialized.');
  } catch (err) {
    console.error('❌ Failed to start BullMQ:', err);
    startIntervalFallback();
  }
}

let fallbackTimer: NodeJS.Timeout | null = null;

function startIntervalFallback(): void {
  if (fallbackTimer) return; // Already running

  console.log('🕒 Fallback: Starting background jobs using in-app interval timers (for standalone development)...');

  // Immediately run first pass
  runRiskScanJob().catch(console.error);
  runMissingDocReminderJob().catch(console.error);

  // Set interval timers
  fallbackTimer = setInterval(() => {
    runRiskScanJob().catch(console.error);
    runMissingDocReminderJob().catch(console.error);
  }, 10 * 60 * 1000); // Poll every 10 minutes in fallback mode

  // Daily status fallback: once every 24 hours
  setInterval(() => {
    runDailyStatusJob().catch(console.error);
  }, 24 * 60 * 60 * 1000);
}
