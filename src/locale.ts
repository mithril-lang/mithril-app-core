/**
 * Locale resolution shared by Mithril Desktop and app.mithril.fund.
 *
 * The supported set is exactly the twelve locales that Mithril Desktop already ships translation trees for.
 * It is deliberately not extended by guesswork: a language is added here only when its strings exist.
 * Anything else resolves to the nearest supported locale or, failing that, to English.
 *
 * Order of precedence (first match wins):
 *   1. `explicit`  a value the person chose this visit (e.g. `?lang=`)
 *   2. `stored`    a value the person chose earlier (cookie / local setting / synced setting)
 *   3. `header`    the HTTP `Accept-Language` header (q-weighted)
 *   4. `navigator` `navigator.languages` / `navigator.language`
 *   5. `default`   `en`
 * Only 1 and 2 are manual choices. Callers must store and sync only those, never an auto-detected value.
 */
export const SUPPORTED_LOCALES = ['en', 'ja', 'zh-CN', 'zh-TW', 'es', 'pt-BR', 'pt-PT', 'id', 'tr', 'pl', 'ar', 'he'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';
export const FALLBACK_LOCALE: AppLocale = 'en';

export const LOCALE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: 'English', ja: '日本語', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', es: 'Español',
  'pt-BR': 'Português (Brasil)', 'pt-PT': 'Português (Portugal)', id: 'Bahasa Indonesia',
  tr: 'Türkçe', pl: 'Polski', ar: 'العربية', he: 'עברית',
};

export const RTL_LOCALES: readonly AppLocale[] = ['ar', 'he'];
export const localeDirection = (locale: AppLocale): 'ltr' | 'rtl' => (RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr');

/** Legacy and script-tagged codes mapped to a supported locale. Keys are lower-case. */
const ALIASES: Record<string, AppLocale> = {
  iw: 'he', in: 'id',
  zh: 'zh-CN', 'zh-cn': 'zh-CN', 'zh-sg': 'zh-CN', 'zh-hans': 'zh-CN', 'zh-hans-cn': 'zh-CN', 'zh-hans-sg': 'zh-CN',
  'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW', 'zh-mo': 'zh-TW', 'zh-hant': 'zh-TW', 'zh-hant-tw': 'zh-TW', 'zh-hant-hk': 'zh-TW',
  // Bare Portuguese has no region. Brazilian is the choice for the unqualified code (a product decision, not a measurement).
  pt: 'pt-BR', 'pt-br': 'pt-BR', 'pt-pt': 'pt-PT',
};

/** Parse one BCP 47-ish tag to a supported locale, or null when it is unsupported or malformed. */
export function parseLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  const norm = value.trim().toLowerCase().replace(/_/g, '-');
  if (!norm || norm === '*' || norm.length > 35 || !/^[a-z0-9-]+$/.test(norm)) return null;
  const direct = ALIASES[norm];
  if (direct) return direct;
  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === norm);
  if (exact) return exact;
  const primary = norm.split('-')[0]!;
  const viaPrimary = ALIASES[primary];
  if (viaPrimary) return viaPrimary;
  return SUPPORTED_LOCALES.find((l) => l.toLowerCase() === primary) ?? null;
}

/** Locales named in an `Accept-Language` header, best first. Malformed entries and `q=0` are dropped. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header || header.length > 1024) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      let q = 1;
      for (const param of params) {
        if (!/^\s*q\s*=/i.test(param)) continue;
        // A malformed q (`q=abc`, `q=`) drops the entry rather than promoting it to q=1.
        const m = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(param);
        q = m ? Number(m[1]) : 0;
      }
      return { tag: tag.trim(), q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.tag);
}

export type LocaleSource = 'explicit' | 'stored' | 'header' | 'navigator' | 'default';
export type LocaleInput = {
  explicit?: string | null;
  stored?: string | null;
  acceptLanguage?: string | null;
  navigatorLanguages?: readonly string[] | null;
};
export type LocaleResolution = { locale: AppLocale; source: LocaleSource; manual: boolean };

function firstSupported(tags: readonly string[]): AppLocale | null {
  for (const tag of tags) {
    const locale = parseLocale(tag);
    if (locale) return locale;
  }
  return null;
}

/** Pure; no I/O. The same input gives the same locale in a Worker, a browser and Electron. */
export function resolveLocale(input: LocaleInput): LocaleResolution {
  const explicit = parseLocale(input.explicit);
  if (explicit) return { locale: explicit, source: 'explicit', manual: true };
  const stored = parseLocale(input.stored);
  if (stored) return { locale: stored, source: 'stored', manual: true };
  const header = firstSupported(parseAcceptLanguage(input.acceptLanguage));
  if (header) return { locale: header, source: 'header', manual: false };
  const nav = firstSupported(input.navigatorLanguages ?? []);
  if (nav) return { locale: nav, source: 'navigator', manual: false };
  return { locale: DEFAULT_LOCALE, source: 'default', manual: false };
}

/**
 * Look a message up with English fallback. A missing or empty translation falls back to English;
 * a missing English message returns the key, so a gap is visible instead of silently blank.
 */
export function translate(
  catalogs: Partial<Record<AppLocale, Readonly<Record<string, string>>>>,
  locale: AppLocale,
  key: string,
): string {
  const own = catalogs[locale]?.[key];
  if (own) return own;
  const fallback = catalogs[FALLBACK_LOCALE]?.[key];
  return fallback ? fallback : key;
}
