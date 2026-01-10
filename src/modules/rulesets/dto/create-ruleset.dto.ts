import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  IsObject,
  IsEnum,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClauseDto } from 'src/modules/rulesets/dto/clause.dto';

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
    description: 'Array of legal clauses',
    type: [ClauseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClauseDto)
  @ArrayMinSize(1)
  clauses: ClauseDto[];

  @ApiPropertyOptional({
    example: { tags: ['employment', 'standard'] },
    description: 'Additional metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    example: '1.0.0',
    description: 'Ruleset version',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be in format x.y.z (e.g., 1.0.0)',
  })
  version: string = '1.0.0';

  @ApiPropertyOptional({
    example: 'active',
    enum: ['active', 'inactive', 'deprecated'],
    description: 'Ruleset status',
  })
  @IsEnum(['active', 'inactive', 'deprecated'])
  @IsOptional()
  status: 'active' | 'inactive' | 'deprecated' = 'active';
}

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
    example: [],
    description: 'Array of legal clauses',
    type: [ClauseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClauseDto)
  @IsOptional()
  clauses?: ClauseDto[];

  @ApiPropertyOptional({
    example: {},
    description: 'Additional metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    example: '1.1.0',
    description: 'Ruleset version',
  })
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be in format x.y.z (e.g., 1.0.0)',
  })
  @IsOptional()
  @MaxLength(50)
  version?: string;

  @ApiPropertyOptional({
    example: 'active',
    enum: ['active', 'inactive', 'deprecated'],
    description: 'Ruleset status',
  })
  @IsEnum(['active', 'inactive', 'deprecated'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'deprecated';
}
