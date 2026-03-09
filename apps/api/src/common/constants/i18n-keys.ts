/**
 * Translation keys for the application
 * Re-exports from per-module i18n constant files
 * Keys follow the pattern: {namespace}.{category}.{KEY_NAME}
 */

import { AuthI18n } from '../../modules/auth/constants/i18n.constants';
import { AuthoritiesI18n } from '../../modules/authorities/constants/i18n.constants';
import { CategoriesI18n } from '../../modules/categories/constants/i18n.constants';
import { DocumentsI18n } from '../../modules/documents/constants/i18n.constants';
import { EntitlementsI18n } from '../../modules/entitlements/constants/i18n.constants';
import { InvitationsI18n } from '../../modules/invitations/constants/i18n.constants';
import { RulesetsI18n } from '../../modules/rulesets/constants/i18n.constants';
import { StorageI18n } from '../../modules/storage/constants/i18n.constants';
import { SubscriptionsI18n } from '../../modules/subscriptions/constants/i18n.constants';
import { TemplatesI18n } from '../../modules/templates/constants/i18n.constants';
import { TenantsI18n } from '../../modules/tenants/constants/i18n.constants';
import { UsersI18n } from '../../modules/users/constants/i18n.constants';
import { CommonI18n } from './i18n.constants';

export {
  AuthI18n,
  AuthoritiesI18n,
  CategoriesI18n,
  CommonI18n,
  DocumentsI18n,
  EntitlementsI18n,
  InvitationsI18n,
  RulesetsI18n,
  StorageI18n,
  SubscriptionsI18n,
  TemplatesI18n,
  TenantsI18n,
  UsersI18n,
};

/**
 * Legacy flat I18nKeys object for backward compatibility
 * @deprecated Use module-specific constants instead (e.g., AuthI18n.errors.EMAIL_ALREADY_REGISTERED)
 */
