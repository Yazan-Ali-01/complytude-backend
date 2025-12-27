import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
  IsObject,
  MaxLength,
  Matches,
  ValidateNested,
  ArrayMinSize,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateFieldDto } from './template-field.dto';
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
import { JsonField } from 'src/common/decorators/json-field.decorator';

export {
  CreateTemplateVersionDto,
  CreateTemplateVersionResponseDto,
} from './create-template-version.dto';

export class CreateTemplateDto {
  @ApiProperty({
    example: 'dmcc_employment_v1',
    description: 'Unique template key (alphanumeric + underscores)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      'Template key must contain only alphanumeric characters and underscores',
  })
  key: string;

  @ApiProperty({
    example: 'DMCC Employment Contract',
    description: 'Template display name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Standard employment contract for DMCC employees',
    description: 'Template description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Category ID',
  })
  @IsUUID()
  @IsOptional()
  category_id?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Authority ID',
  })
  @IsUUID()
  @IsOptional()
  authority_id?: string;

  @ApiProperty({
    example: ['en', 'ar'],
    description: 'Supported languages',
  })
  @JsonField()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  languages: string[];

  @ApiProperty({
    example: [
      {
        key: 'employee_name',
        label: 'Employee Name',
        type: 'text',
        required: true,
      },
    ],
    description: 'Template field definitions',
    type: [TemplateFieldDto],
  })
  @JsonField()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  @ArrayMinSize(1)
  fields: TemplateFieldDto[];

  @ApiPropertyOptional({
    example: ['dmcc_employment_rules_v1'],
    description: 'Array of ruleset keys to apply',
  })
  @JsonField()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ruleset_keys?: string[];

  @ApiPropertyOptional({
    example: '1.0.0',
    description: 'Initial version number',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @ValidateIf((obj) => obj.version !== undefined && obj.version !== null)
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be in format x.y.z (e.g., 1.0.0)',
  })
  version?: string;

  @ApiPropertyOptional({
    example: 'active',
    enum: ['active', 'inactive', 'draft', 'deprecated'],
    description: 'Template status',
  })
  @IsEnum(['active', 'inactive', 'draft', 'deprecated'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';

  @ApiPropertyOptional({
    example: { tags: ['employment', 'standard'] },
    description: 'Additional metadata',
  })
  @JsonField()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  /**
   * File upload validated via custom validators
   * Populated by interceptor with the uploaded file object
   */
  @ApiProperty({
    description: 'DOCX template file (required, max 5MB)',
  })
  @IsFileUploaded()
  @IsMulterLikeFile()
  @IsFileMimeType(TEMPLATE_ALLOWED_MIME_TYPES)
  @IsFileMaxSize(TEMPLATE_MAX_FILE_SIZE)
  file: MulterLikeFile;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({
    example: 'DMCC Employment Contract v2',
    description: 'Template display name',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated description',
    description: 'Template description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Category ID',
  })
  @IsUUID()
  @IsOptional()
  category_id?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Authority ID',
  })
  @IsUUID()
  @IsOptional()
  authority_id?: string;

  @ApiPropertyOptional({
    example: ['en', 'ar'],
    description: 'Supported languages',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiPropertyOptional({
    example: ['dmcc_employment_rules_v2'],
    description: 'Array of ruleset keys',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ruleset_keys?: string[];

  @ApiPropertyOptional({
    example: 'Updated probation period field',
    description: 'Changelog for this version',
  })
  @IsString()
  @IsOptional()
  changelog?: string;

  @ApiPropertyOptional({
    example: 'active',
    enum: ['active', 'inactive', 'draft', 'deprecated'],
    description: 'Template status',
  })
  @IsEnum(['active', 'inactive', 'draft', 'deprecated'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';

  @ApiPropertyOptional({
    example: {},
    description: 'Additional metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
