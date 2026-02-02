import { ApiProperty } from '@nestjs/swagger';

/**
 * Category response DTO
 * Returns category details with all fields
 */
export class CategoryResponseDto {
  @ApiProperty({
    description: 'Category unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Unique category code (lowercase)',
    example: 'employment',
  })
  code: string;

  @ApiProperty({
    description: 'Category display name',
    example: 'Employment Contracts',
  })
  name: string;

  @ApiProperty({
    description: 'Category description',
    example: 'Employment and labor agreements',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Parent category ID (for hierarchical categories)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
  })
  parentId: string | null;

  @ApiProperty({
    description: 'Whether category is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Created timestamp',
    example: '2026-01-21T10:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2026-01-21T12:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: string;
}
