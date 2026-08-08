import { db } from '../db/client.js';

/**
 * Lens ↔ GitHub, Slack, Jira, Linear, CircleCI.
 *
 * ── What is and is not verified ────────────────────────────────────────────
 *
 * The endpoints, payload shapes and auth headers below are written from each
 * provider's published API. None of them has been executed against a real
 * account, because this environment has no credentials for any of them. So:
 *
 *   * every call reports what actually happened — status code and response
 *     body — and never a synthesised success;
 *   * `testConnection` exists so the first thing anyone does with a new
 *     integration is find out whether it works, rather than discovering it
 *     later from a silently swallowed error;
 *   * failures are stored on the integration (`last_error`) and surfaced,
 *     not logged and forgotten.
 *
 * That is the same rule applied to TRA elsewhere in this codebase: a call that
 * cannot be made is reported as not made.
 *
 * ── Deliberately one-directional, mostly ───────────────────────────────────
 *
 * Lens pushes out (open an issue, post a message) and mirrors provider status
 * inward for display. What it does not do is let an external event change a
 * Lens item's status. A merged PR means the code changed; it does not mean the
 * problem is settled, and those are different claims. Closing an item stays a
 * human act with a written resolution.
 */

export type Provider = 'github' | 'slack' | 'jira' | 'linear' | 'circleci';

export const PROVIDERS: Provider[] = ['github', 'slack', 'jira', 'linear', 'circleci'];

/** What each provider needs before it can do anything, for the settings form. */
export const PROVIDER_SETUP: Record<Provider, {
  label: string;
  credentialLabel: string;
  configFields: { key: string; label: string; placeholder: string; required: boolean }[];
  docs: string;
  note?: string;
}> = {
  github: {
    label: 'GitHub',
    credentialLabel: 'Personal access token (repo scope)',
    configFields: [
      { key: 'repo', label: 'Repository', placeholder: 'owner/repo', required: true },
    ],
    docs: 'https://docs.github.com/rest/issues/issues',
  },
  slack: {
    label: 'Slack',
    credentialLabel: 'Bot token (xoxb-…, chat:write scope)',
    configFields: [
      { key: 'channel', label: 'Channel', placeholder: '#platform-dev or C0123456', required: true },
    ],
    docs: 'https://api.slack.com/methods/chat.postMessage',
  },
  jira: {
    label: 'Jira',
    credentialLabel: 'API token (sent with the account email as basic auth)',
    configFields: [
      { key: 'site', label: 'Site URL', placeholder: 'https://your-org.atlassian.net', required: true },
      { key: 'email', label: 'Account email', placeholder: 'you@company.com', required: true },
      { key: 'project', label: 'Project key', placeholder: 'PLAT', required: true },
      { key: 'issue_type', label: 'Issue type', placeholder: 'Task', required: false },
    ],
    docs: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/',
  },
  linear: {
    label: 'Linear',
    credentialLabel: 'API key',
    configFields: [
      { key: 'team_id', label: 'Team ID', placeholder: 'The team UUID from Linear settings', required: true },
    ],
    docs: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
  },
  circleci: {
    label: 'CircleCI',
    credentialLabel: 'Personal API token',
    configFields: [
      { key: 'project_slug', label: 'Project slug', placeholder: 'gh/owner/repo', required: true },
    ],
    docs: 'https://circleci.com/docs/api/v2/',
    note: 'Read-only. Lens attaches build status to an item; it never triggers a pipeline.',
  },
};

export interface CallResult {
  ok: boolean;
  status: number;
  /** What the provider said. Kept verbatim — a paraphrased error is a lost error. */
  detail: string;
  data?: any;
}

