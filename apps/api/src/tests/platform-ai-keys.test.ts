// Per-provider platform AI keys: the stored shape is
//   ai: { enabled, provider (the default), model, providers: { <provider>: { apiKey (encrypted), model } } }
// with the older single-key shape (ai.apiKey for ai.provider) still readable.
// Pure logic only — no database.
import { describe, it, expect } from 'vitest';
import { normalizeAiSettings, mergeAiForSave, maskAiForClient } from '../lib/platform-settings.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';

describe('normalizeAiSettings', () => {
  it('reads the legacy single-key shape as a key for its own provider', () => {
    const n = normalizeAiSettings({ enabled: true, provider: 'anthropic', model: 'claude-haiku-4-5-20251001', apiKey: 'CIPHER' });
    expect(n.providers.anthropic).toEqual({ apiKey: 'CIPHER', model: 'claude-haiku-4-5-20251001' });
    expect(n.provider).toBe('anthropic');
    expect(n.enabled).toBe(true);
  });
  it('a legacy key with no provider is attributed by the model name', () => {
    expect(normalizeAiSettings({ apiKey: 'C', model: 'llama-3.3-70b-versatile' }).providers.groq?.apiKey).toBe('C');
  });
  it('reads the new shape and ignores unknown providers', () => {
    const n = normalizeAiSettings({ provider: 'groq', providers: { groq: { apiKey: 'G', model: 'm' }, madeup: { apiKey: 'X' } } });
    expect(Object.keys(n.providers)).toEqual(['groq']);
  });
  it('an explicit per-provider entry wins over the legacy key for that provider', () => {
    const n = normalizeAiSettings({ provider: 'anthropic', apiKey: 'OLD', providers: { anthropic: { apiKey: 'NEW' } } });
    expect(n.providers.anthropic?.apiKey).toBe('NEW');
  });
  it('is safe on nothing at all', () => {
    expect(normalizeAiSettings(undefined).providers).toEqual({});
    expect(normalizeAiSettings(null).enabled).toBe(false);
  });
});

describe('maskAiForClient', () => {
  it('never returns any key — every stored key becomes the mask, and the legacy field disappears', () => {
    const stored = { enabled: true, provider: 'anthropic', model: 'm', apiKey: encryptSecret('sk-legacy'), providers: { groq: { apiKey: encryptSecret('gsk-1'), model: 'llama-3.3-70b-versatile' } } };
    const out = maskAiForClient(stored) as any;
    const text = JSON.stringify(out);
    expect(text).not.toContain('sk-legacy');
    expect(text).not.toContain('gsk-1');
    expect(text).not.toContain(stored.apiKey);
    expect(out).not.toHaveProperty('apiKey');
    expect(out.providers.anthropic.apiKey).toBe(MASKED_VALUE); // the legacy key surfaces under its provider
    expect(out.providers.groq.apiKey).toBe(MASKED_VALUE);
    expect(out.providers.groq.model).toBe('llama-3.3-70b-versatile');
  });
  it('a provider with no key carries an empty key, not the mask', () => {
    expect((maskAiForClient({ providers: { google: { model: 'gemini-3.8-flash' } } }) as any).providers.google.apiKey).toBe('');
  });
});

describe('mergeAiForSave', () => {
  const existing = { provider: 'anthropic', apiKey: encryptSecret('sk-existing-legacy'), providers: { groq: { apiKey: encryptSecret('gsk-existing'), model: 'llama-3.3-70b-versatile' } } };
  const plain = (enc: string | undefined) => (enc ? decryptSecret(enc) : undefined);

  it('a still-masked key means "unchanged" — the real stored key is kept (incl. one that was in the legacy field)', () => {
    const out = mergeAiForSave({ enabled: true, provider: 'groq', providers: { anthropic: { apiKey: MASKED_VALUE, model: 'claude-sonnet-5' }, groq: { apiKey: MASKED_VALUE, model: 'llama-3.3-70b-versatile' } } }, existing) as any;
    expect(plain(out.providers.anthropic.apiKey)).toBe('sk-existing-legacy');
    expect(plain(out.providers.groq.apiKey)).toBe('gsk-existing');
    expect(out).not.toHaveProperty('apiKey'); // legacy field is retired once folded in
  });
  it('a newly typed key is encrypted, never stored in plaintext', () => {
    const out = mergeAiForSave({ enabled: true, provider: 'google', providers: { google: { apiKey: 'AIza-new-key', model: 'gemini-3.8-flash' } } }, undefined) as any;
    expect(out.providers.google.apiKey).not.toContain('AIza-new-key');
    expect(plain(out.providers.google.apiKey)).toBe('AIza-new-key');
  });
  it('changing one provider leaves the others untouched', () => {
    const out = mergeAiForSave({ enabled: true, provider: 'groq', providers: {
      anthropic: { apiKey: MASKED_VALUE }, groq: { apiKey: MASKED_VALUE }, google: { apiKey: 'AIza-added', model: 'gemini-3.8-flash' } } }, existing) as any;
    expect(Object.keys(out.providers).sort()).toEqual(['anthropic', 'google', 'groq']);
    expect(plain(out.providers.groq.apiKey)).toBe('gsk-existing');
  });
  it('an empty key removes that provider\'s key', () => {
    const out = mergeAiForSave({ enabled: true, provider: 'groq', providers: { anthropic: { apiKey: '' }, groq: { apiKey: MASKED_VALUE, model: 'm' } } }, existing) as any;
    expect(out.providers.anthropic?.apiKey).toBeUndefined();
    expect(plain(out.providers.groq.apiKey)).toBe('gsk-existing');
  });
  it('a mask with nothing stored behind it stores nothing (never the literal mask text as a key)', () => {
    const out = mergeAiForSave({ provider: 'openai', providers: { openai: { apiKey: MASKED_VALUE } } }, undefined) as any;
    expect(out.providers.openai?.apiKey).toBeUndefined();
  });
  it('an old client still sending the single-key shape keeps working', () => {
    const out = mergeAiForSave({ enabled: true, provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'sk-openai-typed' }, undefined) as any;
    expect(plain(out.providers.openai.apiKey)).toBe('sk-openai-typed');
    expect(out.providers.openai.model).toBe('gpt-5.6-luna');
  });
  it('records the default provider and its model', () => {
    const out = mergeAiForSave({ enabled: true, provider: 'groq', providers: { groq: { apiKey: 'k', model: 'openai/gpt-oss-120b' } } }, undefined) as any;
    expect(out.provider).toBe('groq');
    expect(out.model).toBe('openai/gpt-oss-120b');
    expect(out.enabled).toBe(true);
  });
});
