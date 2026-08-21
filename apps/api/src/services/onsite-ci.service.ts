/**
 * Onsite's CI provider seam.
 *
 * A deployment used to be a lie. POST /applications/:id/deploy inserted a row,
 * set a 1.5-second setTimeout, and then wrote `status: 'succeeded'`,
 * `application.status: 'active'` and a `current_version` of
 * `v1.0.${Date.now()/1000 % 10000}`. Nothing was built, nothing was shipped,
 * and no CI system was ever contacted — but the console told you your
 * application was deployed and running. That is the worst thing an
 * infrastructure control plane can do, because the whole reason to look at one
 * is to find out what is actually true about production.
 *
 * Onsite is a control plane, not an infrastructure provider (ONSITE.md §97):
 * it asks a real provider to do the work and reports what the provider says.
 * So this file is the seam, not the implementation. `CIProvider` is the
 * contract; CircleCI is the first implementation because it is the CI system
 * Hudumika already uses (see lens-integration.service.ts, which talks to the
 * same v2 API for Lens).
 *
 * When no provider is connected, `resolveCIProvider` returns null and the
 * caller must refuse the deployment. It must never invent one.
 */
import { withTenant } from '../db/client.js';
import { decryptSecret, decryptJson } from './onsite-secrets.service.js';

export type CIStatus = 'queued' | 'building' | 'deploying' | 'succeeded' | 'failed' | 'cancelled';

export interface CIPipelineRef {
  /** The provider's own id for the run, stored in onsite_deployments.ci_pipeline_id. */
  id: string;
  /** A link a human can open. Null when the provider gives us no usable URL. */
  url: string | null;
}

export interface CIPipelineState {
  status: CIStatus;
  url: string | null;
  /** The provider's own explanation when it failed. Never invented here. */
  error: string | null;
}

export interface CIProvider {
  key: string;
  label: string;
  /** Ask the provider to run a pipeline. Throws with the provider's message on refusal. */
  trigger(opts: { branch: string; tag?: string | null }): Promise<CIPipelineRef>;
  /** What the provider says about a run now. Null when it cannot say yet. */
  poll(pipelineId: string): Promise<CIPipelineState | null>;
}

/**
 * CircleCI's own vocabulary, mapped onto the states onsite_deployments accepts.
 *
 * `created` and `pending` are both "the provider has it but has not started",
 * which is `queued` here. Anything unrecognised is deliberately left out of
 * this map so it falls through to null and the deployment keeps its current
 * status rather than being guessed at.
 */
const CIRCLECI_WORKFLOW_STATUS: Record<string, CIStatus> = {
  success: 'succeeded',
  failed: 'failed',
  error: 'failed',
  failing: 'building',
  running: 'building',
  on_hold: 'queued',
  not_run: 'cancelled',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  unauthorized: 'failed',
};

class CircleCIProvider implements CIProvider {
  key = 'circleci';
  label = 'CircleCI';

  constructor(private token: string, private projectSlug: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://circleci.com/api/v2${path}`, {
      ...init,
      headers: {
        'Circle-Token': this.token,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep the raw text below */ }
    if (!res.ok) {
      // The provider's own words, not a summary of them — a deployment that
      // failed because a token expired should say so.
      const detail = body?.message || text?.slice(0, 300) || `HTTP ${res.status}`;
      throw new Error(`CircleCI: ${detail}`);
    }
    return body;
  }

  async trigger({ branch, tag }: { branch: string; tag?: string | null }): Promise<CIPipelineRef> {
    const body = await this.api(`/project/${encodeURIComponent(this.projectSlug)}/pipeline`, {
      method: 'POST',
      body: JSON.stringify(tag ? { tag } : { branch }),
    });
    if (!body?.id) throw new Error('CircleCI accepted the request but returned no pipeline id.');
    return {
      id: String(body.id),
      url: body.number ? `https://app.circleci.com/pipelines/${this.projectSlug}/${body.number}` : null,
    };
  }

