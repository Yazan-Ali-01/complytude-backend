import { ApiProperty } from '@nestjs/swagger';
import { TemplateFieldItemDto } from './template-field.dto';

/**
 * Template version response DTO
 * Returns details of a specific template version
 */
export class GetTemplateVersionResponseDto {
  @ApiProperty({
    description: 'Version unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Parent template ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  templateId: string;

  @ApiProperty({
    description: 'Version number',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    description: 'Array of template field definitions for this version',
    type: [TemplateFieldItemDto],
    isArray: true,
  })
  fields: TemplateFieldItemDto[];

  @ApiProperty({
    description: 'S3 URL for the template DOCX file',
    example: 's3://complytude-templates/employment_contract_v1/1.0.0.docx',
  })
  fileUrl: string;

  @ApiProperty({
    description: 'Description of changes in this version',
    example: 'Updated employment terms to comply with new regulations',
    nullable: true,
  })
  changelog: string | null;

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
}

/**
 * Template response DTO
 * Returns template details with current version data populated
 */
export class GetTemplateResponseDto {
  @ApiProperty({
    description: 'Template unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Unique template key',
    example: 'employment_contract_v1',
  })
  key: string;

  @ApiProperty({
    description: 'Template display name',
    example: 'Employment Contract Template',
  })
  name: string;

  @ApiProperty({
    description: 'Template description',
    example: 'Standard employment contract for UAE companies',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Category ID this template belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
  })
  categoryId: string | null;

  @ApiProperty({
    description: 'Authority ID this template belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
  })
  authorityId: string | null;

  @ApiProperty({
    description: 'Supported languages',
    example: ['en', 'ar'],
    type: [String],
  })
  languages: string[];

  @ApiProperty({
    description: 'Current version number',
    example: '1.0.0',
  })
  currentVersion: string;

  @ApiProperty({
    description: 'Current version data including fields',
    type: GetTemplateVersionResponseDto,
  })
  currentVersionData: GetTemplateVersionResponseDto;

  @ApiProperty({
    description: 'Template status',
    enum: ['active', 'inactive', 'draft', 'deprecated'],
    example: 'active',
  })
  status: 'active' | 'inactive' | 'draft' | 'deprecated';

  @ApiProperty({
    description: 'S3 URL for the current template file',
    example: 's3://complytude-templates/employment_contract_v1/1.0.0.docx',
    nullable: true,
  })
  fileUrl: string | null;

  @ApiProperty({
    description: 'ID of user who created this template',
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
