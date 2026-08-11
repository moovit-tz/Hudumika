import { withTenant } from '../db/client.js';

/**
 * Opt-in, intensity-only activity monitoring (migration 221). The design rule,
 * enforced here and not just promised in the UI: we ingest COUNTS and coarse
 * on-screen ZONES, never content. Anything a client sends beyond the numeric
 * fields and the zone histogram is dropped on the floor by `sanitize` before it
 * can reach the database — there is no column for keystroke identities or field
 * values, and none is ever added.
 *
 * Ingestion is refused unless BOTH gates are open: the tenant has enabled
 * monitoring AND the individual has consented. Either off ⇒ nothing is stored.
 */

const ZONE_ROWS = 8;   // coarse grid — enough for a heatmap, far too coarse to reconstruct anything
const ZONE_COLS = 12;
const MAX_ZONE_KEYS = ZONE_ROWS * ZONE_COLS;

export interface RawSample {
  windowStart: string; windowEnd: string;
  keystrokes?: number; mouseDistancePx?: number; clicks?: number; activeSeconds?: number;
  zones?: Record<string, number>; app?: string; path?: string;
}

export interface MonitorSettings {
  enabled: boolean; captureKeystrokes: boolean; captureHeatmap: boolean; intervalSeconds: number;
}

const DEFAULTS: MonitorSettings = { enabled: false, captureKeystrokes: true, captureHeatmap: true, intervalSeconds: 60 };

const clampInt = (v: unknown, min: number, max: number): number => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
};

/** Keep only the numeric intensity fields + a bounded, integer zone histogram. */
function sanitize(raw: RawSample): {
  keystrokes: number; mouse_distance_px: number; clicks: number; active_seconds: number; zones: Record<string, number>; app: string | null; path: string | null;
} {
  const zones: Record<string, number> = {};
  if (raw.zones && typeof raw.zones === 'object') {
    for (const [k, v] of Object.entries(raw.zones)) {
      // Only accept the canonical "r{row}c{col}" key shape within the grid.
      const m = /^r(\d{1,2})c(\d{1,2})$/.exec(k);
      if (!m) continue;
      const r = Number(m[1]), c = Number(m[2]);
      if (r < 0 || r >= ZONE_ROWS || c < 0 || c >= ZONE_COLS) continue;
      zones[k] = clampInt(v, 0, 100000);
      if (Object.keys(zones).length >= MAX_ZONE_KEYS) break;
    }
  }
  return {
    keystrokes: clampInt(raw.keystrokes, 0, 100000),
    mouse_distance_px: clampInt(raw.mouseDistancePx, 0, 100_000_000),
    clicks: clampInt(raw.clicks, 0, 100000),
    active_seconds: clampInt(raw.activeSeconds, 0, 24 * 3600),
    zones,
    // Route path is a location label, not content; truncate defensively.
    app: raw.app ? String(raw.app).slice(0, 40) : null,
    path: raw.path ? String(raw.path).slice(0, 200) : null,
  };
}

