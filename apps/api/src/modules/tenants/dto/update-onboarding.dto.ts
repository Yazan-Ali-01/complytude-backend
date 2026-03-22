import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import {
  FIRST_ACTION_TYPES,
  ONBOARDING_STEPS,
  type FirstActionType,
  type OnboardingStep,
} from '../constants/onboarding.constants';

export class UpdateOnboardingDto {
  @ApiPropertyOptional({
    description: 'Current onboarding step',
    enum: ONBOARDING_STEPS,
  })
  @IsOptional()
  @IsEnum(ONBOARDING_STEPS)
  currentStep?: OnboardingStep;

  @ApiPropertyOptional({
    description: 'Whether the user skipped the team invite step',
  })
  @IsOptional()
  @IsBoolean()
  teamInviteSkipped?: boolean;

  @ApiPropertyOptional({
    description: 'Type of first action completed',
    enum: FIRST_ACTION_TYPES,
  })
  @IsOptional()
  @IsEnum(FIRST_ACTION_TYPES)
  firstActionType?: FirstActionType | null;

  // stepsCompleted is updated server-side based on actions, not directly by client
}
