import { ApiProperty } from '@nestjs/swagger';
import { RulesetVersionResponseDto } from './ruleset-version-response.dto';

/**
 * Ruleset response DTO
 * Returns ruleset details with all fields including current version data
 */
export class RulesetResponseDto {
  @ApiProperty({
    description: 'Ruleset unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Unique ruleset key',
    example: 'dmcc_employment_rules_v1',
  })
  key: string;

  @ApiProperty({
    description: 'Ruleset display name',
    example: 'DMCC Employment Rules v1.0',
  })
  name: string;

  @ApiProperty({
    description: 'Ruleset description',
    example: 'Standard employment rules for DMCC contracts',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Authority ID this ruleset belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
  })
  authorityId: string | null;

  @ApiProperty({
    description: 'Current version number',
    example: '1.0.0',
  })
  currentVersion: string;

  @ApiProperty({
    description: 'Current version data including clauses',
    type: RulesetVersionResponseDto,
  })
  currentVersionData: RulesetVersionResponseDto;

  @ApiProperty({
    description: 'Ruleset status',
    enum: ['active', 'inactive', 'deprecated'],
    example: 'active',
  })
  status: 'active' | 'inactive' | 'deprecated';

  @ApiProperty({
    description: 'Additional metadata',
    example: { tags: ['employment', 'standard'] },
  })
  metadata: Record<string, any>;

  @ApiProperty({
    description: 'ID of user who created this ruleset',
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

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2026-01-21T12:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: string;
}
