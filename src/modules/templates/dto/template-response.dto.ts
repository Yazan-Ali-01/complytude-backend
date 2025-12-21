import { ApiProperty } from '@nestjs/swagger';
import { Template } from '../entities/template.entity';

export class TemplateResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'dmcc_employment_v1' })
  key: string;

  @ApiProperty({ example: 'DMCC Employment Contract' })
  name: string;

  @ApiProperty({ example: 'Standard employment contract' })
  description?: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  category_id?: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  authority_id?: string;

  @ApiProperty({ example: ['en', 'ar'] })
  languages: string[];

  @ApiProperty({ example: '1.0.0' })
  current_version: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: 's3://complytude-templates/dmcc_employment_v1.docx' })
  file_url?: string;

  @ApiProperty({ example: {} })
  metadata: Record<string, any>;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  updated_at: Date;
}

export class TemplateListResponseDto {
  @ApiProperty({ type: [TemplateResponseDto] })
  templates: Template[];

  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;
}

export class TemplateVersionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  template_id: string;

  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ example: [] })
  fields: any[];

  @ApiProperty({ example: 's3://complytude-templates/dmcc_employment_v1.docx' })
  file_url: string;

  @ApiProperty({ example: 'Initial version' })
  changelog?: string;

  @ApiProperty({ example: {} })
  metadata: Record<string, any>;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  created_at: Date;
}

export class TemplateDownloadResponseDto {
  @ApiProperty({
    example:
      'https://s3.amazonaws.com/complytude-templates/nda_v1/1.0.0/nda.docx?X-Amz-Signature=...',
    description: 'Signed URL for downloading the template file',
  })
  downloadUrl: string;

  @ApiProperty({ example: 900, description: 'URL expiry time in seconds' })
  expiresIn: number;

  @ApiProperty({
    example: '2024-01-15T10:15:00Z',
    description: 'ISO timestamp when the URL expires',
  })
  expiresAt: string;

  @ApiProperty({
    example: 'nda_v1_1.0.0.docx',
    description: 'Suggested filename for download',
  })
  fileName: string;

  @ApiProperty({ example: '1.0.0', description: 'Version of the template' })
  version: string;
}
