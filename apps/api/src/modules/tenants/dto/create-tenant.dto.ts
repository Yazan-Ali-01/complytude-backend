import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import type { PlanKey } from 'src/common/types/entitlement.types';

export class CreateTenantDto {
  @ApiProperty({
    example: 'navigator',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    description: 'Subscription plan',
    default: 'navigator',
  })
  @IsEnum(['navigator', 'shield', 'general_counsel', 'infrastructure'])
  @IsOptional()
  plan?: PlanKey;
}
