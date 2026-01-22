import { ApiProperty } from '@nestjs/swagger';

export class GenerateDocumentResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the generated document',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Download URLs for each requested format',
    example: {
      docx: 'https://s3.example.com/documents/doc.docx?expires=...',
      pdf: 'https://s3.example.com/documents/doc.pdf?expires=...',
    },
  })
  downloadUrls: Record<string, string>;

  @ApiProperty({
    description: 'Template key used for generation',
    example: 'dmcc_employment_v1',
  })
  templateKey: string;

  @ApiProperty({
    description: 'Template version used for generation',
    example: '1.0.0',
  })
  templateVersion: string;

  @ApiProperty({
    description: 'Document creation timestamp',
    example: '2026-01-21T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;
}
