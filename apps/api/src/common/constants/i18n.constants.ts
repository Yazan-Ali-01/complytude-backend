/**
 * Common i18n translation keys
 * Shared error keys used across the application
 */
export const CommonI18n = {
  errors: {
    VALIDATION_ERROR: 'common.errors.VALIDATION_ERROR',
    TOO_MANY_REQUESTS: 'common.errors.TOO_MANY_REQUESTS',
    NOT_FOUND: 'common.errors.NOT_FOUND',
    INTERNAL_SERVER_ERROR: 'common.errors.INTERNAL_SERVER_ERROR',
    UNAUTHORIZED: 'common.errors.UNAUTHORIZED',
    FORBIDDEN: 'common.errors.FORBIDDEN',
    BAD_REQUEST: 'common.errors.BAD_REQUEST',
    EMAIL_VERIFICATION_REQUIRED: 'common.errors.EMAIL_VERIFICATION_REQUIRED',
    CONFLICT: 'common.errors.CONFLICT',
    INVALID_REFERENCE: 'common.errors.INVALID_REFERENCE',
    CONCURRENT_UPDATE: 'common.errors.CONCURRENT_UPDATE',
    SERVICE_BUSY: 'common.errors.SERVICE_BUSY',
    PAYLOAD_TOO_LARGE: 'common.errors.PAYLOAD_TOO_LARGE',
    UNSUPPORTED_MEDIA_TYPE: 'common.errors.UNSUPPORTED_MEDIA_TYPE',
    PAYMENT_DECLINED: 'common.errors.PAYMENT_DECLINED',
    PAYMENT_PROVIDER_ERROR: 'common.errors.PAYMENT_PROVIDER_ERROR',
  },
  messages: {},
} as const;
