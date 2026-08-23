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
import { runOnsiteUptimeJob, runOnsiteSslSweepJob, runOnsiteServerReachabilityJob } from './onsite-uptime.job.js';
import { runWorkflowLearningJob } from './workflow-learning.job.js';
import { runCloudTrashExpiryJob } from './cloud-trash-expiry.job.js';
import { runOnsiteBackupJob } from './onsite-backup.job.js';
import { runMailOutboxJob } from './mail-outbox.job.js';
import { runImapTicketIngestJob } from './imap-ticket-ingest.job.js';
import { runSanctionsSyncJob } from './sanctions-sync.job.js';
import { runDailyShipmentReportJob } from './daily-shipment-report.job.js';
import { runSignExpiryJob } from './sign-expiry.job.js';
import { runSignReminderJob } from './sign-reminder.job.js';
import { runSignAnchorConfirmJob } from './sign-anchor-confirm.job.js';
import { runSignAnchorStampJob } from './sign-anchor-stamp.job.js';
import { runNotesReminderJob } from './notes-reminder.job.js';
import { runNotesPurgeJob } from './notes-purge.job.js';
import { runCalendarReminderJob } from './calendar-reminder.job.js';
import { runCalendarExternalSyncJob } from './calendar-external-sync.job.js';

let redisConnection: Redis | null = null;
let riskQueue: Queue | null = null;
let reminderQueue: Queue | null = null;
let gpswoxQueue: Queue | null = null;
let workflowCommQueue: Queue | null = null;
let sealAnchorQueue: Queue | null = null;
let declarationAnchorQueue: Queue | null = null;
let mailOutboxQueue: Queue | null = null;
let imapTicketQueue: Queue | null = null;

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
    mailOutboxQueue = track(new Queue('mail-outbox', { connection: redisConnection as any }));
    imapTicketQueue = track(new Queue('imap-ticket-ingest', { connection: redisConnection as any }));

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
        } else if (job.name === 'cloud-trash-expiry') {
          await runCloudTrashExpiryJob();
        } else if (job.name === 'onsite-backup') {
          await runOnsiteBackupJob();
        } else if (job.name === 'sanctions-sync') {
          await runSanctionsSyncJob();
        } else if (job.name === 'daily-shipment-report') {
          await runDailyShipmentReportJob();
        } else if (job.name === 'sign-expiry') {
          await runSignExpiryJob();
        } else if (job.name === 'sign-reminder') {
          await runSignReminderJob();
        } else if (job.name === 'sign-anchor-confirm') {
          await runSignAnchorConfirmJob();
        } else if (job.name === 'sign-anchor-stamp') {
          await runSignAnchorStampJob();
        } else if (job.name === 'notes-reminder') {
          await runNotesReminderJob();
        } else if (job.name === 'notes-purge') {
          await runNotesPurgeJob();
        } else if (job.name === 'calendar-reminder') {
          await runCalendarReminderJob();
        } else if (job.name === 'calendar-external-sync') {
          await runCalendarExternalSyncJob();
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

    // Worker for the mail outbox sweep — its own queue since it polls far
    // more frequently (1 min, mail needs to go out promptly) than the
    // reminders queue's daily-cadence group.
    track(new Worker(
      'mail-outbox',
      async (job) => {
        if (job.name === 'sweep') {
          await runMailOutboxJob();
        }
      },
      { connection: redisConnection as any }
    ));

    // Worker for IMAP-to-ticket ingestion — its own queue, 3 min cadence:
    // less frequent than GPSWOX's 2-min device polling, far more frequent
    // than the daily-cron group (a support reply sitting unread for a day
    // would be a real regression from every other channel's latency).
    track(new Worker(
      'imap-ticket-ingest',
      async (job) => {
        if (job.name === 'sweep') {
          await runImapTicketIngestJob();
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

    reminderQueue.add('cloud-trash-expiry', {}, {
      repeat: { pattern: '0 2 * * *' } // Daily at 2:00 AM — permanently delete Cloud Trash items past 30 days
    }).catch(console.error);

    reminderQueue.add('onsite-backup', {}, {
      repeat: { pattern: '0 3 * * *' } // Daily at 3:00 AM — one scheduled Onsite config snapshot per active tenant
    }).catch(console.error);

    // TRA Z-Report: run at midnight (00:05) every day
    reminderQueue.add('tra-zreport', {}, {
      repeat: { pattern: '5 0 * * *' } // Every day at 00:05 AM
    }).catch(console.error);

    reminderQueue.add('sanctions-sync', {}, {
      repeat: { pattern: '0 5 * * *' } // Daily at 5:00 AM — refresh the shared OFAC SDN + UN Consolidated lists
    }).catch(console.error);

    // Daily shipment-report automation — the one job in this file that's
    // pinned to a specific real-world timezone rather than server-local
    // time: EAT is the operational timezone this feature is for, and no
    // other job here has needed to care about the distinction until now.
    reminderQueue.add('daily-shipment-report', {}, {
      repeat: { pattern: '0 21 * * *', tz: 'Africa/Dar_es_Salaam' } // Daily at 21:00 EAT
    }).catch(console.error);

    reminderQueue.add('sign-expiry', {}, {
      repeat: { pattern: '0 6 * * *' } // Daily at 6:00 AM — flip 'sent' envelopes past expires_at to 'expired'
    }).catch(console.error);

    reminderQueue.add('sign-reminder', {}, {
      repeat: { pattern: '0 9 * * *' } // Daily at 9:00 AM — auto-remind whichever recipient is currently due, 3-day cooldown, capped at 3
    }).catch(console.error);

    reminderQueue.add('sign-anchor-confirm', {}, {
      repeat: { every: 60 * 60 * 1000 } // Every hour — re-check pending Sign envelope anchors for Bitcoin confirmation
    }).catch(console.error);

    reminderQueue.add('sign-anchor-stamp', {}, {
      repeat: { every: 15 * 60 * 1000 } // Every 15 minutes — submit the OpenTimestamps calendar attestation for newly-completed envelopes
    }).catch(console.error);

    // Notes reminders are set to the minute (a datetime-local picker), so a
    // daily/hourly cadence would defeat the point of setting one — 5 minutes
    // is the resolution, not the notify rate (reminder_notified_at guards
    // against re-firing on every pass).
    reminderQueue.add('notes-reminder', {}, {
      repeat: { every: 5 * 60 * 1000 } // Every 5 minutes
    }).catch(console.error);

    reminderQueue.add('notes-purge', {}, {
      repeat: { pattern: '30 2 * * *' } // Daily at 2:30 AM — permanently delete Notes Trash items past 30 days (unless on legal hold)
    }).catch(console.error);

    // Calendar reminders can be set as low as a few minutes before an
    // event — same 5-minute resolution reasoning as notes-reminder.
    reminderQueue.add('calendar-reminder', {}, {
      repeat: { every: 5 * 60 * 1000 } // Every 5 minutes
    }).catch(console.error);

    // External Google/Outlook calendar pull — a genuine no-op until a tenant
    // connects one (calendar-sync.routes.ts); 15 min is plenty for "see my
    // Google events on my Hudumika calendar", not the sub-minute cadence
    // reminders need.
    reminderQueue.add('calendar-external-sync', {}, {
      repeat: { every: 15 * 60 * 1000 } // Every 15 minutes
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

    mailOutboxQueue.add('sweep', {}, {
      repeat: { every: 60 * 1000 } // Every 1 minute — mail needs to go out promptly, not on a daily cadence
    }).catch(console.error);

    imapTicketQueue.add('sweep', {}, {
      repeat: { every: 3 * 60 * 1000 } // Every 3 minutes — inbound support replies via email
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
  runMailOutboxJob().catch(console.error);
  runSignExpiryJob().catch(console.error);
  runSignReminderJob().catch(console.error);
  runSignAnchorStampJob().catch(console.error);
  runNotesReminderJob().catch(console.error);
  runCalendarReminderJob().catch(console.error);
  runCalendarExternalSyncJob().catch(console.error);

  // Set interval timers
  fallbackTimer = setInterval(() => {
    runRiskScanJob().catch(console.error);
    runSupportRulesJob().catch(console.error);
  }, 10 * 60 * 1000); // Poll every 10 minutes in fallback mode

  // Notes reminders — every 5 minutes, same reasoning as the BullMQ
  // schedule above: set-to-the-minute reminders need finer resolution than
  // the daily/10-minute fallback groups.
  setInterval(() => {
    runNotesReminderJob().catch(console.error);
  }, 5 * 60 * 1000);

  // Calendar reminders — same 5-minute resolution reasoning.
  setInterval(() => {
    runCalendarReminderJob().catch(console.error);
  }, 5 * 60 * 1000);

  // External Google/Outlook calendar pull — see the BullMQ registration
  // above for why 15 minutes.
  setInterval(() => {
    runCalendarExternalSyncJob().catch(console.error);
  }, 15 * 60 * 1000);

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
    runCloudTrashExpiryJob().catch(console.error);
    runOnsiteBackupJob().catch(console.error);
    runSanctionsSyncJob().catch(console.error);
    // No tz support on a plain setInterval — this fallback only runs when
    // Redis/BullMQ is unavailable (standalone dev), so a same-day drift from
    // the real 21:00 EAT target is an acceptable gap, not a production risk.
    runDailyShipmentReportJob().catch(console.error);
    runSignExpiryJob().catch(console.error);
    runSignReminderJob().catch(console.error);
    runNotesPurgeJob().catch(console.error);
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

  // Onsite VPS reachability — every minute; the job itself honours a 5-minute
  // per-server floor (SERVER_PROBE_INTERVAL_MS), same "scheduler resolution
  // vs. actual probe rate" split as the uptime job above.
  setInterval(() => {
    runOnsiteServerReachabilityJob().catch(console.error);
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

  // Sign envelope anchor confirmation — hourly (real Bitcoin confirmation
  // takes hours to days regardless of how soon it's submitted).
  setInterval(() => {
    runSignAnchorConfirmJob().catch(console.error);
  }, 60 * 60 * 1000);

  // Sign envelope anchor stamp submission — every 15 minutes, not daily
  // like SEAL/declaration's own stamp job: this submits one lightweight
  // per-envelope call, not a tenant-wide ledger batch, and a signer
  // reasonably expects it to start moving soon after their document
  // completes. Safe to also run on startup (below) for the same reason
  // mail-outbox/imap-ticket-ingest are: each envelope is claimed by its
  // own ots_proof IS NULL check and only ever submitted once.
  setInterval(() => {
    runSignAnchorStampJob().catch(console.error);
  }, 15 * 60 * 1000);

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

  // Mail outbox sweep — every minute. Safe to also run immediately on
  // startup (above): each row is processed exactly once and marked sent/
  // failed, so re-running the sweep on every tsx-watch restart just drains
  // whatever's already due faster, unlike the ledger-anchor jobs' external/
  // irreversible actions.
  setInterval(() => {
    runMailOutboxJob().catch(console.error);
  }, 60 * 1000);

  // IMAP-to-ticket ingest — every 3 minutes. Safe on startup too: a message
  // only gets marked \Seen after it's been processed, so a quick tsx-watch
  // restart can't double-process or double-create a ticket from the same
  // message.
  setInterval(() => {
    runImapTicketIngestJob().catch(console.error);
  }, 3 * 60 * 1000);
}
