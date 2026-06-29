import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations } from './translations';

const savedLang = localStorage.getItem('ledgra_lang') || 'ar';

// Document direction handling
document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = savedLang;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: {
        translation: translations.ar
      },
      en: {
        translation: translations.en
      }
    },
    lng: savedLang,
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

export default i18n;
