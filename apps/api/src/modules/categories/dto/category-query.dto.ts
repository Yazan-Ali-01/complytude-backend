import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto';

/**
 * Query parameters for listing categories
 * Extends standard pagination with filtering options
 */
export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search by category name or code',
    example: 'employment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
