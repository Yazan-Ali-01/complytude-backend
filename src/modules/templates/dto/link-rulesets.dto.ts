import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

/**
 * Request DTO for linking rulesets to a template
 * Used in POST /templates/:key/rulesets endpoint
 */
export class LinkRulesetsDto {
  @ApiProperty({
    description: 'Array of ruleset keys to link to the template',
    example: ['dmcc_employment_rules_v1', 'ifza_employment_rules_v1'],
    type: [String],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'At least one ruleset key must be provided',
  })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  rulesetKeys: string[];
}
