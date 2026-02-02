import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Document ID parameter validation
 * Used for path parameters that expect a document UUID
 */
export class DocumentIdParamDto {
  @ApiProperty({
    description: 'Document UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid document ID format' })
  id: string;
}
