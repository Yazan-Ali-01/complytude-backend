import { ApiProperty } from '@nestjs/swagger';
import { DocumentFormat } from './preview-document.dto';

export class PreviewDocumentResponseDto {
  @ApiProperty({
    description: 'Temporary signed URL to download the preview document',
    example: 'https://s3.example.com/previews/temp-uuid.docx?expires=...',
  })
  previewUrl: string;

  @ApiProperty({
    description: 'Expiration timestamp for the preview URL',
    example: '2026-01-21T11:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  expiresAt: string;

  @ApiProperty({
    description: 'Template key used for generation',
    example: 'dmcc_employment_v1',
  })
  templateKey: string;

  @ApiProperty({
    description: 'Document format',
    enum: DocumentFormat,
    example: DocumentFormat.DOCX,
  })
  format: DocumentFormat;
}
