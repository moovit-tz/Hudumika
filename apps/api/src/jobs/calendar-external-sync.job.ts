import { dbPlatform, withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';

// Pulls events from Google Calendar / Microsoft Graph into a local read-only
// mirror on calendar_events (external_source/external_id, 287_calendar_v3.sql),
// one-way only — never writes back. Inert by construction: with no rows in
// calendar_sync_connections (nobody has connected yet, since that requires a
// tenant admin to first save real OAuth app credentials via PATCH /v1/settings
// and a user to complete the consent flow in calendar-sync.routes.ts), the
// query below returns nothing and the job is a no-op every run.
//
// Each recurring series is requested pre-expanded (Google's singleEvents=true,
// Graph's calendarView) rather than mirrored as one row + a translated
// recurrence rule — every occurrence lands as its own flat calendar_events
// row with a unique external_id, avoiding a second RRULE-translation layer
// this app doesn't otherwise need. A rolling window (30 days back, 180
// forward) is re-synced every pass; anything a user deletes on the far side
// simply stops reappearing next sync rather than being explicitly reconciled.
const WINDOW_BACK_MS = 30 * 24 * 60 * 60 * 1000;
const WINDOW_FORWARD_MS = 180 * 24 * 60 * 60 * 1000;
// Refresh a bit before actual expiry so a mid-sync request never races the
// token dying under it.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface MirroredEvent {
  externalId: string;
  title: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  allDay: boolean;
  description: string | null;
  location: string | null;
}

async function loadTenantProviderCreds(tenantId: string, provider: 'google' | 'outlook'): Promise<{ clientId: string; clientSecret: string } | null> {
  const row = await dbPlatform.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  const config = settings.calendarSync ?? {};
  const clientId = config[`${provider}ClientId`];
  const clientSecretEnc = config[`${provider}ClientSecret`];
  if (!clientId || !clientSecretEnc) return null;
  return { clientId, clientSecret: decryptSecret(clientSecretEnc) };
}

