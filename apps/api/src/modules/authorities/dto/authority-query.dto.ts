import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@complytude/shared';

/**
 * Query parameters for listing authorities
 * Extends standard pagination with filtering options
 */
export class ListAuthoritiesQueryDto extends PaginationQueryDto {
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
    description: 'Search by authority name or code',
    example: 'DMCC',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by country',
    example: 'United Arab Emirates',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}
