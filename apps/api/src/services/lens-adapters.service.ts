import { dbPlatform } from '../db/client.js';
import { decryptLensCredential } from './lens-crypto.service.js';
import type { LensProvider } from '@hudumika/types';

/**
 * Provider capability declarations, configuration schemas, and live adapter contracts.
 */

export interface AdapterCallResult {
  ok: boolean;
  status: number;
  detail: string;
  data?: any;
}

export interface ProviderCapability {
  provider: LensProvider;
  name: string;
  category: 'vcs' | 'tracker' | 'ci' | 'chat' | 'docs';
  authTypes: Array<'oauth' | 'pat' | 'bot_token' | 'app_installation'>;
  features: string[];
  docUrl: string;
  configSchema: { key: string; label: string; placeholder: string; required: boolean; description?: string }[];
}

export const PROVIDER_CAPABILITIES: Record<LensProvider, ProviderCapability> = {
  github: {
    provider: 'github',
    name: 'GitHub',
    category: 'vcs',
    authTypes: ['app_installation', 'pat', 'oauth'],
    features: ['issues', 'pull_requests', 'commits', 'branches', 'webhooks', 'check_runs'],
    docUrl: 'https://docs.github.com/rest',
    configSchema: [
      { key: 'repo', label: 'Default Repository', placeholder: 'owner/repo', required: true, description: 'Default repository identifier' },
      { key: 'installation_id', label: 'App Installation ID', placeholder: '12345678', required: false, description: 'Optional GitHub App Installation ID' },
    ],
  },
  jira: {
    provider: 'jira',
    name: 'Jira Cloud',
    category: 'tracker',
    authTypes: ['oauth', 'pat'],
    features: ['issues', 'projects', 'transitions', 'webhooks', 'field_mapping'],
    docUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
    configSchema: [
      { key: 'site', label: 'Atlassian Site URL', placeholder: 'https://your-org.atlassian.net', required: true },
      { key: 'email', label: 'Service Email', placeholder: 'service@company.com', required: true },
      { key: 'project', label: 'Default Project Key', placeholder: 'HUD', required: true },
      { key: 'issue_type', label: 'Issue Type', placeholder: 'Bug', required: false },
    ],
  },
  linear: {
    provider: 'linear',
    name: 'Linear',
    category: 'tracker',
    authTypes: ['oauth', 'pat'],
    features: ['issues', 'teams', 'cycles', 'webhooks', 'projects'],
    docUrl: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
    configSchema: [
      { key: 'team_id', label: 'Team UUID or Key', placeholder: 'The team UUID from Linear settings', required: true },
    ],
  },
  notion: {
    provider: 'notion',
    name: 'Notion',
    category: 'docs',
    authTypes: ['oauth', 'bot_token'],
    features: ['pages', 'databases', 'release_notes', 'specifications'],
    docUrl: 'https://developers.notion.com/reference/intro',
    configSchema: [
      { key: 'database_id', label: 'Database ID', placeholder: '32-character database UUID', required: false, description: 'Target database for specs and release notes' },
    ],
  },
  slack: {
    provider: 'slack',
    name: 'Slack',
    category: 'chat',
    authTypes: ['bot_token', 'oauth'],
    features: ['channel_notifications', 'thread_links', 'action_triggers', 'interactive_messages'],
    docUrl: 'https://api.slack.com/methods',
    configSchema: [
      { key: 'channel', label: 'Default Notification Channel', placeholder: '#platform-engineering or C01234567', required: true },
    ],
  },
  circleci: {
    provider: 'circleci',
    name: 'CircleCI',
    category: 'ci',
    authTypes: ['pat'],
    features: ['pipeline_status', 'workflow_evidence', 'build_insights'],
    docUrl: 'https://circleci.com/docs/api/v2/',
    configSchema: [
      { key: 'project_slug', label: 'Project Slug', placeholder: 'gh/owner/repo', required: true },
    ],
  },
  gitlab: {
    provider: 'gitlab',
    name: 'GitLab',
    category: 'vcs',
    authTypes: ['pat', 'oauth'],
    features: ['issues', 'merge_requests', 'commits', 'pipelines', 'webhooks'],
    docUrl: 'https://docs.gitlab.com/ee/api/rest/',
    configSchema: [
      { key: 'project_id', label: 'Project ID or Path', placeholder: 'group/project or 12345', required: true },
      { key: 'host', label: 'GitLab Host', placeholder: 'https://gitlab.com', required: false },
    ],
  },
};

