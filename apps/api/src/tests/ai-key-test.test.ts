// The SuperAdmin "Test" button reports a provider's own error text back to the
// browser. That text must never carry the key being tested, and Gemini's
// OpenAI-compatible layer can return errors as an ARRAY, not an object.
import { describe, it, expect } from 'vitest';
import { scrubKey, providerErrorMessage } from '../lib/ai-key-test.js';

describe('scrubKey', () => {
  it('removes the key wherever it appears, including inside a Bearer header echo', () => {
    const key = 'sk-ant-api03-SECRETVALUE1234567890';
    const out = scrubKey(`Invalid key ${key}; header was Authorization: Bearer ${key} (again ${key})`, key);
    expect(out).not.toContain('SECRETVALUE');
    expect(out).toContain('[key]');
  });
  it('also hides a leading fragment of the key (providers often echo a truncated form)', () => {
    const key = 'gsk_abcdefghijklmnopqrstuvwxyz0123456789';
    expect(scrubKey('Invalid API Key: gsk_abcdefghijklmnopqrst***', key)).not.toContain('gsk_abcdefghijklmnopqrst');
  });
  it('leaves an unrelated message alone and tolerates an empty key', () => {
    expect(scrubKey('Your credit balance is too low', 'k')).toBe('Your credit balance is too low');
    expect(scrubKey('nothing to hide', '')).toBe('nothing to hide');
  });
});

describe('providerErrorMessage', () => {
  it('reads the Anthropic / OpenAI / Groq shape', () => {
    expect(providerErrorMessage({ error: { message: 'Your credit balance is too low' } }, 400, 'Anthropic')).toBe('Your credit balance is too low');
  });
  it("reads Gemini's array-wrapped shape", () => {
    expect(providerErrorMessage([{ error: { message: 'API key not valid. Please pass a valid API key.' } }], 400, 'Google Gemini')).toBe('API key not valid. Please pass a valid API key.');
  });
  it('falls back to a plain status message rather than "undefined" for an unreadable body', () => {
    expect(providerErrorMessage(null, 502, 'Groq')).toBe('Groq error 502');
    expect(providerErrorMessage({ weird: true }, 500, 'OpenAI')).toBe('OpenAI error 500');
    expect(providerErrorMessage('plain text body', 503, 'OpenAI')).toBe('plain text body');
  });
});
