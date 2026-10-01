import { ApiProperty } from '@nestjs/swagger';
import {
  INGESTION_JOB_OUTCOMES,
  type IngestionJobOutcome,
} from '../constants/ingestion-status.constants';
import { RulesetVersionResponseDto } from './ruleset-version-response.dto';

/**
 * Ruleset summary DTO for list endpoints.
 * Omits currentVersionData to avoid N+1 queries.
 */
export class RulesetSummaryResponseDto {
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
    description: 'Jurisdiction codes the ruleset applies to',
    example: ['MAINLAND', 'DMCC'],
    type: [String],
  })
  jurisdictions: string[];

  @ApiProperty({
    description: 'Document types the ruleset applies to',
    example: ['employment'],
    type: [String],
  })
  documentTypes: string[];

  @ApiProperty({
    description:
      'The active version number; null until a version is ingested and activated',
    example: '1.0.0',
    nullable: true,
    type: String,
  })
  currentVersion: string | null;

  @ApiProperty({
    description: 'Ruleset status',
    enum: ['active', 'inactive', 'deprecated'],
    example: 'active',
  })
  status: 'active' | 'inactive' | 'deprecated';

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

/**
 * Full ruleset response DTO for single-item endpoints.
 * Includes current version data with clauses.
 */
export class RulesetResponseDto extends RulesetSummaryResponseDto {
  @ApiProperty({
    description:
      'The active version, with its clauses; null until a version is ingested and activated',
    type: RulesetVersionResponseDto,
    nullable: true,
  })
  currentVersionData: RulesetVersionResponseDto | null;

  @ApiProperty({
    description:
      'On create only: the first version, inactive until it is ingested and activated (POST /rulesets/:key/versions/:version/activate)',
    type: RulesetVersionResponseDto,
    required: false,
  })
  createdVersion?: RulesetVersionResponseDto;

  @ApiProperty({
    description:
      'Whether the ingestion job was enqueued. Only present on create responses that trigger ingestion.',
    enum: INGESTION_JOB_OUTCOMES,
    required: false,
  })
  ingestionJob?: IngestionJobOutcome;
}
