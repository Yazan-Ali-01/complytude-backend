import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TemplateFieldDto {
  @ApiProperty({
    example: 'employee_name',
    description: 'Unique field key (alphanumeric + underscores)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      'Field key must contain only alphanumeric characters and underscores',
  })
  key: string;

  @ApiProperty({
    example: 'Employee Name',
    description: 'User-friendly field label',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @ApiProperty({
    example: 'text',
    enum: [
      'text',
      'number',
      'date',
      'boolean',
      'select',
      'textarea',
      'email',
      'phone',
    ],
    description: 'Field input type',
  })
  @IsEnum([
    'text',
    'number',
    'date',
    'boolean',
    'select',
    'textarea',
    'email',
    'phone',
  ])
  @IsNotEmpty()
  type:
    | 'text'
    | 'number'
    | 'date'
    | 'boolean'
    | 'select'
    | 'textarea'
    | 'email'
    | 'phone';

  @ApiProperty({
    example: true,
    description: 'Whether field is required',
  })
  @IsBoolean()
  @IsNotEmpty()
  required: boolean;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Default field value',
  })
  @IsOptional()
  default_value?: any;

  @ApiPropertyOptional({
    example: 'Enter employee full name',
    description: 'Placeholder text for input',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  placeholder?: string;

  @ApiPropertyOptional({
    example: 'Full legal name as per Emirates ID',
    description: 'Help text displayed below field',
  })
  @IsString()
  @IsOptional()
  help_text?: string;

  @ApiPropertyOptional({
    example: { min: 3, max: 100, pattern: '^[A-Za-z ]+$' },
    description: 'Validation rules (min, max, pattern, etc.)',
  })
  @IsObject()
  @IsOptional()
  validation_rules?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: string;
  };

  @ApiPropertyOptional({
    example: ['Option 1', 'Option 2', 'Option 3'],
    description: 'Options for select fields',
  })
  @IsArray()
  @IsOptional()
  options?: string[] | { label: string; value: string }[];

  @ApiPropertyOptional({
    example: 1,
    description: 'Display order (for frontend sorting)',
  })
  @IsNumber()
  @IsOptional()
  order?: number;
}
