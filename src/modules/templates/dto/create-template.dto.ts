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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateFieldDto } from './template-field.dto';

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  @ArrayMinSize(1)
  fields: TemplateFieldDto[];

  @ApiPropertyOptional({
    example: ['dmcc_employment_rules_v1'],
    description: 'Array of ruleset keys to apply',
  })
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
    example: 's3://complytude-templates/dmcc_employment_v1.docx',
    description: 'S3 URL to template DOCX file',
  })
  @IsString()
  @IsOptional()
  file_url?: string;

  @ApiPropertyOptional({
    example: { tags: ['employment', 'standard'] },
    description: 'Additional metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
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
    example: [],
    description: 'Template field definitions',
    type: [TemplateFieldDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  @IsOptional()
  fields?: TemplateFieldDto[];

  @ApiPropertyOptional({
    example: ['dmcc_employment_rules_v2'],
    description: 'Array of ruleset keys',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ruleset_keys?: string[];

  @ApiPropertyOptional({
    example: '1.1.0',
    description: 'New version number',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  version?: string;

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
    example: 's3://complytude-templates/dmcc_employment_v1_1.docx',
    description: 'S3 URL to new template DOCX file',
  })
  @IsString()
  @IsOptional()
  file_url?: string;

  @ApiPropertyOptional({
    example: {},
    description: 'Additional metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
