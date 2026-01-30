import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Create category DTO
 * Defines required and optional fields for creating a new category
 */
export class CreateCategoryDto {
  @ApiProperty({
    example: 'employment',
    description: 'Unique category code (lowercase)',
  })
  @IsString()
  @Transform(({ value }) => value?.toLowerCase())
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({
    example: 'Employment Contracts',
    description: 'Category display name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Employment and labor agreements',
    description: 'Category description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Parent category ID (for hierarchical categories)',
  })
  @IsUUID('4')
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether category is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive: boolean = true;
}
