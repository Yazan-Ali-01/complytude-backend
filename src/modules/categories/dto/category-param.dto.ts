import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Category ID parameter validation
 * Used for path parameters that expect a category UUID
 */
export class CategoryIdParamDto {
  @ApiProperty({
    description: 'Category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid category ID format' })
  id: string;
}