async function call(
  url: string, init: RequestInit, provider: Provider, timeoutMs = 15000,
): Promise<CallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: any; try { data = JSON.parse(text); } catch { data = text; }

    // Slack answers 200 with { ok: false, error } — a status check alone would
    // read that as success.
    const slackFailed = provider === 'slack' && data && typeof data === 'object' && data.ok === false;
    const ok = res.ok && !slackFailed;

    return {
      ok,
      status: res.status,
      detail: ok ? 'ok' : (slackFailed ? `Slack: ${data.error}` : String(text).slice(0, 400)),
      data,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      detail: e?.name === 'AbortError' ? `No response within ${timeoutMs}ms` : (e?.message ?? 'Request failed'),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getIntegration(provider: Provider) {
  return db.selectFrom('lens_integrations').selectAll()
    .where('provider', '=', provider).executeTakeFirst();
}

/** Never returns the credential — only whether one is set. */
export async function listIntegrations() {
  const rows = await db.selectFrom('lens_integrations')
    .select(['provider', 'status', 'config', 'last_sync_at', 'last_error', 'updated_at'])
    .execute();
  const byProvider = new Map(rows.map(r => [r.provider, r]));
  const withSecret = await db.selectFrom('lens_integrations')
    .select(['provider', 'credential']).execute();
  const hasCred = new Map(withSecret.map(r => [r.provider, !!r.credential]));

  return PROVIDERS.map(p => {
    const row = byProvider.get(p);
    return {
      provider: p,
      ...PROVIDER_SETUP[p],
      status: row?.status ?? 'disconnected',
      config: row?.config ?? {},
      has_credential: hasCred.get(p) ?? false,
      last_sync_at: row?.last_sync_at ?? null,
      last_error: row?.last_error ?? null,
    };
  });
}

async function record(provider: Provider, result: CallResult) {
  await db.updateTable('lens_integrations').set({
    status: result.ok ? 'connected' : 'error',
    last_error: result.ok ? null : `${result.status}: ${result.detail}`.slice(0, 1000),
    last_sync_at: result.ok ? new Date() : undefined,
    updated_at: new Date(),
  }).where('provider', '=', provider).execute();
}

/**
 * Ask the provider whether the credentials work, using its cheapest
 * authenticated read. This is the honest first step for any new connection.
 */
export async function testConnection(provider: Provider): Promise<CallResult> {
  const row = await getIntegration(provider);
  if (!row?.credential) {
    return { ok: false, status: 0, detail: 'No credential is stored for this provider.' };
  }
  const cfg = (row.config ?? {}) as Record<string, string>;
  const token = row.credential;
  let result: CallResult;

  switch (provider) {
    case 'github':
      if (!cfg.repo) { result = { ok: false, status: 0, detail: 'No repository configured.' }; break; }
      result = await call(`https://api.github.com/repos/${cfg.repo}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      }, provider);
      break;

    case 'slack':
      result = await call('https://slack.com/api/auth.test', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      }, provider);
      break;

    case 'jira':
      if (!cfg.site || !cfg.email) { result = { ok: false, status: 0, detail: 'Site URL and account email are required.' }; break; }
      result = await call(`${cfg.site.replace(/\/$/, '')}/rest/api/3/myself`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.email}:${token}`).toString('base64')}`,
          Accept: 'application/json',
        },
      }, provider);
      break;

    case 'linear':
      result = await call('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { id name } }' }),
      }, provider);
      break;

    case 'circleci':
      result = await call('https://circleci.com/api/v2/me', {
        headers: { 'Circle-Token': token },
      }, provider);
      break;
  }

  await record(provider, result!);
  return result!;
}

/**
 * Open the item in an external tracker and return the link to record.
 *
 * The item stays the record of what is true; the external issue is where the
 * work gets scheduled. Both refs are kept so either can be found from the other.
 */
export async function createExternalIssue(
  provider: 'github' | 'jira' | 'linear',
  item: { ref: string; title: string; body: string | null; kind: string; evidence: string | null },
): Promise<CallResult & { external_id?: string; url?: string }> {
  const row = await getIntegration(provider);
  if (!row?.credential) return { ok: false, status: 0, detail: 'No credential is stored for this provider.' };
  const cfg = (row.config ?? {}) as Record<string, string>;
  const token = row.credential;

  // The evidence travels with it. An issue that says what is wrong without
  // saying how it is known produces the same guesswork Lens exists to stop.
  const description = [
    item.body ?? '',
    item.evidence ? `\n\n**How it is known**\n\n${item.evidence}` : '',
    `\n\n— opened from Lens ${item.ref}`,
  ].join('');

  switch (provider) {
    case 'github': {
      if (!cfg.repo) return { ok: false, status: 0, detail: 'No repository configured.' };
      const r = await call(`https://api.github.com/repos/${cfg.repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `[${item.ref}] ${item.title}`,
          body: description,
          labels: [item.kind.toLowerCase()],
        }),
      }, provider);
      await record(provider, r);
      return r.ok
        ? { ...r, external_id: `${cfg.repo}#${r.data?.number}`, url: r.data?.html_url }
        : r;
    }

    case 'jira': {
      if (!cfg.site || !cfg.email || !cfg.project) {
        return { ok: false, status: 0, detail: 'Site URL, account email and project key are required.' };
      }
      const r = await call(`${cfg.site.replace(/\/$/, '')}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.email}:${token}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            project: { key: cfg.project },
            summary: `[${item.ref}] ${item.title}`,
            issuetype: { name: cfg.issue_type || 'Task' },
            // Jira v3 takes Atlassian Document Format, not a plain string.
            description: {
              type: 'doc', version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
            },
          },
        }),
      }, provider);
      await record(provider, r);
      return r.ok
        ? { ...r, external_id: r.data?.key, url: `${cfg.site.replace(/\/$/, '')}/browse/${r.data?.key}` }
        : r;
    }

    case 'linear': {
      if (!cfg.team_id) return { ok: false, status: 0, detail: 'No team ID configured.' };
      const r = await call('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($input: IssueCreateInput!) {
            issueCreate(input: $input) { success issue { id identifier url } } }`,
          variables: {
            input: { teamId: cfg.team_id, title: `[${item.ref}] ${item.title}`, description },
          },
        }),
      }, provider);
      // GraphQL answers 200 with an `errors` array — status alone is not enough.
      const gqlFailed = r.ok && Array.isArray(r.data?.errors) && r.data.errors.length > 0;
      const final = gqlFailed
        ? { ...r, ok: false, detail: `Linear: ${r.data.errors[0]?.message ?? 'GraphQL error'}` }
        : r;
      await record(provider, final);
      const issue = final.data?.data?.issueCreate?.issue;
      return final.ok && issue
        ? { ...final, external_id: issue.identifier, url: issue.url }
        : final;
    }
  }
}

