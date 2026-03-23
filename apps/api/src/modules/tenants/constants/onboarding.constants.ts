/**
 * Onboarding metadata schema and constants.
 *
 * Standardizes the onboarding_metadata JSONB structure so frontend and backend agree.
 * Used for progressive onboarding UI (create workspace → invite team → first action).
 */

export const ONBOARDING_STEPS = [
  'create_workspace',
  'invite_team',
  'first_action',
  'completed',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const FIRST_ACTION_TYPES = [
  'upload_contract',
  'ask_question',
  'analyze_document',
] as const;

export type FirstActionType = (typeof FIRST_ACTION_TYPES)[number];

export interface StepsCompleted {
  createWorkspace: boolean;
  inviteTeam: boolean;
  firstAction: boolean;
}

export interface OnboardingMetadata {
  currentStep: OnboardingStep;
  teamInviteSkipped: boolean;
  firstActionType?: FirstActionType | null;
  firstActionCompletedAt?: string | null;
  stepsCompleted: StepsCompleted;
}

/**
 * Default onboarding metadata for new tenants.
 *
 * createWorkspace is always true because this metadata is created during tenant creation.
 */
export const DEFAULT_ONBOARDING_METADATA: OnboardingMetadata = {
  currentStep: 'invite_team',
  teamInviteSkipped: false,
  firstActionType: null,
  firstActionCompletedAt: null,
  stepsCompleted: {
    createWorkspace: true,
    inviteTeam: false,
    firstAction: false,
  },
};
