/**
 * Attached to FastifyRequest.user after Google / Microsoft OAuth strategies validate.
 */
export type SsoOAuthProfile = {
  provider: 'google' | 'microsoft';
  providerSubjectId: string;
  email: string;
  /** True only when the provider asserts it verified the user owns `email`. */
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
};
