import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { SocialError, makeState, readState } from './pulse-social.js';

/**
 * Ad platform adapters for Pulse: Google Ads API and Meta Marketing API.
 * Real calls against each platform's documented endpoints; nothing is
 * simulated. A platform without credentials in the server environment
 * reports itself unavailable and refuses with a plain reason.
 *
 * Scope is deliberately operational: read campaigns and daily numbers,
 * pause/resume, change a daily budget, and push a matched audience. New ads
 * and creatives are made in the platform's own tools.
 */

export { makeState, readState };
export class AdsError extends SocialError {}

export interface AdAccount { external_id: string; name: string; currency: string | null; access_token: string; refresh_token?: string | null; expires_at?: Date | null }
export interface AdCampaign { external_id: string; name: string; status: string; daily_budget: number | null; budget_ref?: string | null; objective?: string | null }
export interface AdDay { campaign_external_id: string; day: string; impressions: number; clicks: number; spend: number; conversions: number }

const GRAPH = () => `https://graph.facebook.com/${env.META_API_VERSION || 'v21.0'}`;
const GADS = () => `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION || 'v21'}`;
const redirect = (n: 'google' | 'meta') => `${(env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '')}/pulse/ads/callback/${n}`;

export function adsAvailable() {
  return {
    meta: !!(env.META_APP_ID && env.META_APP_SECRET),
    google: !!(env.GOOGLE_ADS_CLIENT_ID && env.GOOGLE_ADS_CLIENT_SECRET && env.GOOGLE_ADS_DEVELOPER_TOKEN),
  };
}

async function json(res: Response) {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const g = Array.isArray(body) ? body[0]?.error : body?.error;
    const detail = g?.details?.[0]?.errors?.[0]?.message;
    throw new AdsError(String(detail || g?.message || body?.error_description || `HTTP ${res.status}`).slice(0, 300), res.status === 401 || g?.code === 190);
  }
  return body;
}

export function adsAuthUrl(network: 'google' | 'meta', state: string) {
  if (!adsAvailable()[network]) throw new AdsError(network === 'google' ? 'Google Ads isn’t available on this platform yet (it needs a Google-approved developer token).' : 'Meta ads aren’t available on this platform yet.');
  if (network === 'meta') {
    return `https://www.facebook.com/${env.META_API_VERSION || 'v21.0'}/dialog/oauth?${new URLSearchParams({ client_id: env.META_APP_ID!, redirect_uri: redirect('meta'), state, scope: 'ads_read,ads_management,business_management', response_type: 'code' })}`;
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID!, redirect_uri: redirect('google'), response_type: 'code', scope: 'https://www.googleapis.com/auth/adwords', access_type: 'offline', prompt: 'consent', state })}`;
}

const gHeaders = (token: string, loginCustomerId?: string) => ({
  Authorization: `Bearer ${token}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN!, 'Content-Type': 'application/json',
  ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
});

export async function adsConnect(network: 'google' | 'meta', code: string): Promise<AdAccount[]> {
  if (network === 'meta') {
    const short = await json(await fetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: redirect('meta'), code })}`));
    const long = await json(await fetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, fb_exchange_token: short.access_token })}`));
    const acts = await json(await fetch(`${GRAPH()}/me/adaccounts?${new URLSearchParams({ fields: 'id,name,currency,account_status', access_token: long.access_token, limit: '100' })}`));
    const out = (acts?.data ?? []).map((a: any) => ({ external_id: a.id, name: a.name, currency: a.currency ?? null, access_token: long.access_token, expires_at: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null }));
    if (!out.length) throw new AdsError('No ad accounts came back for this Facebook login.');
    return out;
  }
  const tok = await json(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_ADS_CLIENT_ID!, client_secret: env.GOOGLE_ADS_CLIENT_SECRET!, redirect_uri: redirect('google'), grant_type: 'authorization_code' }),
  }));
  const list = await json(await fetch(`${GADS()}/customers:listAccessibleCustomers`, { headers: gHeaders(tok.access_token) }));
  const out: AdAccount[] = [];
  for (const rn of list?.resourceNames ?? []) {
    const cid = String(rn).split('/').pop()!;
    const rows = await json(await fetch(`${GADS()}/customers/${cid}/googleAds:search`, {
      method: 'POST', headers: gHeaders(tok.access_token),
      body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1' }),
    })).catch(() => null);
    const c = rows?.results?.[0]?.customer;
    if (c?.manager) continue; // manager (MCC) accounts hold no campaigns of their own
    out.push({ external_id: cid, name: c?.descriptiveName ?? `Google Ads ${cid}`, currency: c?.currencyCode ?? null, access_token: tok.access_token, refresh_token: tok.refresh_token ?? null, expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000) });
  }
  if (!out.length) throw new AdsError('No Google Ads accounts are accessible with this login.');
  return out;
}

