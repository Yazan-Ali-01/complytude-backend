import { ApiProperty } from '@nestjs/swagger';

/**
 * Authority response DTO
 * Returns authority details with all fields
 */
export class AuthorityResponseDto {
  @ApiProperty({
    description: 'Authority unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Unique authority code (uppercase)',
    example: 'DMCC',
  })
  code: string;

  @ApiProperty({
    description: 'Authority full name',
    example: 'Dubai Multi Commodities Centre',
  })
  name: string;

  @ApiProperty({
    description: 'Authority description',
    example: 'Dubai free zone authority for commodities trading',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Country where authority operates',
    example: 'United Arab Emirates',
  })
  country: string;

  @ApiProperty({
    description: 'Whether authority is active',
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
