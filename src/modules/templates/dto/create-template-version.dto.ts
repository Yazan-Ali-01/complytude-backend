import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsFileMaxSize,
  IsFileMimeType,
  IsFileUploaded,
  IsMulterLikeFile,
} from 'src/common/decorators/file-validators.decorator';
import {
  TEMPLATE_ALLOWED_MIME_TYPES,
  TEMPLATE_MAX_FILE_SIZE,
} from '../constants/template.constants';
import type { MulterLikeFile } from 'src/common/interfaces/multer-file.interface';
import { TemplateFieldDto } from './template-field.dto';
import type { PlaceholderValidationResult } from '../services/placeholder-extraction.service';

export class CreateTemplateVersionDto {
  @ApiProperty({
    example: '1.1.0',
    description: 'Version number for the new template version',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
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
    type: [TemplateFieldDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  @ArrayMinSize(1)
  fields: TemplateFieldDto[];

  @ApiPropertyOptional({
    example: { tags: ['employment', 'updated'] },
    description: 'Additional metadata for this version',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'DOCX template file (required, max 5MB)',
  })
  @IsFileUploaded()
  @IsMulterLikeFile()
  @IsFileMimeType(TEMPLATE_ALLOWED_MIME_TYPES)
  @IsFileMaxSize(TEMPLATE_MAX_FILE_SIZE)
  file: MulterLikeFile;
}

export class CreateTemplateVersionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  template_id: string;

  @ApiProperty({ example: '1.1.0' })
  version: string;

  @ApiProperty({ example: 'https://s3.../templates/...' })
  file_url: string;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiPropertyOptional({ example: 'Added remote work clause' })
  changelog?: string;

  @ApiProperty({ type: [TemplateFieldDto] })
  fields: TemplateFieldDto[];

  @ApiProperty({ example: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  created_at: Date;

  @ApiProperty({
    example: ['employee_name', 'salary', 'start_date'],
    description: 'Placeholders extracted from the DOCX file',
  })
  placeholders_detected: string[];

  @ApiProperty({
    description:
      'Validation result comparing placeholders to field definitions',
  })
  validation: PlaceholderValidationResult;
}
