import { ApiProperty } from '@nestjs/swagger';
import { IsObjec } from 'class-validator';

export class UpdateOnboardingDto {
  @ApiProperty({
    description: 'Onboarding progress (merged with existing metadata)',
    example: { step: 3, completed_steps: ['profile', 'jurisdiction'] },
  })
  @IsObjec()
  onboarding_metadata: Record<string, unknown>;
}
