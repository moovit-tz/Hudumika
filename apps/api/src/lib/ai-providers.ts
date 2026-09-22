/**
 * Every provider Hudumika's AI features (ai.routes.ts, agent-runtime.service.ts)
 * can call. Anthropic and OpenAI are the two the codebase already spoke —
 * Groq and Google are added here specifically because both offer a genuinely
 * free, no-credit-card API key (console.groq.com / aistudio.google.com),
 * unblocking testing without a paid Anthropic/OpenAI account.
 *
 * Groq and Google's Gemini both expose an OpenAI-compatible chat/completions
 * endpoint (including tool-calling), so they need no new wire-format code —
 * only a different base URL and a wider set of recognized model names. Only
 * Anthropic's native Messages API has a genuinely different shape, kept as
 * its own 'anthropic' kind.
 */

export const AI_PROVIDERS = ['anthropic', 'openai', 'groq', 'google'] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

interface AiProviderConfig {
  kind: 'anthropic' | 'openai-compatible';
  /** Full chat/completions URL for an 'openai-compatible' provider; unused for 'anthropic'. */
  baseUrl: string;
  authHeaders(apiKey: string): Record<string, string>;
  defaultModel: string;
  freeTier: boolean;
  label: string;
  /** Rewrites a tool's JSON Schema into what this provider is documented to accept. Omitted = send the full schema as-is. */
  toolSchema?(schema: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Gemini's function-calling docs (ai.google.dev, Sept 2026) list only basic
 * types, properties, required and enum — they say nothing about format,
 * default, additionalProperties or anyOf, and Gemini's native schema type is
 * an OpenAPI subset that has rejected such keywords before. Rather than
 * gamble on the compatibility layer's tolerance, drop them for Gemini only
 * and fold what they said into the field's description, so the model still
 * learns "this is a uuid" / "defaults to false". Execution is unaffected:
 * every tool re-validates with its real zod schema regardless.
 */
export function simplifySchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const clean = (node: any): any => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;

    // anyOf: [X, {type:'null'}]  ->  X + nullable
    if (Array.isArray(node.anyOf)) {
      const nonNull = node.anyOf.filter((s: any) => s?.type !== 'null');
      if (nonNull.length === 1) {
        const { anyOf: _drop, ...rest } = node;
        return clean({ ...nonNull[0], ...rest, nullable: true });
      }
    }

    const out: Record<string, unknown> = {};
    const hints: string[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' && value && typeof value === 'object') {
        // keys here are property NAMES, not schema keywords — never strip them
        out.properties = Object.fromEntries(Object.entries(value as object).map(([name, sub]) => [name, clean(sub)]));
      } else if (key === 'format') hints.push(`format: ${String(value)}`);
      else if (key === 'default') hints.push(`defaults to ${JSON.stringify(value)}`);
      else if (key === 'additionalProperties' || key === '$schema') continue;
      else if (key === 'anyOf') out.anyOf = clean(value); // multi-type union we can't simplify — keep, it's rare
      else out[key] = clean(value);
    }
    if (hints.length) {
      const base = typeof out.description === 'string' ? out.description + ' ' : '';
      out.description = `${base}(${hints.join(', ')})`;
    }
    return out;
  };
  return clean(schema);
}

export const AI_PROVIDER_CONFIG: Record<AiProvider, AiProviderConfig> = {
  anthropic: {
    kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeaders: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    // Haiku 4.5 (the previous default) has a retirement window opening 2026-10-15 per
    // platform.claude.com/docs/en/models/overview; Sonnet 5 is the current "speed and intelligence" model.
    defaultModel: 'claude-sonnet-5', freeTier: false, label: 'Anthropic',
  },
  openai: {
    kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeaders: (k) => ({ Authorization: `Bearer ${k}` }),
    // gpt-5.6-luna: OpenAI's documented cost-sensitive, high-volume model with function calling.
    defaultModel: 'gpt-5.6-luna', freeTier: false, label: 'OpenAI',
  },
  groq: {
    kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    authHeaders: (k) => ({ Authorization: `Bearer ${k}` }),
    defaultModel: 'llama-3.3-70b-versatile', freeTier: true, label: 'Groq (free)',
  },
  google: {
    kind: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    authHeaders: (k) => ({ Authorization: `Bearer ${k}` }),
    // gemini-2.0-flash was scheduled for shutdown on 2026-06-01 (ai.google.dev/gemini-api/docs/deprecations);
    // gemini-3.8-flash is the page's current recommendation.
    defaultModel: 'gemini-3.8-flash', freeTier: true, label: 'Google Gemini (free)',
    toolSchema: simplifySchemaForGemini,
  },
};

/** An explicit, recognized provider value always wins. Otherwise, inferred
 *  from the model name — the convention this codebase already used for
 *  anthropic-vs-openai before this file existed (`model.startsWith('claude')`),
 *  now extended to the two new providers' model-name conventions. Falls back
 *  to 'openai' last, matching the original code's own fallback. */
export function detectAiProvider(explicit: string | undefined | null, model: string): AiProvider {
  if (explicit && (AI_PROVIDERS as readonly string[]).includes(explicit)) return explicit as AiProvider;
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'google';
  // Groq hosts other vendors' models under namespaced ids (openai/gpt-oss-120b, qwen/…) — those are not OpenAI's own API.
  if (model.includes('/')) return 'groq';
  if (/^(llama|mixtral|gemma|deepseek|qwen)/.test(model)) return 'groq';
  return 'openai';
}

/**
 * Token-limit and sampling fields for a chat request, per provider + model.
 * Sending a parameter a model rejects is a hard 400, while omitting one is
 * always accepted — so where the rule is documented or unknown, omit.
 *
 *  - Claude Sonnet 5 / Opus 5 (and newer): setting temperature/top_p/top_k to
 *    a non-default value returns 400 (platform.claude.com/docs/en/models/
 *    sonnet-5/overview). Only the older families known to accept it get it.
 *  - OpenAI's GPT-5 family / o-series take max_completion_tokens and a fixed
 *    temperature; GPT-4-era models keep max_tokens + temperature. (OpenAI's
 *    model pages don't state this; it follows the API's long-standing
 *    behaviour for those families.)
 *  - Groq and Gemini's OpenAI-compatible layers accept max_tokens/temperature.
 */
export function generationParams(provider: AiProvider, model: string, maxTokens: number, temperature = 0.3): Record<string, number> {
  if (provider === 'anthropic') {
    const acceptsSampling = /^claude-(haiku-4|sonnet-4-[0-6]|opus-4-[0-6])/.test(model);
    return { max_tokens: maxTokens, ...(acceptsSampling ? { temperature } : {}) };
  }
  if (provider === 'openai' && /^(gpt-5|o\d)/.test(model)) return { max_completion_tokens: maxTokens };
  return { max_tokens: maxTokens, temperature };
}

/** A provider error body → one readable line. Handles the common
 *  { error: { message } } shape and Gemini's array-wrapped [{ error: {...} }]. */
export function providerErrorMessage(body: unknown, status: number, label: string): string {
  const first = Array.isArray(body) ? body[0] : body;
  const msg = (first as any)?.error?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
  return `${label} error ${status}`;
}
