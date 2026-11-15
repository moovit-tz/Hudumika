import { createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import type { PulseNetwork } from '../db/client.js';

/**
 * Social network adapters for Pulse. Real HTTP calls to each network's
 * published API; nothing is simulated. A network whose developer-app
 * credentials are not in the server environment reports itself unavailable
 * and every call refuses with a plain reason.
 *
 * OAuth state is signed with the server secret (tenant + user + network +
 * nonce + time), so a callback can't be replayed into another workspace.
 * X's PKCE verifier is derived from that signed state, so it never has to be
 * stored or trusted from the browser.
 */

export class SocialError extends Error {
  constructor(message: string, public readonly expired = false) { super(message); }
}

export interface ConnectedAccount { network: PulseNetwork; external_id: string; name: string; handle?: string | null; avatar_url?: string | null; access_token: string; refresh_token?: string | null; expires_at?: Date | null }
export interface PublishInput { text: string; link?: string | null; imageUrl?: string | null }
export interface Published { id: string; url: string | null }
export type Metrics = Record<string, number>;

export const LIMITS: Record<PulseNetwork, number> = { facebook: 63206, instagram: 2200, linkedin: 3000, x: 280 };

const GRAPH = () => `https://graph.facebook.com/${env.META_API_VERSION || 'v21.0'}`;
const LI_VERSION = '202405';
const redirectUri = (network: 'meta' | 'linkedin' | 'x') => `${(env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '')}/pulse/social/callback/${network}`;

export function available(): Record<'meta' | 'linkedin' | 'x', boolean> {
  return { meta: !!(env.META_APP_ID && env.META_APP_SECRET), linkedin: !!(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET), x: !!(env.X_CLIENT_ID && env.X_CLIENT_SECRET) };
}

// ── Signed state ─────────────────────────────────────────────────────────────

export function makeState(tenantId: string, userId: string, provider: string): string {
  const body = Buffer.from(JSON.stringify({ t: tenantId, u: userId, p: provider, n: randomBytes(8).toString('hex'), at: Date.now() })).toString('base64url');
  return `${body}.${createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url')}`;
}
export function readState(state: string, tenantId: string, userId: string, provider: string): boolean {
  const [body, sig] = String(state).split('.');
  if (!body || !sig || createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url') !== sig) return false;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    return s.t === tenantId && s.u === userId && s.p === provider && Date.now() - s.at < 15 * 60_000;
  } catch { return false; }
}
const pkceVerifier = (state: string) => createHmac('sha256', env.JWT_SECRET).update(`pkce:${state}`).digest('base64url');
const pkceChallenge = (state: string) => createHash('sha256').update(pkceVerifier(state)).digest('base64url');

async function json(res: Response) {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error_description || body?.detail || body?.message || body?.title || `HTTP ${res.status}`;
    throw new SocialError(String(msg).slice(0, 300), res.status === 401 || body?.error?.code === 190);
  }
  return body;
}

// ── Connect ──────────────────────────────────────────────────────────────────

export function authUrl(provider: 'meta' | 'linkedin' | 'x', state: string): string {
  if (!available()[provider]) throw new SocialError(`${provider === 'meta' ? 'Facebook and Instagram' : provider === 'linkedin' ? 'LinkedIn' : 'X'} connections aren't available on this platform yet.`);
  if (provider === 'meta') {
    const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management';
    return `https://www.facebook.com/${env.META_API_VERSION || 'v21.0'}/dialog/oauth?${new URLSearchParams({ client_id: env.META_APP_ID!, redirect_uri: redirectUri('meta'), state, scope, response_type: 'code' })}`;
  }
  if (provider === 'linkedin') {
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: env.LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri('linkedin'), state, scope: 'r_organization_social w_organization_social rw_organization_admin' })}`;
  }
  return `https://x.com/i/oauth2/authorize?${new URLSearchParams({ response_type: 'code', client_id: env.X_CLIENT_ID!, redirect_uri: redirectUri('x'), state, scope: 'tweet.read tweet.write users.read offline.access', code_challenge: pkceChallenge(state), code_challenge_method: 'S256' })}`;
}

/** Exchanges the code and lists every page/profile the person can post as. */
export async function connect(provider: 'meta' | 'linkedin' | 'x', code: string, state: string): Promise<ConnectedAccount[]> {
  if (!available()[provider]) throw new SocialError('This network isn’t available on this platform yet.');
  if (provider === 'meta') {
    const short = await json(await fetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: redirectUri('meta'), code })}`));
    const long = await json(await fetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, fb_exchange_token: short.access_token })}`));
    const pages = await json(await fetch(`${GRAPH()}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}', access_token: long.access_token, limit: '100' })}`));
    const out: ConnectedAccount[] = [];
    for (const p of pages?.data ?? []) {
      // Page tokens from a long-lived user token do not expire.
      out.push({ network: 'facebook', external_id: p.id, name: p.name, avatar_url: p.picture?.data?.url ?? null, access_token: p.access_token });
      const ig = p.instagram_business_account;
      if (ig?.id) out.push({ network: 'instagram', external_id: ig.id, name: ig.username ?? p.name, handle: ig.username ? `@${ig.username}` : null, avatar_url: ig.profile_picture_url ?? null, access_token: p.access_token });
    }
    if (!out.length) throw new SocialError('No Facebook Pages came back. Make sure you chose at least one Page when asked.');
    return out;
  }
  if (provider === 'linkedin') {
    const tok = await json(await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri('linkedin'), client_id: env.LINKEDIN_CLIENT_ID!, client_secret: env.LINKEDIN_CLIENT_SECRET! }),
    }));
    const h = { Authorization: `Bearer ${tok.access_token}`, 'LinkedIn-Version': LI_VERSION, 'X-Restli-Protocol-Version': '2.0.0' };
    const acls = await json(await fetch('https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', { headers: h }));
    const out: ConnectedAccount[] = [];
    for (const a of acls?.elements ?? []) {
      const id = String(a.organization ?? '').split(':').pop();
      if (!id) continue;
      const org = await json(await fetch(`https://api.linkedin.com/rest/organizations/${id}`, { headers: h })).catch(() => null);
      out.push({ network: 'linkedin', external_id: id, name: org?.localizedName ?? `Company page ${id}`, handle: org?.vanityName ?? null,
        access_token: tok.access_token, refresh_token: tok.refresh_token ?? null, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null });
    }
    if (!out.length) throw new SocialError('You aren’t an admin of any LinkedIn company page, so there’s nothing to post as.');
    return out;
  }
  const tok = await json(await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri('x'), code_verifier: pkceVerifier(state) }),
  }));
  const me = await json(await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', { headers: { Authorization: `Bearer ${tok.access_token}` } }));
  return [{ network: 'x', external_id: me.data.id, name: me.data.name, handle: `@${me.data.username}`, avatar_url: me.data.profile_image_url ?? null,
    access_token: tok.access_token, refresh_token: tok.refresh_token ?? null, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null }];
}

