import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ClauseItemDto } from './clause.dto';

/**
 * Create new ruleset version DTO
 * Used for creating immutable versions of a ruleset
 */
export class CreateRulesetVersionDto {
  @ApiProperty({
    description: 'Semantic version string',
    example: '1.1.0',
    pattern: '^\\d+\\.\\d+\\.\\d+$',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be in format x.y.z (e.g., 1.0.0)',
  })
  version: string;

  @ApiProperty({
    description: 'Array of legal clauses for this version',
    type: [ClauseItemDto],
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
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClauseItemDto)
  @ArrayMinSize(1)
  clauses: ClauseItemDto[];

  @ApiPropertyOptional({
    description: 'Description of changes in this version',
    example: 'Updated probation period clause to comply with new regulations',
  })
  @IsString()
  @IsOptional()
  changelog?: string;
}
