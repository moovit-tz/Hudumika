/**
 * Uptime monitoring that actually contacts the thing it monitors.
 *
 * onsite_health_checks was a form over a dead table: you could create a
 * monitor, and no code anywhere ever probed the URL, so last_checked_at,
 * last_status_code, last_response_ms and uptime_30d stayed null forever. The
 * Monitoring page papered over it with `uptime_30d ?? 99.9`.
 *
 * Every number this module writes comes from a request that was actually made.
 * A check that has never run reports nothing, which the UI renders as "Not
 * measured yet" — that is the honest answer, not a placeholder.
 */
import { db } from '../db/client.js';

/** Matches the window uptime_30d is named for. */
const UPTIME_WINDOW_DAYS = 30;

/** A monitor cannot be told to wait forever; nor can the sweep be blocked by one host. */
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  responseMs: number;
  error: string | null;
}

/**
 * Make the request.
 *
 * A non-2xx is a *result*, not an exception — `expected_status` decides whether
 * it counts as up, because a monitor watching a login page may well expect a
 * 401. Only a transport failure or a timeout has no status at all.
 */
export async function probe(target: {
  url: string;
  method?: string | null;
  expected_status?: number | null;
  timeout_ms?: number | null;
}): Promise<ProbeResult> {
  const timeout = Math.min(target.timeout_ms || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = Date.now();

  try {
    const res = await fetch(target.url, {
      method: target.method || 'GET',
      signal: controller.signal,
      redirect: 'follow',
      // A monitor should look like a monitor in the target's own access log.
      headers: { 'User-Agent': 'Hudumika-Onsite-Monitor/1.0' },
    });
    const responseMs = Date.now() - started;
    const expected = target.expected_status ?? null;
    const ok = expected != null ? res.status === expected : res.status >= 200 && res.status < 400;
    return {
      ok,
      statusCode: res.status,
      responseMs,
      error: ok ? null : `Expected ${expected ?? '2xx/3xx'}, got ${res.status} ${res.statusText}`.trim(),
    };
  } catch (err: any) {
    const responseMs = Date.now() - started;
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      statusCode: null,
      responseMs,
      error: aborted ? `No response within ${timeout}ms.` : `Could not reach the URL: ${err?.message ?? err}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record a probe and refresh the check's rollup.
 *
 * uptime_30d is recomputed from the stored samples rather than nudged, so it
 * cannot drift away from the evidence — and a check with no samples in the
 * window keeps a null uptime rather than being rounded up to 100.
 */
export async function recordProbe(
  tenantId: string,
  checkId: string,
  result: ProbeResult,
): Promise<{ uptime30d: number | null; samples: number }> {
  await db.insertInto('onsite_health_check_results')
    .values({
      tenant_id: tenantId,
      check_id: checkId,
      ok: result.ok,
      status_code: result.statusCode,
      response_ms: result.responseMs,
      error: result.error,
    })
    .execute();

  /**
   * Derived from the stored samples, never from the probe that just ran.
   *
   * A single successful probe is not 100% availability and a single failure is
   * not 0% — reporting either would be the same defect as the `?? 99.9` this
   * whole module exists to replace, just with fresher-looking numbers. A check
   * with no samples in the window keeps a null uptime, which the UI renders as
   * "Not measured yet".
   */
  const since = new Date(Date.now() - UPTIME_WINDOW_DAYS * 86_400_000);
  const rows = await db.selectFrom('onsite_health_check_results')
    .select(['ok'])
    .where('check_id', '=', checkId)
    .where('tenant_id', '=', tenantId)
    .where('checked_at', '>=', since)
    .execute();

  const samples = rows.length;
  const up = rows.filter(r => r.ok).length;
  // Two decimals: enough to tell 99.95 from 99.9, which is the point of an
  // availability figure.
  const uptime30d = samples > 0 ? Math.round((up / samples) * 10000) / 100 : null;

  await db.updateTable('onsite_health_checks')
    .set({
      status: result.ok ? 'healthy' : 'critical',
      last_checked_at: new Date(),
      last_response_ms: result.responseMs,
      last_status_code: result.statusCode,
      last_error: result.error,
      uptime_30d: uptime30d,
      updated_at: new Date(),
    })
    .where('id', '=', checkId)
    .where('tenant_id', '=', tenantId)
    .execute();

  return { uptime30d, samples };
}

/** Probe one check and store the outcome. Used by the job and by "Run now". */
export async function runCheck(check: {
  id: string;
  tenant_id: string;
  url: string;
  method: string | null;
  expected_status: number | null;
  timeout_ms: number | null;
}): Promise<ProbeResult> {
  const result = await probe(check);
  await recordProbe(check.tenant_id, check.id, result);
  return result;
}
