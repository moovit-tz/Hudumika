import { evaluateAllAlertRules } from '../services/metric-alerts.service.js';

/** Sweeps every enabled metric_alert_rules row across every tenant and
 *  fires/recovers notifications on state transitions. See
 *  metric-alerts.service.ts for the real evaluation logic — this file is
 *  just the scheduled entrypoint, same split as every other *.job.ts here. */
export async function runMetricAlertsJob(): Promise<void> {
  const { evaluated, fired } = await evaluateAllAlertRules();
  if (fired > 0) {
    console.log(`🔔 Metric Alerts: evaluated ${evaluated} rule(s), ${fired} state transition(s) fired.`);
  }
}
