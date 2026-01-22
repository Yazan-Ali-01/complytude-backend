import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Authority ID parameter validation
 * Used for path parameters that expect an authority UUID
 */
export class AuthorityIdParamDto {
  @ApiProperty({
    description: 'Authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid authority ID format' })
  id: string;
}
