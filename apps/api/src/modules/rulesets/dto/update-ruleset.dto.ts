import {
  ANALYSIS_DOCUMENT_TYPES,
  ANALYSIS_JURISDICTIONS,
  type AnalysisDocumentType,
  type AnalysisJurisdiction,
} from '@lib/queue';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { RulesetStatus } from '../entities/ruleset.entity';

/**
 * Update ruleset DTO.
 * Only allows changes to name, description, authority, applicability and status.
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
    example: ['MAINLAND', 'DMCC'],
    description:
      'Jurisdictions the ruleset applies to; with document_types, decides which analyses use it. Empty or absent: only analyses that pick it explicitly.',
    enum: Object.keys(ANALYSIS_JURISDICTIONS),
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(ANALYSIS_JURISDICTIONS), { each: true })
  jurisdictions?: AnalysisJurisdiction[];

  @ApiPropertyOptional({
    example: ['employment'],
    description: 'Document types the ruleset applies to',
    enum: Object.keys(ANALYSIS_DOCUMENT_TYPES),
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(ANALYSIS_DOCUMENT_TYPES), { each: true })
  document_types?: AnalysisDocumentType[];

  @ApiPropertyOptional({
    example: 'active',
    description: 'Ruleset status',
    enum: ['active', 'inactive', 'deprecated'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'deprecated'])
  status?: RulesetStatus;
}
