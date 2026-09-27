import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type GenerationJobStatusDto =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export class GenerationJobResponseDto {
  @ApiProperty({ description: 'Generation job ID' })
  id: string;

  @ApiProperty({
    description: 'Job status',
    enum: ['queued', 'processing', 'completed', 'failed'],
  })
  status: GenerationJobStatusDto;

  @ApiProperty({
    description: 'Job type',
    enum: ['preview', 'generate'],
  })
  jobType: 'preview' | 'generate';

  @ApiProperty({ description: 'Template ID used for generation' })
  templateId: string;

  @ApiPropertyOptional({
    description: 'When the job started processing',
    example: '2026-03-30T12:00:00.000Z',
  })
  startedAt?: string | null;

  @ApiPropertyOptional({
    description: 'When the job completed (success or failure)',
    example: '2026-03-30T12:01:00.000Z',
  })
  completedAt?: string | null;

  @ApiPropertyOptional({
    description:
      'Result data when completed. For preview jobs: { previewUrl, expiresAt }',
  })
  result?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Error message when status is failed',
  })
  error?: string | null;
}
