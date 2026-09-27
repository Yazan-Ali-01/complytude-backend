import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  IsFileMaxSize,
  IsFileMimeType,
  IsFileUploaded,
  IsMulterLikeFile,
} from 'src/common/decorators/file-validators.decorator';
import { JsonField } from 'src/common/decorators/json-field.decorator';
import type { MulterLikeFile } from 'src/common/interfaces/multer-file.interface';
import {
  TEMPLATE_ALLOWED_MIME_TYPES,
  TEMPLATE_MAX_FILE_SIZE,
} from '../constants/template.constants';
import { TemplateFieldItemDto } from './template-field.dto';

/**
 * Create template version request DTO
 * Used to create a new version of an existing template with updated file and fields
 */
export class CreateTemplateVersionDto {
  @ApiProperty({
    example: '1.1.0',
    description:
      'Version number for the new template version (must follow x.y.z format, e.g., 1.0.0)',
    pattern: '^\\d+\\.\\d+\\.\\d+$',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @ValidateIf((obj) => obj.version !== undefined && obj.version !== null)
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'Version must be in the format x.y.z (e.g., 1.0.0)',
  })
  version: string;

  @ApiPropertyOptional({
    example: 'Added remote work clause',
    description: 'Changelog describing changes in this version',
  })
  @IsString()
  @IsOptional()
  changelog?: string;

  @ApiProperty({
    example: [
      {
        key: 'employee_name',
        label: 'Employee Name',
        type: 'text',
        required: true,
      },
    ],
    description: 'Template field definitions for this version',
    type: [TemplateFieldItemDto],
  })
  @JsonField()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldItemDto)
  @ArrayMinSize(1)
  fields: TemplateFieldItemDto[];

  @ApiProperty({
    description:
      'DOCX template file (required, max 5MB, content type: application/vnd.openxmlformats-officedocument.wordprocessingml.document)',
    type: 'string',
    format: 'binary',
  })
  @IsFileUploaded()
  @IsMulterLikeFile()
  @IsFileMimeType(TEMPLATE_ALLOWED_MIME_TYPES)
  @IsFileMaxSize(TEMPLATE_MAX_FILE_SIZE)
  file: MulterLikeFile;
}

// todo: remove later
/**
 * Create template version response DTO
 * Returns the newly created version with validation results
 */
export class CreateTemplateVersionResponseDto {
  @ApiProperty({
    description: 'Version unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Parent template ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  templateId: string;

  @ApiProperty({
    description: 'Version number',
    example: '1.1.0',
  })
  version: string;

  @ApiProperty({
    description: 'S3 URL for the template DOCX file',
    example: 's3://complytude-templates/employment_contract_v1/1.1.0.docx',
  })
  fileUrl: string;

  @ApiProperty({
    description: 'Whether this version is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Description of changes in this version',
    example: 'Added remote work clause',
    nullable: true,
  })
  changelog: string | null;

  @ApiProperty({
    description: 'Array of template field definitions for this version',
    type: [TemplateFieldItemDto],
    isArray: true,
  })
  fields: TemplateFieldItemDto[];

  @ApiProperty({
    description: 'Created timestamp',
    example: '2026-01-22T10:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Placeholders extracted from the uploaded DOCX file',
    example: ['employee_name', 'salary', 'start_date'],
    type: [String],
  })
  placeholdersDetected: string[];

  @ApiProperty({
    description:
      'Validation result comparing extracted placeholders to field definitions',
    example: {
      isValid: true,
      missingInFields: [],
      missingInTemplate: [],
      matches: ['employee_name', 'salary', 'start_date'],
    },
  })
  validation: {
    isValid: boolean;
    missingInFields: string[];
    missingInTemplate: string[];
    matches: string[];
  };
}
