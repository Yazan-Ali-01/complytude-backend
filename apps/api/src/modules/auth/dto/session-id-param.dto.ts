import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * DTO for session ID path parameter
 */
export class SessionIdParamDto {
  @ApiProperty({
    description: 'Session UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  sessionId: string;
}
