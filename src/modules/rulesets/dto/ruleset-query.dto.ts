import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

/**
 * Query parameters for listing rulesets
 * Extends standard pagination with filtering options
 */
export class ListRulesetsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by ruleset status',
    enum: ['active', 'inactive', 'deprecated'],
    example: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'deprecated'])
  status?: 'active' | 'inactive' | 'deprecated';

  @ApiPropertyOptional({
    description: 'Filter by authority ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  authorityId?: string;

  @ApiPropertyOptional({
    description: 'Search rulesets by name or description',
    example: 'employment',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
