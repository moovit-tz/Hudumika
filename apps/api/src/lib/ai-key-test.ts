import { detectAiProvider, AI_PROVIDER_CONFIG } from './ai-providers.js';
import { runAgentLoop } from '../services/agent-runtime.service.js';

/**
 * Backing for SuperAdmin ▸ AI Providers ▸ "Test". Runs the agent's OWN
 * request path (all registered tools, wire names, the provider-specific
 * schema, the model's generation parameters) with a one-word prompt — so a
 * pass means "this key, this model AND our real tool definitions are
 * accepted", not merely "the key is valid". It also exposes the provider's
 * real error text (invalid key, no credits, model not found) instead of the
 * operator discovering it from a failed chat.
 */

/** Removes the key — and a leading fragment of it, since providers often echo
 *  a truncated form ("Invalid API Key: gsk_abcdef***") — from text that is
 *  about to be sent back to a browser. */
export function scrubKey(text: string, key: string): string {
  if (!key) return text;
  let out = text.split(key).join('[key]');
  if (key.length >= 16) out = out.split(key.slice(0, 16)).join('[key]');
  return out;
}

export { providerErrorMessage } from './ai-providers.js';

export interface KeyTestResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

const TEST_TIMEOUT_MS = 20_000;

export async function runProviderKeyTest(params: { provider: string; model?: string; apiKey: string }): Promise<KeyTestResult> {
  const provider = detectAiProvider(params.provider, params.model ?? '');
  const cfg = AI_PROVIDER_CONFIG[provider];
  const model = params.model?.trim() || cfg.defaultModel;
  const started = Date.now();
  const finish = (r: Omit<KeyTestResult, 'provider' | 'model' | 'latencyMs'>): KeyTestResult =>
    ({ provider, model, latencyMs: Date.now() - started, ...r, ...(r.error ? { error: scrubKey(r.error, params.apiKey) } : {}) });

  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      // STAFF + no tenant data: even if a model ignored the prompt and called a
      // tool, policy-gated tools would be held for approval, never executed.
      runAgentLoop('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', params.apiKey, model, provider, 'STAFF',
        [{ role: 'user', content: 'Reply with only the word OK. Do not call any tool.' }]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`No response from ${cfg.label} within ${TEST_TIMEOUT_MS / 1000}s`)), TEST_TIMEOUT_MS); }),
    ]);
    if (result.status === 'completed') return finish({ ok: true, reply: (result.finalText ?? '').trim().slice(0, 80) });
    if (result.status === 'awaiting_approval') return finish({ ok: true, reply: '(the model tried to call a tool instead of answering — key and tools were accepted)' });
    return finish({ ok: false, error: result.errorMessage || `${cfg.label} rejected the request` });
  } catch (err: any) {
    return finish({ ok: false, error: err?.message || 'Request failed' });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
