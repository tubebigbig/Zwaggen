import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';

function readStoredLang(): string | null {
  try {
    return globalThis.localStorage?.getItem?.('zwaggen:lang') ?? null;
  } catch {
    return null;
  }
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-TW': { translation: zhTW },
    },
    lng: readStoredLang() ?? 'en',
    fallbackLng: 'en',
    initImmediate: false,
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

function syncHtmlLang(lang: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
