import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en/common.js';
import sw from '../locales/sw/common.js';
import fr from '../locales/fr/common.js';
import ar from '../locales/ar/common.js';
import pt from '../locales/pt/common.js';
import zh from '../locales/zh/common.js';

export const SUPPORTED_LOCALES = ['en', 'sw', 'fr', 'ar', 'pt', 'zh'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function resolveInitialLocale(): SupportedLocale {
  const stored = localStorage.getItem('hudumika_locale');
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) return stored as SupportedLocale;
  const browser = navigator.language?.slice(0, 2);
  if (browser && (SUPPORTED_LOCALES as readonly string[]).includes(browser)) return browser as SupportedLocale;
  return 'en';
}

const initialLocale = resolveInitialLocale();

i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    sw: { common: sw },
    fr: { common: fr },
    ar: { common: ar },
    pt: { common: pt },
    zh: { common: zh },
  },
  lng: initialLocale,
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLocale;
document.documentElement.dir = initialLocale === 'ar' ? 'rtl' : 'ltr';

export default i18n;
