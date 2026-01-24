import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Update category DTO
 * All fields are optional - only provided fields will be updated
 */
export class UpdateCategoryDto {
  @ApiPropertyOptional({
    example: 'Employment Contracts',
    description: 'Category display name',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated description',
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
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
