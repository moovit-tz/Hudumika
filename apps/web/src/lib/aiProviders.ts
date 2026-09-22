/**
 * Mirrors apps/api/src/lib/ai-providers.ts's AI_PROVIDER_CONFIG — the display
 * side (labels + selectable models) for both places a provider/model gets
 * picked: the tenant's own BYOK config (Settings.tsx's AI Integration
 * section) and the SuperAdmin platform-default key (SuperAdmin.tsx's AI
 * Provider settings tab). Kept in one file so the two pickers can't drift on
 * which models exist for which provider.
 */
export interface AiProviderOption {
  value: string;
  label: string;
  models: { value: string; label: string }[];
}

export const AI_PROVIDERS: AiProviderOption[] = [
  // Model ids below were checked against each provider's own docs in Sept 2026
  // (platform.claude.com/docs/en/models/overview, console.groq.com/docs/models,
  // ai.google.dev/gemini-api/docs/models + /deprecations, developers.openai.com).
  // The first entry of each provider is what a provider switch selects.
  // Entries marked "older" were not confirmed either way in those docs; they
  // stay only so a tenant's already-saved choice still displays.
  { value: 'anthropic', label: 'Anthropic', models: [
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Recommended)' },
    { value: 'claude-opus-5', label: 'Claude Opus 5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (retiring Oct 2026)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (legacy)' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (legacy)' },
  ] },
  { value: 'openai', label: 'OpenAI', models: [
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra (Recommended)' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (low cost)' },
    { value: 'gpt-4o', label: 'GPT-4o (older)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (older)' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (older)' },
  ] },
  { value: 'groq', label: 'Groq — free API key at console.groq.com', models: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended)' },
    { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
    { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Fast)' },
  ] },
  { value: 'google', label: 'Google Gemini — free API key at aistudio.google.com', models: [
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Recommended)' },
    { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Fast)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ] },
];
