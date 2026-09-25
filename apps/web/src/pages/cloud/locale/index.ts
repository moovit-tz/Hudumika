import { useMemo } from 'react';
import { browserLocale, makeTranslator, type TranslationDict } from '../../../lib/locale.js';
import { cloudEn } from './en.js';

const DICTS: Record<string, TranslationDict> = {
  en: cloudEn,
};

/** Returns a `t(key, params?)` translator scoped to the Cloud app strings. */
export function useCloudStrings() {
  const locale = browserLocale();
  return useMemo(() => {
    const dict = DICTS[locale] ?? DICTS['en']!;
    return makeTranslator(dict);
  }, [locale]);
}
