import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto';

/**
 * Query DTO for listing templates
 * Extends PaginationQueryDto to support cursor-based pagination
 */
export class ListTemplatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by template status',
    enum: ['active', 'inactive', 'draft', 'deprecated'],
    example: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'draft', 'deprecated'])
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';

  @ApiPropertyOptional({
    description: 'Filter by category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter by authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  authorityId?: string;

  @ApiPropertyOptional({
    description: 'Search by template name or description',
    example: 'employment',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