/** New tokens for networks whose access tokens expire (X: 2 hours; LinkedIn: 60 days). */
export async function refresh(network: PulseNetwork, refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_at: Date | null }> {
  if (network === 'x') {
    const tok = await json(await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    }));
    return { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null };
  }
  if (network === 'linkedin') {
    const tok = await json(await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env.LINKEDIN_CLIENT_ID!, client_secret: env.LINKEDIN_CLIENT_SECRET! }),
    }));
    return { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null };
  }
  throw new SocialError('This connection can’t be refreshed; reconnect it.', true);
}

// ── Publish & measure ────────────────────────────────────────────────────────

export async function publish(network: PulseNetwork, externalId: string, token: string, p: PublishInput): Promise<Published> {
  if (p.text.length > LIMITS[network]) throw new SocialError(`Too long for ${network} (${p.text.length}/${LIMITS[network]} characters).`);
  if (network === 'facebook') {
    const r = p.imageUrl
      ? await json(await fetch(`${GRAPH()}/${externalId}/photos`, { method: 'POST', body: new URLSearchParams({ url: p.imageUrl, caption: [p.text, p.link].filter(Boolean).join('\n\n'), access_token: token }) }))
      : await json(await fetch(`${GRAPH()}/${externalId}/feed`, { method: 'POST', body: new URLSearchParams({ message: p.text, ...(p.link ? { link: p.link } : {}), access_token: token }) }));
    const id = r.post_id ?? r.id;
    return { id, url: `https://www.facebook.com/${id}` };
  }
  if (network === 'instagram') {
    if (!p.imageUrl) throw new SocialError('Instagram posts need an image.');
    const caption = [p.text, p.link].filter(Boolean).join('\n\n');
    const media = await json(await fetch(`${GRAPH()}/${externalId}/media`, { method: 'POST', body: new URLSearchParams({ image_url: p.imageUrl, caption, access_token: token }) }));
    const done = await json(await fetch(`${GRAPH()}/${externalId}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: media.id, access_token: token }) }));
    const info = await json(await fetch(`${GRAPH()}/${done.id}?${new URLSearchParams({ fields: 'permalink', access_token: token })}`)).catch(() => null);
    return { id: done.id, url: info?.permalink ?? null };
  }
  if (network === 'linkedin') {
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': LI_VERSION, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: `urn:li:organization:${externalId}`, commentary: p.text, visibility: 'PUBLIC', lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(p.link ? { content: { article: { source: p.link, title: p.link } } } : {}),
      }),
    });
    if (!res.ok) await json(res);
    const urn = res.headers.get('x-restli-id') ?? '';
    return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : null };
  }
  const text = p.link && !p.text.includes(p.link) ? `${p.text}\n${p.link}`.slice(0, 280) : p.text;
  const r = await json(await fetch('https://api.x.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }));
  return { id: r.data.id, url: `https://x.com/i/web/status/${r.data.id}` };
}

/** The network's own public numbers for one post. */
export async function metrics(network: PulseNetwork, postId: string, token: string): Promise<Metrics> {
  if (network === 'facebook') {
    const r = await json(await fetch(`${GRAPH()}/${postId}?${new URLSearchParams({ fields: 'reactions.summary(true).limit(0),comments.summary(true).limit(0),shares', access_token: token })}`));
    return { reactions: r.reactions?.summary?.total_count ?? 0, comments: r.comments?.summary?.total_count ?? 0, shares: r.shares?.count ?? 0 };
  }
  if (network === 'instagram') {
    const r = await json(await fetch(`${GRAPH()}/${postId}?${new URLSearchParams({ fields: 'like_count,comments_count', access_token: token })}`));
    return { likes: r.like_count ?? 0, comments: r.comments_count ?? 0 };
  }
  if (network === 'x') {
    const r = await json(await fetch(`https://api.x.com/2/tweets/${postId}?tweet.fields=public_metrics`, { headers: { Authorization: `Bearer ${token}` } }));
    const m = r.data?.public_metrics ?? {};
    return { likes: m.like_count ?? 0, reposts: m.retweet_count ?? 0, replies: m.reply_count ?? 0, impressions: m.impression_count ?? 0 };
  }
  // LinkedIn post statistics need the Community Management API's analytics
  // product, which most apps aren't approved for; say nothing rather than guess.
  return {};
}