/**
 * Universal timeout-safe HTTP dispatcher for external provider requests.
 */
async function callAdapter(
  url: string,
  init: RequestInit,
  provider: LensProvider,
  timeoutMs = 15000,
): Promise<AdapterCallResult> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: c.signal });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      if (typeof data === 'object' && data !== null) {
        detail = data.message || data.error_description || data.error || (Array.isArray(data.errors) ? data.errors.map((e: any) => e.message || e).join('; ') : detail);
      } else if (typeof data === 'string' && data.trim()) {
        detail = data.slice(0, 300);
      }
      return { ok: false, status: res.status, detail, data };
    }

    return { ok: true, status: res.status, detail: 'OK', data };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    return {
      ok: false,
      status: isTimeout ? 504 : 0,
      detail: isTimeout ? `${provider} request timed out after ${timeoutMs / 1000}s` : (err?.message || 'Network error'),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Test credentials and configuration for a connection instance.
 */
export async function testConnectionInstance(
  provider: LensProvider,
  credentialPlain: string,
  config: Record<string, any>,
): Promise<AdapterCallResult> {
  if (!credentialPlain) {
    return { ok: false, status: 400, detail: 'No credential provided to test' };
  }

  switch (provider) {
    case 'github': {
      const repo = config.repo;
      const url = repo ? `https://api.github.com/repos/${repo}` : 'https://api.github.com/user';
      return callAdapter(url, {
        headers: {
          Authorization: `Bearer ${credentialPlain}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Hudumika-Lens/2.0',
        },
      }, 'github');
    }

    case 'jira': {
      const site = (config.site || '').replace(/\/+$/, '');
      if (!site) return { ok: false, status: 400, detail: 'Missing site URL in configuration' };
      const email = config.email || '';
      const auth = email ? Buffer.from(`${email}:${credentialPlain}`).toString('base64') : credentialPlain;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: email ? `Basic ${auth}` : `Bearer ${auth}`,
      };
      return callAdapter(`${site}/rest/api/3/myself`, { headers }, 'jira');
    }

    case 'linear': {
      const query = `query { viewer { id name email } }`;
      return callAdapter('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: credentialPlain.startsWith('lin_api_') ? credentialPlain : `Bearer ${credentialPlain}`,
        },
        body: JSON.stringify({ query }),
      }, 'linear');
    }

    case 'notion': {
      return callAdapter('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${credentialPlain}`,
          'Notion-Version': '2022-06-28',
        },
      }, 'notion');
    }

    case 'slack': {
      return callAdapter('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentialPlain}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }, 'slack');
    }

    case 'circleci': {
      return callAdapter('https://circleci.com/api/v2/me', {
        headers: {
          'Circle-Token': credentialPlain,
          Accept: 'application/json',
        },
      }, 'circleci');
    }

    case 'gitlab': {
      const host = (config.host || 'https://gitlab.com').replace(/\/+$/, '');
      return callAdapter(`${host}/api/v4/user`, {
        headers: {
          'PRIVATE-TOKEN': credentialPlain,
          Accept: 'application/json',
        },
      }, 'gitlab');
    }

    default:
      return { ok: false, status: 400, detail: `Unsupported provider: ${provider}` };
  }
}

/**
 * Dispatch an external issue creation to an upstream provider.
 */
export async function pushToExternalTracker(
  connectionId: string,
  item: { ref: string; title: string; body?: string | null; kind: string; severity: string },
): Promise<{ ok: boolean; external_id?: string; url?: string; detail: string; status: number }> {
  const conn = await dbPlatform.selectFrom('lens_connection_instances')
    .selectAll()
    .where('id', '=', connectionId)
    .executeTakeFirst();

  if (!conn) return { ok: false, status: 404, detail: 'Connection instance not found' };

  let token: string;
  try {
    token = decryptLensCredential(conn.encrypted_credential);
  } catch (err: any) {
    return { ok: false, status: 500, detail: `Credential decryption failed: ${err.message}` };
  }

  const config = (typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config) as Record<string, any>;
  const provider = conn.provider as LensProvider;

  if (provider === 'github') {
    const repo = config.repo;
    if (!repo) return { ok: false, status: 400, detail: 'Configured GitHub connection lacks repo' };
    const r = await callAdapter(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Hudumika-Lens/2.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `[${item.ref}] ${item.title}`,
        body: `${item.body || ''}\n\n---\n*Tracked in Hudumika Lens as ${item.ref} (${item.kind})*`,
        labels: [item.kind.toLowerCase(), `sev:${item.severity.toLowerCase()}`],
      }),
    }, 'github');

    if (!r.ok) return { ok: false, status: r.status, detail: r.detail };
    return {
      ok: true,
      status: 201,
      detail: 'Created',
      external_id: String(r.data.number),
      url: r.data.html_url,
    };
  }

  if (provider === 'linear') {
    const teamId = config.team_id;
    if (!teamId) return { ok: false, status: 400, detail: 'Configured Linear connection lacks team_id' };
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url title }
        }
      }
    `;
    const r = await callAdapter('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token.startsWith('lin_api_') ? token : `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            title: `[${item.ref}] ${item.title}`,
            description: `${item.body || ''}\n\n*Synced from Hudumika Lens: ${item.ref}*`,
            teamId,
          },
        },
      }),
    }, 'linear');

    if (!r.ok) return { ok: false, status: r.status, detail: r.detail };
    const resData = r.data?.data?.issueCreate;
    if (!resData?.success) {
      return { ok: false, status: 400, detail: 'Linear rejected issue creation' };
    }
    return {
      ok: true,
      status: 201,
      detail: 'Created',
      external_id: resData.issue.identifier,
      url: resData.issue.url,
    };
  }

  if (provider === 'jira') {
    const site = (config.site || '').replace(/\/+$/, '');
    const project = config.project;
    if (!site || !project) return { ok: false, status: 400, detail: 'Configured Jira connection lacks site or project' };
    const email = config.email;
    const auth = email ? Buffer.from(`${email}:${token}`).toString('base64') : token;
    const issueType = config.issue_type || 'Task';

    const r = await callAdapter(`${site}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: email ? `Basic ${auth}` : `Bearer ${auth}`,
      },
      body: JSON.stringify({
        fields: {
          project: { key: project },
          summary: `[${item.ref}] ${item.title}`,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: item.body || item.title }],
              },
            ],
          },
          issuetype: { name: issueType },
        },
      }),
    }, 'jira');

    if (!r.ok) return { ok: false, status: r.status, detail: r.detail };
    return {
      ok: true,
      status: 201,
      detail: 'Created',
      external_id: r.data.key,
      url: `${site}/browse/${r.data.key}`,
    };
  }

  return { ok: false, status: 400, detail: `Provider ${provider} does not support issue creation` };
}

/**
 * Dispatch Slack notification.
 */
export async function sendSlackAlert(
  connectionId: string,
  message: { title: string; text: string; fields?: Array<{ title: string; value: string }>; channel?: string },
): Promise<AdapterCallResult> {
  const conn = await dbPlatform.selectFrom('lens_connection_instances')
    .selectAll()
    .where('id', '=', connectionId)
    .executeTakeFirst();

  if (!conn) return { ok: false, status: 404, detail: 'Connection not found' };

  let token: string;
  try {
    token = decryptLensCredential(conn.encrypted_credential);
  } catch (err: any) {
    return { ok: false, status: 500, detail: `Credential decryption failed: ${err.message}` };
  }

  const config = (typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config) as Record<string, any>;
  const channel = message.channel || config.channel;
  if (!channel) return { ok: false, status: 400, detail: 'No destination Slack channel specified' };

  return callAdapter('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel,
      text: `*${message.title}*\n${message.text}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: message.title.slice(0, 150) },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message.text },
        },
        ...(message.fields ? [{
          type: 'section',
          fields: message.fields.map(f => ({ type: 'mrkdwn', text: `*${f.title}*\n${f.value}` })),
        }] : []),
      ],
    }),
  }, 'slack');
}
