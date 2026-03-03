import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeDocumentResponseDto {
  @ApiProperty({
    description: 'ID of the created document record',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  documentId: string;

  @ApiProperty({
    description:
      'ID of the queued analysis job — poll this for status and results',
    format: 'uuid',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  analysisJobId: string;
}
