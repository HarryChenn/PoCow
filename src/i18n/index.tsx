import { createContext, Fragment, ReactNode, useContext, useEffect, useState } from 'react';
import { AI_NAMES, en, Key, zh } from './dict';

export type Lang = 'en' | 'zh';
export const LANGS: Lang[] = ['en', 'zh'];

const DICTS: Record<Lang, Record<Key, string>> = { en, zh };
const STORE_KEY = 'pocow-lang';

export type Params = Record<string, string | number>;

/** 取文案并插值；缺键时回退英文，再回退键名本身（便于发现漏译） */
export function translate(lang: Lang, key: Key, params?: Params): string {
  const raw = DICTS[lang][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

/** 保存的偏好 > 浏览器为中文 > 英文 */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    /* localStorage 不可用时按浏览器语言 */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en';
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, params?: Params) => string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? 'PoCow 德牛' : 'PoCow';
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
      /* 无痕模式等：本次会话生效即可 */
    }
  };

  const t = (key: Key, params?: Params) => translate(lang, key, params);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 <I18nProvider> 内使用');
  return ctx;
}

/** 渲染带 `**粗体**` 标记的文案 */
export function Rich({ k, params }: { k: Key; params?: Params }) {
  const { t } = useI18n();
  const parts = t(k, params).split('**');
  return (
    <>
      {parts.map((s, i) => (i % 2 ? <b key={i}>{s}</b> : <Fragment key={i}>{s}</Fragment>))}
    </>
  );
}

/** 当前语言的一套 AI 昵称 */
export function aiNames(lang: Lang): string[] {
  return AI_NAMES[lang];
}

/** 语言切换按钮组 */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t('lang.switch')}>
      {LANGS.map((l) => (
        <button
          key={l}
          className={`lang-btn ${lang === l ? 'lang-on' : ''}`}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {translate(l, `lang.${l}` as Key)}
        </button>
      ))}
    </div>
  );
}
