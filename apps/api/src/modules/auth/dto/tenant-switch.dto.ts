import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Request body for switching to a different tenant
 */
export class TenantSwitchDto {
  @ApiProperty({
    description: 'Tenant UUID to switch to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  tenantId: string;
}