export const I18nKeys = {
  // Common keys
  VALIDATION_ERROR: 'common.errors.VALIDATION_ERROR',
  NOT_FOUND: 'common.errors.NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'common.errors.INTERNAL_SERVER_ERROR',
  UNAUTHORIZED: 'common.errors.UNAUTHORIZED',
  FORBIDDEN: 'common.errors.FORBIDDEN',
  BAD_REQUEST: 'common.errors.BAD_REQUEST',

  // Auth keys
  EMAIL_ALREADY_REGISTERED: 'auth.errors.EMAIL_ALREADY_REGISTERED',
  INVALID_CREDENTIALS: 'auth.errors.INVALID_CREDENTIALS',
  NO_ACTIVE_TENANTS: 'auth.errors.NO_ACTIVE_TENANTS',
  TENANT_ACCESS_DENIED: 'auth.errors.TENANT_ACCESS_DENIED',
  INVALID_REFRESH_TOKEN: 'auth.errors.INVALID_REFRESH_TOKEN',
  INVALID_VERIFICATION_TOKEN: 'auth.errors.INVALID_VERIFICATION_TOKEN',
  EMAIL_VERIFIED: 'auth.messages.EMAIL_VERIFIED',
  EMAIL_NOT_VERIFIED: 'auth.errors.EMAIL_NOT_VERIFIED',
  PASSWORD_RESET_SUCCESS: 'auth.messages.PASSWORD_RESET_SUCCESS',
  LOGOUT_SUCCESS: 'auth.messages.LOGOUT_SUCCESS',
  SIGNUP_SUCCESS: 'auth.messages.SIGNUP_SUCCESS',
  PASSWORD_RESET_EMAIL_SENT: 'auth.messages.PASSWORD_RESET_EMAIL_SENT',
  TOKEN_EXPIRED: 'auth.errors.TOKEN_EXPIRED',

  // Templates keys
  TEMPLATE_NOT_FOUND: 'templates.errors.TEMPLATE_NOT_FOUND',
  TEMPLATE_FETCH_FAILED: 'templates.errors.TEMPLATE_FETCH_FAILED',
  TEMPLATE_UPDATE_FAILED: 'templates.errors.TEMPLATE_UPDATE_FAILED',
  TEMPLATE_DELETE_FAILED: 'templates.errors.TEMPLATE_DELETE_FAILED',
  TEMPLATE_ALREADY_EXISTS: 'templates.errors.TEMPLATE_ALREADY_EXISTS',
  INVALID_TEMPLATE_DATA: 'templates.errors.INVALID_TEMPLATE_DATA',
  TEMPLATE_NAME_REQUIRED: 'templates.errors.TEMPLATE_NAME_REQUIRED',
  TEMPLATE_CONTENT_REQUIRED: 'templates.errors.TEMPLATE_CONTENT_REQUIRED',
  TEMPLATE_CATEGORY_REQUIRED: 'templates.errors.TEMPLATE_CATEGORY_REQUIRED',
  CATEGORY_NOT_FOUND: 'templates.errors.CATEGORY_NOT_FOUND',
  AUTHORITY_NOT_FOUND: 'templates.errors.AUTHORITY_NOT_FOUND',
  TEMPLATE_ACCESS_DENIED: 'templates.errors.TEMPLATE_ACCESS_DENIED',
  TEMPLATE_IN_USE: 'templates.errors.TEMPLATE_IN_USE',
  TEMPLATE_VERSION_CONFLICT: 'templates.errors.TEMPLATE_VERSION_CONFLICT',
  TEMPLATE_CLONED_SUCCESS: 'templates.messages.TEMPLATE_CLONED_SUCCESS',
  TEMPLATE_PUBLISHED_SUCCESS: 'templates.messages.TEMPLATE_PUBLISHED_SUCCESS',
  TEMPLATE_ARCHIVED_SUCCESS: 'templates.messages.TEMPLATE_ARCHIVED_SUCCESS',
  TEMPLATE_TEMPORARY_URL_GENERATION_FAILED:
    'templates.errors.TEMPORARY_URL_GENERATION_FAILED',

  // Storage keys
  FILE_NOT_FOUND: 'storage.errors.FILE_NOT_FOUND',
  FILE_UPLOAD_FAILED: 'storage.errors.FILE_UPLOAD_FAILED',
  FILE_DELETE_FAILED: 'storage.errors.FILE_DELETE_FAILED',
  FILE_ACCESS_DENIED: 'storage.errors.FILE_ACCESS_DENIED',
  FILE_TOO_LARGE: 'storage.errors.FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'storage.errors.INVALID_FILE_TYPE',
  STORAGE_ACCESS_FAILED: 'storage.errors.STORAGE_ACCESS_FAILED',
  STORAGE_QUOTA_EXCEEDED: 'storage.errors.STORAGE_QUOTA_EXCEEDED',
  FILE_ALREADY_EXISTS: 'storage.errors.FILE_ALREADY_EXISTS',
  INVALID_FILE_NAME: 'storage.errors.INVALID_FILE_NAME',
  FILE_DOWNLOAD_FAILED: 'storage.errors.FILE_DOWNLOAD_FAILED',
  TEMPORARY_URL_GENERATION_FAILED:
    'storage.errors.TEMPORARY_URL_GENERATION_FAILED',

  // Tenant keys
  TENANT_NOT_FOUND: 'tenant.errors.TENANT_NOT_FOUND',
  TENANT_CREATION_FAILED: 'tenant.errors.TENANT_CREATION_FAILED',
  TENANT_UPDATE_FAILED: 'tenant.errors.TENANT_UPDATE_FAILED',
  TENANT_DELETE_FAILED: 'tenant.errors.TENANT_DELETE_FAILED',
  TENANT_ALREADY_EXISTS: 'tenant.errors.TENANT_ALREADY_EXISTS',
  AUTH_TENANT_ACCESS_DENIED: 'tenant.errors.TENANT_ACCESS_DENIED',
  INVALID_TENANT_DATA: 'tenant.errors.INVALID_TENANT_DATA',
  TENANT_NAME_REQUIRED: 'tenant.errors.TENANT_NAME_REQUIRED',
  TENANT_SUSPENDED: 'tenant.errors.TENANT_SUSPENDED',
  TENANT_INACTIVE: 'tenant.errors.TENANT_INACTIVE',
  DOCUMENT_LIMIT_EXCEEDED: 'tenant.errors.DOCUMENT_LIMIT_EXCEEDED',

  // Entitlement keys
  ADDON_NOT_FOUND: 'entitlements.errors.ADDON_NOT_FOUND',
  ADDON_ALREADY_ACTIVE: 'entitlements.errors.ADDON_ALREADY_ACTIVE',
  ADDON_ADD_SUCCESS: 'entitlements.messages.ADDON_ADD_SUCCESS',
  ADDON_REMOVE_SUCCESS: 'entitlements.messages.ADDON_REMOVE_SUCCESS',

  OVERRIDE_NOT_FOUND: 'entitlements.errors.OVERRIDE_NOT_FOUND',
  OVERRIDE_FEATURE_NOT_FOUND: 'entitlements.errors.OVERRIDE_FEATURE_NOT_FOUND',
  OVERRIDE_APPLY_SUCCESS: 'entitlements.messages.OVERRIDE_APPLY_SUCCESS',
  OVERRIDE_REVOKE_SUCCESS: 'entitlements.messages.OVERRIDE_REVOKE_SUCCESS',
  OVERRIDE_INVALID_VALUE: 'entitlements.errors.OVERRIDE_INVALID_VALUE',

  // Users keys
  USER_NOT_FOUND: 'users.errors.USER_NOT_FOUND',
  USER_NOT_FOUND_IN_TENANT: 'users.errors.USER_NOT_FOUND_IN_TENANT',
  NO_FIELDS_TO_UPDATE: 'users.errors.NO_FIELDS_TO_UPDATE',
  CURRENT_PASSWORD_INCORRECT: 'users.errors.CURRENT_PASSWORD_INCORRECT',
  USER_ALREADY_EXISTS_IN_TENANT: 'users.errors.USER_ALREADY_EXISTS_IN_TENANT',
  CANNOT_MODIFY_OWN_ROLE: 'users.errors.CANNOT_MODIFY_OWN_ROLE',
  CANNOT_REMOVE_YOURSELF: 'users.errors.CANNOT_REMOVE_YOURSELF',

  // Authorities keys
  AUTHORITY_NOT_FOUND_BY_ID: 'authorities.errors.AUTHORITY_NOT_FOUND_BY_ID',
  AUTHORITY_NOT_FOUND_BY_CODE: 'authorities.errors.AUTHORITY_NOT_FOUND_BY_CODE',
  AUTHORITY_ALREADY_EXISTS: 'authorities.errors.AUTHORITY_ALREADY_EXISTS',
  AUTHORITY_CREATE_FAILED: 'authorities.errors.AUTHORITY_CREATE_FAILED',
  AUTHORITIES_FETCH_FAILED: 'authorities.errors.AUTHORITIES_FETCH_FAILED',
  AUTHORITY_FETCH_FAILED: 'authorities.errors.AUTHORITY_FETCH_FAILED',
  AUTHORITY_UPDATE_FAILED: 'authorities.errors.AUTHORITY_UPDATE_FAILED',
  AUTHORITY_DELETE_FAILED: 'authorities.errors.AUTHORITY_DELETE_FAILED',

  // Categories keys
  CATEGORY_NOT_FOUND_BY_ID: 'categories.errors.CATEGORY_NOT_FOUND_BY_ID',
  CATEGORY_NOT_FOUND_BY_CODE: 'categories.errors.CATEGORY_NOT_FOUND_BY_CODE',
  CATEGORY_ALREADY_EXISTS: 'categories.errors.CATEGORY_ALREADY_EXISTS',
  CATEGORY_CREATE_FAILED: 'categories.errors.CATEGORY_CREATE_FAILED',
  CATEGORIES_FETCH_FAILED: 'categories.errors.CATEGORIES_FETCH_FAILED',
  CATEGORY_FETCH_FAILED: 'categories.errors.CATEGORY_FETCH_FAILED',
  CATEGORY_UPDATE_FAILED: 'categories.errors.CATEGORY_UPDATE_FAILED',
  CATEGORY_DEACTIVATE_FAILED: 'categories.errors.CATEGORY_DEACTIVATE_FAILED',

  // Documents keys
  DOCUMENT_NOT_FOUND: 'documents.errors.DOCUMENT_NOT_FOUND',
  ANALYSIS_JOB_NOT_FOUND: 'documents.errors.ANALYSIS_JOB_NOT_FOUND',
  NO_ANALYSIS_JOB_FOR_DOCUMENT: 'documents.errors.NO_ANALYSIS_JOB_FOR_DOCUMENT',
  PREVIEW_NOT_IMPLEMENTED: 'documents.errors.PREVIEW_NOT_IMPLEMENTED',
  GENERATION_NOT_IMPLEMENTED: 'documents.errors.GENERATION_NOT_IMPLEMENTED',
  LISTING_NOT_IMPLEMENTED: 'documents.errors.LISTING_NOT_IMPLEMENTED',
  RETRIEVAL_NOT_IMPLEMENTED: 'documents.errors.RETRIEVAL_NOT_IMPLEMENTED',
  DELETION_NOT_IMPLEMENTED: 'documents.errors.DELETION_NOT_IMPLEMENTED',

  // Invitations keys
  INVITATION_NOT_FOUND: 'invitations.errors.INVITATION_NOT_FOUND',
  INVITATION_NOT_FOUND_OR_EXPIRED:
    'invitations.errors.INVITATION_NOT_FOUND_OR_EXPIRED',
  INVITATION_EXPIRED: 'invitations.errors.INVITATION_EXPIRED',
  INVITATION_WRONG_STATUS: 'invitations.errors.INVITATION_WRONG_STATUS',
  INVITATION_EMAIL_MISMATCH: 'invitations.errors.INVITATION_EMAIL_MISMATCH',
  INVITATION_ALREADY_EXISTS: 'invitations.errors.INVITATION_ALREADY_EXISTS',
  USER_ALREADY_MEMBER: 'invitations.errors.USER_ALREADY_MEMBER',
  INVITATION_WRONG_TENANT: 'invitations.errors.INVITATION_WRONG_TENANT',
  CAN_ONLY_RESEND_PENDING: 'invitations.errors.CAN_ONLY_RESEND_PENDING',
  INVITER_NOT_FOUND: 'invitations.errors.INVITER_NOT_FOUND',
  INVITATION_ACCEPTED_SUCCESSFULLY:
    'invitations.messages.ACCEPTED_SUCCESSFULLY',
  INVITATION_ALREADY_MEMBER_REACTIVATED:
    'invitations.messages.ALREADY_MEMBER_REACTIVATED',
  INVITATION_REJECTED_SUCCESSFULLY:
    'invitations.messages.REJECTED_SUCCESSFULLY',
  INVITATION_REVOKED_SUCCESSFULLY: 'invitations.messages.REVOKED_SUCCESSFULLY',

  // Subscriptions keys
  SUBSCRIPTION_NOT_FOUND: 'subscriptions.errors.SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_ALREADY_EXISTS:
    'subscriptions.errors.SUBSCRIPTION_ALREADY_EXISTS',
  PLAN_NOT_FOUND: 'subscriptions.errors.PLAN_NOT_FOUND',
  PLAN_NOT_ACTIVE: 'subscriptions.errors.PLAN_NOT_ACTIVE',
  ALREADY_ON_PLAN: 'subscriptions.errors.ALREADY_ON_PLAN',

  // Rulesets keys
  RULESET_NOT_FOUND: 'rulesets.errors.RULESET_NOT_FOUND',
  RULESET_ALREADY_EXISTS: 'rulesets.errors.RULESET_ALREADY_EXISTS',
  RULESET_NO_ACTIVE_VERSION: 'rulesets.errors.RULESET_NO_ACTIVE_VERSION',
  VERSION_ALREADY_EXISTS: 'rulesets.errors.VERSION_ALREADY_EXISTS',
  VERSION_NOT_FOUND: 'rulesets.errors.VERSION_NOT_FOUND',
} as const;

