import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, localeDirection, parseAcceptLanguage, parseLocale, resolveLocale, translate } from '../src/locale';

describe('parseLocale', () => {
  it('accepts every supported locale exactly, case-insensitively and with underscores', () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(parseLocale(l)).toBe(l);
      expect(parseLocale(l.toLowerCase())).toBe(l);
      expect(parseLocale(l.replace('-', '_'))).toBe(l);
    }
  });
  it('maps regional, script and legacy codes', () => {
    expect(parseLocale('ja-JP')).toBe('ja');
    expect(parseLocale('en-GB')).toBe('en');
    expect(parseLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(parseLocale('zh-Hant-TW')).toBe('zh-TW');
    expect(parseLocale('zh-HK')).toBe('zh-TW');
    expect(parseLocale('zh')).toBe('zh-CN');
    expect(parseLocale('pt')).toBe('pt-BR');
    expect(parseLocale('pt-PT')).toBe('pt-PT');
    expect(parseLocale('iw')).toBe('he');
    expect(parseLocale('in')).toBe('id');
    expect(parseLocale('es-MX')).toBe('es');
    expect(parseLocale('ar-EG')).toBe('ar');
  });
  it('returns null for unsupported or malformed values instead of guessing', () => {
    for (const v of [null, undefined, '', '*', 'fr', 'de-DE', 'ko', 'xx', '<script>', 'en us', 'a'.repeat(40)]) expect(parseLocale(v as string)).toBeNull();
  });
});

describe('parseAcceptLanguage', () => {
  it('orders by q then position and drops q=0 and junk', () => {
    expect(parseAcceptLanguage('fr;q=0.9, ja;q=0.8, en;q=0.7')).toEqual(['fr', 'ja', 'en']);
    expect(parseAcceptLanguage('en;q=0.5, ja')).toEqual(['ja', 'en']);
    expect(parseAcceptLanguage('ja;q=0, en')).toEqual(['en']);
    expect(parseAcceptLanguage('en;q=abc, ja')).toEqual(['ja']);
    expect(parseAcceptLanguage('')).toEqual([]);
    expect(parseAcceptLanguage('x'.repeat(2000))).toEqual([]);
  });
});

describe('resolveLocale', () => {
  it('prefers an explicit choice, then a stored one, and marks both manual', () => {
    expect(resolveLocale({ explicit: 'es', stored: 'ja', acceptLanguage: 'tr' })).toEqual({ locale: 'es', source: 'explicit', manual: true });
    expect(resolveLocale({ explicit: 'xx', stored: 'ja', acceptLanguage: 'tr' })).toEqual({ locale: 'ja', source: 'stored', manual: true });
  });
  it('falls to Accept-Language, skipping unsupported entries, and is not manual', () => {
    expect(resolveLocale({ acceptLanguage: 'fr-FR,fr;q=0.9,pl;q=0.8,en;q=0.7' })).toEqual({ locale: 'pl', source: 'header', manual: false });
  });
  it('falls to navigator.languages, then to English', () => {
    expect(resolveLocale({ navigatorLanguages: ['de', 'pt-PT', 'en'] })).toEqual({ locale: 'pt-PT', source: 'navigator', manual: false });
    expect(resolveLocale({ navigatorLanguages: ['de'], acceptLanguage: 'ko' })).toEqual({ locale: 'en', source: 'default', manual: false });
    expect(resolveLocale({})).toEqual({ locale: 'en', source: 'default', manual: false });
  });
  it('is deterministic for the same input', () => {
    const input = { acceptLanguage: 'zh-TW,zh;q=0.9', navigatorLanguages: ['ja'] };
    expect(resolveLocale(input)).toEqual(resolveLocale({ ...input }));
    expect(resolveLocale(input).locale).toBe('zh-TW');
  });
});

describe('direction and translate', () => {
  it('marks Arabic and Hebrew right-to-left only', () => {
    expect(SUPPORTED_LOCALES.filter((l) => localeDirection(l) === 'rtl')).toEqual(['ar', 'he']);
  });
  it('falls back to English for a missing or empty translation, and to the key when English is missing', () => {
    const cat = { en: { hello: 'Hello', only: 'Only English' }, ja: { hello: 'こんにちは', only: '' } };
    expect(translate(cat, 'ja', 'hello')).toBe('こんにちは');
    expect(translate(cat, 'ja', 'only')).toBe('Only English');
    expect(translate(cat, 'tr', 'hello')).toBe('Hello');
    expect(translate(cat, 'en', 'missing')).toBe('missing');
  });
});
