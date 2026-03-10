/**
 * Entitlements module i18n translation keys
 */
export const EntitlementsI18n = {
  errors: {
    ADDON_NOT_FOUND: 'entitlements.errors.ADDON_NOT_FOUND',
    ADDON_ALREADY_ACTIVE: 'entitlements.errors.ADDON_ALREADY_ACTIVE',
    OVERRIDE_NOT_FOUND: 'entitlements.errors.OVERRIDE_NOT_FOUND',
    OVERRIDE_FEATURE_NOT_FOUND:
      'entitlements.errors.OVERRIDE_FEATURE_NOT_FOUND',
    OVERRIDE_INVALID_VALUE: 'entitlements.errors.OVERRIDE_INVALID_VALUE',
    UNITS_MUST_BE_GREATER_THAN_ZERO:
      'entitlements.errors.UNITS_MUST_BE_GREATER_THAN_ZERO',
    AT_LEAST_ONE_ALLOCATION_REQUIRED:
      'entitlements.errors.AT_LEAST_ONE_ALLOCATION_REQUIRED',
    ALLOCATION_SUM_MUST_EQUAL_UNITS:
      'entitlements.errors.ALLOCATION_SUM_MUST_EQUAL_UNITS',
    EACH_ALLOCATION_MUST_HAVE_UNITS_GT_ZERO:
      'entitlements.errors.EACH_ALLOCATION_MUST_HAVE_UNITS_GT_ZERO',
    FEATURE_NOT_FOUND: 'entitlements.errors.FEATURE_NOT_FOUND',
    FEATURE_IS_INACTIVE: 'entitlements.errors.FEATURE_IS_INACTIVE',
    NO_ACTIVE_SUBSCRIPTION: 'entitlements.errors.NO_ACTIVE_SUBSCRIPTION',
    PURCHASE_AMOUNT_MUST_BE_GT_ZERO:
      'entitlements.errors.PURCHASE_AMOUNT_MUST_BE_GT_ZERO',
    GRANT_AMOUNT_MUST_BE_GT_ZERO:
      'entitlements.errors.GRANT_AMOUNT_MUST_BE_GT_ZERO',
    DEDUCTION_AMOUNT_MUST_BE_GT_ZERO:
      'entitlements.errors.DEDUCTION_AMOUNT_MUST_BE_GT_ZERO',
    REFUND_AMOUNT_MUST_BE_GT_ZERO:
      'entitlements.errors.REFUND_AMOUNT_MUST_BE_GT_ZERO',
    INSUFFICIENT_CREDITS: 'entitlements.errors.INSUFFICIENT_CREDITS',
    QUOTA_EXCEEDED: 'entitlements.errors.QUOTA_EXCEEDED',
    ENTITLEMENT_FEATURE_NOT_FOUND:
      'entitlements.errors.ENTITLEMENT_FEATURE_NOT_FOUND',
    ENTITLEMENT_ACCESS_DENIED: 'entitlements.errors.ENTITLEMENT_ACCESS_DENIED',
    ENTITLEMENT_REQUIREMENT_NOT_MET:
      'entitlements.errors.ENTITLEMENT_REQUIREMENT_NOT_MET',
  },
  messages: {
    ADDON_ADD_SUCCESS: 'entitlements.messages.ADDON_ADD_SUCCESS',
    ADDON_REMOVE_SUCCESS: 'entitlements.messages.ADDON_REMOVE_SUCCESS',
    OVERRIDE_APPLY_SUCCESS: 'entitlements.messages.OVERRIDE_APPLY_SUCCESS',
    OVERRIDE_REVOKE_SUCCESS: 'entitlements.messages.OVERRIDE_REVOKE_SUCCESS',
  },
} as const;