export async function adsRefresh(network: 'google' | 'meta', refreshToken: string) {
  if (network !== 'google') throw new AdsError('Reconnect this account.', true);
  const tok = await json(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: env.GOOGLE_ADS_CLIENT_ID!, client_secret: env.GOOGLE_ADS_CLIENT_SECRET!, grant_type: 'refresh_token' }),
  }));
  return { access_token: tok.access_token as string, expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000) };
}

/** Campaigns plus the last 30 days of daily numbers. */
export async function adsSync(network: 'google' | 'meta', accountId: string, token: string): Promise<{ campaigns: AdCampaign[]; days: AdDay[] }> {
  if (network === 'meta') {
    const c = await json(await fetch(`${GRAPH()}/${accountId}/campaigns?${new URLSearchParams({ fields: 'id,name,status,daily_budget,objective', access_token: token, limit: '200' })}`));
    const ins = await json(await fetch(`${GRAPH()}/${accountId}/insights?${new URLSearchParams({ level: 'campaign', time_increment: '1', date_preset: 'last_30d', fields: 'campaign_id,impressions,clicks,spend,actions', access_token: token, limit: '1000' })}`));
    return {
      // Meta budgets are in the account currency's minor unit (cents).
      campaigns: (c?.data ?? []).map((x: any) => ({ external_id: x.id, name: x.name, status: x.status, daily_budget: x.daily_budget != null ? Number(x.daily_budget) / 100 : null, objective: x.objective ?? null })),
      days: (ins?.data ?? []).map((r: any) => ({
        campaign_external_id: r.campaign_id, day: r.date_start, impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0), spend: Number(r.spend ?? 0),
        conversions: (r.actions ?? []).filter((a: any) => /lead|purchase|complete_registration/.test(a.action_type)).reduce((s: number, a: any) => s + Number(a.value ?? 0), 0),
      })),
    };
  }
  const q = `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, campaign.advertising_channel_type,
    segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign WHERE segments.date DURING LAST_30_DAYS`;
  const rows = await json(await fetch(`${GADS()}/customers/${accountId}/googleAds:search`, { method: 'POST', headers: gHeaders(token), body: JSON.stringify({ query: q }) }));
  const campaigns = new Map<string, AdCampaign>();
  const days: AdDay[] = [];
  for (const r of rows?.results ?? []) {
    const id = String(r.campaign.id);
    campaigns.set(id, { external_id: id, name: r.campaign.name, status: r.campaign.status, daily_budget: r.campaignBudget?.amountMicros != null ? Number(r.campaignBudget.amountMicros) / 1e6 : null, budget_ref: r.campaign.campaignBudget ?? null, objective: r.campaign.advertisingChannelType ?? null });
    days.push({ campaign_external_id: id, day: r.segments.date, impressions: Number(r.metrics.impressions ?? 0), clicks: Number(r.metrics.clicks ?? 0), spend: Number(r.metrics.costMicros ?? 0) / 1e6, conversions: Number(r.metrics.conversions ?? 0) });
  }
  return { campaigns: [...campaigns.values()], days };
}

