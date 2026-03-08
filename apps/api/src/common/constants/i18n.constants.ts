/**
 * Common/shared i18n translation keys
 * These are cross-cutting keys used across multiple modules
 */
export const CommonI18n = {
  errors: {
    VALIDATION_ERROR: 'common.errors.VALIDATION_ERROR',
    NOT_FOUND: 'common.errors.NOT_FOUND',
    INTERNAL_SERVER_ERROR: 'common.errors.INTERNAL_SERVER_ERROR',
    UNAUTHORIZED: 'common.errors.UNAUTHORIZED',
    FORBIDDEN: 'common.errors.FORBIDDEN',
    BAD_REQUEST: 'common.errors.BAD_REQUEST',
    CONFLICT: 'common.errors.CONFLICT',
    NOT_IMPLEMENTED: 'common.errors.NOT_IMPLEMENTED',
    QUOTA_EXCEEDED: 'common.errors.QUOTA_EXCEEDED',
    INSUFFICIENT_CREDITS: 'common.errors.INSUFFICIENT_CREDITS',
  },
  messages: {
    EVENT_HISTORY_FOR_AGGREGATE: 'common.messages.EVENT_HISTORY_FOR_AGGREGATE',
    DOMAIN_EVENTS_RETRIEVED: 'common.messages.DOMAIN_EVENTS_RETRIEVED',
    EVENTS_FILTERED_BY_TYPE: 'common.messages.EVENTS_FILTERED_BY_TYPE',
    INVITATION_REACTIVATED: 'common.messages.INVITATION_REACTIVATED',
    INVITATION_ACCEPTED: 'common.messages.INVITATION_ACCEPTED',
    INVITATION_REJECTED: 'common.messages.INVITATION_REJECTED',
    INVITATION_REVOKED: 'common.messages.INVITATION_REVOKED',
    EVENTS_FILTERED_BY_DATE_RANGE:
      'common.messages.EVENTS_FILTERED_BY_DATE_RANGE',
    EVENTS_READY_FOR_REPLAY: 'common.messages.EVENTS_READY_FOR_REPLAY',
    AUDIT_TRAIL_RETRIEVED: 'common.messages.AUDIT_TRAIL_RETRIEVED',
    USAGE_RECORDED_AND_DOMAIN_EVENT_OBSERVED:
      'common.messages.USAGE_RECORDED_AND_DOMAIN_EVENT_OBSERVED',
    EVENT_SUMMARY_RETRIEVED: 'common.messages.EVENT_SUMMARY_RETRIEVED',
    EVENTS_FILTERED_BY_AGGREGATE_TYPE:
      'common.messages.EVENTS_FILTERED_BY_AGGREGATE_TYPE',
    EVENTS_FILTERED_WITH_MULTIPLE_CRITERIA:
      'common.messages.EVENTS_FILTERED_WITH_MULTIPLE_CRITERIA',
    LATEST_EVENT_RETRIEVED: 'common.messages.LATEST_EVENT_RETRIEVED',
    NO_EVENTS_FOUND_FOR_AGGREGATE:
      'common.messages.NO_EVENTS_FOUND_FOR_AGGREGATE',
    NO_EVENTS_FOUND_TO_TEST_IMMUTABILITY:
      'common.messages.NO_EVENTS_FOUND_TO_TEST_IMMUTABILITY',
    IMMUTABILITY_TEST_COMPLETE: 'common.messages.IMMUTABILITY_TEST_COMPLETE',
    BLOCKED_AS_EXPECTED: 'common.messages.BLOCKED_AS_EXPECTED',
    ALLOWED_UNEXPECTED: 'common.messages.ALLOWED_UNEXPECTED',
    PLAN_CHANGE_FLOW_COMPLETE: 'common.messages.PLAN_CHANGE_FLOW_COMPLETE',
    STALE_SNAPSHOT_DETECTION_TEST_COMPLETE:
      'common.messages.STALE_SNAPSHOT_DETECTION_TEST_COMPLETE',
    SNAPSHOT_HISTORY_RETRIEVED: 'common.messages.SNAPSHOT_HISTORY_RETRIEVED',
    SNAPSHOT_REBUILT: 'common.messages.SNAPSHOT_REBUILT',
    HIT_VS_MISS_COMPARISON_COMPLETE:
      'common.messages.HIT_VS_MISS_COMPARISON_COMPLETE',
    ACTIVE_SNAPSHOT_COUNT_RETRIEVED:
      'common.messages.ACTIVE_SNAPSHOT_COUNT_RETRIEVED',
    SNAPSHOT_AGE_RETRIEVED: 'common.messages.SNAPSHOT_AGE_RETRIEVED',
    NO_ACTIVE_SNAPSHOT: 'common.messages.NO_ACTIVE_SNAPSHOT',
    SNAPSHOT_DEBUG_INFO: 'common.messages.SNAPSHOT_DEBUG_INFO',
    DOCUMENTS_USAGE_RECORDED: 'common.messages.DOCUMENTS_USAGE_RECORDED',

    CREDITS_AUTOMATICALLY_DEDUCTED:
      'common.messages.CREDITS_AUTOMATICALLY_DEDUCTED',
    NO_CREDITS_NEEDED: 'common.messages.NO_CREDITS_NEEDED',
    CONTRACT_REVIEW_USAGE_RECORDED:
      'common.messages.CONTRACT_REVIEW_USAGE_RECORDED',
    REGULATORY_QUERY_USAGE_RECORDED:
      'common.messages.REGULATORY_QUERY_USAGE_RECORDED',
    USAGE_RECORDED_WITH_IDEMPOTENCY_KEY:
      'common.messages.USAGE_RECORDED_WITH_IDEMPOTENCY_KEY',
    USAGE_RECORDED_EXCEEDING_QUOTA:
      'common.messages.USAGE_RECORDED_EXCEEDING_QUOTA',
    USAGE_RECORDED_WITHIN_QUOTA: 'common.messages.USAGE_RECORDED_WITHIN_QUOTA',
    PHASE_4_BEHAVIOR_EXCEEDING_QUOTA:
      'common.messages.PHASE_4_BEHAVIOR_EXCEEDING_QUOTA',
    PHASE_4_BEHAVIOR_WITHIN_QUOTA:
      'common.messages.PHASE_4_BEHAVIOR_WITHIN_QUOTA',
    PROJECTION_REBUILT_FROM_LEDGER:
      'common.messages.PROJECTION_REBUILT_FROM_LEDGER',
    //mocks
    CREDITS_PURCHASED: 'common.messages.CREDITS_PURCHASED',
    CREDITS_GRANTED: 'common.messages.CREDITS_GRANTED',
    USAGE_ALLOWED_WITHIN_QUOTA: 'common.messages.USAGE_ALLOWED_WITHIN_QUOTA',
    USAGE_ALLOWED_VIA_CREDIT_FALLBACK:
      'common.messages.USAGE_ALLOWED_VIA_CREDIT_FALLBACK',
    USAGE_DENIED_UNEXPECTED: 'common.messages.USAGE_DENIED_UNEXPECTED',
    USAGE_DENIED_QUOTA_EXCEEDED: 'common.messages.USAGE_DENIED_QUOTA_EXCEEDED',
    USAGE_ALLOWED_UNEXPECTED: 'common.messages.USAGE_ALLOWED_UNEXPECTED',
  },
} as const;

