import { ApiProperty as ApiProperty6 } from '@nestjs/swagger';
import { IsObject as IsObject6 } from 'class-validator';

export class UpdateOnboardingDto {
  @ApiProperty6({
    description: 'Onboarding progress (merged with existing metadata)',
    example: { step: 3, completed_steps: ['profile', 'jurisdiction'] },
  })
  @IsObject6()
  onboarding_metadata: Record<string, unknown>;
}