  async poll(pipelineId: string): Promise<CIPipelineState | null> {
    // A pipeline's state is the state of its workflows; the pipeline object
    // itself only reports whether CircleCI managed to *create* it.
    const wf = await this.api(`/pipeline/${encodeURIComponent(pipelineId)}/workflow`);
    const items: any[] = Array.isArray(wf?.items) ? wf.items : [];
    if (items.length === 0) return null;

    const mapped = items
      .map(w => CIRCLECI_WORKFLOW_STATUS[String(w.status)])
      .filter(Boolean) as CIStatus[];
    if (mapped.length === 0) return null;

    // Worst-case wins, so a pipeline is not called succeeded while one of its
    // workflows is still running or has already failed.
    const rank: CIStatus[] = ['failed', 'cancelled', 'building', 'deploying', 'queued', 'succeeded'];
    const status = rank.find(s => mapped.includes(s)) ?? 'queued';

    const failed = items.find(w => ['failed', 'error', 'unauthorized'].includes(String(w.status)));
    const url = items[0]?.id
      ? `https://app.circleci.com/pipelines/workflows/${items[0].id}`
      : null;

    return {
      status,
      url,
      error: failed ? `CircleCI workflow "${failed.name ?? failed.id}" reported ${failed.status}.` : null,
    };
  }
}

/**
 * The CI provider this tenant has connected, or null.
 *
 * Null is a real answer and callers must handle it by refusing to deploy. The
 * credential is read from onsite_provider_connections and decrypted here so it
 * never leaves this module — never returned, never logged, never put in an API
 * response.
 */
/** Every provider this seam knows how to run a deployment through — checked
 *  in this order when a tenant has more than one connected. */
const SUPPORTED_CI_PROVIDERS = ['circleci', 'github', 'cloudflare', 'digitalocean'] as const;

export async function resolveCIProvider(tenantId: string): Promise<CIProvider | null> {
  const rows = await withTenant(tenantId, trx => trx.selectFrom('onsite_provider_connections')
    .select(['provider', 'access_token_cipher', 'config_cipher', 'external_id', 'status'])
    .where('tenant_id', '=', tenantId)
    .where('provider', 'in', [...SUPPORTED_CI_PROVIDERS])
    // 'active' is the word onsite_provider_connections actually uses — its
    // CHECK constraint allows active/revoked/error/pending, and the create
    // route writes 'active'. Filtering on a status the column cannot hold
    // matches nothing, which would have made every deployment report "no CI
    // provider is connected" no matter how many were.
    .where('status', '=', 'active')
    .execute());

  for (const providerKey of SUPPORTED_CI_PROVIDERS) {
    const row = rows.find(r => r.provider === providerKey);
    if (!row?.access_token_cipher) continue;

    let token: string;
    try {
      token = decryptSecret(row.access_token_cipher);
    } catch {
      // A credential that cannot be decrypted is the same as not having one —
      // and saying so beats deploying with an empty token and blaming the provider.
      continue;
    }
    if (!token) continue;

    // "External ID" carries whatever this provider needs to identify a
    // single project, in a fixed slash-delimited shape per provider — the
    // same generic field CircleCI's own project_slug already used, not a
    // new concept.
    let externalId = row.external_id ?? '';
    if (!externalId && row.config_cipher) {
      try { externalId = String(decryptJson(row.config_cipher).project_slug ?? ''); } catch { /* below */ }
    }
    if (!externalId) continue;

    switch (providerKey) {
      case 'circleci':
        return new CircleCIProvider(token, externalId);
      case 'github': {
        const [owner, repo, workflowId] = externalId.split('/');
        if (!owner || !repo) continue;
        return new GitHubActionsProvider(token, owner, repo, workflowId || 'deploy.yml');
      }
      case 'cloudflare': {
        const [accountId, projectName] = externalId.split('/');
        if (!accountId || !projectName) continue;
        return new CloudflarePagesProvider(token, accountId, projectName);
      }
      case 'digitalocean':
        return new DigitalOceanAppPlatformProvider(token, externalId);
    }
  }

  return null;
}

/**
 * Does this credential actually work?
 *
 * Connecting a provider used to write `status: 'active'` and stamp
 * `last_verified_at` with the current time without contacting anything, so the
 * console reported a live, verified connection for a credential that might be
 * a typo. This asks the provider, and the answer is whatever it says.
 *
 * A provider with no verification path returns ok:false rather than a cheerful
 * default — an unverifiable connection is not a verified one.
 */
