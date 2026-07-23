import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { en } from './en';
import { ar } from './ar';

type Lang = 'en' | 'ar';
const dictionaries: Record<Lang, Record<string, string>> = { en, ar };

interface I18nCtx {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: (key: string) => string;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<I18nCtx>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>((localStorage.getItem('clinic_lang') as Lang) || 'en');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('clinic_lang', lang);
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [lang, dir]);

  const t = (key: string) => dictionaries[lang][key] ?? dictionaries.en[key] ?? key;

  return <Ctx.Provider value={{ lang, dir, t, setLang }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
