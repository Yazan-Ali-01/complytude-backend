/**
 * Attached to FastifyRequest.user after Google / Microsoft OAuth strategies validate.
 */
export type SsoOAuthProfile = {
  provider: 'google' | 'microsoft';
  providerSubjectId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};
