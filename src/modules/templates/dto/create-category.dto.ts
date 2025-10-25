import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'employment',
    description: 'Unique category code (lowercase)',
  })
  @IsString()
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
  @IsUUID()
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether category is active',
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

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
    description: 'Parent category ID',
  })
  @IsUUID()
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether category is active',
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
