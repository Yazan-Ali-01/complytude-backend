import {
  ANALYSIS_DOCUMENT_TYPES,
  ANALYSIS_JURISDICTIONS,
  type AnalysisDocumentType,
  type AnalysisJurisdiction,
} from '@lib/queue';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ClauseItemDto } from './clause.dto';

export class CreateRulesetDto {
  @ApiProperty({
    example: 'dmcc_employment_rules_v1',
    description: 'Unique ruleset key',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  key: string;

  @ApiProperty({
    example: 'DMCC Employment Rules v1.0',
    description: 'Ruleset display name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Standard employment rules for DMCC contracts',
    description: 'Ruleset description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Authority ID this ruleset belongs to',
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

  @ApiProperty({
    example: [
      {
        id: 'clause_1',
        title: 'Probation Period',
        content:
          'The employee shall be subject to a probation period of {probation_months} months.',
        order: 1,
        is_required: true,
      },
    ],
    description: 'Array of legal clauses for the initial version (1.0.0)',
    type: [ClauseItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClauseItemDto)
  @ArrayMinSize(1)
  clauses: ClauseItemDto[];
}
