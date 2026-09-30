import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Analysis job status values
 */
export type AnalysisJobStatusDto =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

/**
 * Response DTO for analysis job polling endpoints.
 * Returns job status and full result when completed.
 */
export class AnalysisJobResponseDto {
  @ApiProperty({ description: 'Analysis job ID' })
  id: string;

  @ApiProperty({
    description:
      "Job status. 'completed_with_warnings' means the analysis ran but result.warnings lists why it is not a clean result: document_truncated, not_reranked, rulesets_without_context, ungrounded_findings_dropped, no_findings (nothing reported is not a compliance verdict). A job with no regulatory context to check against fails.",
    enum: [
      'queued',
      'processing',
      'completed',
      'completed_with_warnings',
      'failed',
    ],
  })
  status: AnalysisJobStatusDto;

  @ApiProperty({ description: 'Document ID being analyzed' })
  documentId: string;

  @ApiPropertyOptional({
    description: 'When the job started processing',
    example: '2026-03-04T12:00:00.000Z',
  })
  startedAt?: string | null;

  @ApiPropertyOptional({
    description: 'When the job completed (success or failure)',
    example: '2026-03-04T12:01:00.000Z',
  })
  completedAt?: string | null;

  @ApiPropertyOptional({
    description:
      'Full analysis result when status is completed: findings, summary, warnings, and provenance (prompt version, embedding model, ruleset versions and chunks given to the model, retrieval settings)',
  })
  result?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Error message when status is failed',
  })
  error?: string | null;
}
