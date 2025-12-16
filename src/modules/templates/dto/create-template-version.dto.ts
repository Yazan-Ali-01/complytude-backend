import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateFieldDto } from './template-field.dto';

export class CreateTemplateVersionDto {
  @ApiProperty({
    example: '1.1.0',
    description: 'Semantic version number (e.g., 1.0.0, 2.1.3)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  version: string;

  @ApiPropertyOptional({
    example: 'Added remote work clause and updated salary structure',
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
    description: 'Updated field definitions for this version',
    type: [TemplateFieldDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  fields: TemplateFieldDto[];

  /**
   * S3 URL to template DOCX file.
   * Either provide this OR upload a file via multipart/form-data.
   * If both are provided, the uploaded file takes precedence.
   */
  @ApiPropertyOptional({
    example: 's3://complytude-templates/nda_v1/1.1.0/nda.docx',
    description: 'Direct S3 URL (alternative to file upload)',
  })
  @IsString()
  @IsOptional()
  file_url?: string;
}