export async function verifyProviderConnection(
  provider: string,
  token: string,
): Promise<{ ok: boolean; detail: string; accountName?: string }> {
  try {
    switch (provider) {
      case 'circleci': {
        // The same endpoint lens-integration.service.ts uses to test its own
        // CircleCI credential.
        const res = await fetch('https://circleci.com/api/v2/me', { headers: { 'Circle-Token': token } });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, detail: `CircleCI rejected the token (HTTP ${res.status}). ${text.slice(0, 200)}` };
        }
        let name: string | undefined;
        try { name = JSON.parse(text)?.name ?? undefined; } catch { /* the check passed either way */ }
        return { ok: true, detail: 'Verified with CircleCI.', accountName: name };
      }
      case 'github': {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, detail: `GitHub rejected the token (HTTP ${res.status}). ${text.slice(0, 200)}` };
        }
        let name: string | undefined;
        try { name = JSON.parse(text)?.login ?? undefined; } catch { /* the check passed either way */ }
        return { ok: true, detail: 'Verified with GitHub.', accountName: name };
      }
      case 'cloudflare': {
        const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { /* keep raw text below */ }
        if (!res.ok || body?.success === false) {
          return { ok: false, detail: `Cloudflare rejected the token: ${body?.errors?.[0]?.message || text.slice(0, 200)}` };
        }
        return { ok: true, detail: 'Verified with Cloudflare.', accountName: body?.result?.id };
      }
      case 'digitalocean': {
        const res = await fetch('https://api.digitalocean.com/v2/account', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, detail: `DigitalOcean rejected the token (HTTP ${res.status}). ${text.slice(0, 200)}` };
        }
        let email: string | undefined;
        try { email = JSON.parse(text)?.account?.email ?? undefined; } catch { /* the check passed either way */ }
        return { ok: true, detail: 'Verified with DigitalOcean.', accountName: email };
      }
      default:
        return {
          ok: false,
          detail: `Onsite cannot verify a "${provider}" credential yet, so this connection is saved but unverified.`,
        };
    }
  } catch (err: any) {
    // Unreachable is not the same as invalid, and the message says which.
    return { ok: false, detail: `Could not reach ${provider} to verify the credential: ${err?.message ?? err}` };
  }
}

/**
 * GitHub Actions — workflow_dispatch has no synchronous return of a run id
 * (the API answers 204 with an empty body), so trigger() dispatches and
 * then looks up the run GitHub just created by branch + recency. A short
 * poll loop, not a guess: the run is not always visible in the list
 * endpoint on the very first read after dispatch.
 */
const GITHUB_RUN_STATUS: Record<string, CIStatus> = {
  queued: 'queued',
  in_progress: 'building',
  waiting: 'queued',
  requested: 'queued',
};
const GITHUB_CONCLUSION: Record<string, CIStatus> = {
  success: 'succeeded',
  failure: 'failed',
  cancelled: 'cancelled',
  timed_out: 'failed',
  action_required: 'failed',
  neutral: 'succeeded',
  skipped: 'cancelled',
  stale: 'cancelled',
};

class GitHubActionsProvider implements CIProvider {
  key = 'github';
  label = 'GitHub Actions';

  /** externalId is "owner/repo" or "owner/repo/workflow_id" — workflow_id
   *  defaults to "deploy.yml" when omitted, since GitHub has no concept of
   *  "the" workflow for a repo and something has to be dispatched. */
  constructor(private token: string, owner: string, repo: string, private workflowId: string) {
    this.owner = owner;
    this.repo = repo;
  }
  private owner: string;
  private repo: string;

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  async trigger({ branch, tag }: { branch: string; tag?: string | null }): Promise<CIPipelineRef> {
    const ref = tag || branch;
    const res = await this.api(
      `/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(this.workflowId)}/dispatches`,
      { method: 'POST', body: JSON.stringify({ ref }) },
    );
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try { detail = JSON.parse(text)?.message ?? text; } catch { /* keep raw text */ }
      throw new Error(`GitHub Actions: ${detail || `HTTP ${res.status}`}`);
    }

    // Dispatch is fire-and-forget from GitHub's side — find the run it just
    // created rather than inventing an id. A few short retries: the run
    // isn't always listed instantly.
    const dispatchedAt = Date.now();
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      const listRes = await this.api(
        `/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(this.workflowId)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=5`,
      );
      if (!listRes.ok) continue;
      const body = await listRes.json();
      const run = (body?.workflow_runs ?? []).find((r: any) => new Date(r.created_at).getTime() >= dispatchedAt - 5000);
      if (run) return { id: String(run.id), url: run.html_url ?? null };
    }
    throw new Error('GitHub Actions accepted the dispatch but no matching run appeared yet — check the Actions tab directly.');
  }

  async poll(pipelineId: string): Promise<CIPipelineState | null> {
    const res = await this.api(`/repos/${this.owner}/${this.repo}/actions/runs/${encodeURIComponent(pipelineId)}`);
    if (!res.ok) return null;
    const run = await res.json();
    if (!run?.status) return null;

    const status = run.conclusion
      ? (GITHUB_CONCLUSION[run.conclusion] ?? 'failed')
      : (GITHUB_RUN_STATUS[run.status] ?? 'building');

    return {
      status,
      url: run.html_url ?? null,
      error: run.conclusion && run.conclusion !== 'success'
        ? `GitHub Actions run finished with conclusion "${run.conclusion}".`
        : null,
    };
  }
}

