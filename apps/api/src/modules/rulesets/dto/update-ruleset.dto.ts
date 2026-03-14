import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { RulesetStatus } from '../entities/ruleset.entity';

/**
 * Update ruleset metadata DTO.
 * Only allows changes to name, description, authority, status, and metadata.
 * Clauses are immutable per version — use the versioning endpoints instead.
 */
export class UpdateRulesetDto {
  @ApiPropertyOptional({
    example: 'DMCC Employment Rules v1.1',
    description: 'Ruleset display name',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated employment rules',
    description: 'Ruleset description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Authority ID',
  })
  @IsUUID()
  @IsOptional()
  authority_id?: string;

  @ApiPropertyOptional({
    example: 'active',
    description: 'Ruleset status',
    enum: ['active', 'inactive', 'deprecated'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'deprecated'])
  status?: RulesetStatus;

  @ApiPropertyOptional({
    example: { tags: ['employment', 'updated'] },
    description: 'Additional metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
