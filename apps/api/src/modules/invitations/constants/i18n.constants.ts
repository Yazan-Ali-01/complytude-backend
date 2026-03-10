/**
 * Invitations module i18n translation keys
 */
export const InvitationsI18n = {
  errors: {
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
    TENANT_NOT_FOUND: 'invitations.errors.TENANT_NOT_FOUND',
    INVITER_NOT_FOUND: 'invitations.errors.INVITER_NOT_FOUND',
  },
  messages: {
    ACCEPTED_SUCCESSFULLY: 'invitations.messages.ACCEPTED_SUCCESSFULLY',
    ALREADY_MEMBER_REACTIVATED:
      'invitations.messages.ALREADY_MEMBER_REACTIVATED',
    REJECTED_SUCCESSFULLY: 'invitations.messages.REJECTED_SUCCESSFULLY',
    REVOKED_SUCCESSFULLY: 'invitations.messages.REVOKED_SUCCESSFULLY',
  },
} as const;
