/**
 * Entitlements module i18n translation keys
 */
export const EntitlementsI18n = {
  errors: {
    FEATURE_NOT_FOUND: 'entitlements.errors.feature_not_found',
    ADDON_NOT_FOUND: 'entitlements.errors.addon.not_found',
    ADDON_ALREADY_ACTIVE: 'entitlements.errors.addon.already_active',
    OVERRIDE_NOT_FOUND: 'entitlements.errors.override.not_found',
    OVERRIDE_FEATURE_NOT_FOUND:
      'entitlements.errors.override.feature_not_found',
    OVERRIDE_INVALID_VALUE: 'entitlements.errors.override.invalid_value',
  },
  messages: {
    ADDON_ADD_SUCCESS: 'entitlements.messages.addon.add_success',
    ADDON_REMOVE_SUCCESS: 'entitlements.messages.addon.remove_success',
    OVERRIDE_APPLY_SUCCESS: 'entitlements.messages.override.apply_success',
    OVERRIDE_REVOKE_SUCCESS: 'entitlements.messages.override.revoke_success',
  },
} as const;