/** Post an item to Slack. Notification only — Slack holds nothing. */
export async function notifySlack(
  item: { ref: string; title: string; kind: string; severity: string; confidence: string },
  event: string,
): Promise<CallResult> {
  const row = await getIntegration('slack');
  if (!row?.credential) return { ok: false, status: 0, detail: 'No credential is stored for Slack.' };
  const cfg = (row.config ?? {}) as Record<string, string>;
  if (!cfg.channel) return { ok: false, status: 0, detail: 'No channel configured.' };

  const r = await call('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${row.credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: cfg.channel,
      text: `${item.ref} ${event}: ${item.title}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${item.ref}* ${event}\n${item.title}` } },
        { type: 'context', elements: [{
          type: 'mrkdwn',
          // Confidence goes in the notification deliberately — "nobody has
          // reproduced this" is the most useful thing a reader can know.
          text: `${item.kind} · ${item.severity} · *${item.confidence}*`,
        }] },
      ],
    }),
  }, 'slack');
  await record('slack', r);
  return r;
}

/** Latest CircleCI pipeline for the configured project. Read-only. */
export async function latestBuild(): Promise<CallResult> {
  const row = await getIntegration('circleci');
  if (!row?.credential) return { ok: false, status: 0, detail: 'No credential is stored for CircleCI.' };
  const cfg = (row.config ?? {}) as Record<string, string>;
  if (!cfg.project_slug) return { ok: false, status: 0, detail: 'No project slug configured.' };

  const r = await call(
    `https://circleci.com/api/v2/project/${encodeURIComponent(cfg.project_slug)}/pipeline?limit=1`,
    { headers: { 'Circle-Token': row.credential } }, 'circleci');
  await record('circleci', r);
  return r;
}