async function refreshAccessToken(provider: 'google' | 'outlook', refreshToken: string, clientId: string, clientSecret: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const tokenUrl = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: tokens.access_token,
    // Microsoft rotates refresh tokens on every use; Google normally doesn't
    // return one on refresh at all — keep the existing one in that case.
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

async function fetchGoogleEvents(accessToken: string, from: Date, to: Date): Promise<MirroredEvent[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', from.toISOString());
  url.searchParams.set('timeMax', to.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('maxResults', '250');
  url.searchParams.set('orderBy', 'startTime');

  const events: MirroredEvent[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Google events.list failed (${res.status}): ${await res.text()}`);
    const body = await res.json() as { items?: any[]; nextPageToken?: string };
    for (const ev of body.items ?? []) {
      if (ev.status === 'cancelled') continue;
      const allDay = !!ev.start?.date && !ev.start?.dateTime;
      events.push({
        externalId: ev.id,
        title: ev.summary || '(No title)',
        startAt: allDay ? `${ev.start.date}T00:00:00.000Z` : ev.start.dateTime,
        endAt: allDay ? `${ev.end.date}T00:00:00.000Z` : ev.end.dateTime,
        allDay,
        description: ev.description || null,
        location: ev.location || null,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return events;
}

async function fetchOutlookEvents(accessToken: string, from: Date, to: Date): Promise<MirroredEvent[]> {
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
  url.searchParams.set('startDateTime', from.toISOString());
  url.searchParams.set('endDateTime', to.toISOString());
  url.searchParams.set('$top', '250');
  url.searchParams.set('$select', 'id,subject,bodyPreview,location,start,end,isAllDay');

  const events: MirroredEvent[] = [];
  let next: string | undefined = url.toString();
  while (next) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
    if (!res.ok) throw new Error(`Graph calendarView failed (${res.status}): ${await res.text()}`);
    const body = await res.json() as { value?: any[]; ['@odata.nextLink']?: string };
    for (const ev of body.value ?? []) {
      events.push({
        externalId: ev.id,
        title: ev.subject || '(No title)',
        startAt: `${ev.start.dateTime}Z`,
        endAt: `${ev.end.dateTime}Z`,
        allDay: !!ev.isAllDay,
        description: ev.bodyPreview || null,
        location: ev.location?.displayName || null,
      });
    }
    next = body['@odata.nextLink'];
  }
  return events;
}

export async function runCalendarExternalSyncJob(): Promise<void> {
  console.log('⏳ Running background job: Calendar external sync (Google/Outlook)...');
  try {
    const connections = await dbPlatform.selectFrom('calendar_sync_connections').selectAll()
      .where('status', '=', 'authorized').execute();
    if (connections.length === 0) {
      console.log('📝 No calendar sync connections to run.');
      return;
    }

    const from = new Date(Date.now() - WINDOW_BACK_MS);
    const to = new Date(Date.now() + WINDOW_FORWARD_MS);
    let synced = 0, failed = 0;

    for (const conn of connections as any[]) {
      const provider = conn.provider as 'google' | 'outlook';
      try {
        const creds = await loadTenantProviderCreds(conn.tenant_id, provider);
        if (!creds) throw new Error('Workspace no longer has a Client ID/Secret configured for this provider.');

        let accessToken = conn.access_token ? decryptSecret(conn.access_token) : null;
        const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
        const needsRefresh = !accessToken || !expiresAt || expiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;

        await withTenant(conn.tenant_id, async (trx) => {
          if (needsRefresh) {
            const refreshToken = decryptSecret(conn.refresh_token);
            const refreshed = await refreshAccessToken(provider, refreshToken, creds.clientId, creds.clientSecret);
            accessToken = refreshed.accessToken;
            await trx.updateTable('calendar_sync_connections').set({
              access_token: encryptSecret(refreshed.accessToken),
              refresh_token: encryptSecret(refreshed.refreshToken),
              token_expires_at: refreshed.expiresAt.toISOString(),
              updated_at: new Date(),
            }).where('id', '=', conn.id).execute();
          }

          const events = provider === 'google'
            ? await fetchGoogleEvents(accessToken!, from, to)
            : await fetchOutlookEvents(accessToken!, from, to);

          for (const ev of events) {
            await trx.insertInto('calendar_events').values({
              id: crypto.randomUUID(), tenant_id: conn.tenant_id, user_id: conn.user_id,
              title: ev.title, start_at: ev.startAt, end_at: ev.endAt, all_day: ev.allDay,
              description: ev.description, location: ev.location, category: 'personal',
              guests: '[]' as unknown as any, reminder_offsets: [],
              external_source: provider, external_id: ev.externalId,
            }).onConflict(oc => oc.columns(['user_id', 'external_source', 'external_id']).doUpdateSet({
              title: ev.title, start_at: ev.startAt, end_at: ev.endAt, all_day: ev.allDay,
              description: ev.description, location: ev.location, updated_at: new Date(),
            })).execute();
          }

          await trx.updateTable('calendar_sync_connections').set({
            last_synced_at: new Date().toISOString(), status: 'authorized', last_error: null, updated_at: new Date(),
          }).where('id', '=', conn.id).execute();
        });

        synced++;
      } catch (err: any) {
        failed++;
        console.error(`[CalendarExternalSync] ${provider} sync failed for connection ${conn.id}:`, err.message);
        await withTenant(conn.tenant_id, trx => trx.updateTable('calendar_sync_connections')
          .set({ status: 'error', last_error: String(err.message).slice(0, 500), updated_at: new Date() })
          .where('id', '=', conn.id).execute()
        ).catch(() => {});
      }
    }

    console.log(`✅ Calendar external sync job completed — ${synced} connection(s) synced, ${failed} failed.`);
  } catch (error) {
    console.error('❌ Calendar external sync job failed:', error);
  }
}
