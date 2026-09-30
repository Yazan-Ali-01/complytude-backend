import {
  ANALYSIS_DOCUMENT_TYPES,
  ANALYSIS_JURISDICTIONS,
  type AnalysisDocumentType,
  type AnalysisJurisdiction,
} from '@lib/queue';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * Which rules a contract is checked against. Either say what the contract is (`jurisdiction`
 * and `documentType`, resolved to the rulesets that apply), or pick the rulesets
 * (`rulesetIds` / `rulesetKeys`, which then decide alone). An analysis without either is refused.
 */
export class AnalysisScopeDto {
  @ApiPropertyOptional({
    description:
      'Where the contract is governed. Required with documentType unless rulesets are picked explicitly.',
    enum: Object.keys(ANALYSIS_JURISDICTIONS),
    example: 'DIFC',
  })
  @IsOptional()
  @IsIn(Object.keys(ANALYSIS_JURISDICTIONS))
  jurisdiction?: AnalysisJurisdiction;

  @ApiPropertyOptional({
    description:
      'What kind of contract it is. Required with jurisdiction unless rulesets are picked explicitly.',
    enum: Object.keys(ANALYSIS_DOCUMENT_TYPES),
    example: 'employment',
  })
  @IsOptional()
  @IsIn(Object.keys(ANALYSIS_DOCUMENT_TYPES))
  documentType?: AnalysisDocumentType;

  @ApiPropertyOptional({
    description:
      'Check against exactly these rulesets (by UUID) instead of the ones jurisdiction and documentType select.',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  rulesetIds?: string[];

  @ApiPropertyOptional({
    description:
      'Check against exactly these rulesets (by key), merged with rulesetIds. Unknown or inactive rulesets are refused.',
    example: ['dmcc_company_regulations_2024'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  rulesetKeys?: string[];
}

/** Body of `POST /documents/:documentId/trigger-analysis`. */
export class TriggerAnalysisDto extends AnalysisScopeDto {}
