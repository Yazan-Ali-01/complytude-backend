import { ApiProperty } from '@nestjs/swagger';
import { ClauseItemDto } from './clause.dto';

/**
 * Ruleset version response DTO
 * Returns details of a specific ruleset version
 */
export class RulesetVersionResponseDto {
  @ApiProperty({
    description: 'Version unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Parent ruleset ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  rulesetId: string;

  @ApiProperty({
    description: 'Version number',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    description: 'Array of legal clauses for this version',
    type: [ClauseItemDto],
    isArray: true,
    example: [
      {
        id: 'clause_1',
        title: 'Probation Period',
        content:
          'The employee shall be subject to a probation period of {probation_months} months.',
        order: 1,
        is_required: true,
      },
    ],
  })
  clauses: ClauseItemDto[];

  @ApiProperty({
    description: 'Description of changes in this version',
    example: 'Updated probation period clause to comply with new regulations',
    nullable: true,
  })
  changelog: string | null;

  @ApiProperty({
    description: 'Additional metadata for this version',
    example: { tags: ['updated', 'compliance'], reviewedBy: 'legal-team' },
  })
  metadata: Record<string, unknown>;

  @ApiProperty({
    description: 'Whether this version is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'ID of user who created this version',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  createdBy: string | null;

  @ApiProperty({
    description: 'Created timestamp',
    example: '2026-01-21T10:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;
}
