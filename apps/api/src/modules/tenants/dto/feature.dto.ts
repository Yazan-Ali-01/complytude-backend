import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';

export enum FeatureCategory {
  DOCUMENTS = 'documents',
  CONTRACTS = 'contracts',
  REGULATORY = 'regulatory',
  JURISDICTION = 'jurisdiction',
  SEATS = 'seats',
  ADVANCED = 'advanced',
}

export class FeatureResponseDto {
  @ApiProperty({ example: 'documents_per_month' })
  key: string;

  @ApiProperty({
    example: 'number',
    description: 'Data type: boolean, number, enum, or string',
  })
  dataType: string;

  @ApiProperty({ example: 'documents', description: 'Feature category' })
  category: string;

  @ApiProperty({ example: 'Documents Per Month' })
  displayName: string;

  @ApiProperty({ description: 'Feature description', nullable: true })
  description: string | null;

  @ApiProperty({
    example: ['essential', 'full'],
    description: 'Valid values for enum type features',
    nullable: true,
  })
  enumValues: string[] | null;

  @ApiProperty()
  defaultValue: unknown;

  @ApiProperty({
    example: false,
    description: 'Whether usage is tracked for this feature',
  })
  isMetered: boolean;

  @ApiProperty({ example: 100, description: 'Sort order for UI' })
  sortOrder: number;
}

export class FeatureListResponseDto {
  @ApiProperty({ type: [FeatureResponseDto] })
  features: FeatureResponseDto[];

  @ApiProperty()
  total: number;
}

export class UpdateFeatureDto {
  @ApiPropertyOptional({ example: 'Monthly Document Quota' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'Maximum documents tenant can generate per month',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class CreateFeatureDto {
  @ApiProperty({
    example: 'custom_feature',
    description: 'Unique feature key (snake_case)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @ApiProperty({
    example: 'number',
    enum: ['boolean', 'number', 'enum', 'string'],
  })
  @IsEnum(['boolean', 'number', 'enum', 'string'])
  dataType: 'boolean' | 'number' | 'enum' | 'string';

  @ApiProperty({
    example: 'documents',
    enum: FeatureCategory,
    description: 'Feature category',
  })
  @IsEnum(FeatureCategory)
  @IsNotEmpty()
  category: FeatureCategory;

  @ApiProperty({ example: 'Custom Feature' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiPropertyOptional({ description: 'Feature description' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: ['value1', 'value2'],
    description: 'Valid values for enum type features',
  })
  @IsOptional()
  enumValues?: string[];

  @ApiPropertyOptional({ description: 'System-wide default value' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether to track usage for this feature',
  })
  @IsBoolean()
  @IsOptional()
  isMetered?: boolean;

  @ApiPropertyOptional({ example: 600, description: 'Sort order for UI' })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class FeatureQueryDto {
  @ApiPropertyOptional({
    example: 'documents',
    enum: FeatureCategory,
    description: 'Filter by category',
  })
  @IsEnum(FeatureCategory)
  @IsOptional()
  category?: FeatureCategory;

  @ApiPropertyOptional({
    example: false,
    description: 'Filter by metered status',
  })
  @IsOptional()
  isMetered?: boolean;

  @ApiPropertyOptional({ example: 100, description: 'Limit results' })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
