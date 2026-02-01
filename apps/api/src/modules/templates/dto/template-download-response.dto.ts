import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for template download endpoint
 * Returns a signed URL for downloading the template file
 */
export class TemplateDownloadResponseDto {
  @ApiProperty({
    description: 'Pre-signed URL for downloading the template file',
    example: 'https://s3.amazonaws.com/bucket/template.docx?signature=...',
  })
  signedUrl: string;

  @ApiProperty({
    description: 'Expiration timestamp of the signed URL',
    example: '2026-01-21T11:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  expiresAt: string;

  @ApiProperty({
    description: 'Original filename of the template',
    example: 'employment_contract_v1_1.0.0.docx',
  })
  filename: string;
}
