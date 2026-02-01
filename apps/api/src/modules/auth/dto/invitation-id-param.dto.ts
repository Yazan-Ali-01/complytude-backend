import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Path parameter validation for invitation ID
 */
export class InvitationIdParamDto {
  @ApiProperty({
    description: 'Invitation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  invitationId: string;
}
