import { I18nKeyType } from '../common/constants/i18n.constants';

/**
 * Translation namespaces used in the application
 */
export type TranslationNamespace =
  | 'common'
  | 'auth'
  | 'templates'
  | 'storage'
  | 'tenant'
  | 'entitlements'; // ← Added this

/**
 * Union type of all translation keys
 * Derived from I18nKeyType to ensure type safety
 */
export type TranslationKey = I18nKeyType;

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