/**
 * Re-export module-specific i18n constants for convenience
 * Import them from their respective modules
 */
export { AuthI18n } from '../../modules/auth/constants/i18n.constants';
export { EntitlementsI18n } from '../../modules/entitlements/constants/i18n.constants';
export { StorageI18n } from '../../modules/storage/constants/i18n.constants';
export { TemplatesI18n } from '../../modules/templates/constants/i18n.constants';
export { TenantsI18n } from '../../modules/tenants/constants/i18n.constants';

import { AuthI18n } from '../../modules/auth/constants/i18n.constants';
import { EntitlementsI18n } from '../../modules/entitlements/constants/i18n.constants';
import { StorageI18n } from '../../modules/storage/constants/i18n.constants';
import { TemplatesI18n } from '../../modules/templates/constants/i18n.constants';
import { TenantsI18n } from '../../modules/tenants/constants/i18n.constants';

/**
 * Helper type to extract all values from a nested object
 */
type DeepValues<T> = T extends object
  ? T[keyof T] extends object
    ? DeepValues<T[keyof T]>
    : T[keyof T]
  : never;

/**
 * Union type of all i18n translation keys
 * Derived from all module constants for type safety
 */
export type I18nKeyType =
  | DeepValues<typeof CommonI18n>
  | DeepValues<typeof AuthI18n>
  | DeepValues<typeof TemplatesI18n>
  | DeepValues<typeof StorageI18n>
  | DeepValues<typeof TenantsI18n>
  | DeepValues<typeof EntitlementsI18n>;
