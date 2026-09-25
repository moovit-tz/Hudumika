/**
 * Minimal platform locale system.
 *
 * Currently supports only 'en'. The hook reads the user's browser language
 * preference (navigator.language) and falls back to 'en'. Callers get a
 * `t(key, params?)` function that resolves against the provided dictionary;
 * unknown keys fall back to the key itself so a missing translation never
 * silently breaks the UI.
 *
 * To add a new language: add a matching dictionary in the consuming module
 * and extend the `LOCALES` map there.
 */

export type TranslationDict = Record<string, string>;

/** Resolve :param placeholders in a template string. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/:(\w+)/g, (_, key) => String(params[key] ?? `:${key}`));
}

/** Build a `t()` function from a dictionary. */
export function makeTranslator(dict: TranslationDict) {
  return function t(key: string, params?: Record<string, string | number>): string {
    const template = dict[key] ?? key;
    return interpolate(template, params);
  };
}

/** Derive a two-letter language code from the browser's language setting. */
export function browserLocale(): string {
  try {
    const lang = navigator.language ?? 'en';
    return lang.split('-')[0]?.toLowerCase() ?? 'en';
  } catch {
    return 'en';
  }
}