/** Cloudflare Pages — a Pages "deployment" is created from whatever's on
 *  the connected branch at trigger time, so branch/tag beyond ensuring the
 *  right branch is configured on the project isn't part of this call;
 *  Cloudflare decides what it builds from the project's own settings. */
const CLOUDFLARE_STAGE_STATUS: Record<string, CIStatus> = {
  success: 'succeeded',
  failure: 'failed',
  canceled: 'cancelled',
  active: 'building',
  idle: 'queued',
};

class CloudflarePagesProvider implements CIProvider {
  key = 'cloudflare';
  label = 'Cloudflare Pages';

  constructor(private token: string, private accountId: string, private projectName: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success === false) {
      const detail = body?.errors?.[0]?.message || `HTTP ${res.status}`;
      throw new Error(`Cloudflare Pages: ${detail}`);
    }
    return body?.result;
  }

  async trigger(): Promise<CIPipelineRef> {
    const result = await this.api(
      `/accounts/${this.accountId}/pages/projects/${encodeURIComponent(this.projectName)}/deployments`,
      { method: 'POST' },
    );
    if (!result?.id) throw new Error('Cloudflare Pages accepted the request but returned no deployment id.');
    return { id: String(result.id), url: result.url ?? null };
  }

  async poll(pipelineId: string): Promise<CIPipelineState | null> {
    const result = await this.api(
      `/accounts/${this.accountId}/pages/projects/${encodeURIComponent(this.projectName)}/deployments/${encodeURIComponent(pipelineId)}`,
    );
    const stage = result?.latest_stage;
    if (!stage?.status) return null;
    return {
      status: CLOUDFLARE_STAGE_STATUS[String(stage.status)] ?? 'building',
      url: result.url ?? null,
      error: stage.status === 'failure' ? `Cloudflare Pages stage "${stage.name}" failed.` : null,
    };
  }
}

/** DigitalOcean App Platform. */
const DO_PHASE_STATUS: Record<string, CIStatus> = {
  PENDING_BUILD: 'queued',
  BUILDING: 'building',
  PENDING_DEPLOY: 'deploying',
  DEPLOYING: 'deploying',
  ACTIVE: 'succeeded',
  ERROR: 'failed',
  CANCELED: 'cancelled',
  SUPERSEDED: 'cancelled',
};

class DigitalOceanAppPlatformProvider implements CIProvider {
  key = 'digitalocean';
  label = 'DigitalOcean App Platform';

  constructor(private token: string, private appId: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://api.digitalocean.com/v2${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep raw text below */ }
    if (!res.ok) {
      throw new Error(`DigitalOcean App Platform: ${body?.message || text?.slice(0, 300) || `HTTP ${res.status}`}`);
    }
    return body;
  }

  async trigger(): Promise<CIPipelineRef> {
    const body = await this.api(`/apps/${this.appId}/deployments`, { method: 'POST', body: JSON.stringify({}) });
    const deployment = body?.deployment;
    if (!deployment?.id) throw new Error('DigitalOcean accepted the request but returned no deployment id.');
    return { id: String(deployment.id), url: `https://cloud.digitalocean.com/apps/${this.appId}/deployments/${deployment.id}` };
  }

  async poll(pipelineId: string): Promise<CIPipelineState | null> {
    const body = await this.api(`/apps/${this.appId}/deployments/${pipelineId}`);
    const deployment = body?.deployment;
    if (!deployment?.phase) return null;
    return {
      status: DO_PHASE_STATUS[String(deployment.phase)] ?? 'building',
      url: `https://cloud.digitalocean.com/apps/${this.appId}/deployments/${pipelineId}`,
      error: deployment.phase === 'ERROR' ? (deployment.progress?.error_steps?.[0]?.reason ?? 'DigitalOcean reported a deployment error.') : null,
    };
  }
}

/** Why a deployment cannot start, in words a user can act on. */
export const NO_CI_PROVIDER_MESSAGE =
  'No CI provider is connected for this workspace, so there is nothing to run the build. '
  + 'Connect one under Onsite → Settings → Provider connections, then deploy again.';