/**
 * Type for I18n keys to ensure type safety
 * Derived from all module i18n constants
 */
type ExtractValues<T> =
  T extends Record<string, unknown>
    ? T[keyof T] extends string
      ? T[keyof T]
      : T[keyof T] extends Record<string, unknown>
        ? ExtractValues<T[keyof T]>
        : never
    : never;

export type I18nKeyType =
  | ExtractValues<typeof CommonI18n>
  | ExtractValues<typeof AuthI18n>
  | ExtractValues<typeof AuthoritiesI18n>
  | ExtractValues<typeof CategoriesI18n>
  | ExtractValues<typeof DocumentsI18n>
  | ExtractValues<typeof InvitationsI18n>
  | ExtractValues<typeof RulesetsI18n>
  | ExtractValues<typeof TemplatesI18n>
  | ExtractValues<typeof StorageI18n>
  | ExtractValues<typeof SubscriptionsI18n>
  | ExtractValues<typeof TenantsI18n>
  | ExtractValues<typeof EntitlementsI18n>
  | ExtractValues<typeof UsersI18n>;

/**
 * @deprecated Use module-specific constants instead (e.g., AuthI18n.errors.EMAIL_ALREADY_REGISTERED)
 */
export type I18nKeyTypeLegacy = (typeof I18nKeys)[keyof typeof I18nKeys];
