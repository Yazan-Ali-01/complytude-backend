import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const FINDING_DECISIONS = ['accepted', 'dismissed'] as const;

export class ReviewFindingDto {
  @ApiProperty({
    description: 'Whether the finding is right (accepted) or not (dismissed)',
    enum: FINDING_DECISIONS,
    example: 'dismissed',
  })
  @IsIn(FINDING_DECISIONS)
  decision: (typeof FINDING_DECISIONS)[number];

  @ApiPropertyOptional({
    description: 'Why, in a few words (up to 1000 characters)',
    example: 'The clause applies to mainland employers; this contract is DIFC',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class FindingFeedbackDto {
  @ApiProperty({
    description: "The finding's id in result.findings",
    example: '7f0c1e2a-9a4b-4c1d-8e2f-3b5a6c7d8e9f',
  })
  findingId: string;

  @ApiProperty({ enum: FINDING_DECISIONS, example: 'dismissed' })
  decision: (typeof FINDING_DECISIONS)[number];

  @ApiProperty({
    description: 'Why, if given',
    nullable: true,
    type: String,
    example: 'The clause applies to mainland employers; this contract is DIFC',
  })
  reason: string | null;

  @ApiProperty({
    description: 'Who decided (user ID)',
    nullable: true,
    type: String,
  })
  decidedBy: string | null;

  @ApiProperty({
    description: 'When',
    type: 'string',
    format: 'date-time',
    example: '2026-10-01T12:00:00.000Z',
  })
  decidedAt: string;
}
