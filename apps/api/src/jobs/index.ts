import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { runRiskScanJob } from './risk-scan.job.js';
import { runDailyStatusJob } from './daily-status.job.js';
import { sweepStaleCheckIns } from '../services/time-entry.service.js';
import { runMissingDocReminderJob } from './reminder.job.js';
import { runComplyRenewalJob, runComplyExpiryReminderJob } from './comply-renewal.job.js';
import { runTRAZReportJob } from './tra-zreport.job.js';
import { runSupportRulesJob } from './support-rules.job.js';
import { runGpswoxSyncJob } from './gpswox-sync.job.js';
import { runWorkflowCommQueueJob } from './workflow-comm.job.js';
import { runSealLedgerAnchorJob, runSealLedgerAnchorConfirmationSweepJob } from './seal-ledger-anchor.job.js';
import { runDeclarationLedgerAnchorJob, runDeclarationLedgerAnchorConfirmationSweepJob } from './declaration-ledger-anchor.job.js';
import { runOnsiteDeploymentSyncJob } from './onsite-deployment-sync.job.js';
import { runOnsiteUptimeJob, runOnsiteSslSweepJob } from './onsite-uptime.job.js';
import { runWorkflowLearningJob } from './workflow-learning.job.js';

let redisConnection: Redis | null = null;
let riskQueue: Queue | null = null;
let reminderQueue: Queue | null = null;
let gpswoxQueue: Queue | null = null;
let workflowCommQueue: Queue | null = null;
let sealAnchorQueue: Queue | null = null;
let declarationAnchorQueue: Queue | null = null;

/**
 * Initializes BullMQ or falls back to in-memory intervals if Redis is not running
 */
export async function bootstrapJobs(): Promise<void> {
  console.log('🔄 Bootstrapping background jobs...');

  try {
    // Attempt Redis connection.
    //
    // retryStrategy returns null so a dead Redis fails once and stays failed.
    // The default strategy reconnects forever, which is what produced a
    // "connected" event followed by an endless ECONNRESET storm from BullMQ
    // workers built against a socket that was already gone.
    redisConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });

    // Handle Redis errors gracefully — only log once, then fall back
    let redisErrorHandled = false;
    redisConnection.on('error', (err: any) => {
      if (!redisErrorHandled) {
        redisErrorHandled = true;
        console.warn('⚠️ Redis not available, using in-memory interval fallback (no Redis/BullMQ in dev).');
        redisConnection?.disconnect();
        redisConnection = null;
        // Shut down anything already built against that connection. Without
        // this the workers keep retrying forever behind the fallback, which is
        // both pointless and how the process used to die.
        stopBullMQ().catch(() => { /* already gone */ });
        startIntervalFallback();
      }
    });

    // 'ready' plus an actual PING, not 'connect'. 'connect' fires on the TCP
    // handshake alone — the socket can be accepted and then dropped, which is
    // exactly what happened here: the log said "Connected to Redis", six
    // queues and six workers were built against it, and the whole API then
    // died on the reconnect storm. A server that answers PING is one BullMQ
    // can actually be built on.
    redisConnection.on('ready', () => {
      redisConnection?.ping()
        .then(() => {
          if (!redisConnection) return;
          console.log('🔌 Connected to Redis. Initializing BullMQ queues...');
          startBullMQ();
        })
        .catch(() => { /* the 'error' handler above already falls back */ });
    });
  } catch (error) {
    console.warn('⚠️ Could not connect to Redis. Falling back to standard interval timers.');
    startIntervalFallback();
  }
}

/**
 * Every BullMQ Queue and Worker created, so a Redis outage can be survived.
 *
 * These hold their own reference to the connection and keep retrying after the
 * connection-level error handler has already nulled it and started the interval
 * fallback. A BullMQ Worker is an EventEmitter, and an 'error' event with no
 * listener throws — so a Redis blip took down the entire API, minutes after the
 * log had said "using in-memory interval fallback". Observed: ~30 ECONNRESETs
 * then "Emitted 'error' event on Worker instance", process dead.
 */
const bullInstances: { close: () => Promise<void>; on: (e: string, cb: (err: any) => void) => void }[] = [];
let bullErrorLogged = false;

/** Attaches the listener whose absence was fatal, and tracks the instance. */
function track<T extends { on: any; close: any }>(instance: T): T {
  instance.on('error', (err: any) => {
    // Logged once. The fallback timers are already running by this point; the
    // job still happens, it just is not BullMQ doing it.
    if (!bullErrorLogged) {
      bullErrorLogged = true;
      console.warn('⚠️ BullMQ lost Redis; background jobs continue on interval timers.', err?.code ?? err?.message ?? '');
    }
  });
  bullInstances.push(instance as any);
  return instance;
}

/** Shuts the queues and workers down when we fall back to interval timers. */
async function stopBullMQ(): Promise<void> {
  const instances = bullInstances.splice(0, bullInstances.length);
  await Promise.allSettled(instances.map(i => i.close()));
}