export class ActivityMonitorService {
  static async getSettings(tenantId: string): Promise<MonitorSettings> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('activity_monitor_settings').selectAll().where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!row) return { ...DEFAULTS };
      return { enabled: row.enabled, captureKeystrokes: row.capture_keystrokes, captureHeatmap: row.capture_heatmap, intervalSeconds: row.interval_seconds };
    });
  }

  static async setSettings(tenantId: string, userId: string, patch: Partial<MonitorSettings>): Promise<MonitorSettings> {
    return withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('activity_monitor_settings').selectAll().where('tenant_id', '=', tenantId).executeTakeFirst();
      const next: MonitorSettings = {
        enabled: patch.enabled ?? existing?.enabled ?? DEFAULTS.enabled,
        captureKeystrokes: patch.captureKeystrokes ?? existing?.capture_keystrokes ?? DEFAULTS.captureKeystrokes,
        captureHeatmap: patch.captureHeatmap ?? existing?.capture_heatmap ?? DEFAULTS.captureHeatmap,
        intervalSeconds: clampInt(patch.intervalSeconds ?? existing?.interval_seconds ?? DEFAULTS.intervalSeconds, 15, 600),
      };
      const values = {
        tenant_id: tenantId, enabled: next.enabled, capture_keystrokes: next.captureKeystrokes,
        capture_heatmap: next.captureHeatmap, interval_seconds: next.intervalSeconds, updated_by: userId, updated_at: new Date(),
      };
      if (existing) await trx.updateTable('activity_monitor_settings').set(values).where('tenant_id', '=', tenantId).execute();
      else await trx.insertInto('activity_monitor_settings').values(values).execute();
      return next;
    });
  }

  static async getConsent(tenantId: string, userId: string): Promise<boolean> {
    return withTenant(tenantId, async (trx) => {
      const u = await trx.selectFrom('users').select(['activity_consent']).where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
      return !!u?.activity_consent;
    });
  }

  static async setConsent(tenantId: string, userId: string, consent: boolean): Promise<boolean> {
    return withTenant(tenantId, async (trx) => {
      await trx.updateTable('users').set({ activity_consent: consent, activity_consent_at: consent ? new Date() : null })
        .where('id', '=', userId).where('tenant_id', '=', tenantId).execute();
      return consent;
    });
  }

  /**
   * Ingest a batch of the CURRENT user's own samples. Silently no-ops (returns
   * accepted:0) unless the tenant is enabled and the user has consented — a
   * client that keeps sending after consent is withdrawn stores nothing.
   */
  static async ingest(tenantId: string, userId: string, samples: RawSample[]): Promise<{ accepted: number }> {
    if (!Array.isArray(samples) || samples.length === 0) return { accepted: 0 };
    return withTenant(tenantId, async (trx) => {
      const settings = await trx.selectFrom('activity_monitor_settings').select(['enabled']).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!settings?.enabled) return { accepted: 0 };
      const u = await trx.selectFrom('users').select(['activity_consent']).where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!u?.activity_consent) return { accepted: 0 };

      const rows = samples.slice(0, 240).map((raw) => {
        const s = sanitize(raw);
        return {
          tenant_id: tenantId, user_id: userId,
          window_start: new Date(raw.windowStart), window_end: new Date(raw.windowEnd),
          keystrokes: s.keystrokes, mouse_distance_px: s.mouse_distance_px, clicks: s.clicks,
          active_seconds: s.active_seconds, zones: JSON.stringify(s.zones), app: s.app, path: s.path,
          created_at: new Date(),
        };
      }).filter((r) => !isNaN(r.window_start.getTime()) && !isNaN(r.window_end.getTime()));

      if (rows.length) await trx.insertInto('activity_samples').values(rows).execute();
      return { accepted: rows.length };
    });
  }

  /**
   * Per-user totals + a merged zone heatmap over a window. `scopeUserId` limits
   * to one person (a user viewing themselves); omit for a team roll-up (leads).
   */
  static async summary(tenantId: string, opts: { from: Date; to: Date; scopeUserId?: string }): Promise<any> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('activity_samples').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('window_start', '>=', opts.from).where('window_start', '<=', opts.to);
      if (opts.scopeUserId) q = q.where('user_id', '=', opts.scopeUserId);
      const rows = await q.execute();

      const byUser = new Map<string, { keystrokes: number; mouseDistancePx: number; clicks: number; activeSeconds: number; samples: number }>();
      const zones: Record<string, number> = {};
      for (const r of rows) {
        const u = byUser.get(r.user_id) ?? { keystrokes: 0, mouseDistancePx: 0, clicks: 0, activeSeconds: 0, samples: 0 };
        u.keystrokes += r.keystrokes; u.mouseDistancePx += r.mouse_distance_px; u.clicks += r.clicks; u.activeSeconds += r.active_seconds; u.samples += 1;
        byUser.set(r.user_id, u);
        const z = typeof r.zones === 'string' ? JSON.parse(r.zones) : (r.zones ?? {});
        for (const [k, v] of Object.entries(z)) zones[k] = (zones[k] ?? 0) + Number(v);
      }

      // Attach names.
      const ids = [...byUser.keys()];
      const names = ids.length ? await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', ids).execute() : [];
      const nameOf = new Map(names.map((n) => [n.id, n.name]));

      return {
        rows: rows.length,
        grid: { rows: ZONE_ROWS, cols: ZONE_COLS },
        zones,
        users: ids.map((id) => ({ userId: id, name: nameOf.get(id) ?? '—', ...byUser.get(id)! }))
          .sort((a, b) => b.activeSeconds - a.activeSeconds),
      };
    });
  }
}
