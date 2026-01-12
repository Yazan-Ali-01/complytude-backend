import { I18nKeys } from '../common/constants/i18n-keys';

/**
 * Translation namespaces used in the application
 */
export type TranslationNamespace =
  | 'common'
  | 'auth'
  | 'templates'
  | 'storage'
  | 'tenant';

/**
 * Union type of all translation keys
 * Derived from I18nKeys to ensure type safety
 */
export type TranslationKey = (typeof I18nKeys)[keyof typeof I18nKeys];

/**
 * Translation parameters for interpolation
 */
export interface TranslationParams {
  [key: string]: string | number;
}

/**
 * Supported languages in the application
 */
export enum SupportedLanguages {
  ENGLISH = 'en',
  ARABIC = 'ar',
}

/**
 * Custom I18n context type for request-scoped translations
 * Note: This is distinct from nestjs-i18n's I18nContext class
 * Use this type when you need to type your own i18n context objects
 */
export interface AppI18nContext {
  lang: SupportedLanguages;
  t: (key: string, params?: TranslationParams) => string;
}
