/**
 * Email module i18n translation keys
 */
export const EmailI18n = {
  common: {
    GREETING: 'email.common.GREETING',
    FOOTER_HELP: 'email.common.FOOTER_HELP',
    FOOTER_BRAND: 'email.common.FOOTER_BRAND',
  },
  verification: {
    SUBJECT: 'email.verification.SUBJECT',
    BODY_INTRO: 'email.verification.BODY_INTRO',
    BODY_CTA_HINT: 'email.verification.BODY_CTA_HINT',
    BODY_LINK_TEXT: 'email.verification.BODY_LINK_TEXT',
    BODY_IGNORE: 'email.verification.BODY_IGNORE',
  },
  passwordReset: {
    SUBJECT: 'email.passwordReset.SUBJECT',
    BODY_INTRO: 'email.passwordReset.BODY_INTRO',
    BODY_CTA_HINT: 'email.passwordReset.BODY_CTA_HINT',
    BODY_LINK_TEXT: 'email.passwordReset.BODY_LINK_TEXT',
    BODY_EXPIRY: 'email.passwordReset.BODY_EXPIRY',
    BODY_IGNORE: 'email.passwordReset.BODY_IGNORE',
  },
  trialEnding: {
    SUBJECT: 'email.trial_ending.subject',
    TITLE: 'email.trial_ending.title',
    GREETING: 'email.trial_ending.greeting',
    BODY: 'email.trial_ending.body',
    DAYS_REMAINING: 'email.trial_ending.days_remaining',
    AFTER_TRIAL: 'email.trial_ending.after_trial',
    CTA: 'email.trial_ending.cta',
    IGNORE: 'email.trial_ending.ignore',
  },
  invitation: {
    SUBJECT: 'email.invitation.subject',
    TITLE: 'email.invitation.title',
    BODY: 'email.invitation.body',
    CTA: 'email.invitation.cta',
    EXPIRY: 'email.invitation.expiry',
    IGNORE: 'email.invitation.ignore',
  },
  quotaExceeded: {
    SUBJECT: 'email.quota_exceeded.subject',
    TITLE: 'email.quota_exceeded.title',
    GREETING: 'email.quota_exceeded.greeting',
    BODY: 'email.quota_exceeded.body',
    HINT: 'email.quota_exceeded.hint',
    CTA: 'email.quota_exceeded.cta',
  },
  lowCredit: {
    SUBJECT: 'email.low_credit.subject',
    TITLE: 'email.low_credit.title',
    GREETING: 'email.low_credit.greeting',
    BODY: 'email.low_credit.body',
    CTA: 'email.low_credit.cta',
  },
} as const;
