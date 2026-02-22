import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeactivateTenantDto {
  @ApiProperty({
    description: 'Reason for deactivation',
    example: 'Non-payment of subscription invoice #INV-2026-001',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, {
    message: 'Deactivation reason must be at least 10 characters',
  })
  reason: string;
}