function startBullMQ(): void {
  if (!redisConnection) return;

  try {
    riskQueue = track(new Queue('risk-scans', { connection: redisConnection as any }));
    reminderQueue = track(new Queue('reminders', { connection: redisConnection as any }));
    gpswoxQueue = track(new Queue('gpswox-sync', { connection: redisConnection as any }));
    workflowCommQueue = track(new Queue('workflow-comms', { connection: redisConnection as any }));
    sealAnchorQueue = track(new Queue('seal-ledger-anchor', { connection: redisConnection as any }));
    declarationAnchorQueue = track(new Queue('declaration-ledger-anchor', { connection: redisConnection as any }));

    // Worker for risk scans
    track(new Worker(
      'risk-scans',
      async (job) => {
        if (job.name === 'scan') {
          await runRiskScanJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Worker for reminders & daily statuses
    track(new Worker(
      'reminders',
      async (job) => {
        if (job.name === 'doc-reminder') {
          await runMissingDocReminderJob();
        } else if (job.name === 'stale-checkin') {
          const { closed } = await sweepStaleCheckIns();
          if (closed) console.log(`⏱️  Closed ${closed} check-in(s) left running past a full working day.`);
        } else if (job.name === 'daily-status') {
          await runDailyStatusJob();
        } else if (job.name === 'comply-renewal') {
          await runComplyRenewalJob();
        } else if (job.name === 'comply-expiry-reminders') {
          await runComplyExpiryReminderJob();
        } else if (job.name === 'tra-zreport') {
          await runTRAZReportJob();
        } else if (job.name === 'support-rules') {
          await runSupportRulesJob();
        } else if (job.name === 'workflow-learning') {
          await runWorkflowLearningJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Worker for GPSWOX device sync — its own queue since it polls far more
    // frequently (~2 min) than the 15-min/24h cadence of the reminders queue.
    track(new Worker(
      'gpswox-sync',
      async (job) => {
        if (job.name === 'sync') {
          await runGpswoxSyncJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Worker for delayed workflow-step auto-comms — its own queue since it
    // polls far more frequently (~2 min) than the reminders queue.
    track(new Worker(
      'workflow-comms',
      async (job) => {
        if (job.name === 'send-due') {
          await runWorkflowCommQueueJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Worker for SEAL ledger anchoring — a daily stamp pass plus a more
    // frequent confirmation sweep (proof confirmation lags the stamp by
    // hours to days, independent of the stamp cadence itself).
    track(new Worker(
      'seal-ledger-anchor',
      async (job) => {
        if (job.name === 'stamp') {
          await runSealLedgerAnchorJob();
        } else if (job.name === 'confirmation-sweep') {
          await runSealLedgerAnchorConfirmationSweepJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Worker for ClearOS declaration ledger anchoring — same daily
    // stamp + hourly confirmation-sweep shape as SEAL's.
    track(new Worker(
      'declaration-ledger-anchor',
      async (job) => {
        if (job.name === 'stamp') {
          await runDeclarationLedgerAnchorJob();
        } else if (job.name === 'confirmation-sweep') {
          await runDeclarationLedgerAnchorConfirmationSweepJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Schedule repeatable jobs
    riskQueue.add('scan', {}, {
      repeat: { every: 15 * 60 * 1000 } // Every 15 minutes
    }).catch(console.error);

    reminderQueue.add('support-rules', {}, {
      repeat: { every: 15 * 60 * 1000 } // Every 15 minutes — SLA escalation + status automation
    }).catch(console.error);

    reminderQueue.add('doc-reminder', {}, {
      repeat: { every: 24 * 60 * 60 * 1000 } // Every 24 hours
    }).catch(console.error);

    reminderQueue.add('daily-status', {}, {
      repeat: { pattern: '0 8 * * *' } // Every day at 8:00 AM
    }).catch(console.error);

    // Nobody clocks out reliably. Hourly rather than nightly, so an entry left
    // running is settled while the day it belongs to is still current, and
    // somebody who forgot at 17:00 is not shown as checked in until midnight.
    reminderQueue.add('stale-checkin', {}, {
      repeat: { pattern: '5 * * * *' } // Every hour, five past
    }).catch(console.error);

    reminderQueue.add('comply-renewal', {}, {
      repeat: { pattern: '0 8 * * *' } // Daily at 8:00 AM
    }).catch(console.error);

    reminderQueue.add('workflow-learning', {}, {
      repeat: { pattern: '0 4 * * *' } // Daily at 4:00 AM — mine tenant workflow edits, refresh proposals
    }).catch(console.error);

    reminderQueue.add('comply-expiry-reminders', {}, {
      repeat: { pattern: '0 8 * * *' } // Daily at 8:00 AM — 90-day/30-day permit expiry notices
    }).catch(console.error);

    // TRA Z-Report: run at midnight (00:05) every day
    reminderQueue.add('tra-zreport', {}, {
      repeat: { pattern: '5 0 * * *' } // Every day at 00:05 AM
    }).catch(console.error);

    gpswoxQueue.add('sync', {}, {
      repeat: { every: 2 * 60 * 1000 } // Every 2 minutes — GPSWOX device position/alert sync
    }).catch(console.error);

    workflowCommQueue.add('send-due', {}, {
      repeat: { every: 2 * 60 * 1000 } // Every 2 minutes — delayed workflow-step auto-comms
    }).catch(console.error);

    sealAnchorQueue.add('stamp', {}, {
      repeat: { pattern: '0 3 * * *' } // Daily at 3:00 AM — anchor every non-empty compartment to Bitcoin
    }).catch(console.error);

    sealAnchorQueue.add('confirmation-sweep', {}, {
      repeat: { every: 60 * 60 * 1000 } // Every hour — re-check pending anchors for Bitcoin confirmation
    }).catch(console.error);

    declarationAnchorQueue.add('stamp', {}, {
      repeat: { pattern: '0 3 * * *' } // Daily at 3:00 AM — anchor every ClearOS tenant's declaration ledger to Bitcoin
    }).catch(console.error);

    declarationAnchorQueue.add('confirmation-sweep', {}, {
      repeat: { every: 60 * 60 * 1000 } // Every hour — re-check pending anchors for Bitcoin confirmation
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
  runComplyRenewalJob().catch(console.error);
  runComplyExpiryReminderJob().catch(console.error);
  runSupportRulesJob().catch(console.error);
  runGpswoxSyncJob().catch(console.error);
  runWorkflowCommQueueJob().catch(console.error);

  // Set interval timers
  fallbackTimer = setInterval(() => {
    runRiskScanJob().catch(console.error);
    runSupportRulesJob().catch(console.error);
  }, 10 * 60 * 1000); // Poll every 10 minutes in fallback mode

  // Daily jobs: status + comply renewals — once every 24 hours.
  // The missing-document reminder belongs here, not on the ten-minute timer
  // above: BullMQ schedules it as `doc-reminder` with repeat every 24h, and
  // the fallback disagreeing meant it ran 144 times a day in standalone dev,
  // fanning out a fresh notification to every recipient each time. The job
  // now also enforces its own cooldown, so the two schedules cannot drift
  // into that again.
  setInterval(() => {
    runDailyStatusJob().catch(console.error);
    runMissingDocReminderJob().catch(console.error);
    runComplyRenewalJob().catch(console.error);
    runComplyExpiryReminderJob().catch(console.error);
    runTRAZReportJob().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  // GPSWOX device sync — every 2 minutes, its own timer since it's far more
  // frequent than the other fallback intervals.
  setInterval(() => {
    runGpswoxSyncJob().catch(console.error);
  }, 2 * 60 * 1000);

  // Delayed workflow-step auto-comms — every 2 minutes, same cadence as GPSWOX.
  setInterval(() => {
    runWorkflowCommQueueJob().catch(console.error);
  }, 2 * 60 * 1000);

  // Onsite deployments in flight — every minute. This is what actually moves a
  // deployment to succeeded or failed, by asking the CI provider; nothing else
  // in the system is allowed to decide that. Frequent because someone is
  // usually watching the screen while it runs, and cheap because it does
  // nothing at all when no deployment is open.
  setInterval(() => {
    runOnsiteDeploymentSyncJob().catch(console.error);
  }, 60 * 1000);

  // Onsite uptime monitors — every minute. The job honours each monitor's own
  // interval_s, so this is the scheduler's resolution, not the rate anything
  // actually gets probed at.
  setInterval(() => {
    runOnsiteUptimeJob().catch(console.error);
  }, 60 * 1000);

  // Onsite certificate sweep — every six hours. Each pass is a real TLS
  // handshake per domain, and an expiry date does not move; running it more
  // often is load on other people's servers for no new information.
  setInterval(() => {
    runOnsiteSslSweepJob().catch(console.error);
  }, 6 * 60 * 60 * 1000);

  // SEAL ledger anchoring — deliberately NOT run in the "immediately on
  // startup" pass above: each stamp is a real external network call and a
  // permanent DB row, and tsx watch restarts this process frequently
  // during development, so an immediate run would create a fresh anchor
  // on every save. Daily stamp pass, same cadence group as the other daily
  // jobs above but its own timer to keep this comment self-contained.
  setInterval(() => {
    runSealLedgerAnchorJob().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  // Confirmation sweep — hourly, independent of the daily stamp cadence
  // (real Bitcoin confirmation takes hours to days).
  setInterval(() => {
    runSealLedgerAnchorConfirmationSweepJob().catch(console.error);
  }, 60 * 60 * 1000);

  // ClearOS declaration ledger anchoring — same "not on startup" reasoning
  // as SEAL's anchor job above (each stamp is a real external network call
  // and a permanent DB row; tsx watch restarts frequently in dev).
  setInterval(() => {
    runDeclarationLedgerAnchorJob().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  setInterval(() => {
    runDeclarationLedgerAnchorConfirmationSweepJob().catch(console.error);
  }, 60 * 60 * 1000);

  // Self-learning workflow analysis — daily, not on startup (tsx watch restarts
  // frequently in dev; a fresh proposal on every save would be noise).
  setInterval(() => {
    runWorkflowLearningJob().catch(console.error);
  }, 24 * 60 * 60 * 1000);
}
