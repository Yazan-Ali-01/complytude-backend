export type TranslationNamespace =
  | 'common'
  | 'auth'
  | 'templates'
  | 'storage'
  | 'tenant';

/**
 * Common translation keys
 */
export enum CommonTranslationKeys {
  VALIDATION_ERROR = 'common.VALIDATION_ERROR',
  NOT_FOUND = 'common.NOT_FOUND',
  INTERNAL_SERVER_ERROR = 'common.INTERNAL_SERVER_ERROR',
  UNAUTHORIZED = 'common.UNAUTHORIZED',
  FORBIDDEN = 'common.FORBIDDEN',
  BAD_REQUEST = 'common.BAD_REQUEST',
}

/**
 * Auth module translation keys
 */
export enum AuthTranslationKeys {
  EMAIL_ALREADY_REGISTERED = 'auth.EMAIL_ALREADY_REGISTERED',
  INVALID_CREDENTIALS = 'auth.INVALID_CREDENTIALS',
  NO_ACTIVE_TENANTS = 'auth.NO_ACTIVE_TENANTS',
  TENANT_ACCESS_DENIED = 'auth.TENANT_ACCESS_DENIED',
  INVALID_REFRESH_TOKEN = 'auth.INVALID_REFRESH_TOKEN',
  INVALID_VERIFICATION_TOKEN = 'auth.INVALID_VERIFICATION_TOKEN',
  EMAIL_VERIFIED = 'auth.EMAIL_VERIFIED',
  PASSWORD_RESET_SUCCESS = 'auth.PASSWORD_RESET_SUCCESS',
  LOGOUT_SUCCESS = 'auth.LOGOUT_SUCCESS',
  SIGNUP_SUCCESS = 'auth.SIGNUP_SUCCESS',
  PASSWORD_RESET_EMAIL_SENT = 'auth.PASSWORD_RESET_EMAIL_SENT',
}

/**
 * Templates module translation keys
 */
export enum TemplatesTranslationKeys {
  TEMPLATE_NOT_FOUND = 'templates.TEMPLATE_NOT_FOUND',
  TEMPORARY_URL_GENERATION_FAILED = 'templates.TEMPORARY_URL_GENERATION_FAILED',
  TEMPLATE_FETCH_FAILED = 'templates.TEMPLATE_FETCH_FAILED',
  TEMPLATE_UPDATE_FAILED = 'templates.TEMPLATE_UPDATE_FAILED',
  TEMPLATE_DELETE_FAILED = 'templates.TEMPLATE_DELETE_FAILED',
  TEMPLATE_ALREADY_EXISTS = 'templates.TEMPLATE_ALREADY_EXISTS',
  INVALID_TEMPLATE_DATA = 'templates.INVALID_TEMPLATE_DATA',
  TEMPLATE_NAME_REQUIRED = 'templates.TEMPLATE_NAME_REQUIRED',
  TEMPLATE_CONTENT_REQUIRED = 'templates.TEMPLATE_CONTENT_REQUIRED',
  TEMPLATE_CATEGORY_REQUIRED = 'templates.TEMPLATE_CATEGORY_REQUIRED',
  CATEGORY_NOT_FOUND = 'templates.CATEGORY_NOT_FOUND',
  AUTHORITY_NOT_FOUND = 'templates.AUTHORITY_NOT_FOUND',
  TEMPLATE_ACCESS_DENIED = 'templates.TEMPLATE_ACCESS_DENIED',
  TEMPLATE_IN_USE = 'templates.TEMPLATE_IN_USE',
  TEMPLATE_VERSION_CONFLICT = 'templates.TEMPLATE_VERSION_CONFLICT',
  TEMPLATE_CLONED_SUCCESS = 'templates.TEMPLATE_CLONED_SUCCESS',
  TEMPLATE_PUBLISHED_SUCCESS = 'templates.TEMPLATE_PUBLISHED_SUCCESS',
  TEMPLATE_ARCHIVED_SUCCESS = 'templates.TEMPLATE_ARCHIVED_SUCCESS',
}

/**
 * Storage module translation keys
 */
export enum StorageTranslationKeys {
  FILE_NOT_FOUND = 'storage.FILE_NOT_FOUND',
  FILE_UPLOAD_FAILED = 'storage.FILE_UPLOAD_FAILED',
  FILE_DELETE_FAILED = 'storage.FILE_DELETE_FAILED',
  FILE_ACCESS_DENIED = 'storage.FILE_ACCESS_DENIED',
  FILE_TOO_LARGE = 'storage.FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'storage.INVALID_FILE_TYPE',
  STORAGE_ACCESS_FAILED = 'storage.STORAGE_ACCESS_FAILED',
  STORAGE_QUOTA_EXCEEDED = 'storage.STORAGE_QUOTA_EXCEEDED',
  FILE_ALREADY_EXISTS = 'storage.FILE_ALREADY_EXISTS',
  INVALID_FILE_NAME = 'storage.INVALID_FILE_NAME',
  FILE_DOWNLOAD_FAILED = 'storage.FILE_DOWNLOAD_FAILED',
  TEMPORARY_URL_GENERATION_FAILED = 'storage.TEMPORARY_URL_GENERATION_FAILED',
}

/**
 * Tenant module translation keys
 */
export enum TenantTranslationKeys {
  TENANT_NOT_FOUND = 'tenant.TENANT_NOT_FOUND',
  TENANT_CREATION_FAILED = 'tenant.TENANT_CREATION_FAILED',
  TENANT_UPDATE_FAILED = 'tenant.TENANT_UPDATE_FAILED',
  TENANT_DELETE_FAILED = 'tenant.TENANT_DELETE_FAILED',
  TENANT_ALREADY_EXISTS = 'tenant.TENANT_ALREADY_EXISTS',
  TENANT_ACCESS_DENIED = 'tenant.TENANT_ACCESS_DENIED',
  INVALID_TENANT_DATA = 'tenant.INVALID_TENANT_DATA',
  TENANT_NAME_REQUIRED = 'tenant.TENANT_NAME_REQUIRED',
  TENANT_SUSPENDED = 'tenant.TENANT_SUSPENDED',
  TENANT_INACTIVE = 'tenant.TENANT_INACTIVE',
}

/**
 * Union type of all translation keys
 */
export type TranslationKey =
  | CommonTranslationKeys
  | AuthTranslationKeys
  | TemplatesTranslationKeys
  | StorageTranslationKeys
  | TenantTranslationKeys;

/**
 * Translation parameters for interpolation
 */
export interface TranslationParams {
  [key: string]: string | number;
}

/**
 * Supported languages
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
