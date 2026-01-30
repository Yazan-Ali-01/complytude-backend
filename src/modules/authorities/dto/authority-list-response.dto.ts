import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { AuthorityResponseDto } from './authority-response.dto';

/**
 * Paginated list of authorities response
 * Used for GET /authorities endpoint
 * Extends PaginatedResponseDto with typed data array
 */
export class AuthorityListResponseDto extends PaginatedResponseDto<AuthorityResponseDto> {
  @ApiProperty({
    description: 'Array of authorities for the current page',
    type: [AuthorityResponseDto],
    example: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        code: 'DMCC',
        name: 'Dubai Multi Commodities Centre',
        description: 'Dubai free zone authority for commodities trading',
        country: 'United Arab Emirates',
        isActive: true,
        createdAt: '2026-01-21T10:00:00.000Z',
        updatedAt: '2026-01-21T10:00:00.000Z',
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440001',
        code: 'IFZA',
        name: 'International Free Zone Authority',
        description: 'Dubai international free zone',
        country: 'United Arab Emirates',
        isActive: true,
        createdAt: '2026-01-21T11:00:00.000Z',
        updatedAt: '2026-01-21T11:00:00.000Z',
      },
    ],
  })
  declare data: AuthorityResponseDto[];
}