export async function adsSetStatus(network: 'google' | 'meta', accountId: string, campaignId: string, token: string, active: boolean) {
  if (network === 'meta') {
    await json(await fetch(`${GRAPH()}/${campaignId}`, { method: 'POST', body: new URLSearchParams({ status: active ? 'ACTIVE' : 'PAUSED', access_token: token }) }));
    return active ? 'ACTIVE' : 'PAUSED';
  }
  await json(await fetch(`${GADS()}/customers/${accountId}/campaigns:mutate`, {
    method: 'POST', headers: gHeaders(token),
    body: JSON.stringify({ operations: [{ update: { resourceName: `customers/${accountId}/campaigns/${campaignId}`, status: active ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' }] }),
  }));
  return active ? 'ENABLED' : 'PAUSED';
}

export async function adsSetBudget(network: 'google' | 'meta', accountId: string, campaignId: string, budgetRef: string | null, token: string, amount: number) {
  if (network === 'meta') {
    await json(await fetch(`${GRAPH()}/${campaignId}`, { method: 'POST', body: new URLSearchParams({ daily_budget: String(Math.round(amount * 100)), access_token: token }) }));
    return;
  }
  if (!budgetRef) throw new AdsError('This campaign’s budget can’t be changed from here; change it in Google Ads.');
  await json(await fetch(`${GADS()}/customers/${accountId}/campaignBudgets:mutate`, {
    method: 'POST', headers: gHeaders(token),
    body: JSON.stringify({ operations: [{ update: { resourceName: budgetRef, amountMicros: String(Math.round(amount * 1e6)) }, updateMask: 'amount_micros' }] }),
  }));
}

/** Normalised then SHA-256 hashed, as both platforms require. */
export const hashEmail = (e: string) => createHash('sha256').update(e.trim().toLowerCase()).digest('hex');
/** E.164 for Google ("+255712…"); digits only for Meta ("255712…"). A local
 *  "07…" number is read as Tanzanian, the platform's home market. */
export function hashPhone(p: string, network: 'google' | 'meta') {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('0')) d = `255${d.slice(1)}`;
  return createHash('sha256').update(network === 'google' ? `+${d}` : d).digest('hex');
}

/** Creates (or reuses) the matched audience and uploads hashed members. Returns its id. */
export async function adsPushAudience(network: 'google' | 'meta', accountId: string, token: string, name: string, existingId: string | null, people: { email?: string | null; phone?: string | null }[]): Promise<string> {
  const rows = people.map((p) => ({ e: p.email ? hashEmail(p.email) : null, p: p.phone ? hashPhone(p.phone, network) : null })).filter((r) => r.e || r.p);
  if (network === 'meta') {
    const id = existingId ?? (await json(await fetch(`${GRAPH()}/${accountId}/customaudiences`, {
      method: 'POST', body: new URLSearchParams({ name, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY', description: 'From a Hudumika Pulse audience', access_token: token }),
    }))).id;
    for (let i = 0; i < rows.length; i += 10000) {
      const payload = { schema: ['EMAIL_SHA256', 'PHONE_SHA256'], data: rows.slice(i, i + 10000).map((r) => [r.e ?? '', r.p ?? '']) };
      await json(await fetch(`${GRAPH()}/${id}/users`, { method: 'POST', body: new URLSearchParams({ payload: JSON.stringify(payload), access_token: token }) }));
    }
    return id;
  }
  const h = gHeaders(token);
  let listRn = existingId;
  if (!listRn) {
    const created = await json(await fetch(`${GADS()}/customers/${accountId}/userLists:mutate`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ operations: [{ create: { name, description: 'From a Hudumika Pulse audience', membershipLifeSpan: 10000, crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' } } }] }),
    }));
    listRn = created.results[0].resourceName;
  }
  const job = await json(await fetch(`${GADS()}/customers/${accountId}/offlineUserDataJobs:create`, {
    method: 'POST', headers: h, body: JSON.stringify({ job: { type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: listRn } } }),
  }));
  const jobRn = job.resourceName;
  for (let i = 0; i < rows.length; i += 5000) {
    const operations = rows.slice(i, i + 5000).map((r) => ({ create: { userIdentifiers: [...(r.e ? [{ hashedEmail: r.e }] : []), ...(r.p ? [{ hashedPhoneNumber: r.p }] : [])] } }));
    await json(await fetch(`${GADS()}/${jobRn}:addOperations`, { method: 'POST', headers: h, body: JSON.stringify({ operations, enablePartialFailure: true }) }));
  }
  await json(await fetch(`${GADS()}/${jobRn}:run`, { method: 'POST', headers: h, body: '{}' }));
  return listRn!;
}
