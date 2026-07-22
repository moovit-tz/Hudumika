import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../i18n/index.js';

export interface LanguageOption {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English',   nativeLabel: 'English',   flag: '🇬🇧' },
  { code: 'sw', label: 'Swahili',   nativeLabel: 'Kiswahili', flag: '🇹🇿' },
  { code: 'fr', label: 'French',    nativeLabel: 'Français',  flag: '🇫🇷' },
  { code: 'ar', label: 'Arabic',    nativeLabel: 'العربية',    flag: '🇸🇦' },
  { code: 'pt', label: 'Portuguese',nativeLabel: 'Português', flag: '🇵🇹' },
  { code: 'zh', label: 'Chinese',   nativeLabel: '中文',       flag: '🇨🇳' },
];

export function useLocale() {
  const { t, i18n } = useTranslation();
  const language = (i18n.language?.slice(0, 2) as SupportedLocale) || 'en';

  function setLanguage(code: SupportedLocale) {
    i18n.changeLanguage(code);
    localStorage.setItem('hudumika_locale', code);
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
  }

  return { t, language, setLanguage, LANGUAGES };
}
