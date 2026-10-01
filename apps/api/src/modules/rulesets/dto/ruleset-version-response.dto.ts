import { ApiProperty } from '@nestjs/swagger';
import { ClauseItemDto } from './clause.dto';
import {
  INGESTION_JOB_OUTCOMES,
  type IngestionJobOutcome,
} from '../constants/ingestion-status.constants';
import {
  RULESET_INGESTION_STATES,
  RULESET_REVIEW_STATUSES,
  type RulesetIngestionState,
  type RulesetReviewStatus,
} from '../entities/ruleset-version.entity';

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
    description:
      'When set, this version was created as a rollback copy of this prior semantic version',
    example: '1.2.0',
    nullable: true,
  })
  rolledBackFromVersion: string | null;

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

  @ApiProperty({
    description:
      'pending until its rules are ingested (chunked and embedded); failed with ingestionError if that gave up. Only an ingested version can be activated.',
    enum: RULESET_INGESTION_STATES,
  })
  ingestionStatus: RulesetIngestionState;

  @ApiProperty({ description: 'Chunks stored', nullable: true, type: Number })
  chunkCount: number | null;

  @ApiProperty({ nullable: true, type: String })
  ingestionError: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  ingestedAt: string | null;

  @ApiProperty({
    description:
      'draft until its legal review is recorded (POST …/review). Production activates reviewed versions only; a result made with a draft carries the warning rules_not_reviewed.',
    enum: RULESET_REVIEW_STATUSES,
  })
  reviewStatus: RulesetReviewStatus;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Al Tamimi & Company — Jane Doe',
  })
  reviewedBy: string | null;

  @ApiProperty({ nullable: true, type: String, example: '2026-11-15' })
  reviewedAt: string | null;

  @ApiProperty({ nullable: true, type: String })
  reviewNotes: string | null;

  @ApiProperty({
    description:
      'Whether the ingestion job was enqueued. Only present on create/rollback responses that trigger ingestion.',
    enum: INGESTION_JOB_OUTCOMES,
    required: false,
  })
  ingestionJob?: IngestionJobOutcome;
}
