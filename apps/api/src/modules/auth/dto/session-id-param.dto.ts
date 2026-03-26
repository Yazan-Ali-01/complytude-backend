import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Path parameter validation for session ID (identity or tenant session)
 */
export class SessionIdParamDto {
  @ApiProperty({
    description: 'Session UUID (identity or tenant session)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  sessionId: string;
}
