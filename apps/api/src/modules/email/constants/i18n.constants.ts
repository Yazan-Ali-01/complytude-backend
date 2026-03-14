/**
 * Email module i18n translation keys
 */
export const EmailI18n = {
  verification: {
    SUBJECT: 'email.verification.SUBJECT',
    BODY_WELCOME: 'email.verification.BODY_WELCOME',
    BODY_INSTRUCTIONS: 'email.verification.BODY_INSTRUCTIONS',
    BODY_LINK_TEXT: 'email.verification.BODY_LINK_TEXT',
  },
  passwordReset: {
    SUBJECT: 'email.passwordReset.SUBJECT',
    BODY_INSTRUCTIONS: 'email.passwordReset.BODY_INSTRUCTIONS',
    BODY_LINK_TEXT: 'email.passwordReset.BODY_LINK_TEXT',
    BODY_EXPIRY: 'email.passwordReset.BODY_EXPIRY',
  },
} as const;
