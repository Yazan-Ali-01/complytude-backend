/**
 * Onboarding metadata schema and constants.
 *
 * Standardizes onboarding field values so frontend and backend agree.
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
